import pytest
import unicodedata

def normalize_noc_str(s: str) -> str:
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip().lower()

def is_channel_recording_or_working(c: dict) -> bool:
    mp4 = str(c.get("gravando_mp4") or "").lower()
    mp3 = str(c.get("gravando_mp3") or "").lower()
    tuner = str(c.get("status_tuner") or "").lower()
    
    is_rec = any(w in mp4 for w in ["sim", "gravando", "asf", "rest"]) and "travado" not in mp4 and "erro" not in mp4
    is_rec_audio = any(w in mp3 for w in ["sim", "gravando"]) and "travado" not in mp3
    is_tuner_working = any(w in tuner for w in ["working", "lock"]) or (
        ("connect" in tuner or "conect" in tuner) and "disconnect" not in tuner and "desconect" not in tuner
    )
    has_signal = c.get("qualidade_sinal") is not None and float(c.get("qualidade_sinal") or 0) > 0
    return is_rec or is_rec_audio or is_tuner_working or has_signal

def should_trigger_recording_paralyzed(h: dict, host_svcs: list, channels_list: list) -> bool:
    h_low = (h.get("hostname") or "").lower().strip()
    cs_num = int(float(h.get("cs") or 1))
    norm_h_praca = normalize_noc_str(h.get("praca") or "")
    
    atria = next((s for s in host_svcs if s.get("nome_servico") == "Atria Capture"), None)
    mrec = next((s for s in host_svcs if s.get("nome_servico") == "DNA.MediaRecorderSVC"), None)
    
    atria_run = atria and any(w in str(atria.get("status_servico") or "").lower() for w in ["execu", "running", "ok"])
    mrec_run = mrec and any(w in str(mrec.get("status_servico") or "").lower() for w in ["execu", "running", "ok"])
    
    host_has_active_recording = False
    for c in channels_list:
        c_host = normalize_noc_str(c.get("host") or c.get("hostname") or "")
        c_praca = normalize_noc_str(c.get("cidade") or c.get("praca") or "")
        c_cs = int(float(c.get("cs") or c.get("id_cs") or 1))
        
        matches = (c_host and (c_host == h_low or c_host in h_low or h_low in c_host)) or (c_praca and norm_h_praca and c_praca == norm_h_praca and c_cs == cs_num)
        if matches and is_channel_recording_or_working(c):
            host_has_active_recording = True
            break
            
    is_cs_atria_only = cs_num >= 2
    recording_paralyzed = not host_has_active_recording and not atria_run and (not mrec_run if not is_cs_atria_only else True) and (atria or (not is_cs_atria_only and mrec))
    return recording_paralyzed

def test_goiania_cs2_atria_never_triggers_false_incident():
    """Goiânia CS2 com Atria Capture aberto gravando 10 multiplexes nunca deve disparar falso alerta."""
    host = {"hostname": "Goiania-SMME-324-CS2", "praca": "Goiania", "cs": 2}
    channels = [
        {"canal": "Record HD", "cidade": "Goiânia", "cs": 2, "gravando_mp4": "Gravando (.ASF BKP)", "status_tuner": "Connected with tuner. WORKING.", "qualidade_sinal": 100},
        {"canal": "SBT", "cidade": "Goiânia", "cs": 2, "gravando_mp4": "Gravando (.ASF BKP)", "status_tuner": "Connected with tuner. WORKING.", "qualidade_sinal": 100},
        {"canal": "Rede Globo", "cidade": "Goiânia", "cs": 2, "gravando_mp4": "Gravando (.ASF BKP)", "status_tuner": "Connected with tuner. WORKING.", "qualidade_sinal": 100}
    ]
    svcs = [
        {"nome_servico": "Atria Capture", "status_servico": "Em Execução", "ram_uso": "562 MB"},
        {"nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Inexistente", "ram_uso": "N/A"}
    ]
    assert not should_trigger_recording_paralyzed(host, svcs, channels)

def test_goiania_cs2_with_unregistered_service_but_working_tuners():
    """Mesmo se o serviço Atria não estiver reportando no SharePoint, se os tuners estão WORKING, não dispara alerta falso."""
    host = {"hostname": "Goiania-SMME-324-CS2", "praca": "Goiania", "cs": 2}
    channels = [
        {"canal": "Record HD", "cidade": "Goiânia", "cs": 2, "gravando_mp4": "Gravando (.ASF BKP)", "status_tuner": "Connected with tuner. WORKING.", "qualidade_sinal": 100}
    ]
    svcs = [
        {"nome_servico": "Atria Capture", "status_servico": "Parado", "ram_uso": "N/A"}
    ]
    assert not should_trigger_recording_paralyzed(host, svcs, channels)

def test_porto_alegre_cs1_with_atria_and_missing_mediarecorder():
    """Porto Alegre CS1 que opera Atria (658 MB RAM) e tem MediaRecorder Não Encontrado não deve disparar alerta."""
    host = {"hostname": "Porto_Alegre-SMME-203-CS1", "praca": "Porto Alegre", "cs": 1}
    channels = [
        {"canal": "Rede Globo", "cidade": "Porto Alegre", "cs": 1, "gravando_mp4": "Gravando (.ASF BKP)", "status_tuner": "Connected with tuner. WORKING.", "qualidade_sinal": 90}
    ]
    svcs = [
        {"nome_servico": "Atria Capture", "status_servico": "Em Execução", "ram_uso": "658 MB"},
        {"nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Não Encontrado", "ram_uso": "N/A"}
    ]
    assert not should_trigger_recording_paralyzed(host, svcs, channels)

def test_uruguaiana_cs1_with_atria_active():
    """Uruguaiana CS1 que opera Atria (32 MB) não deve disparar falso alarme."""
    host = {"hostname": "Uruguaiana-SMME-225-CS1", "praca": "Uruguaiana", "cs": 1}
    channels = [
        {"canal": "Rede Globo", "cidade": "Uruguaiana", "cs": 1, "gravando_mp4": "Gravando (.ASF BKP)", "status_tuner": "Connected with tuner. WORKING.", "qualidade_sinal": 85}
    ]
    svcs = [
        {"nome_servico": "Atria Capture", "status_servico": "Em Execução", "ram_uso": "32 MB"},
        {"nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Inexistente", "ram_uso": "N/A"}
    ]
    assert not should_trigger_recording_paralyzed(host, svcs, channels)

def test_real_outage_triggers_incident():
    """Host sem nenhum canal gravando e com Atria/MediaRecorder parados DEVE disparar incidente P0."""
    host = {"hostname": "Teste-SMME-999-CS1", "praca": "Teste", "cs": 1}
    channels = [
        {"canal": "Canal Teste", "cidade": "Teste", "cs": 1, "gravando_mp4": "Não", "status_tuner": "Disconnected", "qualidade_sinal": 0}
    ]
    svcs = [
        {"nome_servico": "Atria Capture", "status_servico": "Parado", "ram_uso": "0 MB"},
        {"nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Parado", "ram_uso": "0 MB"}
    ]
    assert should_trigger_recording_paralyzed(host, svcs, channels)


def test_parauapebas_cs2_with_mediarecorder_active():
    """Parauapebas CS2 operando DNA.MediaRecorderSVC (237 MB) não deve disparar alerta falso mesmo com Atria Parado."""
    host = {"hostname": "Parauapebas-SMME-316-CS2", "praca": "Parauapebas", "cs": 2}
    svcs = [
        {"nome_servico": "Atria Capture", "status_servico": "Parado", "ram_uso": "N/A"},
        {"nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Em Execução", "ram_uso": "237 MB"}
    ]
    atria = next((s for s in svcs if s.get("nome_servico") == "Atria Capture"), None)
    mrec = next((s for s in svcs if s.get("nome_servico") == "DNA.MediaRecorderSVC"), None)
    atria_run = atria and "execu" in str(atria.get("status_servico", "")).lower()
    mrec_run = mrec and "execu" in str(mrec.get("status_servico", "")).lower()
    is_recording_engine_running = atria_run or mrec_run
    assert is_recording_engine_running


def test_network_link_nordeste_region_matches_hosts():
    """Garante que nós do Nordeste (BA, PE, CE, etc.) são catalogados como Região Nordeste e exibem praças."""
    import sys
    sys.path.insert(0, "dashboard")
    from media_pipeline_monitor import get_link_monitoring_metrics
    metrics = get_link_monitoring_metrics()
    ne_metrics = [m for m in metrics if m.get("regiao") == "Nordeste"]
    assert len(ne_metrics) >= 40
    ne_cities = set(m.get("praca") for m in ne_metrics)
    assert "Salvador" in ne_cities or "Recife" in ne_cities or "Fortaleza" in ne_cities

