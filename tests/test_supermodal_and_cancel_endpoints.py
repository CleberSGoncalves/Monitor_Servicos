import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))

def test_cancel_order_endpoint():
    from app import app
    from fastapi.testclient import TestClient
    client = TestClient(app)

    resp = client.post(
        "/api/fleet/cancel-order",
        json={"hostname": "Ariquemes-SMME-283-CS1", "execution_id": "exec-test-123", "reason": "Teste unitario de cancelamento"},
        headers={"Authorization": "Bearer test-admin-token"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "Ariquemes-SMME-283-CS1" in data["message"]

def test_cancel_update_endpoint():
    from app import app
    from fastapi.testclient import TestClient
    client = TestClient(app)

    resp = client.post(
        "/api/fleet/cancel-update",
        json={"hostname": "Uberlandia-SMME-284-CS1", "service_name": "Atria Capture"},
        headers={"Authorization": "Bearer test-admin-token"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "Uberlandia-SMME-284-CS1" in data["message"]

def test_index_html_nav_and_cancel_buttons():
    html_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Botão de Configuração CS direto no menu superior
    assert 'id="topNavBtnCSConfig"' in html
    assert 'data-tab="fleet-csconfig"' in html

    # Botão de cancelar no modal de update
    assert 'id="btnCancelFleetUpdate"' in html
    assert 'cancelCurrentFleetUpdate()' in html

    # Modal do Tracker de Configuração com botão cancelar
    assert 'id="modalConfigActionTracker"' in html
    assert 'id="btnCancelConfigOrder"' in html
    assert 'cancelCurrentConfigOrder()' in html

    # Super Modal ATRIA
    assert 'id="modalHostConfig"' in html
    assert 'btnSaveHostConfig' in html

def test_fleet_ops_js_functions():
    js_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "fleet_ops.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "cancelCurrentConfigOrder" in js
    assert "cancelCurrentFleetUpdate" in js
    assert "openConfigActionTrackerModal" in js
    assert "switchMainTabAndFleetSubtab" in js
    assert "openConfigActionTrackerModal(hostname" in js
