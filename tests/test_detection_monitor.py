"""
Testes Automatizados para o Pipeline de Detecção Automática (CS01)
Diretriz GEMINI.md: Validação prática obrigatória de ponta a ponta.
"""

import pytest
import sys
from pathlib import Path

# Adiciona o diretório do dashboard ao path
DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from tracking_detection_monitor import (
    build_detection_fleet_snapshot,
    generate_detection_ai_diagnostic,
    DEFAULT_STALLED_THRESHOLD_MINUTES
)
from fastapi.testclient import TestClient
from app import app


def test_build_detection_fleet_snapshot_structure():
    """Valida se o snapshot consolida a frota CS01 com estrutura e métricas completas."""
    data = build_detection_fleet_snapshot(threshold_minutes=45)
    assert "summary" in data, "Snapshot deve conter 'summary'"
    assert "sites" in data, "Snapshot deve conter 'sites'"

    summary = data["summary"]
    assert summary["total_cs01"] > 0, "Deve encontrar hosts CS01 na frota"
    assert "nominal_fastmatching" in summary
    assert "fallback_detection_svc" in summary
    assert "inoperant_p0" in summary
    assert "stalled_tracking" in summary
    assert "compliance_rate" in summary
    assert summary["threshold_minutes"] == 45

    sites = data["sites"]
    assert len(sites) == summary["total_cs01"]

    # Valida que TODOS os sites retornados são estritamente CS01
    for site in sites:
        assert site["cs"] == 1, f"Host {site['hostname']} deve ser exclusivamente CS01, obtido CS={site['cs']}"
        assert site["engine_tier"] in ("PRIMARY", "FALLBACK", "NONE")
        assert site["health_status"] in ("NOMINAL", "WARNING", "STALLED", "CRITICAL")
        assert "pipeline_services" in site
        p = site["pipeline_services"]
        assert "fast_matching" in p
        assert "detection_svc" in p
        assert "config_monitor" in p
        assert "tracking_svc" in p


def test_detection_ai_diagnostic():
    """Valida o diagnóstico heurístico de IA para um host CS01 real."""
    data = build_detection_fleet_snapshot()
    assert len(data["sites"]) > 0
    first_host = data["sites"][0]["hostname"]

    result = generate_detection_ai_diagnostic(first_host)
    assert result["success"] is True
    assert "diagnosis" in result
    diag = result["diagnosis"]
    assert "root_cause" in diag and len(diag["root_cause"]) > 5
    assert "technical_assessment" in diag and len(diag["technical_assessment"]) > 10
    assert "recommended_actions" in diag
    assert len(diag["recommended_actions"]) > 0


def test_detection_ai_diagnostic_unknown_host():
    """Valida que diagnóstico para host inexistente retorna erro tratado sem quebrar."""
    result = generate_detection_ai_diagnostic("HOST-INEXISTENTE-999")
    assert result["success"] is False
    assert "não localizado" in result["error"]


def test_api_detection_endpoints():
    """Valida as rotas HTTP FastAPI de /api/fleet/detection/summary e /api/fleet/detection/sites."""
    client = TestClient(app)

    # 1. Summary
    resp_sum = client.get("/api/fleet/detection/summary?threshold=30")
    assert resp_sum.status_code == 200
    json_sum = resp_sum.json()
    assert json_sum["status"] == "success"
    assert json_sum["summary"]["total_cs01"] > 0
    assert json_sum["summary"]["threshold_minutes"] == 30

    # 2. Sites sem filtro
    resp_sites = client.get("/api/fleet/detection/sites")
    assert resp_sites.status_code == 200
    json_sites = resp_sites.json()
    assert json_sites["status"] == "success"
    assert len(json_sites["sites"]) > 0

    # 3. Sites com filtro por praça
    first_praca = json_sites["sites"][0]["praca"]
    resp_filtered = client.get(f"/api/fleet/detection/sites?praca={first_praca}")
    assert resp_filtered.status_code == 200
    json_filt = resp_filtered.json()
    assert all(first_praca.lower() in s["praca"].lower() or first_praca.lower() in s["hostname"].lower() for s in json_filt["sites"])

    # 4. Diagnóstico via POST
    first_host = json_sites["sites"][0]["hostname"]
    resp_diag = client.post("/api/fleet/detection/ai-diagnose", json={"hostname": first_host})
    assert resp_diag.status_code == 200
    json_diag = resp_diag.json()
    assert json_diag["success"] is True
    assert "diagnosis" in json_diag
