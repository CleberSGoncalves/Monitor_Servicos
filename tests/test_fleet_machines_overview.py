# -*- coding: utf-8 -*-
"""
Testes automatizados para o endpoint /api/fleet/machines/overview e a Visão 360° da Frota.
Valida determinismo do pipeline de 6 estágios, categorização por dimensão e regras de negócio de CS.
"""
import sys
from pathlib import Path
sys.path.insert(0, "dashboard")

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app import app
from praca_analyzer import get_fleet_machines_overview, audit_praca_ecosystem, generate_ai_solutions_plan


def test_get_fleet_machines_overview_structure():
    """Valida que o overview da frota retorna os 6 estágios e contadores corretos."""
    mock_data = {
        "channels": [
            {
                "cidade": "Aracaju",
                "hostname": "Aracaju-SMME-101-CS1",
                "canal": "TV Sergipe (Globo)",
                "meio": "TV",
                "qualidade_sinal": "92",
                "status_tuner": "Lock",
                "gravando_video": "Sim",
                "has_outage": False
            },
            {
                "cidade": "Aracaju",
                "hostname": "Aracaju-SMME-102-CS2",
                "canal": "Record TV",
                "meio": "TV",
                "qualidade_sinal": "80",
                "status_tuner": "Lock",
                "gravando_video": "Sim",
                "has_outage": False
            },
            {
                "cidade": "Aracaju",
                "hostname": "Aracaju-SMME-103-CS3",
                "canal": "Rádio FM 101",
                "meio": "Radio",
                "qualidade_sinal": "0",
                "gravando_mp3": "Sim",
                "has_outage": False
            }
        ],
        "services": [
            {
                "hostname": "Aracaju-SMME-101-CS1",
                "praca": "Aracaju",
                "cs": 1,
                "nome_servico": "FastMatchingSvc",
                "status_servico": "Executando",
                "versao_instalada": "2.0.0.3",
                "cpu_uso": "26%",
                "ram_uso": "120 MB",
                "disco_d_livre": "280 GB"
            },
            {
                "hostname": "Aracaju-SMME-101-CS1",
                "praca": "Aracaju",
                "cs": 1,
                "nome_servico": "DNA.ConfigMonitorSVC",
                "status_servico": "Executando",
                "versao_instalada": "1.0.21.5"
            },
            {
                "hostname": "Aracaju-SMME-102-CS2",
                "praca": "Aracaju",
                "cs": 2,
                "nome_servico": "Atria Capture",
                "status_servico": "Executando",
                "versao_instalada": "1.4.4",
                "cpu_uso": "26%",
                "ram_uso": "95 MB",
                "disco_d_livre": "300 GB"
            },
            {
                "hostname": "Aracaju-SMME-103-CS3",
                "praca": "Aracaju",
                "cs": 3,
                "nome_servico": "SonifexCapture",
                "status_servico": "Executando",
                "versao_instalada": "1.0.0",
                "cpu_uso": "26%",
                "ram_uso": "45 MB",
                "disco_d_livre": "350 GB"
            }
        ]
    }

    with patch("praca_analyzer.get_cached_data", return_value=mock_data):
        res = get_fleet_machines_overview()

        assert "total_hosts" in res
        assert res["total_hosts"] == 3
        assert "tag_counts" in res
        counts = res["tag_counts"]
        for key in ["all", "alert", "link", "detection", "signal", "recording", "hardware", "dispatch"]:
            assert key in counts

        machines = res["machines"]
        assert len(machines) == 3

        # Host CS01
        cs01 = next(m for m in machines if m["cs_tier"] == 1)
        assert cs01["stages"]["detection"]["status"] == "NOMINAL"
        assert cs01["stages"]["detection"]["badge"] == "FastMatching"
        assert cs01["stages"]["dispatch"]["status"] == "NOMINAL"

        # Host CS02: Detecção deve ser N/A (Regra: detecção roda exclusivamente no CS01)
        cs02 = next(m for m in machines if m["cs_tier"] == 2)
        assert cs02["stages"]["detection"]["status"] == "NA"
        assert "Exclusivo CS01" in cs02["stages"]["detection"]["badge"]

        # Host CS03 (Rádio): Rádio Sonifex não gera quebra de RF por ausência de lock de TV
        cs03 = next(m for m in machines if m["cs_tier"] == 3)
        assert cs03["stages"]["signal"]["status"] == "NOMINAL"
        assert cs03["stages"]["recording"]["status"] == "NOMINAL"


def test_api_fleet_machines_overview_endpoint():
    """Valida o endpoint /api/fleet/machines/overview com autenticação."""
    client = TestClient(app)

    from auth import create_session
    token = create_session("admin", "admin")

    resp = client.get("/api/fleet/machines/overview", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "machines" in data
    assert "tag_counts" in data
    assert isinstance(data["machines"], list)


def test_praca_audit_available_cs_options_contract():
    """Garante que a auditoria de praça retorna opções de CS compatíveis sem quebrar csKey."""
    res = audit_praca_ecosystem(praca_name="Aracaju", selected_cs="ALL")
    assert "available_cs_options" in res
    assert isinstance(res["available_cs_options"], list)
    for cs_opt in res["available_cs_options"]:
        # Se for dict, deve ter "code"
        if isinstance(cs_opt, dict):
            assert "code" in cs_opt
            assert isinstance(cs_opt["code"], str)
        else:
            assert isinstance(cs_opt, str)
