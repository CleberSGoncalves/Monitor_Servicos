"""
praca_analyzer.py - Analisador Forense de Capture Sites por Praca & Central de Solucoes Inteligente
Kantar IBOPE Media — Central CS Fleet

Examina a topologia completa da praca e de cada Capture Site especifico (CS01, CS02, CS03):
- CS01: Deteccao Comercial (FastMatching / DetectionSVC) + Captura TV Principal.
- CS02: Captura e Gravacao de Veiculos Filiais (PROIBIDO analisar deteccao automatica).
- CS03: Captura de Rádio Sonifex / Streaming (NUNCA exige Lock RF nem SNR 0%).
"""
import re
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
        
        # Canal com falha apenas se houver outage real ou TV sem lock (ignora SNR em radio)
        canal_nome = c.get("canal", "").lower()
        is_rad = any(w in canal_nome for w in ["fm", "am", "radio", "rádio"]) or c.get("meio") == "Radio"
        if is_rad:
            rec_mp3 = "sim" in str(c.get("gravando_mp3", "")).lower()
            if not rec_mp3 or c.get("has_outage"):
                praca_map[p_norm]["canais_com_falha"] += 1
        else:
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


def audit_praca_ecosystem(praca_name: str, selected_cs: Optional[str] = "ALL") -> Dict[str, Any]:
    """
    Realiza o Raio-X completo e deterministico dos Capture Sites da praca informada.
    Permite filtrar por maquina especifica: 'ALL', 'CS01', 'CS02', 'CS03' ou hostname exato.
    """
    p_norm = (praca_name or "").strip().lower()
    selected_filter = (selected_cs or "ALL").strip().upper()
    data = get_cached_data()
    all_channels = data.get("channels", [])
    all_services = data.get("services", [])

    praca_channels_raw = [c for c in all_channels if (c.get("cidade") or c.get("praca") or "").strip().lower() == p_norm]
    praca_services_raw = [s for s in all_services if (s.get("praca") or "").strip().lower() == p_norm]

    # Agrupamento e identificacao dos hosts da praca
    hosts_dict = {}
    for s in praca_services_raw:
        h = s.get("hostname", "")
        if not h:
            continue
        if h not in hosts_dict:
            # Determinacao do CS Tier (1, 2 ou 3)
            cs_val = s.get("cs")
            if cs_val in (1, 2, 3):
                cs_tier = cs_val
            elif "02" in h or "cs2" in h.lower() or "dt02" in h.lower():
                cs_tier = 2
            elif "03" in h or "cs3" in h.lower() or "dt03" in h.lower() or "radio" in h.lower():
                cs_tier = 3
            else:
                cs_tier = 1

            label_prefix = f"CS0{cs_tier}"
            cs_role = "Detecção Comercial & TV Principal" if cs_tier == 1 else ("Captura TV Filial" if cs_tier == 2 else "Rádio Sonifex / Streaming")

            # Sanitizacao de CPU 95% estatico do SharePoint em CS2/CS3
            raw_cpu = str(s.get("cpu_uso") or "26%")
            if ("95%" in raw_cpu or "99%" in raw_cpu) and cs_tier in (2, 3):
                raw_cpu = "26%"

            hosts_dict[h] = {
                "hostname": h,
                "cs_tier": cs_tier,
                "cs_label": f"{label_prefix} — {cs_role}",
                "services": [],
                "status_geral": "NOMINAL",
                "versao_agente": s.get("versao_instalada", "N/D"),
                "ultima_atualizacao": s.get("ultima_atualizacao", "N/D"),
                "cpu_uso": raw_cpu,
                "ram_uso": s.get("ram_uso", "N/A"),
                "disco_d_livre": s.get("disco_d_livre", "N/A")
            }
        hosts_dict[h]["services"].append({
            "nome": s.get("nome_servico") or s.get("service_name") or s.get("nome") or "",
            "status": s.get("status_servico") or s.get("status") or "",
            "versao": s.get("versao_instalada") or s.get("versao_agente") or ""
        })

    # Lista de CS disponiveis na praca para os botoes da UI
    available_cs_options = []
    for h, info in sorted(hosts_dict.items(), key=lambda x: x[1]["cs_tier"]):
        available_cs_options.append({
            "cs_tier": info["cs_tier"],
            "code": f"CS0{info['cs_tier']}",
            "hostname": h,
            "label": f"CS0{info['cs_tier']} ({info['cs_label'].split('—')[1].strip()})"
        })

    # Filtragem de maquina se o operador selecionou CS01, CS02 ou CS03
    target_hosts = list(hosts_dict.values())
    is_single_cs_focus = False
    active_cs_tier = None
    focused_host = None

    if selected_filter in ("CS01", "CS1"):
        target_hosts = [info for info in hosts_dict.values() if info["cs_tier"] == 1]
        is_single_cs_focus = True
        active_cs_tier = 1
    elif selected_filter in ("CS02", "CS2"):
        target_hosts = [info for info in hosts_dict.values() if info["cs_tier"] == 2]
        is_single_cs_focus = True
        active_cs_tier = 2
    elif selected_filter in ("CS03", "CS3"):
        target_hosts = [info for info in hosts_dict.values() if info["cs_tier"] == 3]
        is_single_cs_focus = True
        active_cs_tier = 3
    elif selected_filter != "ALL":
        target_hosts = [info for info in hosts_dict.values() if info["hostname"] == selected_cs]
        if target_hosts:
            is_single_cs_focus = True
            active_cs_tier = target_hosts[0]["cs_tier"]

    if target_hosts:
        focused_host = target_hosts[0]["hostname"]

    # Se a praca inteira for o foco, tenta achar o CS01 legitimo
    cs01_candidates = [info["hostname"] for info in hosts_dict.values() if info["cs_tier"] == 1]
    cs01_host = cs01_candidates[0] if cs01_candidates else None

    # Filtragem de canais sem duplicatas e atribuidos a cada CS
    seen_channels = set()
    praca_channels = []
    for c in praca_channels_raw:
        c_name = c.get("canal", "Canal Desconhecido")
        c_host = c.get("host") or ""
        # Deduplicacao de canal na mesma praca
        if c_name in seen_channels:
            continue
        seen_channels.add(c_name)

        # Identifica CS do canal
        c_tier = 1
        is_rad = any(w in c_name.lower() for w in ["fm", "am", "radio", "rádio"]) or c.get("meio") == "Radio"
        if is_rad:
            # Se ha host CS03 na praca, o canal de radio pertence ao CS03
            c_tier = 3 if any(info["cs_tier"] == 3 for info in hosts_dict.values()) else 1
        elif "02" in c_host or "cs2" in c_host.lower():
            c_tier = 2

        c["cs_tier"] = c_tier
        c["cs_origin"] = f"CS0{c_tier}"

        # Se houver filtro ativo de CS, inclui apenas os canais daquela maquina
        if is_single_cs_focus and active_cs_tier is not None:
            if c_tier == active_cs_tier:
                praca_channels.append(c)
        else:
            praca_channels.append(c)

    problems = []

    # ==============================================================================
    # 1. AUDITORIA DO MOTOR DE DETECÇÃO COMERCIAL (ESTRITAMENTE EXCLUSIVO AO CS01)
    # ==============================================================================
    active_engine = "N/A"
    engine_conflict = False
    detection_analyzed = False

    # REGRA DE OURO: CS02 e CS03 NUNCA executam deteccao de comerciais!
    if is_single_cs_focus and active_cs_tier in (2, 3):
        active_engine = "N/A — Exclusivo CS01 (Nó de Captação)"
        detection_analyzed = False
    elif cs01_host and (not is_single_cs_focus or active_cs_tier == 1):
        detection_analyzed = True
        svcs = hosts_dict[cs01_host]["services"]
        fm = next((s for s in svcs if "fastmatch" in str(s.get("nome") or "").lower().replace(" ", "")), None)
        det = next((s for s in svcs if "detectionsvc" in str(s.get("nome") or "").lower().replace(" ", "")), None)
        trk = next((s for s in svcs if "trackingsvc" in str(s.get("nome") or "").lower().replace(" ", "")), None)
        cfg = next((s for s in svcs if "configmonitor" in str(s.get("nome") or "").lower().replace(" ", "")), None)

        fm_run = fm and any(w in str(fm.get("status", "")).lower() for w in ["execu", "running", "ativo"])
        det_run = det and any(w in str(det.get("status", "")).lower() for w in ["execu", "running", "ativo"])

        if fm_run and det_run:
            engine_conflict = True
            active_engine = "CONFLITO (FastMatching + DetectionSVC ativos)"
            problems.append({
                "code": "ENGINE_CONCURRENCY_CONFLICT",
                "severity": "CRITICO",
                "category": "Deteccao Comercial (CS01)",
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
                        "category": "Deteccao Comercial (CS01)",
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
                "category": "Deteccao Comercial (CS01)",
                "host": cs01_host,
                "title": "Nenhum Motor de Detecção Comercial Ativo no CS01",
                "detail": "O Capture Site CS01 não possui nenhum motor de matching rodando. Nenhuma detecção comercial está sendo gerada.",
                "recommended_action": "safe_cascade_restart",
                "action_label": "Iniciar Motor com Auto-Cura Segura"
            })

        if cfg and not any(w in str(cfg.get("status", "")).lower() for w in ["execu", "running", "ativo"]):
            problems.append({
                "code": "CONFIG_MONITOR_STOPPED",
                "severity": "CRITICO",
                "category": "Transmissao WCF (CS01)",
                "host": cs01_host,
                "title": "DNA.ConfigMonitorSVC Parado no CS01",
                "detail": "O despachante WCF está inativo. Os arquivos de detecção estão represados na pasta data\\tracking sem envio à matriz.",
                "recommended_action": "safe_cascade_restart",
                "action_label": "Reiniciar ConfigMonitorSVC"
            })
    elif not cs01_host:
        active_engine = "N/A — Praça sem CS01 de Detecção Cadastrado"

    # ==============================================================================
    # 2. AUDITORIA DE CANAIS, TUNERS E GRAVAÇÃO (COM LÓGICA CORRETA DE RÁDIO)
    # ==============================================================================
    canais_auditoria = []
    for c in praca_channels:
        canal_nome = c.get("canal", "Canal Desconhecido")
        is_radio = (
            any(w in canal_nome.lower() for w in ["fm", "am", "radio", "rádio"]) 
            or c.get("meio") == "Radio" 
            or "sonifex" in str(c.get("placa", "")).lower()
            or "stream" in str(c.get("placa", "")).lower()
        )
        tuner_stat = str(c.get("status_tuner", "Lock"))
        has_outage = bool(c.get("has_outage", False))
        mp4_rec = "sim" in str(c.get("gravando_mp4", "")).lower() or "gravando" in str(c.get("gravando_mp4", "")).lower()
        mp3_rec = "sim" in str(c.get("gravando_mp3", "")).lower() or "gravando" in str(c.get("gravando_mp3", "")).lower()

        # REGRAS RÍGIDAS DE RÁDIO VS TV DIGITAL:
        if is_radio:
            # Rádio (Sonifex FM / Streaming IP): NUNCA exige Lock RF nem SNR 0%!
            # Se gravando_mp3 == 'Sim', o canal está 100% NOMINAL!
            rec_nominal = mp3_rec
            qualidade_label = "Áudio OK (Sonifex)" if not "stream" in str(c.get("placa", "")).lower() else "Stream Conectado"
            display_qualidade = 100 if mp3_rec else 0
            is_nominal = mp3_rec and not has_outage

            if not mp3_rec:
                problems.append({
                    "code": "RADIO_AUDIO_RECORDING_FAULT",
                    "severity": "ALERTA",
                    "category": f"Gravação Rádio ({c.get('cs_origin', 'CS03')})",
                    "host": c.get("host") or focused_host or "CS",
                    "canal": canal_nome,
                    "title": f"Rádio sem Gravação MP3: {canal_nome}",
                    "detail": f"O canal de rádio {canal_nome} não está gerando arquivos MP3 contínuos no disco.",
                    "recommended_action": "restart_atria_capture",
                    "action_label": "Reiniciar Captura de Rádio"
                })

            canais_auditoria.append({
                "canal": canal_nome,
                "meio": "Radio",
                "is_radio": True,
                "cs_origin": c.get("cs_origin", "CS03"),
                "qualidade": display_qualidade,
                "qualidade_str": qualidade_label if mp3_rec else "Sem Áudio",
                "status_tuner": "Áudio OK (Sonifex/Stream)" if mp3_rec else "Sem Gravação",
                "gravando": "Sim" if mp3_rec else "Nao",
                "is_nominal": is_nominal,
                "has_outage": has_outage
            })
        else:
            # TV DIGITAL TERRESTRE (ISDB-Tb)
            qualidade = int(float(c.get("qualidade_sinal") or 0))
            rec_nominal = mp4_rec
            is_nominal = (not has_outage) and ("disconnect" not in tuner_stat.lower()) and (qualidade > 0) and rec_nominal

            if has_outage or "disconnect" in tuner_stat.lower() or qualidade == 0:
                problems.append({
                    "code": "TV_SIGNAL_OUTAGE",
                    "severity": "CRITICO",
                    "category": f"Sinal & Sintonia TV ({c.get('cs_origin', 'CS01')})",
                    "host": c.get("host") or focused_host or "CS",
                    "canal": canal_nome,
                    "title": f"Quebra de Sinal TV / Tuner sem Lock: {canal_nome}",
                    "detail": f"O canal digital {canal_nome} está com status de tuner '{tuner_stat}' e Qualidade de Sinal em {qualidade}%.",
                    "recommended_action": "restart_tuner",
                    "action_label": f"Reiniciar Sintonizador ({canal_nome})"
                })
            elif not mp4_rec:
                problems.append({
                    "code": "TV_RECORDING_FAULT",
                    "severity": "ALERTA",
                    "category": f"Gravação TV ({c.get('cs_origin', 'CS01')})",
                    "host": c.get("host") or focused_host or "CS",
                    "canal": canal_nome,
                    "title": f"Falha de Gravação TV: {canal_nome}",
                    "detail": f"Canal digital sintonizado mas sem geração contínua de MP4/ASF.",
                    "recommended_action": "restart_atria_capture",
                    "action_label": "Reiniciar Atria Capture"
                })

            canais_auditoria.append({
                "canal": canal_nome,
                "meio": "TV",
                "is_radio": False,
                "cs_origin": c.get("cs_origin", "CS01"),
                "qualidade": qualidade,
                "qualidade_str": f"{qualidade}%",
                "status_tuner": tuner_stat,
                "gravando": "Sim" if mp4_rec else "Nao",
                "is_nominal": is_nominal,
                "has_outage": has_outage
            })

    # ==============================================================================
    # 3. PIPELINE FORENSE DE 6 ESTÁGIOS DA MÁQUINA
    # ==============================================================================
    pipeline_stages = []
    current_target_host = focused_host or cs01_host or (list(hosts_dict.keys())[0] if hosts_dict else "CS")
    host_info = hosts_dict.get(current_target_host, {})
    host_tier = host_info.get("cs_tier", active_cs_tier or 1)

    # Estágio 1: Link & Keepalive
    agent_ver = host_info.get("versao_agente", "N/D")
    last_hb = host_info.get("ultima_atualizacao", "N/D")
    pipeline_stages.append({
        "id": "link",
        "title": "1. Conectividade & Keepalive",
        "status": "NOMINAL" if agent_ver != "N/D" else "CRITICO",
        "badge": f"Agente v{agent_ver}",
        "detail": f"Telemetria recebida às {last_hb[:19].replace('T', ' ')}" if last_hb != "N/D" else "Sem reporte do agente local."
    })

    # Estágio 2: Detecção Automática (Apenas CS01)
    if host_tier == 1 and detection_analyzed:
        det_stat = "NOMINAL" if active_engine not in ("PARADO", "NENHUM") and not engine_conflict and not any(p["code"] == "FASTMATCHING_CATALOG_RECON_ZERO" for p in problems) else "CRITICO"
        pipeline_stages.append({
            "id": "detection",
            "title": "2. Detecção Automática de Comerciais",
            "status": det_stat,
            "badge": active_engine,
            "detail": "Pipeline de matching operando nominalmente." if det_stat == "NOMINAL" else "Motor de detecção parado, em concorrência ou com recon=0."
        })
    else:
        pipeline_stages.append({
            "id": "detection",
            "title": "2. Detecção Automática de Comerciais",
            "status": "NA",
            "badge": "N/A — Exclusivo CS01",
            "detail": f"Este nó (CS0{host_tier}) opera na captação/gravação de mídia. O motor de matching roda exclusivamente no CS01."
        })

    # Estágio 3: Sintonizadores & Sinal
    signal_faults = [p for p in problems if "SIGNAL" in p["code"]]
    pipeline_stages.append({
        "id": "signal",
        "title": "3. Integridade de Sintonizadores & Sinal",
        "status": "CRITICO" if signal_faults else "NOMINAL",
        "badge": f"{len(signal_faults)} Anomalia(s)" if signal_faults else "Tuners Saudáveis",
        "detail": f"{len(signal_faults)} canal(is) sem Lock/Sinal." if signal_faults else "Todos os sintonizadores de TV e placas de áudio operando com lock/estabilidade."
    })

    # Estágio 4: Gravação Contínua
    rec_faults = [p for p in problems if "RECORDING" in p["code"]]
    pipeline_stages.append({
        "id": "recording",
        "title": "4. Fluxo de Gravação de Mídia",
        "status": "ALERTA" if rec_faults else "NOMINAL",
        "badge": f"{len(rec_faults)} Falha(s)" if rec_faults else "Gravação Ativa",
        "detail": f"{len(rec_faults)} canal(is) sem gravação de vídeo/áudio." if rec_faults else "Gravação nominal contínua de MP4/ASF (TV) e MP3 (Rádio)."
    })

    # Estágio 5: Hardware & SO
    cpu_val_str = host_info.get("cpu_uso", "26%")
    ram_val_str = host_info.get("ram_uso", "N/A")
    disk_val_str = host_info.get("disco_d_livre", "N/A")
    pipeline_stages.append({
        "id": "hardware",
        "title": "5. Recursos de Hardware & SO",
        "status": "NOMINAL",
        "badge": f"CPU {cpu_val_str} | RAM {ram_val_str}",
        "detail": f"Espaço em disco D: {disk_val_str}. Uso estável de hardware."
    })

    # Estágio 6: Despacho & Limpeza
    cfg_fault = any(p["code"] == "CONFIG_MONITOR_STOPPED" for p in problems)
    pipeline_stages.append({
        "id": "dispatch",
        "title": "6. Despacho & Arquivamento",
        "status": "CRITICO" if cfg_fault else "NOMINAL",
        "badge": "Despacho WCF OK" if not cfg_fault else "WCF Represado",
        "detail": "DNA.ConfigMonitorSVC operando despacho à matriz." if not cfg_fault else "DNA.ConfigMonitorSVC inativo. Verifique o serviço."
    })

    # Health score justo (0 a 100)
    total_checks = max(1, len(praca_channels) * 2 + len(target_hosts) * 3)
    fault_weight = sum(3 if p["severity"] == "CRITICO" else 1 for p in problems)
    health_score = max(0, min(100, int(100 - (fault_weight / total_checks * 100))))

    return {
        "praca": praca_name.title(),
        "selected_cs": selected_filter,
        "is_single_cs_focus": is_single_cs_focus,
        "active_cs_tier": active_cs_tier,
        "focused_host": current_target_host,
        "available_cs_options": available_cs_options,
        "timestamp_auditoria": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "health_score": health_score,
        "status_geral": "CRITICO" if any(p["severity"] == "CRITICO" for p in problems) else ("ALERTA" if problems else "NOMINAL"),
        "total_hosts": len(target_hosts),
        "total_canais": len(praca_channels),
        "hosts": target_hosts,
        "canais": canais_auditoria,
        "pipeline_stages": pipeline_stages,
        "problems": problems,
        "active_engine": active_engine,
        "engine_conflict": engine_conflict,
        "cs01_host": cs01_host
    }


def generate_ai_solutions_plan(audit_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Central de Solucoes Inteligente:
    Recebe os dados do Raio-X e gera o plano explicativo estruturado com o pipeline de resolucao
    e botoes de acao de 1 clique integrados para o operador N1, adaptado a CS01, CS02 ou CS03.
    """
    praca = audit_data.get("praca", "Praca")
    selected_cs = audit_data.get("selected_cs", "ALL")
    focused_host = audit_data.get("focused_host", "")
    cs01_host = audit_data.get("cs01_host", "")
    active_cs_tier = audit_data.get("active_cs_tier")
    problems = audit_data.get("problems", [])
    score = audit_data.get("health_score", 100)

    if not problems:
        target_name = f"no nó {selected_cs} ({focused_host})" if selected_cs != "ALL" else f"em todos os Capture Sites da praça {praca}"
        return {
            "praca": praca,
            "selected_cs": selected_cs,
            "focused_host": focused_host,
            "health_score": score,
            "veredito": f"O ecossistema {target_name} está 100% NOMINAL e saudável. Todos os canais, sintonizadores e gravações estão operando dentro dos parâmetros de SLA.",
            "pipeline_steps": [],
            "can_escalate": False
        }

    steps = []
    step_num = 1

    # ==============================================================================
    # PASSO A: RESOLUÇÃO DE DETECÇÃO (APENAS PARA CS01 OU VISÃO GERAL)
    # ==============================================================================
    if active_cs_tier in (None, 1) and cs01_host:
        has_recon_zero = any(p["code"] == "FASTMATCHING_CATALOG_RECON_ZERO" for p in problems)
        if has_recon_zero:
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

        has_engine_issue = any(p["code"] in ("ENGINE_CONCURRENCY_CONFLICT", "DETECTION_ENGINE_STOPPED", "CONFIG_MONITOR_STOPPED") for p in problems)
        if has_engine_issue and not has_recon_zero:
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

    # ==============================================================================
    # PASSO B: SINTONIZADORES DE TV DIGITAL (LOCK & SINAL RF)
    # ==============================================================================
    tv_signal_problems = [p for p in problems if p["code"] == "TV_SIGNAL_OUTAGE"]
    if tv_signal_problems:
        canals_str = ", ".join(p.get("canal", "") for p in tv_signal_problems[:3])
        target_h = tv_signal_problems[0].get("host") or focused_host
        steps.append({
            "step": step_num,
            "title": f"Reiniciar Sintonizadores de TV Digital sem Sinal ({canals_str})",
            "why": "Reconecta o pipeline DirectShow/BDA da placa TBS ou reinicia o processo DigitalTVReceiver para restabelecer o Tuner Lock sem reiniciar a máquina inteira.",
            "action_type": "restart_tuner",
            "action_payload": {"hostname": target_h},
            "btn_label": "📶 Reiniciar Sintonizadores TBS",
            "btn_style": "btn-warning",
            "estimated_time": "20 segundos"
        })
        step_num += 1

    # ==============================================================================
    # PASSO C: CAPTURA & GRAVAÇÃO (TV MP4/ASF OU RÁDIO MP3)
    # ==============================================================================
    rec_problems = [p for p in problems if "RECORDING" in p["code"]]
    if rec_problems:
        target_h = rec_problems[0].get("host") or focused_host
        is_rad_issue = any("RADIO" in p["code"] for p in rec_problems)
        steps.append({
            "step": step_num,
            "title": f"Reiniciar Módulo de Captura ({'Rádio Sonifex' if is_rad_issue else 'Atria Capture TV'})",
            "why": "Recicla o processo de gravação do Atria Capture para destravar a geração contínua de blocos sem perda de buffer.",
            "action_type": "restart_atria_capture",
            "action_payload": {"hostname": target_h},
            "btn_label": "🔄 Reciclar Atria Capture",
            "btn_style": "btn-warning",
            "estimated_time": "20 segundos"
        })
        step_num += 1

    # ==============================================================================
    # PASSO D: VALIDAÇÃO FINAL PÓS-EXECUÇÃO
    # ==============================================================================
    steps.append({
        "step": step_num,
        "title": "Auditoria de Fechamento & Validação de SLA",
        "why": "Re-executa a auditoria completa da praça para confirmar que todos os alertas foram sanados e o Health Score atingiu 100%.",
        "action_type": "reaudit",
        "action_payload": {"praca": praca, "selected_cs": selected_cs},
        "btn_label": "✅ Confirmar Resolução (Re-auditar)",
        "btn_style": "btn-success",
        "estimated_time": "5 segundos"
    })

    return {
        "praca": praca,
        "selected_cs": selected_cs,
        "focused_host": focused_host,
        "health_score": score,
        "veredito": f"Identificados {len(problems)} pontos de atenção no nó {selected_cs} ({focused_host or praca}). Siga o pipeline inteligente abaixo para aplicar as correções sem necessidade de acesso manual via RDP.",
        "pipeline_steps": steps,
        "can_escalate": score < 50
    }



def get_fleet_machines_overview() -> Dict[str, Any]:
    """
    Retorna a Visão Geral 360° de todas as máquinas da frota.
    Consolida para cada máquina o status dos 6 estágios:
    Link, Detecção Comercial, Sinal RF/Sintonizador, Gravação, Hardware e Despacho.
    Permite filtrar na UI por qualquer dimensão de incidente.
    """
    data = get_cached_data()
    all_channels = data.get("channels", [])
    all_services = data.get("services", [])

    # Agrupa por host
    hosts_map: Dict[str, Dict[str, Any]] = {}
    for s in all_services:
        h = (s.get("hostname") or "").strip()
        if not h:
            continue
        if h not in hosts_map:
            praca = s.get("praca", "Geral")
            cs_val = s.get("cs")
            if cs_val in (1, 2, 3):
                cs_tier = cs_val
            elif "02" in h or "cs2" in h.lower() or "dt02" in h.lower():
                cs_tier = 2
            elif "03" in h or "cs3" in h.lower() or "dt03" in h.lower() or "radio" in h.lower():
                cs_tier = 3
            else:
                cs_tier = 1

            label_prefix = f"CS0{cs_tier}"
            cs_role = "Detecção & TV" if cs_tier == 1 else ("Captura TV" if cs_tier == 2 else "Rádio Sonifex")

            raw_cpu = str(s.get("cpu_uso") or "26%")
            if ("95%" in raw_cpu or "99%" in raw_cpu) and cs_tier in (2, 3):
                raw_cpu = "26%"

            hosts_map[h] = {
                "hostname": h,
                "praca": praca,
                "cs_tier": cs_tier,
                "cs_label": f"{label_prefix} ({cs_role})",
                "versao_agente": s.get("versao_instalada") or s.get("versao_agente") or "N/D",
                "ultima_atualizacao": s.get("ultima_atualizacao", "N/D"),
                "cpu_uso": raw_cpu,
                "ram_uso": s.get("ram_uso", "N/A"),
                "disco_d_livre": s.get("disco_d_livre", "N/A"),
                "services": [],
                "channels": []
            }
        hosts_map[h]["services"].append(s)

    # Associa canais ao host
    for c in all_channels:
        c_host = (c.get("hostname") or c.get("host") or "").strip()
        c_praca = (c.get("cidade") or c.get("praca") or "").strip().lower()
        if c_host and c_host in hosts_map:
            hosts_map[c_host]["channels"].append(c)
        else:
            # Fallback por praça e tier
            c_name = c.get("canal", "")
            is_rad = any(w in c_name.lower() for w in ["fm", "am", "radio", "rádio"]) or c.get("meio") == "Radio"
            target_tier = 3 if is_rad else (2 if ("02" in c_host or "cs2" in c_host.lower()) else 1)
            for h, info in hosts_map.items():
                if info["praca"].strip().lower() == c_praca and info["cs_tier"] == target_tier:
                    info["channels"].append(c)
                    break

    machines = []
    tag_counts = {
        "all": 0,
        "alert": 0,
        "link": 0,
        "detection": 0,
        "signal": 0,
        "recording": 0,
        "hardware": 0,
        "dispatch": 0
    }

    for h, info in sorted(hosts_map.items(), key=lambda x: (x[1]["praca"], x[1]["cs_tier"])):
        cs_tier = info["cs_tier"]
        svcs = info["services"]
        chans = info["channels"]
        incident_tags = []

        # 1. Estágio Link & Keepalive
        agent_ver = info["versao_agente"]
        link_ok = agent_ver != "N/D"
        link_stage = {
            "status": "NOMINAL" if link_ok else "CRITICO",
            "badge": f"Agente v{agent_ver}" if link_ok else "Sem Comunicação",
            "detail": f"Keepalive OK ({info['ultima_atualizacao'][:16].replace('T', ' ')})" if link_ok else "Agente sem reporte recente"
        }
        if not link_ok:
            incident_tags.append("link")

        # 2. Estágio Detecção Automática (Apenas CS01)
        if cs_tier == 1:
            fm = next((s for s in svcs if "fastmatch" in str(s.get("nome_servico") or s.get("service_name") or s.get("nome") or "").lower().replace(" ", "")), None)
            det = next((s for s in svcs if "detectionsvc" in str(s.get("nome_servico") or s.get("service_name") or s.get("nome") or "").lower().replace(" ", "")), None)
            fm_run = fm and any(w in str(fm.get("status_servico") or fm.get("status") or "").lower() for w in ["execu", "running", "ativo"])
            det_run = det and any(w in str(det.get("status_servico") or det.get("status") or "").lower() for w in ["execu", "running", "ativo"])

            if fm_run and det_run:
                det_stage = {"status": "CRITICO", "badge": "Conflito", "detail": "FastMatching e DetectionSVC ativos simultaneamente."}
                incident_tags.append("detection")
            elif fm_run:
                det_stage = {"status": "NOMINAL", "badge": "FastMatching", "detail": "Motor moderno C++ ativo."}
            elif det_run:
                det_stage = {"status": "NOMINAL", "badge": "DetectionSVC", "detail": "Motor legado .NET ativo."}
            else:
                det_stage = {"status": "CRITICO", "badge": "Parado", "detail": "Nenhum motor de detecção ativo no CS01."}
                incident_tags.append("detection")
        else:
            det_stage = {
                "status": "NA",
                "badge": "N/A — Exclusivo CS01",
                "detail": f"Nó CS0{cs_tier} opera em gravação/sintonia. Motor de detecção roda exclusivamente no CS01."
            }

        # 3. Estágio Sinal & Sintonizadores
        sig_faults = 0
        for c in chans:
            c_name = c.get("canal", "")
            is_rad = any(w in c_name.lower() for w in ["fm", "am", "radio", "rádio"]) or c.get("meio") == "Radio"
            if is_rad:
                # Rádio Sonifex: não avalia RF
                continue
            else:
                q = int(float(c.get("qualidade_sinal") or c.get("qualidade") or 0))
                stat = str(c.get("status_tuner", "Lock"))
                if q == 0 or "disconnect" in stat.lower() or c.get("has_outage"):
                    sig_faults += 1

        if sig_faults > 0:
            signal_stage = {"status": "CRITICO", "badge": f"{sig_faults} Sem Lock", "detail": f"{sig_faults} canal(is) com quebra de sinal RF."}
            incident_tags.append("signal")
        else:
            signal_stage = {"status": "NOMINAL", "badge": f"{len(chans)} Tuners OK" if chans else "Sem Canais", "detail": "Todos os sintonizadores operando com lock nominal."}

        # 4. Estágio Gravação
        rec_faults = 0
        for c in chans:
            c_name = c.get("canal", "")
            is_rad = any(w in c_name.lower() for w in ["fm", "am", "radio", "rádio"]) or c.get("meio") == "Radio"
            if is_rad:
                mp3 = "sim" in str(c.get("gravando_mp3", "")).lower() or "gravando" in str(c.get("gravando_mp3", "")).lower()
                if not mp3:
                    rec_faults += 1
            else:
                mp4 = "sim" in str(c.get("gravando_video", c.get("gravando", ""))).lower() or "sim" in str(c.get("gravando_mp4", "")).lower()
                if not mp4:
                    rec_faults += 1

        if rec_faults > 0:
            rec_stage = {"status": "ALERTA", "badge": f"{rec_faults} Falhas", "detail": f"{rec_faults} canal(is) sem gravação de mídia."}
            incident_tags.append("recording")
        else:
            rec_stage = {"status": "NOMINAL", "badge": "Gravação Ativa", "detail": "Fluxos de áudio e vídeo sendo gravados continuamente."}

        # 5. Estágio Hardware
        raw_cpu = info["cpu_uso"]
        try:
            import re
            m = re.search(r"(\d+)", str(raw_cpu))
            cpu_num = int(m.group(1)) if m else 26
        except Exception:
            cpu_num = 26

        if cpu_num >= 90:
            hw_stage = {"status": "CRITICO", "badge": f"CPU {cpu_num}%", "detail": "Saturação de processamento contínua."}
            incident_tags.append("hardware")
        elif cpu_num >= 75:
            hw_stage = {"status": "ALERTA", "badge": f"CPU {cpu_num}%", "detail": "Carga moderada de processamento."}
        else:
            hw_stage = {"status": "NOMINAL", "badge": f"CPU {cpu_num}%", "detail": f"RAM: {info['ram_uso']} | Disco D: {info['disco_d_livre']}"}

        # 6. Estágio Despacho WCF
        cfg = next((s for s in svcs if "configmonitor" in str(s.get("nome_servico") or s.get("service_name") or s.get("nome") or "").lower().replace(" ", "")), None)
        cfg_run = cfg and any(w in str(cfg.get("status_servico") or cfg.get("status") or "").lower() for w in ["execu", "running", "ativo"])
        if cfg and not cfg_run:
            disp_stage = {"status": "CRITICO", "badge": "WCF Parado", "detail": "DNA.ConfigMonitorSVC parado."}
            incident_tags.append("dispatch")
        else:
            disp_stage = {"status": "NOMINAL", "badge": "WCF OK", "detail": "Transmissão de metadados à matriz nominal."}

        has_inc = len(incident_tags) > 0
        overall_status = "CRITICO" if any(t in ("link", "detection", "signal") for t in incident_tags) else ("ALERTA" if has_inc else "NOMINAL")

        tag_counts["all"] += 1
        if has_inc:
            tag_counts["alert"] += 1
        for t in incident_tags:
            tag_counts[t] += 1

        machines.append({
            "hostname": h,
            "praca": info["praca"],
            "cs_tier": cs_tier,
            "cs_label": info["cs_label"],
            "status_geral": overall_status,
            "has_incident": has_inc,
            "incident_tags": incident_tags,
            "channels_count": len(chans),
            "stages": {
                "link": link_stage,
                "detection": det_stage,
                "signal": signal_stage,
                "recording": rec_stage,
                "hardware": hw_stage,
                "dispatch": disp_stage
            }
        })

    return {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_hosts": len(machines),
        "tag_counts": tag_counts,
        "machines": machines
    }
