import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "dashboard"))
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timezone, timedelta
from fleet_auto_healing import audit_and_diagnose_fleet

def test_fleet_auto_healing_respects_strict_telemetry_precedence(monkeypatch):
    """
    Testa se o auto-healing de serviços críticos só é acionado para hosts
    estritamente ONLINE (telemetria fresca <= 20 min).
    Se o host estiver DELAY (ex: 45 min) ou OFFLINE, mesmo que conste serviço parado,
    NÃO deve elegibilizar para restart ou marcar stopped_critical_services.
    """
    now_utc = datetime.now(timezone.utc)
    t_stale_45min = (now_utc - timedelta(minutes=45)).isoformat()
    t_fresh_5min = (now_utc - timedelta(minutes=5)).isoformat()

    mock_services = [
        # Host 1: Castanhal - Telemetria atrasada há 45 min (stale), com FastMatching "Parado"
        {
            "id": "101",
            "hostname": "BRPA-CAM-DT01",
            "praca": "Castanhal",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao": "1.0.20.0",
            "status_servico": "Em Execução",
            "ultima_atualizacao": t_stale_45min
        },
        {
            "id": "102",
            "hostname": "BRPA-CAM-DT01",
            "praca": "Castanhal",
            "nome_servico": "FastMatching",
            "status_servico": "Parado",
            "ultima_atualizacao": t_stale_45min
        },
        # Host 2: Goiânia - Telemetria fresca há 5 min, com FastMatching "Parado"
        {
            "id": "201",
            "hostname": "BRGO-GNA-DT01",
            "praca": "Goiânia",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao": "1.0.20.0",
            "status_servico": "Em Execução",
            "ultima_atualizacao": t_fresh_5min
        },
        {
            "id": "202",
            "hostname": "BRGO-GNA-DT01",
            "praca": "Goiânia",
            "nome_servico": "FastMatching",
            "status_servico": "Parado",
            "ultima_atualizacao": t_fresh_5min
        }
    ]

    import fleet_auto_healing as fah
    monkeypatch.setattr(fah, "get_cached_data", lambda: {"services": mock_services})

    res = audit_and_diagnose_fleet()
    hosts = {h["hostname"]: h for h in res["hosts"]}

    # Host 1 (Castanhal - 45 min stale): comm_state deve ser DELAY, NÃO elegível para service restart!
    h1 = hosts["BRPA-CAM-DT01"]
    assert h1["comm_state"] == "DELAY"
    assert h1["eligible_service_restart"] is False
    assert len(h1["stopped_critical_services"]) == 0

    # Host 2 (Goiânia - 5 min fresh): comm_state deve ser ONLINE, ELEGÍVEL para service restart!
    h2 = hosts["BRGO-GNA-DT01"]
    assert h2["comm_state"] == "ONLINE"
    assert h2["eligible_service_restart"] is True
    assert "FastMatching" in h2["stopped_critical_services"]
