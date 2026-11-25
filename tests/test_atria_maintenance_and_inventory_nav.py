import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "dashboard"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from fleet_auto_healing import audit_and_diagnose_fleet, execute_auto_healing_batch
import maintenance_manager


def test_atria_stopped_suspends_auto_healing_on_capture_site(monkeypatch):
    """
    Quando técnicos fecham o ATRIA Capture para manutenção ou teste isolado,
    NENHUM serviço no Capture Site deve ser elegível para auto-healing ou restart.
    """
    now_utc = datetime.now(timezone.utc)
    t_fresh = (now_utc - timedelta(minutes=3)).isoformat()

    mock_services = [
        # Host: Campinas CS01 - Atria Capture PARADO, e FastMatching / ConfigMonitor PARADOS
        {
            "id": "301",
            "hostname": "BRSP-CPN-DT01",
            "praca": "Campinas",
            "cs": "1",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao": "1.0.21.6",
            "status_servico": "Em Execução",
            "ultima_atualizacao": t_fresh
        },
        {
            "id": "302",
            "hostname": "BRSP-CPN-DT01",
            "praca": "Campinas",
            "cs": "1",
            "nome_servico": "Atria Capture",
            "status_servico": "Parado",
            "ultima_atualizacao": t_fresh
        },
        {
            "id": "303",
            "hostname": "BRSP-CPN-DT01",
            "praca": "Campinas",
            "cs": "1",
            "nome_servico": "FastMatchingSvc",
            "status_servico": "Parado",
            "ultima_atualizacao": t_fresh
        },
        {
            "id": "304",
            "hostname": "BRSP-CPN-DT01",
            "praca": "Campinas",
            "cs": "1",
            "nome_servico": "DNA.ConfigMonitorSVC",
            "status_servico": "Parado",
            "ultima_atualizacao": t_fresh
        }
    ]

    import fleet_auto_healing as fah
    monkeypatch.setattr(fah, "get_cached_data", lambda: {"services": mock_services})
    monkeypatch.setattr(fah, "is_praca_in_maintenance", lambda p: False)

    res = audit_and_diagnose_fleet()
    host_data = next(h for h in res["hosts"] if h["hostname"] == "BRSP-CPN-DT01")

    # Como Atria está PARADO, auto-healing deve estar 100% suspenso!
    assert host_data["eligible_service_restart"] is False
    assert len(host_data["stopped_critical_services"]) == 0
    assert host_data.get("in_maintenance") is True
    assert "ATRIA Fechado" in host_data.get("maintenance_reason", "")


def test_atria_running_allows_auto_healing_for_down_services(monkeypatch):
    """
    Quando ATRIA Capture está 'Em Execução' e um serviço crítico cai (sem manutenção),
    o auto-healing deve detectar e permitir a recuperação do serviço crítico.
    """
    now_utc = datetime.now(timezone.utc)
    t_fresh = (now_utc - timedelta(minutes=3)).isoformat()

    mock_services = [
        # Host: Bauru CS01 - Atria Capture EM EXECUÇÃO, mas FastMatching PARADO
        {
            "id": "401",
            "hostname": "BRSP-BAU-DT01",
            "praca": "Bauru",
            "cs": "1",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao": "1.0.21.6",
            "status_servico": "Em Execução",
            "ultima_atualizacao": t_fresh
        },
        {
            "id": "402",
            "hostname": "BRSP-BAU-DT01",
            "praca": "Bauru",
            "cs": "1",
            "nome_servico": "Atria Capture",
            "status_servico": "Em Execução",
            "ultima_atualizacao": t_fresh
        },
        {
            "id": "403",
            "hostname": "BRSP-BAU-DT01",
            "praca": "Bauru",
            "cs": "1",
            "nome_servico": "FastMatchingSvc",
            "status_servico": "Parado",
            "ultima_atualizacao": t_fresh
        }
    ]

    import fleet_auto_healing as fah
    monkeypatch.setattr(fah, "get_cached_data", lambda: {"services": mock_services})
    monkeypatch.setattr(fah, "is_praca_in_maintenance", lambda p: False)

    res = audit_and_diagnose_fleet()
    host_data = next(h for h in res["hosts"] if h["hostname"] == "BRSP-BAU-DT01")

    # Atria está rodando: FastMatching deve ser elegível para auto-healing
    assert host_data["eligible_service_restart"] is True
    assert "FastMatchingSvc" in host_data["stopped_critical_services"]


def test_praca_in_maintenance_suspends_auto_healing_even_if_atria_running(monkeypatch):
    """
    Se a praça estiver registrada em modo de manutenção, o Auto-Healing deve ser suspenso.
    """
    now_utc = datetime.now(timezone.utc)
    t_fresh = (now_utc - timedelta(minutes=2)).isoformat()

    mock_services = [
        {
            "id": "501",
            "hostname": "BRMG-UBA-DT01",
            "praca": "Uberaba",
            "cs": "1",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao": "1.0.21.6",
            "status_servico": "Em Execução",
            "ultima_atualizacao": t_fresh
        },
        {
            "id": "502",
            "hostname": "BRMG-UBA-DT01",
            "praca": "Uberaba",
            "cs": "1",
            "nome_servico": "Atria Capture",
            "status_servico": "Em Execução",
            "ultima_atualizacao": t_fresh
        },
        {
            "id": "503",
            "hostname": "BRMG-UBA-DT01",
            "praca": "Uberaba",
            "cs": "1",
            "nome_servico": "FastMatchingSvc",
            "status_servico": "Parado",
            "ultima_atualizacao": t_fresh
        }
    ]

    import fleet_auto_healing as fah
    monkeypatch.setattr(fah, "get_cached_data", lambda: {"services": mock_services})
    # Simula praça em manutenção ativa
    monkeypatch.setattr(fah, "is_praca_in_maintenance", lambda p: True)

    res = audit_and_diagnose_fleet()
    host_data = next(h for h in res["hosts"] if h["hostname"] == "BRMG-UBA-DT01")

    assert host_data["eligible_service_restart"] is False
    assert len(host_data["stopped_critical_services"]) == 0
    assert host_data.get("in_maintenance") is True
    assert "Praça em Manutenção" in host_data.get("maintenance_reason", "")


def test_frontend_inventory_tab_routing_integrity():
    """
    Valida se o app.js e index.html possuem os elementos e roteamento correto
    para a aba de Inventário CS (fleet-inventory).
    """
    base_dir = Path(__file__).parent.parent

    # 1. Verifica index.html
    index_html = (base_dir / "dashboard" / "static" / "index.html").read_text(encoding="utf-8")
    assert 'data-tab="fleet-inventory"' in index_html
    assert 'id="fleetSubtabInventoryContainer"' in index_html
    assert 'id="btn-fleet-subtab-inventory"' in index_html

    # 2. Verifica app.js
    app_js = (base_dir / "dashboard" / "static" / "js" / "app.js").read_text(encoding="utf-8")
    assert 'tabName === "fleet-inventory"' in app_js
    assert 'switchFleetSubtab("inventory")' in app_js
    assert 'loadFleetInventory(true)' in app_js
    assert 'document.getElementById("fleetSubtabInventoryContainer")' in app_js

    # 3. Verifica fleet_inventory.js
    inv_js = (base_dir / "dashboard" / "static" / "js" / "fleet_inventory.js").read_text(encoding="utf-8")
    assert 'function navigateToFleetInventory' in inv_js


def test_agent_orchestrator_atria_and_service_guard_rules():
    """
    Valida no código C# do FleetOrchestrator se as regras de ouro estão implementadas:
    1. ATRIA Capture nunca auto-inicia via auto-healing.
    2. Quando ATRIA está parado no Capture Site, nenhum serviço auto-reinicia.
    3. Travas de manutenção locais suspendem auto-healing.
    """
    base_dir = Path(__file__).parent.parent
    csharp_code = (base_dir / "WinServiceFleetAgent" / "Core" / "FleetOrchestrator.cs").read_text(encoding="utf-8")

    assert "REGRA DE OURO 1: ATRIA Capture" in csharp_code
    assert "REGRA DE OURO 2: Se ATRIA Capture está no Capture Site e não está em execução" in csharp_code
    assert "REGRA DE OURO 3: Se houver trava de manutenção local" in csharp_code
    assert "hasAtriaConfigured && !isAtriaRunning" in csharp_code
    assert "isLocalMaintenance" in csharp_code
