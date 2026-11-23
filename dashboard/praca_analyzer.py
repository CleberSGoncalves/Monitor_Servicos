"""
praca_analyzer.py - Analisador Forense de Capture Sites por Praca & Central de Solucoes Inteligente
Examina a topologia completa da praca (CS01, CS02, CS03, canais, tuners, esteira de deteccao, SGG e WCF)
e gera um plano de acao guiado passo a passo para o operador N1 resolver sem RDP.
"""
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from sharepoint_sync import get_cached_data

logger = logging.getLogger("PracaAnalyzer")

def list_active_pracas() -> List[Dict[str, Any]]:
    """Retorna lista consolidada de todas as pracas ativas com contagem de hosts e canais."""
    data = get_cached_data()
    channels = data.get("channels", [])
    services = data.get("services", [])

    praca_map = {}
    for c in channels:
        p = (c.get("cidade") or c.get("praca") or "").strip()
        if not p:
            continue
        p_norm = p.title()
        if p_norm not in praca_map:
            praca_map[p_norm] = {"praca": p_norm, "total_canais": 0, "canais_com_falha": 0, "hosts": set()}
        praca_map[p_norm]["total_canais"] += 1
        if c.get("has_outage") or c.get("qualidade_sinal") == "0":
            praca_map[p_norm]["canais_com_falha"] += 1
        h = c.get("host") or c.get("hostname")
        if h:
            praca_map[p_norm]["hosts"].add(h)

    for s in services:
        p = (s.get("praca") or "").strip()
        if not p:
            continue
        p_norm = p.title()
        if p_norm in praca_map and s.get("hostname"):
            praca_map[p_norm]["hosts"].add(s.get("hostname"))

    result = []
    for p, info in sorted(praca_map.items()):
        result.append({
            "praca": p,
            "total_canais": info["total_canais"],
            "canais_com_falha": info["canais_com_falha"],
            "total_hosts": len(info["hosts"]),
            "status_geral": "CRITICO" if info["canais_com_falha"] > 0 else "NOMINAL"
        })
    return result


def audit_praca_ecosystem(praca_name: str) -> Dict[str, Any]:
    """
    Realiza o Raio-X completo e deterministico de todos os Capture Sites da praca informada.
    Audita:
    1. Hosts fisicos (CS01, CS02, CS03) e status dos agentes.
    2. Sintonizadores, Tuners, Sinal RF e Gravacao MP4/MP3 por canal.
    3. Motor de deteccao no CS01 (FastMatching vs DetectionSVC vs Concorrencia).
    4. Integridade da base SGG (spots) e esteira de envio WCF (ConfigMonitor).
    """
    p_norm = (praca_name or "").strip().lower()
    data = get_cached_data()
    all_channels = data.get("channels", [])
    all_services = data.get("services", [])

    praca_channels = [c for c in all_channels if (c.get("cidade") or c.get("praca") or "").strip().lower() == p_norm]
    praca_services = [s for s in all_services if (s.get("praca") or "").strip().lower() == p_norm]

    # Agrupamento de hosts
    hosts_dict = {}
    for s in praca_services:
        h = s.get("hostname", "")
        if h not in hosts_dict:
            # Identifica se e CS01, CS02 ou CS03
            cs_tier = 1
            if "02" in h or "cs2" in h.lower() or "dt02" in h.lower():
                cs_tier = 2
            elif "03" in h or "cs3" in h.lower() or "dt03" in h.lower():
                cs_tier = 3

            hosts_dict[h] = {
                "hostname": h,
                "cs_tier": cs_tier,
                "services": [],
                "status_geral": "NOMINAL",
                "versao_agente": s.get("versao_instalada", "N/D"),
                "ultima_atualizacao": s.get("ultima_atualizacao", "N/D")
            }
        hosts_dict[h]["services"].append({
            "nome": s.get("nome_servico"),
            "status": s.get("status_servico"),
            "versao": s.get("versao_instalada")
        })

    # Lista de problemas detectados
    problems = []

    # 1. Auditoria do Motor de Deteccao no CS01
    cs01_hosts = [h for h, info in hosts_dict.items() if info["cs_tier"] == 1]
    cs01_host = cs01_hosts[0] if cs01_hosts else (list(hosts_dict.keys())[0] if hosts_dict else None)

    active_engine = "NENHUM"
    engine_conflict = False

    if cs01_host:
        svcs = hosts_dict[cs01_host]["services"]
        fm = next((s for s in svcs if "fastmatch" in s["nome"].lower()), None)
        det = next((s for s in svcs if "detectionsvc" in s["nome"].lower()), None)
        trk = next((s for s in svcs if "trackingsvc" in s["nome"].lower()), None)
        cfg = next((s for s in svcs if "configmonitorsvc" in s["nome"].lower()), None)

        fm_run = fm and fm["status"] == "Em Execução"
        det_run = det and det["status"] == "Em Execução"

        if fm_run and det_run:
            engine_conflict = True
            active_engine = "CONFLITO (FastMatching + DetectionSVC ativos)"
            problems.append({
                "code": "ENGINE_CONCURRENCY_CONFLICT",
                "severity": "CRITICO",
                "category": "Deteccao Comercial",
                "host": cs01_host,
                "title": "Conflito de Concorrência entre FastMatching e DetectionSVC",
                "detail": "Ambos os motores estão rodando simultaneamente no CS01. Isso causa bloqueio de CPU, lock de arquivos EMU e duplicidade de logs.",
                "recommended_action": "safe_cascade_restart",
                "action_label": "Desativar Legado & Manter FastMatching"
            })
        elif fm_run:
            active_engine = "FastMatchingSvc (Moderno C++)"
            # Auditoria de Recon / Fingerprints em memória no FastMatching (Ponta Porã recon=0)
            try:
                from tracking_detection_monitor import get_fastmatching_node_telemetry
                fm_telemetry = get_fastmatching_node_telemetry(cs01_host, praca_name)
                if fm_telemetry.get("catalog_recon_zero"):
                    problems.append({
                        "code": "FASTMATCHING_CATALOG_RECON_ZERO",
                        "severity": "CRITICO",
                        "category": "Deteccao Comercial",
                        "host": cs01_host,
                        "title": "FastMatching Ocioso / Falha de Carregamento de Spots (recon=0)",
                        "detail": "O FastMatchingSvc identificou o catálogo ConfigXml.xml mas carregou 0 spots (recon=0, RAM ociosa). Causa provável: Templates .mdna ausentes em data\\sgg ou IdCanal incorreto no FastMatchingSvc.ini.",
                        "recommended_action": "fastmatching_recon_fix",
                        "action_label": "Auto-Cura FastMatching (recon=0 Fix)"
                    })
            except Exception as e:
                logger.warning(f"Erro ao checar telemetria FastMatching em {cs01_host}: {e}")
        elif det_run:
            active_engine = "DNA.DetectionSVC + TrackingSVC (Legado .NET)"
        else:
            active_engine = "PARADO"
            problems.append({
                "code": "DETECTION_ENGINE_STOPPED",
                "severity": "CRITICO",
                "category": "Deteccao Comercial",
                "host": cs01_host,
                "title": "Nenhum Motor de Detecção Comercial Ativo no CS01",
                "detail": "O Capture Site CS01 não possui nenhum motor de matching rodando. Nenhuma detecção comercial está sendo gerada.",
                "recommended_action": "safe_cascade_restart",
                "action_label": "Iniciar Motor com Auto-Cura Segura"
            })

        if cfg and cfg["status"] != "Em Execução":
            problems.append({
                "code": "CONFIG_MONITOR_STOPPED",
                "severity": "CRITICO",
                "category": "Transmissao WCF",
                "host": cs01_host,
                "title": "DNA.ConfigMonitorSVC Parado no CS01",
                "detail": "O despachante WCF está inativo. Os arquivos de detecção estão represados na pasta data\\tracking sem envio à matriz.",
                "recommended_action": "safe_cascade_restart",
                "action_label": "Reiniciar ConfigMonitorSVC"
            })

    # 2. Auditoria de Canais, Tuners e Gravacao
    canais_auditoria = []
    for c in praca_channels:
        canal_nome = c.get("canal", "Canal Desconhecido")
        is_radio = "fm" in canal_nome.lower() or "am" in canal_nome.lower() or "radio" in canal_nome.lower()
        tuner_stat = c.get("status_tuner", "Lock")
        has_outage = bool(c.get("has_outage", False))
        qualidade = int(float(c.get("qualidade_sinal") or 0))

        mp4_rec = c.get("gravando_mp4") == "Sim"
        mp3_rec = c.get("gravando_mp3") == "Sim"
        rec_nominal = mp3_rec if is_radio else mp4_rec

        # Deteccao de problemas no canal
        if has_outage or "disconnect" in tuner_stat.lower() or qualidade == 0:
            problems.append({
                "code": "CHANNEL_SIGNAL_OUTAGE",
                "severity": "CRITICO",
                "category": "Sinal & Sintonia",
                "host": c.get("host") or cs01_host or "CS",
                "canal": canal_nome,
                "title": f"Quebra de Sinal / Tuner sem Lock: {canal_nome}",
                "detail": f"O canal {canal_nome} está com status de tuner '{tuner_stat}' e Qualidade de Sinal em {qualidade}%.",
                "recommended_action": "restart_tuner",
                "action_label": f"Reiniciar Sintonizador ({canal_nome})"
            })
        elif not rec_nominal:
            problems.append({
                "code": "RECORDING_FAULT",
                "severity": "ALERTA",
                "category": "Gravacao de Midia",
                "host": c.get("host") or cs01_host or "CS",
                "canal": canal_nome,
                "title": f"Falha de Gravação: {canal_nome}",
                "detail": f"Canal sintonizado mas sem geração contínua de {'MP3' if is_radio else 'MP4/ASF'}.",
                "recommended_action": "restart_atria_capture",
                "action_label": "Reiniciar Atria Capture"
            })

        canais_auditoria.append({
            "canal": canal_nome,
            "meio": "Radio" if is_radio else "TV",
            "qualidade": qualidade,
            "status_tuner": tuner_stat,
            "gravando": "Sim" if rec_nominal else "Nao",
            "has_outage": has_outage
        })

    # Health score deterministico (0 a 100)
    total_checks = max(1, len(praca_channels) * 2 + len(hosts_dict) * 3)
    fault_weight = sum(3 if p["severity"] == "CRITICO" else 1 for p in problems)
    health_score = max(0, min(100, int(100 - (fault_weight / total_checks * 100))))

    return {
        "praca": praca_name.title(),
        "timestamp_auditoria": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "health_score": health_score,
        "status_geral": "CRITICO" if any(p["severity"] == "CRITICO" for p in problems) else ("ALERTA" if problems else "NOMINAL"),
        "total_hosts": len(hosts_dict),
        "total_canais": len(praca_channels),
        "hosts": list(hosts_dict.values()),
        "canais": canais_auditoria,
        "active_engine": active_engine,
        "engine_conflict": engine_conflict,
        "cs01_host": cs01_host,
        "problems": problems,
        "total_problems": len(problems)
    }


def generate_ai_solutions_plan(audit_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Central de Solucoes Inteligente:
    Recebe os dados do Raio-X e gera o plano explicativo estruturado com o pipeline de resolucao
    e botoes de acao de 1 clique integrados para o operador N1.
    """
    praca = audit_data.get("praca", "Praca")
    problems = audit_data.get("problems", [])
    cs01_host = audit_data.get("cs01_host", "")
    score = audit_data.get("health_score", 100)

    if not problems:
        return {
            "praca": praca,
            "health_score": score,
            "veredito": f"O ecossistema do Capture Site {praca} está 100% NOMINAL e operacional. Todos os serviços, gravações e esteira de detecção estão saudáveis.",
            "pipeline_steps": [],
            "can_escalate": False
        }

    # Pipeline guiado de passos executaveis
    steps = []
    step_num = 1

    # Passo A: Resolver Conflitos de Motor ou Parada no CS01
    has_engine_issue = any(p["code"] in ("ENGINE_CONCURRENCY_CONFLICT", "DETECTION_ENGINE_STOPPED", "CONFIG_MONITOR_STOPPED") for p in problems)
    if has_engine_issue and cs01_host:
        steps.append({
            "step": step_num,
            "title": "Restaurar Esteira de Detecção com Auto-Cura Segura (Zero Exclusão de .EMU)",
            "why": "O motor de detecção ou o ConfigMonitor do CS01 apresentam falha de concorrência ou parada. A auto-cura reinicia os serviços em ordem estrita, isola o motor correto e preserva integralmente as gravações de áudio.",
            "action_type": "safe_heal",
            "action_payload": {"hostname": cs01_host, "mode": "safe_cascade_restart"},
            "btn_label": "⚡ Executar Auto-Cura Segura no CS01",
            "btn_style": "btn-primary",
            "estimated_time": "30 segundos"
        })
        step_num += 1

    # Passo A1: Correção Específica de FastMatching recon=0 / Ponta Porã
    has_recon_zero = any(p["code"] == "FASTMATCHING_CATALOG_RECON_ZERO" for p in problems)
    if has_recon_zero and cs01_host:
        steps.append({
            "step": step_num,
            "title": "Reset de Sincronização no Portal MediaDNA (Reset Sincronização)",
            "why": "Reinicializa o ponteiro de sincronização de spots no servidor central da Kantar IBOPE (https://mediadna.ibope.com). Ao reiniciar o ConfigMonitorSVC, o CS01 recebe o catálogo completo de spots .mdna do zero.",
            "action_type": "mediadna_reset_sync",
            "action_payload": {"praca": praca, "host_query": praca, "cs_hostname": cs01_host},
            "btn_label": "🌐 Resetar Sincronização no Portal MediaDNA",
            "btn_style": "btn-danger",
            "estimated_time": "25 segundos"
        })
        step_num += 1

        steps.append({
            "step": step_num,
            "title": "Recuperar Base de Fingerprints do FastMatching (Fix recon=0 & Resync SGG)",
            "why": "O FastMatchingSvc está ativo mas operando ocioso (RAM ~22MB) com 'recon=0' (nenhum spot comercial em memória). Esta ação audita o FastMatchingSvc.ini, força o download de templates .mdna via ConfigMonitorSVC e recarrega os spots no motor.",
            "action_type": "safe_heal",
            "action_payload": {"hostname": cs01_host, "mode": "fastmatching_recon_fix"},
            "btn_label": "⚡ Executar Correção FastMatching Local",
            "btn_style": "btn-primary",
            "estimated_time": "30 segundos"
        })
        step_num += 1

    # Passo B: Sincronizacao de Spots se houver suspeita de base desatualizada
    if cs01_host:
        steps.append({
            "step": step_num,
            "title": "Verificar & Ressincronizar Base de Spots (Pasta data\\sgg)",
            "why": "Garante que o catálogo local de comerciais (.MDNA) esteja 100% alinhado com as novidades cadastradas pela coleta central, sem arquivos corrompidos.",
            "action_type": "safe_heal",
            "action_payload": {"hostname": cs01_host, "mode": "sgg_resync_safe"},
            "btn_label": "🔄 Executar Resync Seguro SGG",
            "btn_style": "btn-secondary",
            "estimated_time": "45 segundos"
        })
        step_num += 1

    # Passo C: Canais sem Sinal / Tuner
    signal_problems = [p for p in problems if p["code"] == "CHANNEL_SIGNAL_OUTAGE"]
    if signal_problems:
        canals_str = ", ".join(p.get("canal", "") for p in signal_problems[:3])
        steps.append({
            "step": step_num,
            "title": f"Reiniciar Sintonizadores com Quebra de Sinal ({canals_str})",
            "why": "Reconecta o pipeline DirectShow/BDA da placa TBS ou reinicia o processo DigitalTVReceiver para restabelecer o Tuner Lock sem reiniciar a máquina inteira.",
            "action_type": "restart_atria_capture",
            "action_payload": {"hostname": signal_problems[0].get("host", cs01_host)},
            "btn_label": "📶 Reiniciar Sintonizadores & Tuners",
            "btn_style": "btn-warning",
            "estimated_time": "20 segundos"
        })
        step_num += 1

    # Passo D: Validacao Pos-Execucao
    steps.append({
        "step": step_num,
        "title": "Reauditar Capture Site para Comprovação de Restabelecimento",
        "why": "Após a aplicação dos passos acima, executa uma nova sonda determinística para garantir que a esteira de matching avançou o ponteiro e o health score atingiu 100%.",
        "action_type": "reaudit",
        "action_payload": {"praca": praca},
        "btn_label": "🔬 Reauditar Praça Agora",
        "btn_style": "btn-success",
        "estimated_time": "Imediato"
    })

    veredito = (
        f"Foram identificados {len(problems)} pontos de atenção no Capture Site {praca}. "
        f"O Health Score da praça está em {score}%. Siga o pipeline guiado abaixo para aplicar as correções "
        f"de forma 100% segura pelo Dashboard, sem necessidade de acesso manual via RDP."
    )

    return {
        "praca": praca,
        "health_score": score,
        "veredito": veredito,
        "total_problems": len(problems),
        "problems_summary": [p["title"] for p in problems],
        "pipeline_steps": steps,
        "can_escalate": True,
        "escalate_payload": {
            "praca": praca,
            "host": cs01_host or "CS",
            "severity": "P1" if score >= 50 else "P0",
            "delay_minutes": 60,
            "probable_cause_label": problems[0]["title"] if problems else "Degradação Operacional"
        }
    }
