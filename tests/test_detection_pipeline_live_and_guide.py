import pytest
import sys
import os
from pathlib import Path

# Adiciona o dashboard ao path para testes
dashboard_dir = Path(__file__).resolve().parent.parent / "dashboard"
if str(dashboard_dir) not in sys.path:
    sys.path.insert(0, str(dashboard_dir))

from tracking_detection_monitor import (
    get_channels_for_praca,
    get_fastmatching_pipeline_live,
    clean_channel_code
)


def test_clean_channel_code():
    assert clean_channel_code("Rede Globo") == "GLOBO"
    assert clean_channel_code("RPC TV Cascavel") == "GLOBO"
    assert clean_channel_code("Record TV") == "RECORD"
    assert clean_channel_code("RIC TV Oeste") == "RECORD"
    assert clean_channel_code("Rede Bandeirantes") == "BAND"
    assert clean_channel_code("TV Tarobá") == "BAND"
    assert clean_channel_code("SBT") == "SBT"
    assert clean_channel_code("Rede Massa") == "SBT"
    assert clean_channel_code("Rede TV") == "REDETV"
    assert clean_channel_code("TV Brasil") == "TV BRASIL"


def test_cascavel_strictly_no_sbt():
    """Garante que Cascavel possui exclusivamente Globo, Record e Band, e NUNCA SBT."""
    channels = get_channels_for_praca("Cascavel", hostname="Cascavel-SMME-215-CS1")
    channel_names = [c["name"] for c in channels]
    
    assert "GLOBO" in channel_names
    assert "RECORD" in channel_names
    assert "BAND" in channel_names
    assert "SBT" not in channel_names, "FALHA CRÍTICA: SBT não pode existir na praça de Cascavel!"
    assert len(channel_names) == 3


def test_other_pracas_channels():
    """Verifica a resolução correta de canais para outras praças."""
    # Londrina tem SBT
    londrina_chs = [c["name"] for c in get_channels_for_praca("Londrina")]
    assert "SBT" in londrina_chs
    
    # Pelotas tem 2 canais
    pelotas_chs = [c["name"] for c in get_channels_for_praca("Pelotas")]
    assert "GLOBO" in pelotas_chs
    assert "SBT" not in pelotas_chs


def test_pipeline_live_payload_cascavel():
    """Garante que o payload retornado pelo pipeline live de Cascavel respeita a grade real."""
    data = get_fastmatching_pipeline_live("Cascavel-SMME-215-CS1")
    assert data["success"] is True
    assert data["praca"] == "Cascavel"
    assert "monitored_channels" in data
    assert data["monitored_channels"] == ["GLOBO", "RECORD", "BAND"]
    assert data["emu_status"]["active_channels"] == 3
    
    # Nenhuma detecção recente pode ser do SBT
    detections = data.get("recent_detections", [])
    for d in detections:
        assert d["channel"] != "SBT", f"Detecção inválida encontrada para SBT em Cascavel: {d}"
        assert d["channel"] in ["GLOBO", "RECORD", "BAND"]
        
    # Nenhum log pode mencionar [SBT]
    logs = data.get("raw_logs", [])
    for line in logs:
        assert "[SBT]" not in line, f"Linha de log com SBT indevido encontrada para Cascavel: {line}"


def test_pipeline_live_payload_londrina():
    """Garante que praças com SBT mantêm a detecção e canal oficial."""
    data = get_fastmatching_pipeline_live("Londrina-SMME-211-CS1")
    assert data["success"] is True
    assert data["praca"] == "Londrina"
    assert "SBT" in data["monitored_channels"]
