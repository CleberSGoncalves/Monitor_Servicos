"""
test_praca_analyzer_bh_radio_nominal.py - Validação automatizada determinística
Garante que a praça Belo Horizonte (Hub Regional de Streaming de Rádios CS03 e TV CS02)
não sofra falsos positivos de gravação de áudio, mantenha 0 falhas e Health Score 100.
"""
import sys
sys.path.insert(0, "dashboard")

import pytest
from praca_analyzer import audit_praca_ecosystem, list_active_pracas, is_radio_channel_healthy

def test_bh_radio_channels_are_all_nominal():
    audit = audit_praca_ecosystem("Belo Horizonte", selected_cs="ALL")
    assert audit is not None
    assert audit["praca"].lower() == "belo horizonte"
    assert audit["health_score"] == 100
    assert len(audit["problems"]) == 0

    # Todos os canais de rádio devem estar nominais
    radio_channels = [c for c in audit["canais"] if c.get("is_radio")]
    assert len(radio_channels) > 0
    for ch in radio_channels:
        assert ch["is_nominal"] is True, f"Canal de rádio {ch['canal']} marcado como falha indevidamente!"
        assert ch["gravando"] == "Sim"

def test_bh_in_active_pracas_dropdown_has_zero_failures():
    pracas = list_active_pracas()
    bh = next((p for p in pracas if p["praca"].lower() == "belo horizonte"), None)
    assert bh is not None
    assert bh["canais_com_falha"] == 0
    assert bh["status_geral"] == "NOMINAL"

def test_bh_cs02_and_cs03_isolated_scopes():
    # CS02: 8 canais de TV
    audit_cs2 = audit_praca_ecosystem("Belo Horizonte", selected_cs="CS02")
    assert audit_cs2["health_score"] == 100
    assert len(audit_cs2["problems"]) == 0
    assert audit_cs2["is_single_cs_focus"] is True
    assert audit_cs2["active_cs_tier"] == 2
    assert "Exclusivo CS01" in audit_cs2["active_engine"]

    # CS03: 34 canais de Rádio
    audit_cs3 = audit_praca_ecosystem("Belo Horizonte", selected_cs="CS03")
    assert audit_cs3["health_score"] == 100
    assert len(audit_cs3["problems"]) == 0
    assert audit_cs3["is_single_cs_focus"] is True
    assert audit_cs3["active_cs_tier"] == 3
    assert "Exclusivo CS01" in audit_cs3["active_engine"]
