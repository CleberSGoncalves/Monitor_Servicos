# -*- coding: utf-8 -*-
"""
test_boa_vista_atria_working_nominal.py - Teste automatizado para garantia de determinismo em Boa Vista.
Garante que sintonizadores com status 'Connected with tuner. WORKING.' e gravação ativa
JAMAIS gerem falsos positivos de queda de sinal RF mesmo quando qualidade_sinal == 0 (driver BDA sem SNR).
"""
import sys
from pathlib import Path
sys.path.insert(0, "dashboard")

import pytest
from praca_analyzer import is_tv_channel_healthy, audit_praca_ecosystem, get_fleet_machines_overview


def test_is_tv_channel_healthy_eliminates_zero_quality_false_positive():
    """Valida a regra de ouro: canal gravando e tuner WORKING é 100% saudável mesmo com qualidade_sinal 0."""
    ch = {
        "canal": "Rede Globo",
        "qualidade_sinal": 0,
        "status_tuner": "Connected with tuner. WORKING.",
        "gravando_mp4": "Sim (~30h rest)",
        "motivo": "Operando Normalmente (Sintonizador TBS Conectado)",
        "has_outage": False
    }

    is_ok, desc, eff_q = is_tv_channel_healthy(ch)
    assert is_ok is True
    assert "working" in desc.lower() or "lock" in desc.lower()
    assert eff_q == 100


def test_boa_vista_audit_cs01_is_100_percent_nominal():
    """Valida que a auditoria forense do CS01 de Boa Vista atinge 100% de Health Score sem alertas de sinal."""
    audit = audit_praca_ecosystem("Boa Vista", "CS01")
    assert audit["health_score"] == 100
    assert audit.get("status_geral") == "NOMINAL"
    assert len(audit.get("problems", [])) == 0

    stages = {st["name"] if "name" in st else st["title"]: st for st in audit["pipeline_stages"]}
    signal_st = next(st for k, st in stages.items() if "Sinal" in k or "Sintonizadores" in k)
    assert signal_st["status"] == "NOMINAL"
    assert signal_st["badge"] == "Tuners Saudáveis"


def test_boa_vista_channels_are_all_nominal_in_audit():
    """Garante que todos os 5 canais do CS01 de Boa Vista constam como nominais e com Lock Atria."""
    audit = audit_praca_ecosystem("Boa Vista", "CS01")
    canais = audit.get("canais", [])
    assert len(canais) == 5

    for ch in canais:
        assert ch["is_nominal"] is True
        assert "lock" in ch["status_tuner"].lower() or "working" in ch["status_tuner"].lower()
