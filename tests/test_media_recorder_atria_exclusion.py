import sys
import os
sys.path.insert(0, os.path.abspath("dashboard"))
import time
from datetime import datetime, timezone, timedelta
from media_pipeline_monitor import get_fleet_pipeline_incidents

def test_atria_running_suppresses_mediarecorder_stopped_incident():
    """
    CENÁRIO CACOAL REPORTADO PELO USUÁRIO:
    No host onde o Atria Capture está 'Em Execução' gravando normalmente,
    o DNA.MediaRecorderSVC permanecer 'Parado' é o comportamento nominal esperado
    (motores mutuamente exclusivos de gravação MP4/MP3).
    Garante que nenhum falso incidente de 'GRAVACAO INTERROMPIDA' ou 'MediaRecorder Parado' seja gerado.
    """
    now = datetime.now(timezone.utc)
    fresh_ts = (now - timedelta(minutes=5)).isoformat()

    mock_services = [
        # Agente ativo
        {"id": "1", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
        # Atria Capture em execução (gravando MUX 1 e MUX 3)
        {"id": "2", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "Atria Capture", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
        # DNA.MediaRecorderSVC parado (nominal pois Atria é o motor ativo)
        {"id": "3", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Parado", "ultima_atualizacao": fresh_ts},
        # FileTransfer ativo
        {"id": "4", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "DNA.FiletransferSVC", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
    ]

    incidents = get_fleet_pipeline_incidents(services=mock_services, channels=[], force_refresh=True)
    mr_incidents = [i for i in incidents if i.get("type") == "ausencia_geracao_30min"]

    assert len(mr_incidents) == 0, f"Nenhum incidente de MediaRecorder deve ser gerado quando Atria Capture está ativo! Encontrado: {mr_incidents}"


def test_both_atria_and_mediarecorder_stopped_generates_legitimate_incident():
    """
    Quando AMBOS os motores de gravação (Atria Capture e DNA.MediaRecorderSVC) estão parados,
    a gravação de fato está interrompida e o incidente DEVE ser gerado legitimamente.
    """
    now = datetime.now(timezone.utc)
    fresh_ts = (now - timedelta(minutes=5)).isoformat()

    mock_services = [
        {"id": "1", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
        {"id": "2", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "Atria Capture", "status_servico": "Parado", "ultima_atualizacao": fresh_ts},
        {"id": "3", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Parado", "ultima_atualizacao": fresh_ts},
        {"id": "4", "hostname": "BRRO-COA-DT01", "praca": "Cacoal", "cs": 1, "nome_servico": "DNA.FiletransferSVC", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
    ]

    incidents = get_fleet_pipeline_incidents(services=mock_services, channels=[], force_refresh=True)
    mr_incidents = [i for i in incidents if i.get("type") == "ausencia_geracao_30min"]

    assert len(mr_incidents) == 1, f"Deve gerar incidente quando ambos motores de gravação estão parados! Encontrados: {mr_incidents}"
    assert "Nenhum motor de gravacao ativo" in mr_incidents[0]["description"]


def test_mediarecorder_running_and_atria_stopped_is_nominal():
    """
    Em praças onde o motor principal de gravação é o DNA.MediaRecorderSVC (e Atria está inativo/inexistente),
    a gravação está operando normalmente e nenhum alarme é emitido.
    """
    now = datetime.now(timezone.utc)
    fresh_ts = (now - timedelta(minutes=5)).isoformat()

    mock_services = [
        {"id": "1", "hostname": "BRSP-SPO-DT01", "praca": "São Paulo", "cs": 1, "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
        {"id": "2", "hostname": "BRSP-SPO-DT01", "praca": "São Paulo", "cs": 1, "nome_servico": "Atria Capture", "status_servico": "Inexistente", "ultima_atualizacao": fresh_ts},
        {"id": "3", "hostname": "BRSP-SPO-DT01", "praca": "São Paulo", "cs": 1, "nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
        {"id": "4", "hostname": "BRSP-SPO-DT01", "praca": "São Paulo", "cs": 1, "nome_servico": "DNA.FiletransferSVC", "status_servico": "Em Execução", "ultima_atualizacao": fresh_ts},
    ]

    incidents = get_fleet_pipeline_incidents(services=mock_services, channels=[], force_refresh=True)
    mr_incidents = [i for i in incidents if i.get("type") == "ausencia_geracao_30min"]

    assert len(mr_incidents) == 0
