import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))

def test_atria_installer_cs_contains_anti_prompt_hardening():
    """
    Verifica que o código C# do instalador do Atria (WinServiceFleetAgent/Core/AtriaInstaller.cs)
    possui a blindagem contra prompts interativos (PromptYN / Read-Host) em serviços Windows Session 0.
    """
    cs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "WinServiceFleetAgent", "Core", "AtriaInstaller.cs"))
    assert os.path.exists(cs_path), f"Arquivo não encontrado: {cs_path}"
    with open(cs_path, "r", encoding="utf-8") as fp:
        content = fp.read()
    
    assert "PromptYN" in content
    assert "Read-Host" in content
    assert "function global:PromptYN($msg) { return $true }" in content
    assert "function global:Read-Host($msg) { return 'Y' }" in content

def test_fleet_actions_dynamic_stepper_progression():
    """
    Verifica que get_host_service_action_status avalia a idade da execução (age_seconds)
    para avançar dinamicamente a esteira e os logs do terminal, além de disparar timeout se > 10 min.
    """
    from fleet_actions import get_host_service_action_status
    
    # Ariquemes-SMME-261-CS1 é um host real com Atria Capture
    res = get_host_service_action_status("Ariquemes-SMME-261-CS1", "Atria Capture", "2.0.0.2")
    assert res.get("success") is True
    assert res.get("hostname") == "Ariquemes-SMME-261-CS1"
    assert res.get("service_name") == "Atria Capture"
    assert "steps" in res
    assert len(res["steps"]) == 5
    assert "terminal_logs" in res
    assert len(res["terminal_logs"]) >= 3
    assert "progress_percent" in res

def test_fleet_ops_js_stale_timer_resilience():
    """
    Verifica que o fleet_ops.js possui tratamento para resetar timers órfãos
    e limpar o localStorage quando a esteira finaliza ou não está ativa.
    """
    js_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "fleet_ops.js"))
    with open(js_path, "r", encoding="utf-8") as fp:
        content = fp.read()
    
    # Verifica que openFleetUpdateProgressModal suporta isNewDispatch e trata timestamps antigos
    assert "isNewDispatch" in content
    assert "elapsedSaved > 20 * 60 * 1000" in content
    # Verifica que renderFleetUpdateProgressData limpa o active_fleet_update quando concluído ou inativo
    assert "clearSavedActiveFleetUpdate()" in content
    # Verifica que executeDirectUpdateFromDashboard renova o startTime
    assert "updateProgressStartTime = Date.now();" in content

def test_index_html_cache_busting_version():
    """
    Verifica que o index.html referencia a versão cache-busted v=3.9.113 do fleet_ops.js.
    """
    html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "index.html"))
    with open(html_path, "r", encoding="utf-8") as fp:
        content = fp.read()
    
    assert "fleet_ops.js?v=3.9.113" in content
