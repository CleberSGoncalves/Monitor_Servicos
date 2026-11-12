import os
import sys
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure dashboard directory is in path
dashboard_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard"))
if dashboard_dir not in sys.path:
    sys.path.insert(0, dashboard_dir)

from version_governance import (
    get_desired_versions,
    set_desired_version,
    get_service_fleet_evolution,
    get_all_services_governance_summary,
    enrich_services_with_central_governance,
    DEFAULT_DESIRED_VERSIONS
)
from app import app
from auth import create_session


def test_desired_versions_defaults_and_keys():
    """Valida se o dicionário de versões homologadas possui todos os serviços fundamentais da frota."""
    versions = get_desired_versions()
    assert isinstance(versions, dict)
    
    assert "DNA.MonitorServiceSVC" in versions
    assert "FastMatchingSvc" in versions
    assert "DNA.DetectionSVC" in versions
    assert "DNA.ConfigMonitorSVC" in versions
    assert "Atria Capture" in versions
    assert versions["DNA.MonitorServiceSVC"] == "1.0.20.0"
    assert versions["FastMatchingSvc"] == "1.1.0.0"


def test_set_desired_version_persists_and_updates():
    """Valida alteração e persistência da versão desejada oficial."""
    res = set_desired_version("FastMatchingSvc", "1.1.0.0")
    assert res["success"] is True
    assert res["service_name"] == "FastMatchingSvc"
    assert res["new_version"] == "1.1.0.0"

    # Confirma que reflete imediatamente em get_desired_versions
    cur = get_desired_versions()
    assert cur["FastMatchingSvc"] == "1.1.0.0"


def test_get_service_fleet_evolution_fastmatching():
    """Valida computação de adoção para FastMatchingSvc."""
    evol = get_service_fleet_evolution("FastMatchingSvc")
    assert evol["service_name"] == "FastMatchingSvc"
    assert evol["target_version"] == "1.1.0.0"
    assert evol["total_hosts"] > 0
    assert 0.0 <= evol["updated_pct"] <= 100.0
    assert "versions_breakdown" in evol
    assert len(evol["hosts_detail"]) == evol["total_hosts"]

    # Valida consistência matemática
    assert evol["updated_count"] + evol["pending_online_count"] + evol["offline_count"] == evol["total_hosts"]


def test_get_all_services_governance_summary():
    """Valida sumário de governança de todos os serviços rastreados."""
    summary = get_all_services_governance_summary()
    assert "services" in summary
    assert summary["total_services_tracked"] >= 10

    service_names = [s["service_name"] for s in summary["services"]]
    assert "DNA.MonitorServiceSVC" in service_names
    assert "FastMatchingSvc" in service_names
    assert "DNA.ConfigMonitorSVC" in service_names

    for s in summary["services"]:
        assert "target_version" in s
        assert "updated_pct" in s
        assert "health" in s
        assert s["health"] in ("nominal", "warning", "critical")


def test_enrich_services_with_central_governance():
    """Valida enriquecimento de serviços com a governança central de versões."""
    mock_services = [
        {"nome_servico": "FastMatchingSvc", "versao_instalada": "1.1.0.0", "versao_desejada": "1.0.3.7"},
        {"nome_servico": "FastMatchingSvc", "versao_instalada": "1.0.3.7", "versao_desejada": "1.0.3.7"},
        {"nome_servico": "DNA.MonitorServiceSVC", "versao_instalada": "1.0.20.0", "versao_desejada": "1.0.13.1"},
        {"nome_servico": "DNA.MonitorServiceSVC", "versao_instalada": "1.0.18.0", "versao_desejada": "1.0.13.1"}
    ]

    enriched = enrich_services_with_central_governance(mock_services)

    # FastMatching com 1.1.0.0 deve ser considerado Atualizado
    assert enriched[0]["versao_desejada"] == "1.1.0.0"
    assert enriched[0]["status_atualizacao"] == "Atualizado"

    # FastMatching com 1.0.3.7 deve ser considerado Desatualizado
    assert enriched[1]["versao_desejada"] == "1.1.0.0"
    assert enriched[1]["status_atualizacao"] == "Desatualizado"

    # MonitorService com 1.0.20.0 deve ser considerado Atualizado
    assert enriched[2]["versao_desejada"] == "1.0.20.0"
    assert enriched[2]["status_atualizacao"] == "Atualizado"

    # MonitorService com 1.0.18.0 deve ser considerado Desatualizado
    assert enriched[3]["versao_desejada"] == "1.0.20.0"
    assert enriched[3]["status_atualizacao"] == "Desatualizado"


def test_api_governance_endpoints():
    """Valida endpoints REST de governança via TestClient."""
    token = create_session("cleber.goncalves", "admin")
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Summary
    resp_sum = client.get("/api/fleet/governance/summary", headers=headers)
    assert resp_sum.status_code == 200
    data_sum = resp_sum.json()
    assert "services" in data_sum
    assert data_sum["total_services_tracked"] >= 10

    # 2. Service Evolution
    resp_svc = client.get("/api/fleet/governance/service/FastMatchingSvc", headers=headers)
    assert resp_svc.status_code == 200
    data_svc = resp_svc.json()
    assert data_svc["service_name"] == "FastMatchingSvc"
    assert data_svc["target_version"] == "1.1.0.0"
    assert "updated_pct" in data_svc

    # 3. Set Version
    resp_set = client.post(
        "/api/fleet/governance/set-version",
        headers=headers,
        json={"service_name": "FastMatchingSvc", "target_version": "1.1.0.0"}
    )
    assert resp_set.status_code == 200
    data_set = resp_set.json()
    assert data_set["success"] is True
    assert data_set["new_version"] == "1.1.0.0"


def test_frontend_governance_dom_elements():
    """Valida a presença dos elementos HTML da nova Matriz de Governança de Versões no index.html."""
    html_file = Path(__file__).resolve().parent.parent / "dashboard" / "static" / "index.html"
    assert html_file.exists()
    content = html_file.read_text(encoding="utf-8")

    assert 'id="fleetGovernanceGrid"' in content
    assert 'id="selectFleetGovernanceService"' in content
    assert 'id="modalSetDesiredVersion"' in content
    assert 'id="modalSelectService"' in content
    assert 'id="modalInputVersion"' in content
    assert 'openSetTargetVersionModal' in content

