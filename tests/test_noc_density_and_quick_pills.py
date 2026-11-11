import os
import re
import pytest

def test_noc_html_elements_present():
    """Valida a presença dos elementos de pills e density switch no index.html."""
    html_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Quick Filter Pills
    assert 'id="nocQuickFilterPills"' in html, "Deve conter o container de pills rápidas"
    assert 'id="nocPillAll"' in html, "Deve conter a pill de todos"
    assert 'id="nocPillP0"' in html, "Deve conter a pill de P0 Crítico"
    assert 'id="nocPillP1"' in html, "Deve conter a pill de P1 Alertas"
    assert 'id="nocPillDetection"' in html, "Deve conter a pill de Detecção CS01"
    assert 'id="nocPillRf"' in html, "Deve conter a pill de RF / Sinal"
    assert 'id="nocPillOffline"' in html, "Deve conter a pill de Hosts Offline"
    assert 'id="nocPillHardware"' in html, "Deve conter a pill de Hardware"

    # Pill counters
    for cnt_id in ["pillCntAll", "pillCntP0", "pillCntP1", "pillCntDet", "pillCntRf", "pillCntOffline", "pillCntHw"]:
        assert f'id="{cnt_id}"' in html, f"Deve conter o elemento de contagem {cnt_id}"

    # Density toggle buttons
    assert 'id="btnNocDensityCompact"' in html, "Deve conter o botão de modo Tabela Compacta"
    assert 'id="btnNocDensityCards"' in html, "Deve conter o botão de modo Cards Detalhados"
    assert 'onclick="setNocDensity(\'compact\')"' in html
    assert 'onclick="setNocDensity(\'cards\')"' in html


def test_noc_css_styles_present():
    """Valida a presença dos estilos CSS para as pills e a tabela compacta."""
    css_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "css", "style.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    assert ".noc-quick-pill" in css, "Deve conter classe para as pills"
    assert ".noc-quick-pill.active" in css
    assert ".noc-quick-pill.pill-p0.active" in css
    assert ".noc-quick-pill.pill-p1.active" in css
    assert ".noc-compact-table-container" in css, "Deve conter container da tabela compacta"
    assert ".noc-compact-table" in css, "Deve conter classe da tabela compacta"
    assert "tr.noc-compact-row" in css, "Deve conter linhas da tabela compacta com altura de 38px"
    assert ".btn-compact-action" in css, "Deve conter botões de ação compacta"


def test_app_js_density_and_quick_filter_logic():
    """Valida funções de alternância de densidade e filtro rápido no app.js."""
    js_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "function setNocDensity(mode)" in js
    assert "function setNocQuickFilter(filterKey)" in js
    assert "window.setNocDensity = setNocDensity;" in js
    assert "window.setNocQuickFilter = setNocQuickFilter;" in js
    assert 'nocDensityMode === "compact"' in js
    assert 'noc-compact-table' in js
    assert 'noc-compact-row' in js
    assert 'pillCntAll' in js
    assert 'pillCntP0' in js
    assert 'pillCntP1' in js
    assert 'pillCntDet' in js
    assert 'pillCntRf' in js
    assert 'pillCntOffline' in js
    assert 'pillCntHw' in js


def test_app_js_prevents_false_p0_on_telemetry_latency():
    """Garante que host com telemetria suspensa/em atraso nunca receba P0 de motor parado."""
    js_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # O else if para P0 DEVE exigir estritamente hStatus === 'CRITICAL'
    # Não pode ter '|| engTier === "NONE"' sem validação de telemetria
    match = re.search(r'\}\s*else\s+if\s*\(\s*hStatus\s*===\s*"CRITICAL"\s*\)', js)
    assert match is not None, "P0 de motor de matching deve exigir estritamente hStatus === 'CRITICAL'"
