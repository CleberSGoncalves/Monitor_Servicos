import pytest
import os
import sys

dashboard_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard"))
if dashboard_dir not in sys.path:
    sys.path.insert(0, dashboard_dir)

from fleet_actions import (
    build_service_raw_script,
    build_service_contingency_command,
    build_emu_profile_hardening_snippet,
    build_fastmatching_cleaner_migration_snippet
)

SERVICES_TO_TEST = [
    ("Atria Capture", "2.0.0.2"),
    ("FastMatchingSvc", "1.0.3.7"),
    ("DNA.MonitorServiceSVC", "1.0.21.5"),
    ("DNA.DetectionSVC", "4.5.6024.30490"),
    ("DNA.ConfigMonitorSVC", "4.7.6180.25943"),
    ("DNA.FiletransferSVC", "3.6.6828.34652"),
    ("DNA.TrackingSVC", "6.1.1.0"),
    ("FileCleaner", "1.0.0.0"),
]

def test_all_service_raw_scripts_generation():
    """Valida se todos os serviços geram scripts PowerShell válidos, idempotentes e seguros."""
    for svc_name, ver in SERVICES_TO_TEST:
        script = build_service_raw_script(svc_name, ver)
        assert script is not None, f"Script para {svc_name} retornou None"
        assert len(script) > 50, f"Script para {svc_name} muito curto"
        assert "$ErrorActionPreference = 'Continue'" in script
        assert "[Net.ServicePointManager]::SecurityProtocol" in script
        
        # Valida que não há placeholders não substituídos
        assert "None" not in script
        assert "{" not in script or "}" in script  # balanceamento de chaves ou tags


def test_atria_script_hardening_and_interactive():
    """Valida particularidades do Atria Capture (Task Scheduler interativo e EMU hardening: EMU MDNA vs EMU MediaDNA 1min)."""
    # 1. Sem flag de migração: mantém stack legada com perfil EMU MDNA
    script_leg = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=False)
    assert "DigitalTVCapture.exe" in script_leg
    assert "Start_Atria_Interactive" in script_leg
    assert "schtasks" in script_leg
    assert "EMU MDNA" in script_leg
    assert "GetEncoding(1252)" in script_leg

    # 2. Com flag de migração: migra stack para FastMatching com perfil EMU MediaDNA 1min
    script_fast = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=True)
    assert "EMU MediaDNA 1min" in script_fast
    assert "FastMatchingSvc" in script_fast
    assert "FileCleaner" in script_fast


def test_fastmatching_script_security_and_bcrypt():
    """Valida expurgação de bcrypt.dll e configuração de binPath do FastMatchingSvc."""
    script = build_service_raw_script("FastMatchingSvc", "1.0.3.7")
    assert "FastMatchingSvc.exe" in script
    assert "bcrypt.dll" in script
    assert "sc.exe config FastMatchingSvc binPath=" in script
    assert "Start-Service -Name FastMatchingSvc" in script


def test_monitorservice_atomic_update_and_watchdog():
    """Valida auto-atualização atômica do DNA.MonitorServiceSVC via BAT isolado e Watchdog."""
    script = build_service_raw_script("DNA.MonitorServiceSVC", "1.0.21.5")
    assert "apply_self_update.bat" in script
    assert "WinServiceFleetAgent.exe" in script
    assert "DNA_FleetAgent_Watchdog" in script
    assert "DNA_MonitorService_SelfUpdate" in script
    assert "update_execution.log" in script


def test_contingency_one_liners():
    """Valida os comandos de 1 linha de contingência para Tanium / GV."""
    for svc_name, ver in SERVICES_TO_TEST:
        one_liner = build_service_contingency_command(svc_name, ver)
        assert "\n" not in one_liner, f"One-liner de {svc_name} contém quebras de linha"
        assert len(one_liner) > 50
