import os
import sys
import pytest

# Adiciona o diretorio dashboard ao sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "dashboard"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fleet_actions import build_service_raw_script, build_fastmatching_cleaner_migration_snippet
from app import app, DispatchServiceUpdateRequest


def test_build_service_raw_script_without_migration_flag():
    """Valida que sem a chave ativada (legado) o script garante perfil emu_mdna, desativa FastMatching + FileCleaner e ativa Detection + Tracking."""
    script = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=False)
    assert "dna_atria_updating.lock" in script
    assert "DigitalTVCapture.exe" in script
    
    # 1. Deve aplicar perfil emu_mdna (blocos de 15 min)
    assert "emu_mdna" in script
    assert "<EMU_ProfileName>emu_mdna</EMU_ProfileName>" in script

    # 2. Deve desativar FastMatchingSvc e FileCleaner
    assert "sc.exe config FastMatchingSvc start= disabled" in script
    assert "sc.exe config FileCleaner start= disabled" in script
    assert "Set-Service -Name FastMatchingSvc -StartupType Disabled" in script
    assert "Set-Service -Name FileCleaner -StartupType Disabled" in script

    # 3. Deve garantir DNA.DetectionSVC e DNA.TrackingSVC ativos como Automático
    assert "sc.exe config DNA.DetectionSVC start= auto" in script
    assert "sc.exe config DNA.TrackingSVC start= auto" in script
    assert "Start-Service -Name DNA.DetectionSVC" in script
    assert "Start-Service -Name DNA.TrackingSVC" in script


def test_build_service_raw_script_with_migration_flag():
    """Valida que com a chave ativada o script garante perfil emu_mdna_1min, desinstala/desativa Detection/Tracking e ativa FastMatching + FileCleaner."""
    script = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=True)
    
    # 1. Deve aplicar perfil emu_mdna_1min (blocos de 1 min)
    assert "emu_mdna_1min" in script
    assert "<EMU_ProfileName>emu_mdna_1min</EMU_ProfileName>" in script

    # 2. Deve desinstalar/desativar DetectionSVC e TrackingSVC
    assert "taskkill /f /im DNA.DetectionSVC.exe" in script
    assert "taskkill /f /im DNA.TrackingSVC.exe" in script
    assert "sc.exe delete DNA.DetectionSVC" in script
    assert "sc.exe delete DNA.TrackingSVC" in script
    assert "Stop-Service -Name DNA.DetectionSVC" in script
    assert "Stop-Service -Name DNA.TrackingSVC" in script
    assert "Set-Service -Name DNA.DetectionSVC -StartupType Disabled" in script
    assert "Set-Service -Name DNA.TrackingSVC -StartupType Disabled" in script

    # 3. Deve ativar FastMatchingSvc como Automatico e iniciar
    assert "FastMatchingSvc" in script
    assert "Set-Service -Name FastMatchingSvc -StartupType Automatic" in script
    assert "Start-Service -Name FastMatchingSvc" in script

    # 4. Deve ativar FileCleaner como Automatico e iniciar
    assert "FileCleaner" in script
    assert "Set-Service -Name $cleanerSvc.Name -StartupType Automatic" in script
    assert "Start-Service -Name FileCleaner" in script


def test_fastmatching_update_script_with_migration_flag():
    """Valida que o servico FastMatchingSvc tambem suporta a migracao da stack se acionada."""
    script = build_service_raw_script("FastMatchingSvc", "1.1.0.0", migrate_to_fastmatching=True)
    assert "sc.exe delete DNA.DetectionSVC" in script
    assert "sc.exe delete DNA.TrackingSVC" in script
    assert "Start-Service -Name FileCleaner" in script


def test_index_html_contains_migration_toggle():
    """Valida a presenca visual da chave no modal de seguranca da aba Frota."""
    html_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    assert "safetyModalAtriaMigrationContainer" in html
    assert "chkMigrateFastMatchingAndCleaner" in html
    assert "Ativar Migração para FastMatching" in html
    assert "DNA.DetectionSVC" in html
    assert "FileCleaner" in html


def test_fleet_ops_js_wires_migration_checkbox():
    """Valida que o JS envia o payload migrate_to_fastmatching e exibe a opcao para Atria/FastMatching."""
    js_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "fleet_ops.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "safetyModalAtriaMigrationContainer" in js
    assert "chkMigrateFastMatchingAndCleaner" in js
    assert "migrate_to_fastmatching" in js
