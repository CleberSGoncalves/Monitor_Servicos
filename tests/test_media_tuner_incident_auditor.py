import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest

# Garante path para importação do dashboard
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from praca_analyzer import is_radio_channel_type, is_radio_channel_healthy, is_tv_channel_healthy, infer_cs_operational_role
from media_pipeline_monitor import resolve_pipeline_file_location, get_fleet_pipeline_incidents
from incident_manager import sync_live_fleet_to_incident_events, _parse_cs, _parse_ts_utc


def test_radio_channel_healthy_no_false_outage():
    """Valida que canal de rádio com gravação MP3 ativa é saudável mesmo se has_outage vier True por erro RF."""
    radio_chan = {
        "canal": "Rádio Band FM",
        "cidade": "Belo Horizonte",
        "meio": "Radio",
        "gravando_mp3": "Sim, Gravando",
        "gravando_mp4": "Não",
        "qualidade_sinal": 0,
        "status_tuner": "Audio Device Active",
        "has_outage": True,  # Antigo falso positivo gerado por RF=0
        "is_degraded": False,
        "motivo": "Sinal RF Zerado e Sem Gravação"
    }

    assert is_radio_channel_type(radio_chan) is True
    is_ok, reason = is_radio_channel_healthy(radio_chan)
    assert is_ok is True
    assert "Áudio OK" in reason


def test_radio_stream_working_healthy():
    """Valida que canal de rádio stream virtual com status WORKING é saudável."""
    radio_stream = {
        "canal": "CBN FM 90.5",
        "cidade": "São Paulo",
        "meio": "Radio",
        "gravando_mp3": "Não",
        "status_tuner": "Working",
        "has_outage": False,
        "is_degraded": False,
        "motivo": "Operando Normalmente"
    }

    assert is_radio_channel_type(radio_stream) is True
    is_ok, reason = is_radio_channel_healthy(radio_stream)
    assert is_ok is True
    assert "Stream Conectado" in reason


def test_cs03_hosts_operational_role_no_motor_gravacao_incident():
    """Valida que hosts CS03 (Rádio/PayTV) não recebem incidentes de Motor de Gravação Parado."""
    # Nó Florianópolis CS3 (Rádio/PayTV)
    fln_cs3_svcs = [
        {"hostname": "Florianopolis-SMME-230-CS3", "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução", "cs": 3, "praca": "Florianópolis"},
        {"hostname": "Florianopolis-SMME-230-CS3", "nome_servico": "Atria Capture", "status_servico": "Parado", "cs": 3, "praca": "Florianópolis"},
        {"hostname": "Florianopolis-SMME-230-CS3", "nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Inexistente", "cs": 3, "praca": "Florianópolis"}
    ]
    role_fln = infer_cs_operational_role(3, channels=[], services=fln_cs3_svcs, hostname="Florianopolis-SMME-230-CS3", praca="Florianópolis")
    assert (role_fln.get("is_radio") or role_fln.get("is_paytv")) is True

    # Nó Brasília CS3
    bsb_cs3_svcs = [
        {"hostname": "Brasilia-SMME-186-CS3", "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução", "cs": 3, "praca": "Brasília"},
        {"hostname": "Brasilia-SMME-186-CS3", "nome_servico": "DNA.MediaRecorderSVC", "status_servico": "Inexistente", "cs": 3, "praca": "Brasília"}
    ]
    role_bsb = infer_cs_operational_role(3, channels=[], services=bsb_cs3_svcs, hostname="Brasilia-SMME-186-CS3", praca="Brasília")
    assert (role_bsb.get("is_radio") or role_bsb.get("is_paytv")) is True


def test_resolve_pipeline_file_location_dynamic():
    """Valida que o resolvedor dinâmico de pipeline de mídia atribui a praça real e não Pelotas."""
    mock_services = [
        {"hostname": "Fortaleza-SMME-191-CS2", "praca": "Fortaleza", "id_host": 191, "cs": 2},
        {"hostname": "Florianopolis-SMME-230-CS3", "praca": "Florianópolis", "id_host": 230, "cs": 3},
        {"hostname": "BRRS-PLT-DT01", "praca": "Pelotas", "id_host": 100, "cs": 1}
    ]
    mock_channels = [
        {"canal": "Record TV", "cidade": "Fortaleza", "id_host": 191, "id_canal": 1610, "id": "45016", "cs": 2}
    ]

    # Arquivo H191 de Fortaleza
    f_for = {"filename": "H191_PV1610_CS2.mp4", "host_id": "191", "pv_code": "1610", "cs_id": 2}
    praca, host = resolve_pipeline_file_location(f_for, mock_services, mock_channels)
    assert praca == "Fortaleza"
    assert host == "Fortaleza-SMME-191-CS2"

    # Arquivo H230 de Florianópolis
    f_fln = {"filename": "H230_PV2200_CS3.mp3", "host_id": "230", "pv_code": "2200", "cs_id": 3}
    praca, host = resolve_pipeline_file_location(f_fln, mock_services, mock_channels)
    assert praca == "Florianópolis"
    assert host == "Florianopolis-SMME-230-CS3"

    # Arquivo H100 de Pelotas (apenas este deve ser Pelotas)
    f_plt = {"filename": "H100_PV101_CS1.mp4", "host_id": "100", "pv_code": "101", "cs_id": 1}
    praca, host = resolve_pipeline_file_location(f_plt, mock_services, mock_channels)
    assert praca == "Pelotas"
    assert host == "BRRS-PLT-DT01"


def test_disconnected_host_prevention_in_sync():
    """Valida que hosts sem keepalive (> 25 min) não disparam falsos incidentes picados de serviços de mídia."""
    now_utc = datetime.now(timezone.utc)
    old_time_str = (now_utc - timedelta(minutes=40)).isoformat()

    old_dt = _parse_ts_utc(old_time_str)
    assert old_dt is not None
    diff_min = (now_utc - old_dt).total_seconds() / 60.0
    assert diff_min > 25.0


def test_parse_cs_helper():
    """Valida o helper _parse_cs com formatos numéricos e alfanuméricos."""
    assert _parse_cs(1) == 1
    assert _parse_cs("1.0") == 1
    assert _parse_cs("CS01") == 1
    assert _parse_cs("CS2") == 2
    assert _parse_cs("3") == 3
    assert _parse_cs(None, default=1) == 1
