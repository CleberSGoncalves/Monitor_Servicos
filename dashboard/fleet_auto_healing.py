"""
Módulo de Auto-Healing da Frota (DNA Monitor Fleet)
Kantar IBOPE Media — Monitor_Servicos NOC LATAM

Objetivos:
1. Rastrear agentes offline, em delay e com versões antigas (< 1.0.18.0).
2. Auto-recuperar estações ativas solicitando atualização automática via SharePoint (Acao_Solicitada = 'Atualizar').
3. Auto-recuperar serviços críticos caídos (FastMatching, DetectionSVC, TrackingSVC, ConfigMonitor) via RemoteCommand.
4. Destravar filas de tracking estagnadas (D:\mediadna_V2\data\tracking) reciclando o DNA.TrackingSVC.
"""

import os
import json
import time
import logging
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

import requests
from config import (
    SITE_ID,
    LIST_SERVICES_ID,
    TENANT_ID,
    CLIENT_ID,
    CLIENT_SECRET,
    DATA_DIR
)
from sharepoint_sync import get_graph_token, get_cached_data

logger = logging.getLogger("fleet_auto_healing")

TARGET_AGENT_VERSION = "1.0.18.0"
AUTO_HEALING_LOG_FILE = DATA_DIR / "auto_healing_history.json"


def audit_and_diagnose_fleet() -> Dict[str, Any]:
    """
    Realiza a auditoria completa de saúde dos agentes e serviços da frota,
    categorizando os hosts em:
    - Atualizados e Saudáveis
    - Desatualizados Elegíveis para Auto-Healing (Online, versão antiga)
    - Em Delay (2h a 6h sem atualização)
    - Offline Crítico (> 24h sem comunicação)
    - Serviços Críticos Parados
    """
    fleet_data = get_cached_data()
    services = fleet_data.get("services", [])
    now_utc = datetime.now(timezone.utc)

    hosts_map: Dict[str, Dict[str, Any]] = {}

    for s in services:
        h = str(s.get("hostname") or "").strip()
        if not h or h == "N/A":
            continue

        p = str(s.get("praca") or "").strip()
        if not p or p.lower() in ("n/a", "não informado", "nao informado"):
            p = h

        cs_val = str(s.get("cs", "1")).strip()

        if h not in hosts_map:
            hosts_map[h] = {
                "hostname": h,
                "praca": p,
                "cs": cs_val,
                "agent_version": "N/A",
                "agent_status": "Desconhecido",
                "last_update": "",
                "hours_offline": 9999.0,
                "comm_state": "OFFLINE",
                "services": {},
                "stopped_critical_services": [],
                "eligible_auto_update": False,
                "eligible_service_restart": False
            }

        svc_name = str(s.get("nome_servico") or "").strip()
        svc_status = str(s.get("status_servico") or "Desconhecido").strip()
        svc_id = s.get("id")

        hosts_map[h]["services"][svc_name] = {
            "id": svc_id,
            "status": svc_status,
            "version": s.get("versao_instalada", "N/A"),
            "desired_version": s.get("versao_desejada", "N/A"),
            "action": s.get("acao_solicitada", "Nenhuma"),
            "cs": cs_val
        }

        # Identifica o agente
        if "monitorservice" in svc_name.lower():
            hosts_map[h]["agent_version"] = s.get("versao_instalada", "N/A")
            hosts_map[h]["agent_status"] = svc_status
            hosts_map[h]["last_update"] = s.get("ultima_atualizacao", "")

            upd_str = s.get("ultima_atualizacao", "")
            if upd_str:
                try:
                    dt = datetime.fromisoformat(upd_str.replace("Z", "+00:00"))
                    diff_h = (now_utc - dt).total_seconds() / 3600.0
                    hosts_map[h]["hours_offline"] = round(diff_h, 1)

                    if diff_h <= 2.0:
                        hosts_map[h]["comm_state"] = "ONLINE"
                    elif diff_h <= 6.0:
                        hosts_map[h]["comm_state"] = "DELAY"
                    elif diff_h <= 24.0:
                        hosts_map[h]["comm_state"] = "OFFLINE_RECENT"
                    else:
                        hosts_map[h]["comm_state"] = "OFFLINE_CRITICAL"
                except Exception:
                    hosts_map[h]["comm_state"] = "UNKNOWN"

    # Avaliação de elegibilidade para Auto-Healing
    up_to_date_count = 0
    eligible_update_count = 0
    delay_count = 0
    offline_count = 0
    stopped_services_count = 0

    critical_svc_keywords = ["fastmatching", "detectionsvc", "trackingsvc", "configmonitorsvc", "atriacapture"]

    for h, data in hosts_map.items():
        is_agent_online = data["comm_state"] in ("ONLINE", "DELAY")
        ver = data["agent_version"]

        if ver == TARGET_AGENT_VERSION:
            up_to_date_count += 1
        elif is_agent_online and ver != "N/A":
            data["eligible_auto_update"] = True
            eligible_update_count += 1

        if data["comm_state"] == "DELAY":
            delay_count += 1
        elif data["comm_state"] in ("OFFLINE_RECENT", "OFFLINE_CRITICAL", "OFFLINE"):
            offline_count += 1

        # Verifica serviços críticos parados
        for s_name, s_info in data["services"].items():
            s_low = s_name.lower().replace(" ", "").replace(".", "")
            if any(k in s_low for k in critical_svc_keywords):
                st_low = s_info["status"].lower()
                if "parado" in st_low or "stopped" in st_low:
                    data["stopped_critical_services"].append(s_name)
                    data["eligible_service_restart"] = True
                    stopped_services_count += 1

    return {
        "timestamp": now_utc.isoformat(),
        "target_version": TARGET_AGENT_VERSION,
        "summary": {
            "total_hosts": len(hosts_map),
            "up_to_date": up_to_date_count,
            "eligible_for_update": eligible_update_count,
            "in_delay": delay_count,
            "offline": offline_count,
            "stopped_services": stopped_services_count
        },
        "hosts": list(hosts_map.values())
    }


def execute_auto_healing_batch(max_hosts: int = 50) -> Dict[str, Any]:
    """
    Executa o ciclo automático de Auto-Healing:
    1. Para agentes ativos desatualizados: seta Acao_Solicitada = 'Atualizar' e Versao_Desejada = TARGET_AGENT_VERSION no SharePoint.
    2. Para serviços críticos parados em hosts online: solicita restart do serviço.
    """
    audit = audit_and_diagnose_fleet()
    eligible_hosts = [h for h in audit["hosts"] if h["eligible_auto_update"] or h["eligible_service_restart"]]

    token = get_graph_token()
    if not token:
        return {"status": "error", "message": "Falha de autenticação com Microsoft Graph SPN"}

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    actions_taken = []
    errors = []

    processed = 0
    for h in eligible_hosts[:max_hosts]:
        h_name = h["hostname"]
        praca = h["praca"]

        # 1. Auto-Update do Agente
        if h["eligible_auto_update"]:
            # Localiza o ID do item do MonitorService no SharePoint
            agent_svc_id = None
            for s_name, s_info in h["services"].items():
                if "monitorservice" in s_name.lower():
                    agent_svc_id = s_info.get("id")
                    break

            if agent_svc_id:
                patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{agent_svc_id}/fields"
                payload = {
                    "Acao_Solicitada": "Atualizar",
                    "Versao_Desejada": TARGET_AGENT_VERSION
                }
                try:
                    res = requests.patch(patch_url, json=payload, headers=headers, timeout=12)
                    if res.ok:
                        actions_taken.append({
                            "hostname": h_name,
                            "praca": praca,
                            "tipo": "AUTO_UPDATE_AGENT",
                            "detalhe": f"Ação 'Atualizar' solicitada para versão {TARGET_AGENT_VERSION} (Versão atual: {h['agent_version']})"
                        })
                    else:
                        errors.append(f"Erro ao solicitar update para {h_name}: HTTP {res.status_code}")
                except Exception as e:
                    errors.append(f"Exceção ao solicitar update para {h_name}: {e}")

        # 2. Auto-Restart de Serviços Críticos Parados
        if h["eligible_service_restart"]:
            for s_name in h["stopped_critical_services"]:
                s_id = h["services"][s_name].get("id")
                if s_id:
                    patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{s_id}/fields"
                    payload = {"Acao_Solicitada": "Iniciar"}
                    try:
                        res = requests.patch(patch_url, json=payload, headers=headers, timeout=12)
                        if res.ok:
                            actions_taken.append({
                                "hostname": h_name,
                                "praca": praca,
                                "tipo": "AUTO_RESTART_SERVICE",
                                "detalhe": f"Ação 'Iniciar' solicitada para o serviço crítico '{s_name}'"
                            })
                    except Exception as e:
                        errors.append(f"Exceção ao iniciar {s_name} em {h_name}: {e}")

        processed += 1
        time.sleep(0.3)  # Evita throttling 429 no Graph

    result = {
        "status": "success",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_eligible": len(eligible_hosts),
        "total_processed": processed,
        "actions_taken": actions_taken,
        "errors": errors
    }

    # Salva histórico de ações
    try:
        history = []
        if AUTO_HEALING_LOG_FILE.exists():
            with open(AUTO_HEALING_LOG_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
        history.append(result)
        # Mantém últimos 50 registros
        history = history[-50:]
        with open(AUTO_HEALING_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Erro ao salvar log de auto-healing: {e}")

    return result


def recycle_tracking_service_on_host(hostname: str) -> Dict[str, Any]:
    """
    Solicita a reciclagem imediata do serviço DNA.TrackingSVC no host especificado
    para destravar acúmulo de arquivos XML na pasta D:\\mediadna_V2\\data\\tracking.
    """
    fleet_data = get_cached_data()
    services = fleet_data.get("services", [])

    tracking_svc_id = None
    target_praca = ""

    for s in services:
        h = str(s.get("hostname") or "").strip()
        if h.lower() == hostname.lower():
            target_praca = s.get("praca", "")
            s_name = str(s.get("nome_servico") or "").strip().lower()
            if "trackingsvc" in s_name:
                tracking_svc_id = s.get("id")
                break

    if not tracking_svc_id:
        return {
            "status": "error",
            "message": f"Serviço DNA.TrackingSVC não encontrado no SharePoint para o host '{hostname}'"
        }

    token = get_graph_token()
    if not token:
        return {"status": "error", "message": "Falha de autenticação com Microsoft Graph"}

    patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{tracking_svc_id}/fields"
    payload = {"Acao_Solicitada": "Reiniciar"}

    try:
        res = requests.patch(
            patch_url,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            timeout=15
        )
        if res.ok:
            return {
                "status": "success",
                "hostname": hostname,
                "praca": target_praca,
                "service": "DNA.TrackingSVC",
                "message": f"Comando de reinicialização enviado com sucesso para DNA.TrackingSVC em {hostname}. O agente executará o restart para escoar os XMLs acumulados."
            }
        else:
            return {
                "status": "error",
                "message": f"Erro ao solicitar reinicialização: HTTP {res.status_code} - {res.text}"
            }
    except Exception as e:
        return {"status": "error", "message": f"Exceção ao solicitar restart: {e}"}
