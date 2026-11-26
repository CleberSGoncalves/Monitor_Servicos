"""
Regressão: consistência do Pipeline de Detecção Automática (lista CS01).

Bug reportado: na mesma linha aparecia "📶 Agente online" + "Sem dados recentes" + "Comunicação Perdida",
hosts offline exibiam "INOPERANTE Crítico P0" e os KPIs (Primário/Fallback/Inoperantes) divergiam da tabela.

Regras validadas (fonte única de verdade):
  1. Heartbeat do host <= 2h  => agente ONLINE, is_stale False, NUNCA COMM_LOST (mesmo sem linha do MonitorServiceSVC).
  2. Heartbeat > 2h           => COMM_LOST e fora dos KPIs de motor (estado desconhecido).
  3. Host ONLINE porém motores sem evidência fresca (> 20 min) => WARNING / TELEMETRY_PARTIAL, não P0.
  4. P0 (INOPERANTE) só com telemetria fresca e KPI inoperant_p0 == nº de linhas CRITICAL.
"""
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "dashboard"))

from dashboard import tracking_detection_monitor as tdm  # noqa: E402


def _ts(minutes_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _svc(host, praca, name, status, minutes_ago, ram="N/A", versao="1.0.0.0"):
    return {
        "id": f"{host}_{name}",
        "hostname": host,
        "praca": praca,
        "cs": 1,
        "nome_servico": name,
        "status_servico": status,
        "versao_instalada": versao,
        "ram_uso": ram,
        "cpu_uso": "<1%",
        "ultima_atualizacao": _ts(minutes_ago),
    }


def _fixture_services():
    svcs = []
    # A) Linha do agente AUSENTE, demais serviços frescos (10 min) — caso "Campinas vN/A"
    a = ("TesteA-SMME-901-CS1", "TesteA")
    svcs += [
        _svc(*a, "DNA.DetectionSVC", "Em Execução", 10, ram="300 MB"),
        _svc(*a, "DNA.TrackingSVC", "Em Execução", 10, ram="40 MB"),
        _svc(*a, "DNA.ConfigMonitorSVC", "Em Execução", 10),
    ]
    # B) Agente sem reportar há 199h — caso "Manaus"
    b = ("TesteB-SMME-902-CS1", "TesteB")
    svcs += [
        _svc(*b, "DNA.MonitorServiceSVC", "Em Execução", 199 * 60, versao="1.0.21.3"),
        _svc(*b, "DNA.DetectionSVC", "Em Execução", 199 * 60, ram="400 MB"),
        _svc(*b, "DNA.ConfigMonitorSVC", "Em Execução", 199 * 60),
    ]
    # C) Agente ONLINE (35 min) mas motores sem evidência fresca
    c = ("TesteC-SMME-903-CS1", "TesteC")
    svcs += [
        _svc(*c, "DNA.MonitorServiceSVC", "Em Execução", 35, versao="1.0.21.5"),
        _svc(*c, "FastMatchingSvc", "Parado", 35),
        _svc(*c, "DNA.DetectionSVC", "Parado", 35),
        _svc(*c, "DNA.ConfigMonitorSVC", "Em Execução", 35),
    ]
    # D) Telemetria fresca (5 min) e ambos motores parados => P0 real
    d = ("TesteD-SMME-904-CS1", "TesteD")
    svcs += [
        _svc(*d, "DNA.MonitorServiceSVC", "Em Execução", 5, versao="1.0.21.5"),
        _svc(*d, "FastMatchingSvc", "Parado", 5),
        _svc(*d, "DNA.DetectionSVC", "Parado", 5),
        _svc(*d, "DNA.ConfigMonitorSVC", "Em Execução", 5),
    ]
    return svcs


@pytest.fixture()
def snapshot(monkeypatch):
    monkeypatch.setattr(tdm, "get_fleet_services", _fixture_services)
    snap = tdm.build_detection_fleet_snapshot(threshold_minutes=60)
    return snap, {s["hostname"]: s for s in snap["sites"]}


def test_agent_online_never_shows_comm_lost(snapshot):
    _, sites = snapshot
    a = sites["TesteA-SMME-901-CS1"]
    assert a["agent_comm"]["status"] == "ONLINE"
    assert a["agent_comm"]["is_stale"] is False
    assert a["health_status"] != "COMM_LOST"
    assert a["engine_tier"] == "FALLBACK"


def test_offline_host_is_comm_lost_and_excluded_from_engine_kpis(snapshot):
    snap, sites = snapshot
    b = sites["TesteB-SMME-902-CS1"]
    assert b["agent_comm"]["status"] == "OFFLINE_CRITICAL"
    assert b["health_status"] == "COMM_LOST"
    k = snap["kpis"]
    # Fallback só conta TesteA (TesteB está sem comunicação)
    assert k["fallback_detection_svc"] == 1
    assert k["comm_lost"] == 1


def test_online_without_fresh_engine_evidence_is_warning_not_p0(snapshot):
    _, sites = snapshot
    c = sites["TesteC-SMME-903-CS1"]
    assert c["agent_comm"]["status"] == "ONLINE"
    assert c["engine_tier"] == "NONE"
    assert c["health_status"] == "WARNING"
    assert c["pipeline_bottleneck"] == "TELEMETRY_PARTIAL"


def test_p0_only_with_fresh_telemetry_and_kpi_matches_table(snapshot):
    snap, sites = snapshot
    d = sites["TesteD-SMME-904-CS1"]
    assert d["health_status"] == "CRITICAL"
    critical_rows = sum(1 for s in snap["sites"] if s["health_status"] == "CRITICAL" and s["engine_tier"] == "NONE")
    assert snap["kpis"]["inoperant_p0"] == critical_rows == 1


def test_frontend_no_synthetic_labels():
    js = (ROOT / "dashboard" / "static" / "js" / "detection_monitor.js").read_text(encoding="utf-8")
    assert "Parado (>180m)" not in js
    assert "Sem dados recentes" not in js
    assert 'site.health_status === "COMM_LOST"' in js and "Sem Telemetria" in js
