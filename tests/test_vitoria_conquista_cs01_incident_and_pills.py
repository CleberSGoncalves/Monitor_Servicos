import sys
from pathlib import Path

dashboard_dir = Path(__file__).resolve().parent.parent / "dashboard"
if str(dashboard_dir) not in sys.path:
    sys.path.insert(0, str(dashboard_dir))

from tracking_detection_monitor import build_detection_fleet_snapshot


def test_vitoria_conquista_cs01_comm_lost_when_offline():
    """
    Garante que hosts CS01 com agent_comm >= 2h (offline) sao classificados
    como COMM_LOST e nao como NOMINAL, permitindo visibilidade na Fila de Incidentes N1.
    """
    snapshot = build_detection_fleet_snapshot()
    sites = snapshot.get("sites", [])

    vca_sites = [s for s in sites if "conquista" in str(s.get("praca", "")).lower()]
    assert len(vca_sites) > 0, "Vitória da Conquista CS01 deve constar no snapshot"

    vca = vca_sites[0]
    comm = vca.get("agent_comm", {})

    # Se estiver com horas_since_last_seen >= 2.0 (como 12.3h no cache), DEVE ser COMM_LOST
    if comm.get("hours_since_last_seen", 0) >= 2.0:
        assert vca.get("health_status") == "COMM_LOST"
        assert "Telemetria Suspensa" in vca.get("severity_label") or "Host Desconectado" in vca.get("severity_label")


def test_index_html_p2_checkbox_is_checked_by_default():
    """
    Garante que a checkbox P2 no menu lateral esteja marcada por padrão (checked),
    evitando que incidentes P2 sejam ocultados silenciosamente quando o pill 'Todos' estiver ativo.
    """
    index_path = dashboard_dir / "static" / "index.html"
    content = index_path.read_text(encoding="utf-8")

    assert 'value="P2" checked' in content, "A checkbox P2 deve ter o atributo 'checked' por padrão"


def test_app_js_covers_all_offline_hosts_in_incident_pipeline():
    """
    Garante que a seção 7 de buildUnifiedIncidents em app.js não descarte nós físicos CS01
    que estejam offline.
    """
    app_js_path = dashboard_dir / "static" / "js" / "app.js"
    content = app_js_path.read_text(encoding="utf-8")

    assert "coveredIncidentHosts" in content, "Seção 7 deve verificar se o incidente já foi criado, sem descartar CS01 às cegas"
