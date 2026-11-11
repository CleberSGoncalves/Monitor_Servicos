"""
Testes automatizados do Guia Técnico das Colunas fma.log e Playbook How-To Integrado no Dashboard.
Valida:
1. Presença do botão de acesso e do painel retrátil do guia no index.html.
2. Presença dos cards explicativos para as 8 colunas e das tooltips nos cabeçalhos (<th>).
3. Presença dos 5 pilares do Playbook How-To (generación de coincidencias, retraso, escaneo, catálogo, memória).
4. Presença do modal flutuante de How-To passo a passo para o técnico (fmHowToModal).
5. Presença das funções JavaScript correspondentes em detection_monitor.js.
"""
from pathlib import Path
import pytest


def test_html_contains_columns_guide_and_playbook_panel():
    """Valida a presença de todos os elementos DOM do Guia das Colunas e Playbook no HTML principal."""
    html_path = Path("dashboard/static/index.html")
    assert html_path.exists(), "dashboard/static/index.html deve existir"
    content = html_path.read_text(encoding="utf-8")

    # Botão de alternância do guia
    assert 'id="btnToggleFmColumnsGuide"' in content
    assert 'toggleFmColumnsGuide()' in content

    # Painel principal do guia
    assert 'id="fmColumnsGuidePanel"' in content
    assert 'id="btnGuideTabCols"' in content
    assert 'id="btnGuideTabPlaybook"' in content
    assert 'id="guideContentCols"' in content
    assert 'id="guideContentPlaybook"' in content

    # Cards explicativos das colunas
    assert 'id="guideColCard_status"' in content
    assert 'id="guideColCard_proctime"' in content
    assert 'id="guideColCard_delayed"' in content
    assert 'id="guideColCard_ram"' in content
    assert 'id="guideColCard_spots"' in content
    assert 'id="guideColCard_search"' in content
    assert 'id="guideColCard_sla"' in content
    assert 'id="guideColCard_actions"' in content

    # Tooltips e cliques nos cabeçalhos da tabela
    assert "openFmGuideColumn('status')" in content
    assert "openFmGuideColumn('proctime')" in content
    assert "openFmGuideColumn('delayed')" in content
    assert "openFmGuideColumn('ram')" in content
    assert "openFmGuideColumn('spots')" in content
    assert "openFmGuideColumn('search')" in content
    assert "openFmGuideColumn('sla')" in content

    # Modal How-To Cirúrgico
    assert 'id="fmHowToModal"' in content
    assert 'id="fmHowToModalTitle"' in content
    assert 'id="fmHowToModalBody"' in content
    assert 'closeFmHowToModal()' in content


def test_package_html_contains_columns_guide_sync():
    """Valida que o pacote de instalação 24x7 também contém os novos elementos sincronizados."""
    pkg_html = Path("pacote_instalacao_dashboard_24x7/dashboard/static/index.html")
    assert pkg_html.exists(), "pacote_instalacao_dashboard_24x7 HTML deve existir"
    content = pkg_html.read_text(encoding="utf-8")

    assert 'id="btnToggleFmColumnsGuide"' in content
    assert 'id="fmColumnsGuidePanel"' in content
    assert 'id="fmHowToModal"' in content


def test_js_contains_guide_and_playbook_functions():
    """Valida a presença das funções interativas de controle do Guia, Tooltips e Modal no JS."""
    js_path = Path("dashboard/static/js/detection_monitor.js")
    assert js_path.exists(), "detection_monitor.js deve existir"
    content = js_path.read_text(encoding="utf-8")

    # Funções do painel do guia
    assert "function toggleFmColumnsGuide()" in content
    assert "window.toggleFmColumnsGuide = toggleFmColumnsGuide;" in content
    assert "function switchFmGuideTab(" in content
    assert "window.switchFmGuideTab = switchFmGuideTab;" in content
    assert "function openFmGuideColumn(" in content
    assert "window.openFmGuideColumn = openFmGuideColumn;" in content

    # Funções do Modal How-To
    assert "function openFmHowToModal(" in content
    assert "window.openFmHowToModal = openFmHowToModal;" in content
    assert "function closeFmHowToModal()" in content
    assert "window.closeFmHowToModal = closeFmHowToModal;" in content
    assert "function executeFmQuickAction(" in content
    assert "window.executeFmQuickAction = executeFmQuickAction;" in content

    # Botão Como Resolver na tabela
    assert "openFmHowToModal" in content
    assert "Como Resolver" in content
