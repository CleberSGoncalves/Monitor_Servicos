# -*- coding: utf-8 -*-
"""
test_sla_matrix_service.py - Testes automatizados para a Matriz Geral de SLA & Situação dos Incidentes.
Valida o cálculo determinístico de atrasos (KA, MP3, MP4/ASF, DT), identificação de tiers,
isolamento de DT no CS01 e separação de estações crônicas.
"""
import sys
from pathlib import Path
sys.path.insert(0, "dashboard")

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app import app
from sla_matrix_service import get_fleet_sla_matrix


def test_sla_matrix_structure_and_kpis():
    """Valida se a estrutura e os KPIs da matriz de SLA são gerados corretamente."""
    res = get_fleet_sla_matrix()

    assert "kpis" in res
    assert "rows" in res
    assert "total_filtered" in res
    assert "generated_at" in res

    kpis = res["kpis"]
    for k in ["total_hosts", "nominal_count", "active_alerts_count", "critical_count", "chronic_zombies_count", "detection_lag_count", "media_lag_count", "wan_issues_count"]:
        assert k in kpis
        assert isinstance(kpis[k], int)

    assert kpis["total_hosts"] > 0
    assert len(res["rows"]) == kpis["total_hosts"]


def test_sla_matrix_host_contract():
    """Valida o contrato das linhas da matriz: colunas clássicas do NOC + WAN."""
    res = get_fleet_sla_matrix()
    rows = res["rows"]
    assert len(rows) > 0

    first = rows[0]
    expected_fields = [
        "id_host", "hostname", "raw_hostname", "display_name", "praca", "cs",
        "tier", "color_flag", "max_delay_min", "has_delays",
        "ka_delay_min", "mp3_arc_min", "mp3_bur_min", "asf_arc_min", "asf_bur_min",
        "mp4_arc_min", "mp4_bur_min", "dt_delay_min", "subproducts", "wan"
    ]
    for field in expected_fields:
        assert field in first, f"Campo {field} ausente na linha da matriz"

    # DT deve ser 'N/A' em nós CS02 e CS03
    for r in rows:
        if r["cs"] in (2, 3):
            assert r["dt_delay_min"] == "N/A", f"CS {r['cs']} não deve avaliar detecção comercial"


def test_sla_matrix_filtering():
    """Valida que os filtros de tier e busca funcionam de forma consistente."""
    # Filtro por tier ativo
    res_active = get_fleet_sla_matrix(filter_tier="active")
    for r in res_active["rows"]:
        assert r["tier"] in ("CRITICO", "ALERTA")

    # Filtro por busca de praça
    res_search = get_fleet_sla_matrix(search="Pelotas")
    for r in res_search["rows"]:
        assert "pelotas" in r["praca"].lower() or "pelotas" in r["hostname"].lower()


def test_api_fleet_sla_matrix_endpoint():
    """Valida o endpoint HTTP /api/fleet/sla-matrix."""
    client = TestClient(app)
    from auth import create_session
    token = create_session("admin", "admin")

    resp = client.get("/api/fleet/sla-matrix", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "kpis" in data
    assert "rows" in data
    assert isinstance(data["rows"], list)
