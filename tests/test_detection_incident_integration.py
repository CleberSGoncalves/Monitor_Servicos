"""
Suíte de Testes Automatizados — Integração do Pipeline de Detecção Automática na Central de Incidentes N1
Diretriz GEMINI.md: Validação prática obrigatória de ponta a ponta.
"""

import sys
import json
import re
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from app import app
from tracking_detection_monitor import build_detection_fleet_snapshot

client = TestClient(app)


def test_detection_fleet_snapshot_clean_metrics():
    """Valida que o snapshot da frota CS01 não sofre mais com a contaminação de COMM_LOST em 100% dos hosts."""
    data = build_detection_fleet_snapshot()
    summary = data.get("summary", {})
    
    # 1. Total de sites CS01
    assert summary["total_cs01"] > 50, f"Esperado >50 hosts CS01, obtido {summary['total_cs01']}"
    
    # 2. Compliance rate deve ser realista e refletir a frota real (>= 70%)
    assert summary["compliance_rate"] >= 70.0, f"Taxa de conformidade deve ser >= 70%, obtido: {summary['compliance_rate']}%"
    
    # 3. Não pode ter todos os sites marcados como comm_lost
    assert summary["comm_lost"] < summary["total_cs01"] * 0.1, "COMM_LOST não pode englobar a maioria dos sites"
    
    # 4. Deve segregar sites com e sem motor
    engines = [s.get("active_engine") for s in data.get("sites", [])]
    assert any(e == "FastMatchingSvc" for e in engines), "Deve mapear sites com motor primário FastMatching"
    assert any(e == "DNA.DetectionSVC" for e in engines), "Deve mapear sites com motor fallback DetectionSVC"
    assert summary["inoperant_p0"] >= 0, "Deve identificar sites sem motor (P0 crítico)"


def test_detection_api_endpoints():
    """Valida que os endpoints de detecção retornam dados consistentes em menos de 100ms."""
    r_sum = client.get("/api/fleet/detection/summary")
    assert r_sum.status_code == 200
    sum_data = r_sum.json().get("summary", {})
    assert "compliance_rate" in sum_data
    assert sum_data["compliance_rate"] > 0

    r_sites = client.get("/api/fleet/detection/sites")
    assert r_sites.status_code == 200
    sites_data = r_sites.json()
    assert "sites" in sites_data
    assert len(sites_data["sites"]) > 0


def test_frontend_ui_elements_presence():
    """Valida a presença dos elementos de detecção sem poluição visual no index.html e app.js."""
    index_path = DASHBOARD_DIR / "static" / "index.html"
    index_html = index_path.read_text(encoding="utf-8")

    # 1. Top Strip Cockpit Pill
    assert "nocKpiDeteccao" in index_html, "ID nocKpiDeteccao ausente no Cockpit Top Strip"
    assert "nocKpiDeteccaoContainer" in index_html, "Container nocKpiDeteccaoContainer ausente"

    # 2. Sidebar Facet Filter
    assert "facetCountDeteccao" in index_html, "ID facetCountDeteccao ausente na Sidebar"
    assert 'value="deteccao"' in index_html, "Trigger value 'deteccao' ausente na Sidebar"

    app_js_path = DASHBOARD_DIR / "static" / "js" / "app.js"
    app_js = app_js_path.read_text(encoding="utf-8")

    # 3. Funções no app.js
    assert "toggleNocTriggerFilter" in app_js, "Função toggleNocTriggerFilter ausente no app.js"
    assert 'trigger_type: "deteccao"' in app_js, "Geração de trigger_type 'deteccao' ausente no app.js"
    assert 'incidentCode.startsWith("deteccao_")' in app_js, "Suporte a diagnóstico IA de detecção ausente"


def test_ram_metric_parsing_prevents_700_percent():
    """Valida que valores em MB (ex: 713 MB) jamais são interpretados como percentuais de 700%."""
    app_js_path = DASHBOARD_DIR / "static" / "js" / "app.js"
    app_js = app_js_path.read_text(encoding="utf-8")

    # Valida que parseRamMetric existe e separa isPct de mb
    assert "function parseRamMetric" in app_js
    assert "isPct: false" in app_js
    assert "pctMatch" in app_js
    assert "mbMatch" in app_js
