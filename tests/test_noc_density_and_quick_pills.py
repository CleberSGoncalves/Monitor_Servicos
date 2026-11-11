import os
import re
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "dashboard"))

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
    """Valida a presença dos estilos CSS para as pills, tabela compacta e operador responsável."""
    css_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "css", "style.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    assert ".noc-quick-pill" in css, "Deve conter classe para as pills"
    assert ".noc-quick-pill.active" in css
    assert ".noc-quick-pill.pill-p0.active" in css
    assert ".noc-quick-pill.pill-p1.active" in css
    assert ".noc-compact-table-container" in css, "Deve conter container da tabela compacta"
    assert ".noc-compact-table" in css, "Deve conter classe da tabela compacta"
    assert "tr.noc-compact-row" in css, "Deve conter linhas da tabela compacta"
    assert ".summary-title" in css, "Deve conter título do problema em linha dedicada"
    assert ".summary-detail" in css, "Deve conter detalhe do problema legível sem cortes"
    assert ".btn-compact-action" in css, "Deve conter botões de ação compacta"

    # Estilos do operador responsável
    assert ".btn-noc-assign" in css, "Deve conter botão para operador assumir incidente"
    assert ".noc-assigned-pill" in css, "Deve conter badge para operador alocado"
    assert ".noc-assigned-pill.assigned-me" in css, "Deve conter badge de operador próprio"
    assert ".noc-assigned-pill.assigned-other" in css, "Deve conter badge de outro operador com cadeado"
    assert ".btn-noc-unassign" in css, "Deve conter botão de desatribuição/liberação"


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
    assert 'summary-title' in js
    assert 'summary-detail' in js
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

    match = re.search(r'\}\s*else\s+if\s*\(\s*hStatus\s*===\s*"CRITICAL"\s*\)', js)
    assert match is not None, "P0 de motor de matching deve exigir estritamente hStatus === 'CRITICAL'"


def test_format_noc_time_label_python():
    """Testa a formatação humana de tempo de NOC no backend, sem decimais bizarros como 0.6h ou 8.0d."""
    from tracking_detection_monitor import format_noc_time_label

    # < 1h
    assert format_noc_time_label(0.6, "Conectado") == "Conectado (36 min atrás)"
    assert format_noc_time_label(0.1, "Conectado") == "Conectado (6 min atrás)"
    assert format_noc_time_label(0.7) == "42 min atrás"

    # 1h a 24h
    assert format_noc_time_label(1.0, "Conectado") == "Conectado (1h atrás)"
    assert format_noc_time_label(2.1, "Atraso Telemetria") == "Atraso Telemetria (2h 6m atrás)"
    assert format_noc_time_label(4.1, "Atraso Telemetria") == "Atraso Telemetria (4h 6m atrás)"

    # >= 24h
    assert format_noc_time_label(24.0, "Desconectado") == "Desconectado (1 dia atrás)"
    assert format_noc_time_label(48.0, "Desconectado") == "Desconectado (2 dias atrás)"
    assert format_noc_time_label(192.0, "Desconectado") == "Desconectado (8 dias atrás)"
    assert "d" in format_noc_time_label(309.6) and "h" in format_noc_time_label(309.6)  # 12d 22h


def test_campinas_detection_deduplication():
    """Verifica se Campinas consolida os registros irmãos e não gera falso WCF travado com 0 min."""
    from tracking_detection_monitor import build_detection_fleet_snapshot

    snapshot = build_detection_fleet_snapshot()
    cas_sites = [s for s in snapshot.get("sites", []) if "CAS" in s.get("hostname", "") or "CAMPINAS" in s.get("praca", "").upper()]

    # Deve consolidar em exatamente 1 site canônico
    assert len(cas_sites) == 1, f"Campinas deve ter exatamente 1 site consolidado, encontrado {len(cas_sites)}"
    site = cas_sites[0]
    assert site["hostname"] == "BRSP-CAS-ATRIA--DT01"
    assert site["praca"] == "Campinas"
    # O status deve ser NOMINAL (FastMatching ativo e ConfigMonitor ativo)
    assert site["health_status"] == "NOMINAL"
    assert site["engine_tier"] == "PRIMARY"
    assert "0 min" not in site["incident_description"], "Nunca deve relatar 'ha 0 min' em fila acumulada"


def test_incident_assignments_backend_lifecycle():
    """Testa o ciclo de vida completo de alocação de incidentes (assumir, consultar, liberar)."""
    from incident_manager import assign_incident, get_incident_assignments, unassign_incident

    test_key = "teste_inc_unit_99"
    # 1. Atribui incidente ao operador
    res = assign_incident(
        incident_key=test_key,
        praca="Pelotas",
        hostname="BRRS-PLT-DT01",
        operator_username="suportesmmc",
        operator_name="Suporte SMMC NOC",
        status="em_analise"
    )
    assert res["assigned_to"] == "suportesmmc"
    assert res["status"] == "em_analise"

    # 2. Consulta alocações ativas
    assignments = get_incident_assignments()
    assert test_key in assignments
    assert assignments[test_key]["assigned_to"] == "suportesmmc"
    assert assignments[test_key]["praca"] == "Pelotas"

    # 3. Libera o incidente
    unassigned = unassign_incident(test_key, "suportesmmc")
    assert unassigned is True

    # 4. Confirma que saiu do mapa ativo
    assignments_after = get_incident_assignments()
    assert test_key not in assignments_after


def test_frontend_responsavel_column_and_offline_threshold():
    """Verifica presença da coluna Responsável / Status e limiar de 24h para offline no app.js."""
    js_path = os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "app.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Coluna no thead
    assert "Responsável / Status" in js, "Deve conter cabeçalho da coluna Responsável / Status"
    # Função de alocação
    assert "assignIncidentToMe" in js, "Deve conter função assignIncidentToMe"
    assert "unassignIncidentAction" in js, "Deve conter função unassignIncidentAction"
    assert "formatNocHumanTime" in js, "Deve conter formatNocHumanTime"

    # Limiar estrito de 24h para hosts desconectados (evitando falsos alertas de 2h/4h)
    assert "hoursAgo < 24.0" in js, "Deve exigir hoursAgo < 24.0 para descartar falso alarme de host morto"
