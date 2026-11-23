import os
import sys
import pytest

# Adiciona caminhos do projeto
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "dashboard"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fleet_actions import build_service_raw_script
from gcp_sync import get_latest_command_for_host, resolve_raw_hostname_for_command
from incident_manager import sync_live_fleet_to_incident_events


def test_atria_script_has_anti_lock_and_lockfile():
    """Valida que o script de atualização do Atria implementa a trava e mata processos antes da cópia."""
    script = build_service_raw_script("Atria Capture", "2.0.0.2")
    assert "dna_atria_updating.lock" in script
    assert "taskkill /f /t /im DigitalTVCapture.exe" in script
    assert "Start_Atria_Interactive" in script
    assert "Remove-Item -Path $lockFile" in script


def test_atria_and_fastmatching_update_scripts_have_full_hardening():
    """
    Valida a blindagem completa dos scripts de atualizacao do Atria Capture e FastMatchingSvc:
    1. Criacao defensiva de Junction C:\\DTV\\DTVCapture -> D:
    2. Remocao profilatica obrigatoria de bcrypt.dll incompativel
    3. Ajuste de binPath do FastMatchingSvc no disco D:
    4. Desativacao profilatica do DNA.DetectionSVC legado (anti-concorrencia)
    5. Preservacao de config.json e configuracoes de matching
    6. Suporte a TARGETDIR / INSTALLDIR no instalador MSI
    """
    script_atria = build_service_raw_script("Atria Capture", "2.0.0.2")
    assert "New-Item -ItemType Junction" in script_atria
    assert "bcrypt.dll" in script_atria
    assert "sc.exe config FastMatchingSvc binPath=" in script_atria
    assert "Stop-Service -Name DNA.DetectionSVC" in script_atria
    assert "TARGETDIR=" in script_atria
    assert "config.json" in script_atria

    script_fm = build_service_raw_script("FastMatchingSvc", "1.0.3.7")
    assert "New-Item -ItemType Junction" in script_fm
    assert "bcrypt.dll" in script_fm
    assert "sc.exe config FastMatchingSvc binPath=" in script_fm
    assert "Stop-Service -Name DNA.DetectionSVC" in script_fm


def test_gcp_hostname_alias_resolution():
    """Valida resolução de nomes de host (canônico vs NetBIOS raw)."""
    raw = resolve_raw_hostname_for_command("Altamira-SMME-271-CS1")
    assert raw == "BRPA-ATA-DT01"
    raw_cs2 = resolve_raw_hostname_for_command("Uruguaiana-SMME-307-CS2")
    assert raw_cs2 == "BRRS-UGN-ATRIA-"


def test_cs2_hosts_never_generate_commercial_detection_incident():
    """Garante que hosts CS2 (como Uruguaiana CS2) jamais geram incidentes de Detecção comercial."""
    app_js_path = os.path.join("dashboard", "static", "js", "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Valida regra estrita no frontend
    assert 'isCs2OrHigher' in js
    assert 'hLow.includes("-cs2")' in js
    assert 'hLow.includes("dt02")' in js
    assert 'csNum === 1 && !isCs2OrHigher' in js

    # Valida regra estrita no backend incident_manager.py
    inc_mgr_path = os.path.join("dashboard", "incident_manager.py")
    with open(inc_mgr_path, "r", encoding="utf-8") as f:
        py_inc = f.read()

    assert 'is_cs2_or_higher = cs_num >= 2 or any(x in h_low for x in ["-cs2", "-cs02", "_cs2", "dt02", "dt2", "-cs3", "_cs3"])' in py_inc
    assert 'if cs_num == 1 and not is_cs2_or_higher:' in py_inc


def test_csharp_fleet_orchestrator_honors_update_lock():
    """Valida que o agente C# suspende AutoRestart quando dna_atria_updating.lock existir."""
    orchestrator_path = os.path.join("WinServiceFleetAgent", "Core", "FleetOrchestrator.cs")
    with open(orchestrator_path, "r", encoding="utf-8") as f:
        code = f.read()

    assert "dna_atria_updating.lock" in code
    assert "File.Exists(atriaLockFile)" in code
    assert "AutoRestart de '{srv.ServiceName}' suspenso: atualização remota" in code
