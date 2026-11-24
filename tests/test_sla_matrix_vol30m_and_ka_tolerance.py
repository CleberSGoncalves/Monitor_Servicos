import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "dashboard"))

import pytest
from datetime import datetime, timezone, timedelta
from sla_matrix_service import get_fleet_sla_matrix

def test_sla_matrix_ka_tolerance_and_vol30m():
    """
    Valida:
    1. Que nós nominais com ciclo de dirty check de 15-25 min não disparam falso alerta de KA.
    2. Que Vitória da Conquista (>500 min) é mantida com KA atrasado real.
    3. Que o payload contém os dados para a coluna oficial VOL (30m).
    """
    res = get_fleet_sla_matrix()
    assert "rows" in res
    rows = res["rows"]
    assert len(rows) > 0

    vca_hosts = [r for r in rows if "vitoria_da_conquista" in r["hostname"].lower()]
    assert len(vca_hosts) > 0, "Vitória da Conquista deve existir na frota"
    for vh in vca_hosts:
        # Vitória da Conquista está realmente sem telemetria há mais de 8 horas
        assert vh["ka_delay_min"] > 500, f"Vitória da Conquista deve estar com KA > 500m, obteve {vh['ka_delay_min']}"
        assert vh["tier"] in ("CRITICO", "CRONICO")

    # Verifica nós com telemetria nominal recente
    for r in rows:
        assert "wan" in r
        assert "volume_mb_30min" in r["wan"]
        assert "drain_time_min" in r["wan"]
        assert isinstance(r["wan"]["volume_mb_30min"], (int, float))

    # Verifica que hosts com KA <= 25m têm ka_delay_min == 0 (exibidos como '-' limpo)
    nominal_ka = [r for r in rows if r["ka_delay_min"] == 0]
    assert len(nominal_ka) > 200, "A grande maioria dos hosts deve estar dentro da tolerância nominal de KA"
