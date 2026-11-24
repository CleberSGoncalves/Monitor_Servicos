import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))

def test_fleet_action_status_has_live_progress_and_terminal():
    from fleet_actions import get_host_service_action_status
    # Testar com um host existente no cache
    res = get_host_service_action_status("Uberlandia-SMME-284-CS1", "Atria Capture", "2.0.0.2")
    assert res.get("success") is True
    assert "progress_percent" in res
    assert isinstance(res["progress_percent"], int)
    assert 0 <= res["progress_percent"] <= 100
    assert "current_activity" in res
    assert isinstance(res["current_activity"], str)
    assert len(res["current_activity"]) > 5
    assert "terminal_logs" in res
    assert isinstance(res["terminal_logs"], list)
    assert len(res["terminal_logs"]) > 0
    assert "script_name" in res
    assert "Atualizar" in res["script_name"]
    assert "is_active_operation" in res

def test_index_html_has_progress_bar_terminal_and_floating_widget():
    html_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "index.html")
    with open(html_path, "r", encoding="utf-8") as fp:
        html = fp.read()
    
    # Barra de Progresso e Percentual
    assert "upProgPercentText" in html
    assert "upProgressBar" in html
    assert "upProgScriptName" in html
    assert "upProgCurrentActivity" in html
    
    # Terminal de Execução ao Vivo
    assert "upProgTerminalBox" in html
    assert "upProgTerminalLiveBadge" in html
    assert "copyUpProgTerminalLogs()" in html
    
    # Widget Flutuante Global de Atualização Ativa
    assert "fleetActiveUpdateFloatingWidget" in html
    assert "floatingUpdatePercentBadge" in html
    assert "floatingUpdateHostText" in html
    assert "floatingUpdateServiceText" in html
    assert "reopenActiveUpdateModal()" in html
    assert "dismissActiveUpdateFloatingWidget" in html

def test_fleet_ops_js_wires_floating_tracker_and_terminal():
    js_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "fleet_ops.js")
    with open(js_path, "r", encoding="utf-8") as fp:
        js = fp.read()
    
    assert "upProgPercentText" in js
    assert "upProgressBar" in js
    assert "upProgTerminalBox" in js
    assert "fleetActiveUpdateFloatingWidget" in js
    assert "showActiveUpdateFloatingWidget" in js
    assert "hideActiveUpdateFloatingWidget" in js
    assert "reopenActiveUpdateModal" in js
    assert "saveActiveFleetUpdate" in js
    assert "getSavedActiveFleetUpdate" in js
    assert "initActiveFleetUpdateRestoration" in js
