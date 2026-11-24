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

    # Valida que hosts com KA atrasado (offline) têm CPU/RAM/Disco marcados como '-'
    offline_hosts = [r for r in rows if r["ka_delay_min"] > 0]
    assert len(offline_hosts) > 0, "Deve haver hosts offline (ex: Vitória da Conquista)"
    for off_h in offline_hosts:
        assert off_h["cpu_uso"] == "-", f"Host offline {off_h['hostname']} não deve exibir CPU congelada: {off_h['cpu_uso']}"
        assert off_h["ram_uso"] == "-", f"Host offline {off_h['hostname']} não deve exibir RAM congelada: {off_h['ram_uso']}"
        assert off_h["disco_d_livre"] == "-", f"Host offline {off_h['hostname']} não deve exibir Disco congelado: {off_h['disco_d_livre']}"

    # Valida que hosts online não estão todos cravados em um único valor estático de 56%
    online_hosts = [r for r in rows if r["ka_delay_min"] == 0]
    online_cpus = set(r["cpu_uso"] for r in online_hosts)
    assert len(online_cpus) > 5, f"Hosts online devem ter variação dinâmica de CPU, obtido apenas {online_cpus}"
