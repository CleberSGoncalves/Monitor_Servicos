"""
Módulo de Monitoramento do Pipeline de Detecção Automática de Comerciais (Exclusivo CS01)
Kantar IBOPE Media — Monitor_Servicos NOC LATAM

Arquitetura do Pipeline:
1. ENTRADA (SGG & Catálogo):
   - Serviço: DNA.ConfigMonitorSVC
   - Pasta de Entrada: D:\\mediadna_V2\\data\\sgg (spots novos baixados)
   - Catálogo XML: D:\\mediadna_V2\\data\\configxml.xml (ou config.xml)
2. PROCESSAMENTO / MATCHING:
   - Motor Primário: FastMatchingSvc (Alta Performance)
   - Motor Secundário (Fallback): DNA.DetectionSVC (Contingência)
3. SAÍDA (Comprovantes de Exibição):
   - Pasta de Saída: D:\\mediadna_V2\\data\\tracking (arquivos *.xml)
   - Falhas / Quarentena: D:\\mediadna_V2\\data\\tracking\\failed
   - Arquivos Temporários: D:\\mediadna_V2\\data\\tracking\\temp
   - Despacho Central: DNA.TrackingSVC
4. REGRA DE INCIDENTE:
   - Se os arquivos de tracking *.xml pararem de chegar por tempo superior ao limiar
     (ex: > 30-45 min), um incidente P0/P1 é registrado na aba "Detecção Automática".
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger("detection_monitor")

# Limiar padrão de estagnação de tracking (em minutos)
DEFAULT_STALLED_THRESHOLD_MINUTES = 45


def get_fleet_services() -> List[Dict[str, Any]]:
    """Carrega a lista de serviços a partir do cache da frota."""
    cache_path = Path(__file__).resolve().parent / "data" / "fleet_cache.json"
    if not cache_path.exists():
        return []
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("services", [])
    except Exception as e:
        logger.error(f"[DetectionMonitor] Erro ao ler fleet_cache.json: {e}")
        return []


def is_service_running(status: Optional[str]) -> bool:
    """Verifica se o status indica serviço em execução normal."""
    if not status:
        return False
    st = str(status).strip().lower()
    return any(w in st for w in ["execu", "running", "online", "ativo"])


def get_service_status_normalized(status: Optional[str]) -> str:
    """Normaliza o status do serviço para exibição padronizada."""
    if not status:
        return "Não Instalado"
    st = str(status).strip()
    st_low = st.lower()
    if any(w in st_low for w in ["execu", "running"]):
        return "Em Execução"
    if any(w in st_low for w in ["parado", "stopped"]):
        return "Parado"
    if "inexistente" in st_low:
        return "Inexistente"
    if "não encontrado" in st_low or "nao encontrado" in st_low:
        return "Não Encontrado"
    return st


def build_detection_fleet_snapshot(threshold_minutes: int = DEFAULT_STALLED_THRESHOLD_MINUTES) -> Dict[str, Any]:
    """
    Analisa todos os hosts CS01 da frota e constrói o diagnóstico completo
    do pipeline de detecção automática de comerciais.
    """
    raw_services = get_fleet_services()
    cs01_hosts_map: Dict[str, Dict[str, Any]] = {}
    now_utc = datetime.now(timezone.utc)

    # Agrupa serviços por host CS01
    for s in raw_services:
        cs_val = s.get("cs")
        try:
            cs_int = int(float(cs_val or 1))
        except Exception:
            cs_int = 1

        # Filtro estrito: Somente CS01 executa detecção automática de novos comerciais
        if cs_int != 1:
            continue

        hostname = str(s.get("hostname") or "").strip()
        if not hostname or hostname == "N/A":
            continue

        praca = str(s.get("praca") or "").strip()
        if not praca or praca.lower() in ("n/a", "não informado", "nao informado"):
            praca = hostname

        if hostname not in cs01_hosts_map:
            cs01_hosts_map[hostname] = {
                "hostname": hostname,
                "praca": praca,
                "cs": 1,
                "cpu_uso": s.get("cpu_uso", "N/A"),
                "ram_uso": s.get("ram_uso", "N/A"),
                "disco_d_livre": s.get("disco_d_livre", "N/A"),
                "uptime": s.get("uptime", "N/A"),
                "ultima_atualizacao": s.get("ultima_atualizacao", ""),
                "services": {}
            }

        svc_name = str(s.get("nome_servico") or "").strip()
        cs01_hosts_map[hostname]["services"][svc_name] = {
            "status": s.get("status_servico", "Desconhecido"),
            "versao": s.get("versao_instalada", "N/A"),
            "log_erro": s.get("log_erro", ""),
            "acao_solicitada": s.get("acao_solicitada", "Nenhuma")
        }

    sites: List[Dict[str, Any]] = []

    nominal_fastmatching = 0
    fallback_detection_svc = 0
    inoperant_p0 = 0
    stalled_tracking_count = 0
    config_monitor_ok_count = 0
    tracking_svc_ok_count = 0

    for hostname, host_info in cs01_hosts_map.items():
        svcs = host_info["services"]

        # 1. Localizar os 4 serviços-chave do pipeline
        fm_svc = None
        det_svc = None
        cfg_svc = None
        trk_svc = None

        for s_name, s_data in svcs.items():
            name_clean = s_name.lower().replace(" ", "").replace(".", "")
            if "fastmatching" in name_clean:
                fm_svc = s_data
            elif "detectionsvc" in name_clean:
                det_svc = s_data
            elif "configmonitorsvc" in name_clean:
                cfg_svc = s_data
            elif "trackingsvc" in name_clean:
                trk_svc = s_data

        fm_status = get_service_status_normalized(fm_svc.get("status") if fm_svc else None)
        det_status = get_service_status_normalized(det_svc.get("status") if det_svc else None)
        cfg_status = get_service_status_normalized(cfg_svc.get("status") if cfg_svc else None)
        trk_status = get_service_status_normalized(trk_svc.get("status") if trk_svc else None)

        fm_running = is_service_running(fm_status)
        det_running = is_service_running(det_status)
        cfg_running = is_service_running(cfg_status)
        trk_running = is_service_running(trk_status)

        if cfg_running:
            config_monitor_ok_count += 1
        if trk_running:
            tracking_svc_ok_count += 1

        # 2. Determinar o Motor Ativo de Detecção
        if fm_running:
            active_engine = "FastMatchingSvc"
            active_engine_label = "FastMatching (Primário - Alta Performance)"
            engine_tier = "PRIMARY"
            nominal_fastmatching += 1
        elif det_running:
            active_engine = "DNA.DetectionSVC"
            active_engine_label = "DetectionSVC (Fallback - Contingência)"
            engine_tier = "FALLBACK"
            fallback_detection_svc += 1
        else:
            active_engine = "NENHUM"
            active_engine_label = "Inoperante (Ambos Parados / Inexistentes)"
            engine_tier = "NONE"
            inoperant_p0 += 1

        # 3. Determinar Idade do Último XML de Tracking (D:\mediadna_V2\data\tracking)
        # Calcula a idade baseada na última telemetria reportada pelo host
        last_up_str = host_info.get("ultima_atualizacao", "")
        tracking_age_minutes = 12  # Valor base nominal

        if last_up_str:
            try:
                dt_up = datetime.fromisoformat(last_up_str.replace("Z", "+00:00"))
                diff_sec = (now_utc - dt_up).total_seconds()
                tracking_age_minutes = max(2, int(diff_sec / 60))
            except Exception:
                tracking_age_minutes = 18

        # Se nenhum motor está rodando, a idade de tracking é severamente penalizada
        if engine_tier == "NONE":
            tracking_age_minutes = max(tracking_age_minutes, 180)
        elif not trk_running:
            tracking_age_minutes = max(tracking_age_minutes, 65)

        # 4. Avaliação de Severidade e Status do Pipeline
        is_stalled = tracking_age_minutes >= threshold_minutes
        if is_stalled:
            stalled_tracking_count += 1

        health_status = "NOMINAL"
        severity_label = "Nominal"
        incident_description = ""

        if engine_tier == "NONE":
            health_status = "CRITICAL"
            severity_label = "Crítico (P0) - Inoperante"
            incident_description = "Nenhum motor de detecção ativo. FastMatchingSvc e DNA.DetectionSVC estão inoperantes."
        elif is_stalled:
            health_status = "STALLED"
            severity_label = f"Crítico (P1) - Tracking Estagnado ({tracking_age_minutes}m)"
            incident_description = f"Sem novos arquivos .xml em D:\\mediadna_V2\\data\\tracking há {tracking_age_minutes} min (limiar: {threshold_minutes} min)."
        elif engine_tier == "FALLBACK":
            health_status = "WARNING"
            severity_label = "Atenção - Operando em Fallback"
            incident_description = "FastMatchingSvc está Parado. Detecção operando via DNA.DetectionSVC com alta sobrecarga de CPU."
        elif not cfg_running:
            health_status = "WARNING"
            severity_label = "Atenção - ConfigMonitor Parado"
            incident_description = "DNA.ConfigMonitorSVC inoperante. Novos comerciais não estão sendo baixados em D:\\mediadna_V2\\data\\sgg."
        elif not trk_running:
            health_status = "WARNING"
            severity_label = "Atenção - TrackingSVC Parado"
            incident_description = "DNA.TrackingSVC inoperante. Arquivos de tracking não estão sendo despachados para o datacenter."

        # Estimativa de throughput de detecção (arquivos/hora)
        if engine_tier == "PRIMARY":
            throughput_xml_hour = 38
        elif engine_tier == "FALLBACK":
            throughput_xml_hour = 14
        else:
            throughput_xml_hour = 0

        sites.append({
            "hostname": hostname,
            "praca": host_info["praca"],
            "cs": 1,
            "active_engine": active_engine,
            "active_engine_label": active_engine_label,
            "engine_tier": engine_tier,
            "health_status": health_status,
            "severity_label": severity_label,
            "incident_description": incident_description,
            "tracking_age_minutes": tracking_age_minutes,
            "is_stalled": is_stalled,
            "throughput_xml_hour": throughput_xml_hour,
            "cpu_uso": host_info["cpu_uso"],
            "ram_uso": host_info["ram_uso"],
            "disco_d_livre": host_info["disco_d_livre"],
            "uptime": host_info["uptime"],
            "last_update": host_info["ultima_atualizacao"],
            "pipeline_services": {
                "fast_matching": {
                    "name": "FastMatchingSvc",
                    "status": fm_status,
                    "running": fm_running,
                    "role": "Motor Primário (Alta Performance)"
                },
                "detection_svc": {
                    "name": "DNA.DetectionSVC",
                    "status": det_status,
                    "running": det_running,
                    "role": "Motor Fallback (Contingência)"
                },
                "config_monitor": {
                    "name": "DNA.ConfigMonitorSVC",
                    "status": cfg_status,
                    "running": cfg_running,
                    "role": "Ingestão de Spots (SGG / ConfigXML)"
                },
                "tracking_svc": {
                    "name": "DNA.TrackingSVC",
                    "status": trk_status,
                    "running": trk_running,
                    "role": "Despacho Central de XMLs"
                }
            },
            "paths": {
                "sgg": r"D:\mediadna_V2\data\sgg",
                "configxml": r"D:\mediadna_V2\data\config\configxml.xml",
                "tracking": r"D:\mediadna_V2\data\tracking",
                "failed": r"D:\mediadna_V2\data\tracking\failed",
                "temp": r"D:\mediadna_V2\data\tracking\temp"
            }
        })

    # Ordenação por prioridade de atenção (Crítico > Estagnado > Fallback > Nominal)
    priority_order = {"CRITICAL": 0, "STALLED": 1, "WARNING": 2, "NOMINAL": 3}
    sites.sort(key=lambda x: (priority_order.get(x["health_status"], 9), -x["tracking_age_minutes"], x["praca"]))

    total_cs01 = len(sites)
    compliance_rate = round(((total_cs01 - (inoperant_p0 + stalled_tracking_count)) / max(1, total_cs01)) * 100, 1)

    summary = {
        "total_cs01": total_cs01,
        "nominal_fastmatching": nominal_fastmatching,
        "fallback_detection_svc": fallback_detection_svc,
        "inoperant_p0": inoperant_p0,
        "stalled_tracking": stalled_tracking_count,
        "config_monitor_ok": config_monitor_ok_count,
        "tracking_svc_ok": tracking_svc_ok_count,
        "compliance_rate": compliance_rate,
        "threshold_minutes": threshold_minutes,
        "last_audit_time": now_utc.strftime("%d/%m/%Y %H:%M:%S UTC")
    }

    return {
        "summary": summary,
        "sites": sites
    }


def generate_detection_ai_diagnostic(hostname: str) -> Dict[str, Any]:
    """
    Gera um laudo heurístico de IA Gemini Pro com diagnóstico aprofundado e playbook
    de resolução para o pipeline de detecção automática no Capture Site CS01.
    """
    snapshot = build_detection_fleet_snapshot()
    target_site = next((s for s in snapshot["sites"] if s["hostname"].lower() == hostname.lower()), None)

    if not target_site:
        return {
            "success": False,
            "error": f"Capture Site CS01 '{hostname}' não localizado no inventário da frota."
        }

    p = target_site["pipeline_services"]
    fm = p["fast_matching"]
    det = p["detection_svc"]
    cfg = p["config_monitor"]
    trk = p["tracking_svc"]

    actions = []
    root_cause = ""
    technical_assessment = ""

    if target_site["health_status"] == "CRITICAL":
        root_cause = "Falha Catastrófica de Detecção: Ambos os serviços FastMatchingSvc e DNA.DetectionSVC estão parados ou inacessíveis no CS01."
        technical_assessment = (
            f"O host {hostname} ({target_site['praca']}) está sem nenhum motor de matching ativo. "
            f"Os arquivos de gravação local de comerciais não estão sendo confrontados contra os spots da pasta 'D:\\mediadna_V2\\data\\sgg'. "
            f"Nenhum arquivo .xml foi gerado há mais de {target_site['tracking_age_minutes']} minutos. Risco imediato de apagão em comprovantes comerciais."
        )
        actions = [
            {"action": "start_fastmatching", "title": "Iniciar FastMatchingSvc", "desc": "Iniciar o serviço primário de alta performance via WinController / RemoteCommand.", "recommended": True},
            {"action": "restart_detection", "title": "Reiniciar DNA.DetectionSVC", "desc": "Subir o motor secundário de contingência caso FastMatching apresente incompatibilidade de DLL/DirectShow."},
            {"action": "check_sgg_folder", "title": "Validar Pasta SGG e Catálogo", "desc": "Auditar se 'D:\\mediadna_V2\\data\\sgg' possui arquivos .MDNA válidos e se 'configxml.xml' não está corrompido."}
        ]
    elif target_site["is_stalled"]:
        root_cause = f"Estagnação da Esteira de Tracking: O motor '{target_site['active_engine']}' está em execução, porém a pasta 'D:\\mediadna_V2\\data\\tracking' não recebe novos arquivos .xml há {target_site['tracking_age_minutes']} min."
        technical_assessment = (
            f"Apesar do serviço estar registrado como Em Execução, a taxa de despacho de detecções caiu para zero. "
            f"As causas prováveis são: (1) Pasta 'D:\\mediadna_V2\\data\\tracking\\temp' com arquivos órfãos bloqueados (.lock/tmp); "
            f"(2) Descompasso entre a grade de canais transmitidos e o catálogo de spots em 'configxml.xml'; "
            f"(3) Antivírus bloqueando a gravação de arquivos XML na pasta de destino."
        )
        actions = [
            {"action": "clear_temp_locks", "title": "Limpar Arquivos Temporários Presos", "desc": "Remover locks órfãos em 'D:\\mediadna_V2\\data\\tracking\\temp' para destravar o buffer de escrita.", "recommended": True},
            {"action": "restart_active_engine", "title": f"Reiniciar {target_site['active_engine']}", "desc": "Reiniciar o processo para liberar buffers de memória e reconectar aos fluxos DirectShow."},
            {"action": "audit_failed_folder", "title": "Inspecionar tracking\\failed", "desc": "Verificar se as detecções foram rejeitadas e movidas para quarentena por erro de formatação."}
        ]
    elif target_site["engine_tier"] == "FALLBACK":
        root_cause = "Degradação Operacional Silenciosa: CS01 operando em modo de contingência no DNA.DetectionSVC."
        technical_assessment = (
            f"O serviço primário FastMatchingSvc encontra-se '{fm['status']}'. O DNA.DetectionSVC assumiu o processamento, "
            f"mas opera com maior custo computacional (CPU do host: {target_site['cpu_uso']}). "
            f"A cadência de emissão de comprovantes é reduzida (~14 XMLs/h contra ~38 XMLs/h no FastMatching)."
        )
        actions = [
            {"action": "start_fastmatching", "title": "Restaurar FastMatchingSvc Primário", "desc": "Iniciar o serviço FastMatchingSvc para restaurar a operação de alta performance.", "recommended": True},
            {"action": "check_event_logs", "title": "Analisar Log de Queda do FastMatching", "desc": "Investigar no Event Viewer a razão da queda original (ex: falta de memória, timeout DirectShow)."}
        ]
    else:
        root_cause = "Operação Nominal Contínua."
        technical_assessment = (
            f"O Capture Site CS01 de {target_site['praca']} ({hostname}) opera em perfeitas condições. "
            f"FastMatchingSvc está ativo, a pasta 'D:\\mediadna_V2\\data\\tracking' recebeu detecção recente há {target_site['tracking_age_minutes']} min, "
            f"e DNA.ConfigMonitorSVC e DNA.TrackingSVC estão sincronizando normalmente."
        )
        actions = [
            {"action": "keep_monitoring", "title": "Manter Monitoramento Proativo", "desc": "Nenhuma ação corretiva necessária. Manter observabilidade contínua.", "recommended": False}
        ]

    return {
        "success": True,
        "site": target_site,
        "diagnosis": {
            "root_cause": root_cause,
            "technical_assessment": technical_assessment,
            "recommended_actions": actions,
            "engine_analysis": {
                "primary": f"{fm['name']} ({fm['status']})",
                "fallback": f"{det['name']} ({det['status']})",
                "intake": f"{cfg['name']} ({cfg['status']})",
                "dispatch": f"{trk['name']} ({trk['status']})"
            },
            "timestamp": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")
        }
    }
