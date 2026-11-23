import os
import sys
import pytest

# Adiciona o diretorio dashboard ao sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "dashboard"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fleet_actions import build_service_raw_script, build_fastmatching_cleaner_migration_snippet
from app import app, DispatchServiceUpdateRequest


def test_build_service_raw_script_without_migration_flag():
    """Valida que sem a chave ativada o script preserva o comportamento padrao sem desinstalar os servicos legados."""
    script = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=False)
    assert "dna_atria_updating.lock" in script
    assert "DigitalTVCapture.exe" in script
    # Nao deve deletar servicos legados
    assert "sc.exe delete DNA.DetectionSVC" not in script
    assert "sc.exe delete DNA.TrackingSVC" not in script
    assert "FileCleaner" not in script


def test_build_service_raw_script_with_migration_flag():
    """Valida que com a chave ativada o script inclui a desinstalacao do Detection/Tracking e ativacao de FastMatching + FileCleaner."""
    script = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=True)
    # Deve desinstalar DetectionSVC e TrackingSVC
    assert "sc.exe delete DNA.DetectionSVC" in script
    assert "sc.exe delete DNA.TrackingSVC" in script
    assert "Stop-Service -Name DNA.DetectionSVC" in script
    assert "Stop-Service -Name DNA.TrackingSVC" in script

    # Deve ativar FastMatchingSvc como Automatico e iniciar
    assert "FastMatchingSvc" in script
    assert "Set-Service -Name FastMatchingSvc -StartupType Automatic" in script
    assert "Start-Service -Name FastMatchingSvc" in script

    # Deve ativar FileCleaner como Automatico e iniciar
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
