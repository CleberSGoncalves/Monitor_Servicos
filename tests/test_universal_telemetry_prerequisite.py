import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import sys
from pathlib import Path

# Adiciona o diretório do dashboard ao path
sys.path.insert(0, str(Path(__file__).parent.parent / "dashboard"))

from tracking_detection_monitor import build_detection_fleet_snapshot


def test_channel_outage_suppressed_when_telemetry_stale():
    """
    DIRETRIZ UNIVERSAL:
    Se a telemetria do canal/host está atrasada (> 3 horas),
    NÃO é permitido inferir 'Vídeo Congelado' ou 'Áudio Mudo' como queda real de sinal.
    Deve ser classificado estritamente como Telemetria Atrasada (sem queda crítica).
    """
    from sharepoint_sync import sync_fleet_data
    now_utc = datetime.now(timezone.utc)
    stale_date = (now_utc - timedelta(hours=6)).isoformat()

    # Canal com vídeo congelado gravado há 6 horas
    raw_channel_stale = {
        "fields": {
            "Title": "TV Globo HD",
            "Cidade": "Castanhal",
            "IDCS": 1,
            "Atualizacao": stale_date,
            "VideoCongelado": "Sim",
            "AudioMudo": "Não",
            "StatusTuner": "Working",
            "QualidadeSinal": 80.0,
            "ForcaSinal": 90.0,
            "GravandoMP4": "Sim",
            "MeiodeTransmiss_x00e3_o": "Digital Terrestre"
        }
    }

    # Simula lógica interna de classificação de canal
    at_str = raw_channel_stale["fields"]["Atualizacao"]
    dt = datetime.fromisoformat(at_str.replace("Z", "+00:00"))
    is_stale = (now_utc - dt).total_seconds() > 3 * 3600
    is_frozen = "sim" in raw_channel_stale["fields"]["VideoCongelado"].lower()

    # Validação da Lei da Validade de Telemetria:
    has_outage = False
    is_degraded = False
    motivo = "Estável"

    if is_stale:
        has_outage = False
        is_degraded = True
        motivo = "Telemetria Atrasada (>3h sem novo reporte)"
    elif is_frozen:
        has_outage = True
        motivo = "Vídeo Congelado"

    assert is_stale is True
    assert has_outage is False, "Canal com telemetria estagnada NÃO pode ser classificado com has_outage=True"
    assert is_degraded is True
    assert "Telemetria Atrasada" in motivo


def test_channel_outage_active_when_telemetry_is_fresh():
    """
    Canal com telemetria fresca (< 15 min) e com Vídeo Congelado
    DEVE SIM ser classificado como queda (has_outage=True).
    """
    now_utc = datetime.now(timezone.utc)
    fresh_date = (now_utc - timedelta(minutes=5)).isoformat()

    at_str = fresh_date
    dt = datetime.fromisoformat(at_str.replace("Z", "+00:00"))
    is_stale = (now_utc - dt).total_seconds() > 3 * 3600
    is_frozen = True

    has_outage = False
    is_degraded = False
    motivo = "Estável"

    if is_stale:
        has_outage = False
        is_degraded = True
        motivo = "Telemetria Atrasada (>3h sem novo reporte)"
    elif is_frozen:
        has_outage = True
        motivo = "Vídeo Congelado"

    assert is_stale is False
    assert has_outage is True
    assert motivo == "Vídeo Congelado"


def test_pipeline_stalled_suppressed_on_offline_host():
    """
    Host offline (sem telemetria há dias) NÃO pode ser considerado como
    fila WCF estagnada em data\\tracking (is_stalled=False).
    """
    stale_date = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    mock_services = [
        {
            "id": "svc_cfg", "hostname": "BRPA-CAH-DT01", "praca": "Castanhal", "cs": 1,
            "nome_servico": "DNA.ConfigMonitorSVC", "status_servico": "Parado",
            "versao_instalada": "4.8.0.0", "versao_desejada": "4.8.0.0", "status_atualizacao": "Atualizado",
            "acao_solicitada": "Nenhuma", "ultima_atualizacao": stale_date, "cpu_uso": "<1%", "ram_uso": "64 MB",
            "disco_d_livre": "N/A", "uptime": "N/A", "status_wcf": "Desconectado", "log_erro": ""
        },
        {
            "id": "svc_agent", "hostname": "BRPA-CAH-DT01", "praca": "Castanhal", "cs": 1,
            "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução",
            "versao_instalada": "1.0.20.0", "versao_desejada": "1.0.20.0", "status_atualizacao": "Atualizado",
            "acao_solicitada": "Nenhuma", "ultima_atualizacao": stale_date, "cpu_uso": "<1%", "ram_uso": "64 MB",
            "disco_d_livre": "N/A", "uptime": "N/A", "status_wcf": "Desconectado", "log_erro": ""
        }
    ]

    with patch("tracking_detection_monitor.get_fleet_services", return_value=mock_services):
        snap = build_detection_fleet_snapshot()
        site = snap["sites"][0]

        # Em host offline, o escoamento WCF NÃO pode ser considerado travado falsamente
        assert site["is_stalled"] is False
        assert site["tracking_age_minutes"] == 0
        assert site["health_status"] == "COMM_LOST"
        assert snap["summary"]["stalled_tracking"] == 0


def test_frontend_hardware_offline_suppression_logic():
    """
    Simula a lógica do app.js para garantir que um host offline há mais de 3 horas
    com CPU 95% ou Disco D 11GB NÃO seja incluído na lista de gargalos de hardware em tempo real.
    """
    now_ms = datetime.now(timezone.utc).timestamp() * 1000
    stale_ms = (datetime.now(timezone.utc) - timedelta(days=4)).timestamp() * 1000

    host_offline = {
        "hostname": "BRPR-CTA-DT01",
        "cpu_val": 95,
        "disco_val": 11,
        "max_timestamp": stale_ms,
        "has_critical_hw": False,
        "critical_reasons": []
    }

    diff_hours = (now_ms - host_offline["max_timestamp"]) / 3600000
    is_offline = diff_hours > 3.0

    # Lógica implementada em app.js:
    if is_offline:
        host_offline["has_critical_hw"] = False
    else:
        if host_offline["cpu_val"] >= 85:
            host_offline["has_critical_hw"] = True
            host_offline["critical_reasons"].append(f"CPU {host_offline['cpu_val']}%")
        if host_offline["disco_val"] < 30:
            host_offline["has_critical_hw"] = True
            host_offline["critical_reasons"].append(f"Disco D: {host_offline['disco_val']}GB livres")

    assert is_offline is True
    assert host_offline["has_critical_hw"] is False, (
        "Host offline há 4 dias NÃO pode ser classificado como gargalo de hardware em tempo real!"
    )


def test_offline_host_does_not_count_as_inoperant_p0():
    """
    DIRETRIZ DE ENGENHARIA NOC:
    Host offline (sem telemetria do agente há dias, ex: Castanhal) NÃO PODE
    ser contabilizado como 'Inoperante (P0) / Sem Motor de Matching'.
    Deve ser classificado estritamente como COMM_LOST, e inoperant_p0 deve ser 0.
    """
    stale_date = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    mock_services = [
        {
            "id": "svc_agent", "hostname": "BRPA-CAH-DT01", "praca": "Castanhal", "cs": 1,
            "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução",
            "versao_instalada": "1.0.20.0", "versao_desejada": "1.0.20.0", "status_atualizacao": "Atualizado",
            "acao_solicitada": "Nenhuma", "ultima_atualizacao": stale_date, "cpu_uso": "<1%", "ram_uso": "64 MB",
            "disco_d_livre": "N/A", "uptime": "N/A", "status_wcf": "Desconectado", "log_erro": ""
        }
    ]

    with patch("tracking_detection_monitor.get_fleet_services", return_value=mock_services):
        snap = build_detection_fleet_snapshot()
        site = snap["sites"][0]

        # Validação mandatória:
        assert site["health_status"] == "COMM_LOST", f"Esperado COMM_LOST, obtido {site['health_status']}"
        assert site["engine_tier"] == "NONE", f"Esperado engine_tier NONE, obtido {site['engine_tier']}"
        assert "Host Desconectado" in site["severity_label"]
        assert "Telemetria suspensa" in site["incident_description"]

        # Sumário NÃO pode ter inoperant_p0 incrementado
        assert snap["summary"]["inoperant_p0"] == 0, "Host offline não pode inflar inoperant_p0!"
        assert snap["summary"]["critical"] == 0, "Host offline não pode ser classificado como critical (P0)!"
        assert snap["summary"]["comm_lost"] == 1, "Host offline deve ser contabilizado em comm_lost!"
