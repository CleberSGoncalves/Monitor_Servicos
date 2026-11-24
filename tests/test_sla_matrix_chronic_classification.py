import sys
from pathlib import Path

# Add dashboard to sys.path
dashboard_dir = Path(__file__).resolve().parent.parent / "dashboard"
if str(dashboard_dir) not in sys.path:
    sys.path.insert(0, str(dashboard_dir))

from sla_matrix_service import get_fleet_sla_matrix


def test_sla_matrix_chronic_hosts_classification():
    """
    Valida que hosts com atraso de Keepalive > 1440 min (24h) sao classificados
    como CRONICO, devidamente contabilizados em chronic_zombies_count e isolados
    do filtro operacional 'active'.
    """
    matrix_all = get_fleet_sla_matrix()
    kpis = matrix_all["kpis"]
    rows = matrix_all["rows"]

    # 1. Total de hosts deve bater com a frota
    assert kpis["total_hosts"] >= 240

    # 2. Hosts cronicos devem ter tier == 'CRONICO'
    chronic_rows = [r for r in rows if r["tier"] == "CRONICO"]
    assert len(chronic_rows) == kpis["chronic_zombies_count"]

    for r in chronic_rows:
        # Atraso maximo deve ser > 1440 min (24 horas)
        assert r["max_delay_min"] > 1440
        assert r["color_flag"] == "flag-chronic"
        # Telemetria viva de CPU/RAM/Disco deve ser suspensa (-) pois o host esta offline ha dias
        assert r["cpu_uso"] == "-"
        assert r["ram_uso"] == "-"
        assert r["disco_d_livre"] == "-"

    # 3. No filtro de atrasos ativos operacionais, cronicos NAO devem aparecer
    matrix_active = get_fleet_sla_matrix(filter_tier="active")
    for r in matrix_active["rows"]:
        assert r["tier"] in ("CRITICO", "ALERTA")
        assert r["tier"] != "CRONICO"
        assert r["max_delay_min"] <= 1440 or r["tier"] != "CRONICO"

    # 4. No filtro de cronicos, todos os registros devem ser estritamente cronicos
    matrix_chronic = get_fleet_sla_matrix(filter_tier="chronic")
    for r in matrix_chronic["rows"]:
        assert r["tier"] == "CRONICO"
        assert r["max_delay_min"] > 1440
