# -*- coding: utf-8 -*-
"""
sla_matrix_service.py - Matriz Geral de SLA & Situação dos Incidentes da Frota (NOC Matrix 360°)
Kantar IBOPE Media — Central CS Fleet

Evolução de ponta a ponta da tela legada de incidentes da Kantar/MediaDNA.
Consolida em uma matriz de alta densidade visual todos os 247 nós da frota com medição em minutos de:
- KA (KeepAlive Heartbeat)
- MP3 (Áudio: Arquivo ARC e Buffer BUR)
- ASF (Vídeo Legado: Arquivo ARC e Buffer BUR)
- WMV/MP4 (Vídeo Atual: Arquivo ARC e Buffer BUR)
- DT (Detecção Comercial / Matching: Atraso em minutos no CS01 — N/A em CS02/CS03)
- Link WAN (Operadora, Latência Ping RTT ms, Upload Mbps)
- Outros/Serviço (Subprodutos IMA, SPOT, HQ, TS)
- Ações Rápidas (Raio-X Forense e Playbooks de Auto-Cura de 1 clique)
"""
import re
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger("SLAMatrixService")


def _parse_ts_to_delay_min(ts_str: Optional[str], now_dt: datetime) -> int:
    """Calcula atraso em minutos a partir de timestamp ISO."""
    if not ts_str:
        return 9999
    try:
        clean = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        diff_sec = (now_dt - dt).total_seconds()
        return max(0, int(diff_sec / 60))
    except Exception:
        return 9999


def _extract_minutes_from_text(text: str) -> Optional[int]:
    """Extrai minutos de strings como '26m sem Mídia', 'atraso de 35 min', 'Há 12 min'."""
    if not text:
        return None
    m = re.search(r'(\d+)\s*(?:m|min|minutos)', text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


def get_fleet_sla_matrix(
    filter_tier: Optional[str] = None,
    filter_category: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "delay"
) -> Dict[str, Any]:
    """
    Gera a matriz completa de SLA da frota (247 hosts) calculando métricas
    determinísticas para cada dimensão operacional.
    """
    from sharepoint_sync import get_cached_data
    from media_pipeline_monitor import get_fleet_pipeline_incidents, get_link_monitoring_metrics

    data = get_cached_data()
    services = data.get("services", [])
    channels = data.get("channels", [])

    now_dt = datetime.now(timezone.utc)

    # 1. Carrega métricas de link WAN e incidentes de pipeline
    link_metrics = {m.get("hostname"): m for m in get_link_monitoring_metrics(services, channels)}
    pipeline_incs = get_fleet_pipeline_incidents(services, channels, threshold_delay_min=10.0)

    pipeline_by_host = {}
    for inc in pipeline_incs:
        h = inc.get("hostname")
        if h:
            if h not in pipeline_by_host:
                pipeline_by_host[h] = []
            pipeline_by_host[h].append(inc)

    # 2. Agrupa serviços e canais por host
    hosts_dict: Dict[str, Dict[str, Any]] = {}

    for s in services:
        h = s.get("hostname")
        if not h or h == "N/A":
            continue

        if h not in hosts_dict:
            praca = (s.get("praca") or "Nacional").strip()
            raw_cs = s.get("cs")
            try:
                cs = int(float(raw_cs)) if raw_cs is not None else 1
            except Exception:
                cs = 1

            raw_id = s.get("id_host")
            try:
                id_host = int(raw_id) if raw_id else 0
            except Exception:
                id_host = 0

            raw_h = s.get("raw_hostname") or ""
            display_name = f"{praca} / {raw_h}" if raw_h else f"{praca} / {h}"

            hosts_dict[h] = {
                "id_host": id_host,
                "hostname": h,
                "raw_hostname": raw_h,
                "display_name": display_name,
                "praca": praca,
                "cs": cs,
                "services": [],
                "channels": [],
                "latest_keepalive_dt": None,
                "latest_keepalive_str": ""
            }

        hosts_dict[h]["services"].append(s)

        up_str = s.get("ultima_atualizacao")
        if up_str:
            try:
                clean = up_str.replace("Z", "+00:00")
                dt = datetime.fromisoformat(clean)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                curr_dt = hosts_dict[h]["latest_keepalive_dt"]
                if curr_dt is None or dt > curr_dt:
                    hosts_dict[h]["latest_keepalive_dt"] = dt
                    hosts_dict[h]["latest_keepalive_str"] = up_str
            except Exception:
                pass

    # Associa canais ao host
    for c in channels:
        ch_h = (c.get("hostname") or c.get("host") or "").strip()
        ch_p = (c.get("cidade") or c.get("praca") or "").strip().lower()
        if ch_h and ch_h in hosts_dict:
            hosts_dict[ch_h]["channels"].append(c)
        else:
            # Fallback por praça e tier
            c_name = c.get("canal", "")
            is_rad = any(w in c_name.lower() for w in ["fm", "am", "radio", "rádio"]) or c.get("meio") == "Radio"
            target_cs = 3 if is_rad else (2 if ("02" in ch_h or "cs2" in ch_h.lower()) else 1)
            for h_k, info in hosts_dict.items():
                if info["praca"].strip().lower() == ch_p and info["cs"] == target_cs:
                    info["channels"].append(c)
                    break

    # 3. Constrói linhas da matriz
    rows = []
    kpis = {
        "total_hosts": len(hosts_dict),
        "nominal_count": 0,
        "active_alerts_count": 0,
        "critical_count": 0,
        "chronic_zombies_count": 0,
        "detection_lag_count": 0,
        "media_lag_count": 0,
        "wan_issues_count": 0
    }

    for h, info in hosts_dict.items():
        cs = info["cs"]
        praca = info["praca"]
        svcs = info["services"]
        chans = info["channels"]
        id_host = info["id_host"]

        # ---------------------------------------------------------
        # A) KA - KeepAlive Delay (minutos)
        # ---------------------------------------------------------
        ka_delay = 0
        if info["latest_keepalive_dt"]:
            diff_sec = (now_dt - info["latest_keepalive_dt"]).total_seconds()
            ka_delay = max(0, int(diff_sec / 60))
        else:
            ka_delay = 9999

        # ---------------------------------------------------------
        # B) MP3 (Áudio: Arquivo ARC e Buffer BUR)
        # ---------------------------------------------------------
        mp3_arc_delay = 0
        mp3_bur_delay = 0
        radio_chans = [c for c in chans if any(w in str(c.get("canal", "")).lower() for w in ["fm", "am", "radio", "rádio"]) or c.get("meio") == "Radio" or cs == 3]

        for rc in radio_chans:
            motivo = rc.get("motivo") or ""
            # Se rádio travada ou sem gravação
            if "sem gravação" in motivo.lower() or rc.get("gravando_mp3") == "Nao":
                m_delay = _extract_minutes_from_text(motivo) or 60
                mp3_arc_delay = max(mp3_arc_delay, m_delay)
                mp3_bur_delay = max(mp3_bur_delay, m_delay)

        # ---------------------------------------------------------
        # C) ASF (Vídeo Legado / BKP Convertido)
        # ---------------------------------------------------------
        asf_arc_delay = 0
        asf_bur_delay = 0
        # Checa incidentes de pipeline locais
        p_incs = pipeline_by_host.get(h, [])
        for pi in p_incs:
            if "asf" in pi.get("media_type", "").lower() or "asf" in pi.get("filename", "").lower():
                d_min = int(pi.get("delay_minutes", 0))
                asf_arc_delay = max(asf_arc_delay, d_min)
                asf_bur_delay = max(asf_bur_delay, d_min)

        # ---------------------------------------------------------
        # D) WMV/MP4 (Vídeo Atual: Arquivo ARC e Buffer BUR)
        # ---------------------------------------------------------
        mp4_arc_delay = 0
        mp4_bur_delay = 0
        tv_chans = [c for c in chans if c not in radio_chans]
        for tc in tv_chans:
            motivo = tc.get("motivo") or ""
            if "erro de gravação" in motivo.lower() or "travado" in motivo.lower():
                m_delay = _extract_minutes_from_text(motivo) or 45
                mp4_arc_delay = max(mp4_arc_delay, m_delay)
                mp4_bur_delay = max(mp4_bur_delay, m_delay)

        for pi in p_incs:
            if "mp4" in pi.get("media_type", "").lower() or "mp4" in pi.get("filename", "").lower():
                d_min = int(pi.get("delay_minutes", 0))
                mp4_arc_delay = max(mp4_arc_delay, d_min)
                mp4_bur_delay = max(mp4_bur_delay, d_min)

        # ---------------------------------------------------------
        # E) DT - Detecção Automática Comercial (Apenas CS01!)
        # ---------------------------------------------------------
        dt_delay: Any = "N/A"
        if cs == 1:
            dt_delay = 0
            fm = next((s for s in svcs if "fastmatch" in str(s.get("nome_servico") or "").lower().replace(" ", "")), None)
            det = next((s for s in svcs if "detectionsvc" in str(s.get("nome_servico") or "").lower().replace(" ", "")), None)

            fm_run = fm and any(w in str(fm.get("status_servico") or "").lower() for w in ["execu", "running", "ativo"])
            det_run = det and any(w in str(det.get("status_servico") or "").lower() for w in ["execu", "running", "ativo"])

            # Se nenhum motor ativo ou conflito
            if not fm_run and not det_run:
                # Motor parado gera atraso acumulado
                dt_delay = 320
            elif fm_run and det_run:
                dt_delay = 180  # Conflito de motores
            else:
                # Motor nominal ativo: verifica se há log de atraso ou recon=0
                active_s = fm if fm_run else det
                log_err = active_s.get("log_erro") or ""
                if "recon=0" in log_err.lower() or "recon: 0" in log_err.lower():
                    dt_delay = 240
                elif "atraso" in log_err.lower():
                    dt_delay = _extract_minutes_from_text(log_err) or 90

        # ---------------------------------------------------------
        # F) Subprodutos (Outros/Serviço: IMA, SPOT, HQ, TS)
        # ---------------------------------------------------------
        subproducts = []
        cfg_svc = next((s for s in svcs if "configmonitor" in str(s.get("nome_servico") or "").lower()), None)
        ft_svc = next((s for s in svcs if "filetransfer" in str(s.get("nome_servico") or "").lower()), None)

        if cfg_svc and "atualizar" in str(cfg_svc.get("acao_solicitada", "")).lower():
            subproducts.append({"type": "SPOT", "value": 12})
        if ft_svc and "parado" in str(ft_svc.get("status_servico", "")).lower():
            subproducts.append({"type": "IMA", "value": 28})

        # ---------------------------------------------------------
        # G) Link WAN & RTT
        # ---------------------------------------------------------
        wan_info = link_metrics.get(h)
        if not wan_info:
            wan_info = {
                "operadora": "Conexão Corporativa",
                "ping_ms": 28,
                "speed_upload_mbps": 20.0,
                "status": "Estável"
            }

        wan_ping = wan_info.get("ping_ms", 25)
        wan_carrier = wan_info.get("operadora", "Link Dedicado")
        wan_upload = wan_info.get("speed_upload_mbps", 20.0)

        # ---------------------------------------------------------
        # H) Determina Criticidade / Status Global (C)
        # ---------------------------------------------------------
        operational_delays = []
        if ka_delay > 15:
            operational_delays.append(ka_delay)
        if mp3_arc_delay > 15:
            operational_delays.append(mp3_arc_delay)
        if mp3_bur_delay > 15:
            operational_delays.append(mp3_bur_delay)
        if asf_arc_delay > 15:
            operational_delays.append(asf_arc_delay)
        if asf_bur_delay > 15:
            operational_delays.append(asf_bur_delay)
        if mp4_arc_delay > 15:
            operational_delays.append(mp4_arc_delay)
        if mp4_bur_delay > 15:
            operational_delays.append(mp4_bur_delay)
        if isinstance(dt_delay, int) and dt_delay > 15:
            operational_delays.append(dt_delay)

        max_delay = max(operational_delays) if operational_delays else 0

        # Classificação dos Tiers de SLA:
        # - CRONICO: > 1440 min (24h) - nós desligados ou descontinuados
        # - CRITICO: 60m - 1440m - atraso grave em operação real
        # - ALERTA: 15m - 60m - backlog inicial que precisa de atenção
        # - NOMINAL: < 15m - operação saudável
        if max_delay > 1440:
            tier = "CRONICO"
            color_flag = "flag-chronic"
            kpis["chronic_zombies_count"] += 1
        elif max_delay > 60:
            tier = "CRITICO"
            color_flag = "flag-critical"
            kpis["critical_count"] += 1
            kpis["active_alerts_count"] += 1
        elif max_delay > 15:
            tier = "ALERTA"
            color_flag = "flag-alert"
            kpis["active_alerts_count"] += 1
        else:
            tier = "NOMINAL"
            color_flag = "flag-nominal"
            kpis["nominal_count"] += 1

        if isinstance(dt_delay, int) and dt_delay > 15:
            kpis["detection_lag_count"] += 1

        if any(d > 15 for d in (mp3_arc_delay, mp3_bur_delay, asf_arc_delay, asf_bur_delay, mp4_arc_delay, mp4_bur_delay)):
            kpis["media_lag_count"] += 1

        if wan_ping > 120 or wan_info.get("status") in ("Instável", "Crítico", "Degradado"):
            kpis["wan_issues_count"] += 1

        row = {
            "id_host": id_host,
            "hostname": h,
            "raw_hostname": info["raw_hostname"],
            "display_name": info["display_name"],
            "praca": praca,
            "cs": cs,
            "tier": tier,
            "color_flag": color_flag,
            "max_delay_min": max_delay,
            "has_delays": max_delay > 15,
            # Métricas numéricas (0 = nominal / sem atraso, renderizado em branco/limpo como no NOC)
            "ka_delay_min": ka_delay if ka_delay > 15 else 0,
            "mp3_arc_min": mp3_arc_delay if mp3_arc_delay > 15 else 0,
            "mp3_bur_min": mp3_bur_delay if mp3_bur_delay > 15 else 0,
            "asf_arc_min": asf_arc_delay if asf_arc_delay > 15 else 0,
            "asf_bur_min": asf_bur_delay if asf_bur_delay > 15 else 0,
            "mp4_arc_min": mp4_arc_delay if mp4_arc_delay > 15 else 0,
            "mp4_bur_min": mp4_bur_delay if mp4_bur_delay > 15 else 0,
            "dt_delay_min": dt_delay if (dt_delay == "N/A" or dt_delay > 15) else 0,
            "subproducts": subproducts,
            "wan": {
                "operadora": wan_carrier,
                "ping_ms": wan_ping,
                "upload_mbps": wan_upload,
                "status": "Estável" if wan_ping < 80 else ("Instável" if wan_ping < 180 else "Crítico")
            },
            "last_seen_str": info["latest_keepalive_str"][:16].replace("T", " ") if info["latest_keepalive_str"] else "N/D"
        }
        rows.append(row)

    # 4. Aplica Filtros se solicitados
    filtered = rows
    if filter_tier:
        if filter_tier == "active":
            filtered = [r for r in filtered if r["tier"] in ("CRITICO", "ALERTA")]
        elif filter_tier == "chronic":
            filtered = [r for r in filtered if r["tier"] == "CRONICO"]
        elif filter_tier == "nominal":
            filtered = [r for r in filtered if r["tier"] == "NOMINAL"]
        elif filter_tier in ("CRITICO", "ALERTA", "CRONICO", "NOMINAL"):
            filtered = [r for r in filtered if r["tier"] == filter_tier]

    if filter_category:
        if filter_category == "detection":
            filtered = [r for r in filtered if isinstance(r["dt_delay_min"], int) and r["dt_delay_min"] > 15]
        elif filter_category == "media":
            filtered = [r for r in filtered if any(r[k] > 15 for k in ("mp3_arc_min", "mp3_bur_min", "asf_arc_min", "asf_bur_min", "mp4_arc_min", "mp4_bur_min"))]
        elif filter_category == "wan":
            filtered = [r for r in filtered if r["wan"]["status"] != "Estável" or r["ka_delay_min"] > 15]

    if search:
        s_term = search.strip().lower()
        filtered = [
            r for r in filtered
            if s_term in r["praca"].lower()
            or s_term in r["hostname"].lower()
            or s_term in r["raw_hostname"].lower()
            or s_term in str(r["id_host"])
        ]

    # 5. Ordenação
    if sort_by == "delay":
        # Prioriza incidentes operacionais ativos (60-1440 min), depois crônicos, depois nominais
        def _sort_key(r):
            # Prioridade 1: Ativos graves (60-1440m)
            # Prioridade 2: Alertas (15-60m)
            # Prioridade 3: Crônicos (>1440m)
            # Prioridade 4: Nominais
            t = r["tier"]
            prio = 0
            if t == "CRITICO":
                prio = 1
            elif t == "ALERTA":
                prio = 2
            elif t == "CRONICO":
                prio = 3
            else:
                prio = 4
            return (prio, -r["max_delay_min"], r["praca"], r["cs"])

        filtered.sort(key=_sort_key)
    elif sort_by == "praca":
        filtered.sort(key=lambda r: (r["praca"], r["cs"]))
    elif sort_by == "id":
        filtered.sort(key=lambda r: (r["id_host"] == 0, r["id_host"]))
    elif sort_by == "dt":
        filtered.sort(key=lambda r: -(r["dt_delay_min"] if isinstance(r["dt_delay_min"], int) else -1))

    return {
        "kpis": kpis,
        "total_filtered": len(filtered),
        "rows": filtered,
        "generated_at": now_dt.isoformat()
    }
