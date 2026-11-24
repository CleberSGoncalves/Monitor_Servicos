# -*- coding: utf-8 -*-
"""
test_cs3_role_paytv_vs_radio.py - Testes automatizados para validação determinística
do papel operacional de nós CS03: PayTV / Cabo vs Rádio Sonifex.
Garante que CS03 com canais por assinatura (ex: Nacional) não seja chamado de rádio
e que canais analógicos da placa TW6802 com gravação ativa sejam 100% saudáveis.
"""
import sys
sys.path.insert(0, "dashboard")

import pytest
from praca_analyzer import audit_praca_ecosystem, infer_cs_operational_role, is_tv_channel_healthy, is_radio_channel_type


def test_nacional_cs03_is_paytv_not_radio():
    """Valida que o nó CS03 de Nacional é identificado estritamente como PayTV / Cabo."""
    res = audit_praca_ecosystem("Nacional", "CS03")
    assert res["is_paytv"] is True
    assert res["is_radio"] is False
    assert "PayTV" in res["role_title"]
    assert "PayTV" in res["role_label"]

    # Estágio 6 deve declarar PayTV / Cabo
    det_stage = next((st for st in res["pipeline_stages"] if st["id"] == "detection"), None)
    assert det_stage is not None
    assert "PayTV / Cabo" in det_stage["detail"]


def test_bh_cs03_is_radio():
    """Valida que o nó CS03 de Belo Horizonte continua sendo identificado como Rádio."""
    res = audit_praca_ecosystem("Belo Horizonte", "CS03")
    assert res["is_radio"] is True
    assert res["is_paytv"] is False
    assert "Rádio" in res["role_title"] or "Radio" in res["role_title"]


def test_analog_paytv_tw6802_channel_healthy_when_recording():
    """Valida que canais analógicos da placa TW6802 com gravação ativa não são falsamente marcados como sem sinal."""
    fake_ch = {
        "canal": "SPORTV",
        "meio": "Analógico",
        "device_analog": "TW6802 PCI, Analog Capture (#06)",
        "status_tuner": "Initialisation correct. Disconnected.",
        "gravando_mp4": "Gravando (.ASF BKP)",
        "qualidade_sinal": 0,
        "has_outage": False
    }
    is_ok, desc, q = is_tv_channel_healthy(fake_ch)
    assert is_ok is True
    assert "PayTV/Cabo" in desc
    assert q == 100


def test_amc_is_not_detected_as_radio():
    """Valida que canais de TV com 'am' no nome (como AMC) não são confundidos com rádio AM."""
    fake_amc = {
        "canal": "AMC",
        "meio": "Analógico",
        "device_analog": "TW6802 PCI, Analog Capture (#02)"
    }
    assert is_radio_channel_type(fake_amc) is False
