import hmac
import hashlib
import json
import logging
import sqlite3
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from urllib.parse import quote
import requests

from config import SITE_ID, CLIENT_SECRET, DATA_DIR, LIST_SERVICES_ID
from sharepoint_sync import get_graph_token

logger = logging.getLogger("RemoteQueue")
DB_PATH = DATA_DIR / "fleet.db"
QUEUE_ROOT = "Fila_Comandos"


def _encode_drive_path(path: str) -> str:
    parts = [p for p in path.split("/") if p]
    return "/".join(quote(p, safe="") for p in parts)


def sign_command_payload(
    key: str,
    exec_id: str,
    host: str,
    shell: str,
    created_at: str,
    timeout_s: int,
    script: str,
) -> str:
    """
    Assinatura HMAC-SHA256 idêntica ao método RemoteCommandExecutor.Sign (C# v1.0.16.0):
    canonical = f"{exec_id}\\n{host}\\n{shell}\\n{created_at}\\n{timeout_s}\\n{script}"
    """
    canonical = f"{exec_id}\n{host}\n{shell}\n{created_at}\n{timeout_s}\n{script}"
    return hmac.new(
        key.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().lower()


def enqueue_command_on_sharepoint(
    exec_id: str,
    host: str,
    title: str,
    shell_type: str,
    script: str,
    requested_by: str,
    timeout_s: int = 120,
) -> bool:
    """
    Publica o comando assinado em Fila_Comandos/{HOST}/pending/{exec_id}.json no SharePoint Drive
    para execução real pelo serviço C# (WinServiceFleetAgent / DNA.MonitorServiceSVC >= 1.0.16.0).
    """
    try:
        token = get_graph_token()
        if not token or not CLIENT_SECRET:
            return False

        clean_host = host.strip()
        created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        per_host_exec_id = f"{exec_id}_{clean_host}"
        sig = sign_command_payload(
            key=CLIENT_SECRET,
            exec_id=per_host_exec_id,
            host=clean_host,
            shell=shell_type,
            created_at=created_at,
            timeout_s=timeout_s,
            script=script,
        )

        payload = {
            "exec_id": per_host_exec_id,
            "host": clean_host,
            "title": title,
            "shell": shell_type,
            "script": script,
            "requested_by": requested_by,
            "created_at": created_at,
            "timeout_s": timeout_s,
            "sig": sig,
        }

        rel_path = f"{QUEUE_ROOT}/{clean_host}/pending/{per_host_exec_id}.json"
        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drive/root:/{_encode_drive_path(rel_path)}:/content"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        resp = requests.put(
            url,
            headers=headers,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            timeout=15,
        )
        return resp.status_code in (200, 201)
    except Exception as e:
        logger.warning(f"[RemoteQueue] Aviso ao enfileirar comando em {host}: {e}")
        return False


def poll_command_result_from_sharepoint(exec_id: str, host: str) -> Optional[Dict[str, Any]]:
    """
    Consulta se o agente C# na praça já gravou Fila_Comandos/{HOST}/results/{exec_id}_{HOST}.json.
    """
    try:
        token = get_graph_token()
        if not token:
            return None
        clean_host = host.strip()
        per_host_exec_id = f"{exec_id}_{clean_host}"
        rel_path = f"{QUEUE_ROOT}/{clean_host}/results/{per_host_exec_id}.json"
        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drive/root:/{_encode_drive_path(rel_path)}:/content"
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(url, headers=headers, timeout=12)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


def sync_pending_execution_results(exec_id: str) -> None:
    """
    Sincroniza resultados reais do SharePoint Drive para um execution_id caso algum host tenha atualizado.
    """
    try:
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            rows = cursor.execute(
                "SELECT id, host, status, stdout FROM remote_command_results WHERE execution_id = ?",
                (exec_id,),
            ).fetchall()

            for r in rows:
                host = r["host"]
                res_data = poll_command_result_from_sharepoint(exec_id, host)
                if not res_data:
                    continue
                sp_status = res_data.get("status", "sucesso")
                if sp_status == "em_execucao":
                    continue
                stdout_real = res_data.get("stdout") or ""
                stderr_real = res_data.get("stderr") or ""
                exit_code = int(res_data.get("exit_code", 0))
                dur_ms = int(res_data.get("duration_ms", 0))
                agent_ver = res_data.get("agent_version", "1.0.16.0")
                header = f"[Agente C# v{agent_ver} • Execução Real via SharePoint Queue em {host}]\n"
                cursor.execute(
                    """
                    UPDATE remote_command_results
                    SET status = ?, exit_code = ?, stdout = ?, stderr = ?, duration_ms = ?
                    WHERE id = ?
                    """,
                    (sp_status, exit_code, header + stdout_real, stderr_real, dur_ms, r["id"]),
                )
            conn.commit()
    except Exception as e:
        logger.debug(f"[RemoteQueue] Aviso ao sincronizar resultados de {exec_id}: {e}")


# ==============================================================================
# ESTEIRA DE HOMOLOGAÇÃO CANÁRIO DE SERVIÇOS (5 Pilotos -> Despacho para Frota)
# ==============================================================================

def get_service_canary_status(service_name: str = "DNA.MonitorServiceSVC", target_version: str = "1.0.16.0") -> Dict[str, Any]:
    """
    Calcula o estado atual da homologação gradual (5 pilotos -> frota completa)
    para um serviço específico a partir do cache do SharePoint.
    """
    cache_file = DATA_DIR / "fleet_cache.json"
    services = []
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            services = data.get("services", [])
        except Exception:
            services = []

    clean_target = target_version.strip().lstrip("vV")
    matching = [
        s for s in services
        if (s.get("nome_servico") or "").lower().replace(" ", "") in (
            service_name.lower().replace(" ", ""),
            f"dna.{service_name}".lower().replace(" ", ""),
        )
    ]

    up_to_date = []
    pilots_in_progress = []
    pending_fleet = []

    for s in matching:
        inst = (s.get("versao_instalada") or "").strip().lstrip("vV")
        des = (s.get("versao_desejada") or "").strip().lstrip("vV")
        entry = {
            "id": s.get("id"),
            "hostname": s.get("hostname"),
            "praca": s.get("praca"),
            "cs": s.get("cs"),
            "versao_instalada": inst,
            "versao_desejada": des,
            "status_servico": s.get("status_servico"),
            "status_atualizacao": s.get("status_atualizacao"),
            "acao_solicitada": s.get("acao_solicitada"),
        }
        if inst == clean_target:
            up_to_date.append(entry)
        elif des == clean_target:
            pilots_in_progress.append(entry)
        else:
            pending_fleet.append(entry)

    total = len(matching)
    pilots_done_count = len(up_to_date)
    canary_target = min(5, total) if total > 0 else 5
    canary_approved = pilots_done_count >= canary_target and total > 0

    if total == 0:
        stage = "sem_dados"
    elif pilots_done_count == total:
        stage = "frota_100_atualizada"
    elif canary_approved:
        stage = "canario_homologado_pronto_frota"
    elif len(pilots_in_progress) > 0 or pilots_done_count > 0:
        stage = "em_homologacao_canario"
    else:
        stage = "aguardando_inicio_canario"

    return {
        "service_name": service_name,
        "target_version": clean_target,
        "stage": stage,
        "canary_size": 5,
        "total_hosts": total,
        "updated_count": pilots_done_count,
        "in_progress_count": len(pilots_in_progress),
        "pending_count": len(pending_fleet),
        "canary_approved": canary_approved,
        "updated_hosts": up_to_date,
        "in_progress_hosts": pilots_in_progress,
        "pending_hosts": pending_fleet,
    }


def trigger_canary_rollout_sharepoint(
    service_name: str = "DNA.MonitorServiceSVC",
    target_version: str = "1.0.16.0",
    phase: str = "canary",  # "canary" (5 máquinas piloto) ou "full" (demais máquinas da frota)
    pilot_count: int = 5,
) -> Dict[str, Any]:
    """
    Executa na lista do SharePoint:
    - phase='canary': seleciona até 5 máquinas online candidatas e define Versao_Desejada=target_version e Acao_Solicitada='Atualizar'.
    - phase='full': despacha Versao_Desejada=target_version e Acao_Solicitada='Atualizar' para todas as demais máquinas da frota.
    """
    clean_target = target_version.strip().lstrip("vV")
    token = get_graph_token()
    if not token:
        return {"success": False, "detail": "Falha ao obter token do Microsoft Graph."}

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    # Busca itens atuais da lista de serviços no SharePoint
    items = []
    next_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items?$expand=fields&$top=500"
    while next_url:
        r = requests.get(next_url, headers=headers, timeout=15)
        if not r.ok:
            break
        d = r.json()
        items.extend(d.get("value", []))
        next_url = d.get("@odata.nextLink")

    matching = []
    for it in items:
        f = it.get("fields", {})
        ns = (f.get("Nome_Servico") or "").strip()
        if ns.lower().replace(" ", "") in (
            service_name.lower().replace(" ", ""),
            f"dna.{service_name}".lower().replace(" ", ""),
        ):
            matching.append(it)

    if not matching:
        return {"success": False, "detail": f"Nenhum registro encontrado para '{service_name}' no SharePoint."}

    candidates = []
    already_updated = []
    already_targeted = []

    for it in matching:
        f = it.get("fields", {})
        inst = (f.get("Versao_Instalada") or "").strip().lstrip("vV")
        des = (f.get("Versao_Desejada") or "").strip().lstrip("vV")
        status_srv = (f.get("Status_Servico") or "").strip()
        if inst == clean_target:
            already_updated.append(f.get("Hostname") or f.get("Title"))
        elif des == clean_target and (f.get("Acao_Solicitada") or "") == "Atualizar":
            already_targeted.append(f.get("Hostname") or f.get("Title"))
        else:
            # Prioriza máquinas cujo serviço está Em Execução
            priority = 0 if "execu" in status_srv.lower() else 1
            candidates.append((priority, it))

    candidates.sort(key=lambda x: x[0])

    if phase == "canary":
        # Seleciona estritamente até `pilot_count` (5) máquinas para o lote canário
        # (contando as que já concluíram + as que já estão em atualização até o limite de 5)
        slots_for_active_pilots = max(0, pilot_count - len(already_updated))
        # Ordena already_targeted + candidates para escolher exatamente os pilotos ativos
        all_potential_pilots = []
        for it in matching:
            f = it.get("fields", {})
            inst = (f.get("Versao_Instalada") or "").strip().lstrip("vV")
            if inst == clean_target:
                continue
            status_srv = (f.get("Status_Servico") or "").strip()
            acao_cur = (f.get("Acao_Solicitada") or "").strip()
            des_cur = (f.get("Versao_Desejada") or "").strip().lstrip("vV")
            # Prioriza os que estão Em Execução e que já estavam marcados
            prio = (0 if "execu" in status_srv.lower() else 1, 0 if (des_cur == clean_target and acao_cur == "Atualizar") else 1)
            all_potential_pilots.append((prio, it))
        all_potential_pilots.sort(key=lambda x: x[0])

        selected = [it for _, it in all_potential_pilots[:slots_for_active_pilots]]
        non_pilots_to_hold = [it for _, it in all_potential_pilots[slots_for_active_pilots:]]
    else:
        selected = [it for _, it in candidates]
        non_pilots_to_hold = []

    dispatched_hosts = []
    held_back_hosts = []
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for it in selected:
        item_id = it.get("id")
        f = it.get("fields", {})
        host = f.get("Hostname") or f.get("Title") or str(item_id)
        patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        body = {
            "Versao_Desejada": clean_target,
            "Status_Atualizacao": "Desatualizado",
            "Acao_Solicitada": "Atualizar",
            "Ultima_atualizacao": now_iso,
        }
        pr = requests.patch(patch_url, headers=headers, data=json.dumps(body), timeout=12)
        if pr.ok:
            dispatched_hosts.append(host)

    # Garante que as demais máquinas fora do lote de 5 pilotos fiquem blindadas na versão instalada atual
    for it in non_pilots_to_hold:
        f = it.get("fields", {})
        des_cur = (f.get("Versao_Desejada") or "").strip().lstrip("vV")
        acao_cur = (f.get("Acao_Solicitada") or "").strip()
        inst_cur = (f.get("Versao_Instalada") or "1.0.15.0").strip().lstrip("vV")
        if des_cur == clean_target or acao_cur == "Atualizar":
            item_id = it.get("id")
            host = f.get("Hostname") or f.get("Title") or str(item_id)
            patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
            body = {
                "Versao_Desejada": inst_cur,
                "Status_Atualizacao": "Atualizado",
                "Acao_Solicitada": "Nenhuma",
            }
            pr = requests.patch(patch_url, headers=headers, data=json.dumps(body), timeout=12)
            if pr.ok:
                held_back_hosts.append(host)

    # Atualiza também o cache local imediatamente para refletir na UI sem esperar 60s
    try:
        cache_file = DATA_DIR / "fleet_cache.json"
        if cache_file.exists():
            cache_data = json.loads(cache_file.read_text(encoding="utf-8"))
            for s in cache_data.get("services", []):
                if (s.get("nome_servico") or "").lower().replace(" ", "") in (
                    service_name.lower().replace(" ", ""),
                    f"dna.{service_name}".lower().replace(" ", ""),
                ):
                    if s.get("hostname") in dispatched_hosts:
                        s["versao_desejada"] = clean_target
                        s["acao_solicitada"] = "Atualizar"
                        s["status_atualizacao"] = "Em Homologação Canário" if phase == "canary" else "Desatualizado"
                    elif s.get("hostname") in held_back_hosts:
                        s["versao_desejada"] = s.get("versao_instalada") or "1.0.15.0"
                        s["acao_solicitada"] = "Nenhuma"
                        s["status_atualizacao"] = "Atualizado"
            cache_file.write_text(json.dumps(cache_data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

    return {
        "success": True,
        "phase": phase,
        "service_name": service_name,
        "target_version": clean_target,
        "dispatched_count": len(dispatched_hosts),
        "dispatched_hosts": dispatched_hosts,
        "held_back_count": len(held_back_hosts),
        "already_updated_count": len(already_updated),
        "already_targeted_count": len(dispatched_hosts),
        "message": (
            f"Fase Piloto Canário ativa em {len(dispatched_hosts)} praça(s) piloto ({len(already_updated)} já na v{clean_target}; {len(held_back_hosts)} praças blindadas aguardando homologação)."
            if phase == "canary"
            else f"Rollout Global disparado para {len(dispatched_hosts)} máquina(s) restantes da frota!"
        ),
    }
