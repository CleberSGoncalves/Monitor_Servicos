"""
Testes Automatizados para o Módulo de Reset de Sincronização no Portal MediaDNA
(mediadna_spot_sync.py e endpoint /api/fleet/mediadna/reset-sync)
"""
import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from mediadna_spot_sync import (
    get_default_mediadna_credentials,
    run_mediadna_reset_sync
)


def test_get_default_mediadna_credentials():
    """Valida leitura de credenciais padrão."""
    creds = get_default_mediadna_credentials()
    assert "username" in creds
    assert "password" in creds
    assert creds["username"] in ("svc.captacao", "Cleber Gonçalves") or len(creds["username"]) > 0


def test_run_mediadna_reset_sync_mocked_success():
    """Valida fluxo de sucesso simulado do Playwright para reset de sincronização."""
    mock_browser = MagicMock()
    mock_context = MagicMock()
    mock_page = MagicMock()

    mock_page.url = "https://mediadna.ibope.com/MediaDNA/HostNovoConfig/HostEdita.aspx"
    mock_page.title.return_value = "Hosts"

    # Mock inputs
    mock_txb_nome = MagicMock()
    mock_btn_reset = MagicMock()
    mock_target_link = MagicMock()

    mock_row = MagicMock()
    mock_row.inner_text.return_value = "331 | Itaituba / BRPA-IAB-ATRIA | 12/05/2017"
    mock_row.query_selector_all.return_value = [mock_target_link]

    def query_selector_side_effect(sel):
        if "imgBtnBR" in sel:
            return MagicMock()
        if "btnSim" in sel:
            return MagicMock()
        if "Nome" in sel or "text" in sel:
            return mock_txb_nome
        if "Reset" in sel:
            return mock_btn_reset
        return None

    mock_page.query_selector.side_effect = query_selector_side_effect
    mock_page.query_selector_all.return_value = [mock_row]

    mock_context.new_page.return_value = mock_page
    mock_browser.new_context.return_value = mock_context

    with patch("playwright.sync_api.sync_playwright") as mock_playwright:
        mock_p_instance = MagicMock()
        mock_p_instance.chromium.launch.return_value = mock_browser
        mock_playwright.return_value.__enter__.return_value = mock_p_instance

        res = run_mediadna_reset_sync(
            host_query="Itaituba",
            username="svc.captacao",
            password="Acount@!2026",
            headless=True
        )

        assert res["success"] is True
        assert res["host_query"] == "Itaituba"
        assert "sucesso" in res["message"].lower()
        assert len(res["logs"]) > 0


def test_run_mediadna_reset_sync_insufficient_permissions():
    """Valida tratamento seguro quando o usuário é redirecionado por falta de permissão ao menu Hosts."""
    mock_browser = MagicMock()
    mock_context = MagicMock()
    mock_page = MagicMock()

    # Simula redirecionamento para PaginaInicial.aspx
    mock_page.url = "https://mediadna.ibope.com/MediaDNA/Comum/PaginaInicial.aspx"
    mock_page.title.return_value = "MediaDNA"
    mock_page.query_selector.return_value = None

    mock_context.new_page.return_value = mock_page
    mock_browser.new_context.return_value = mock_context

    with patch("playwright.sync_api.sync_playwright") as mock_playwright:
        mock_p_instance = MagicMock()
        mock_p_instance.chromium.launch.return_value = mock_browser
        mock_playwright.return_value.__enter__.return_value = mock_p_instance

        res = run_mediadna_reset_sync(
            host_query="Ponta Pora",
            username="svc.captacao",
            password="Acount@!2026",
            headless=True
        )

        assert res["success"] is False
        assert res["error"] == "INSUFFICIENT_PERMISSIONS"
        assert "permissão" in res["message"].lower()
