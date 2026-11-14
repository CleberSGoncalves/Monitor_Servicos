import json
import sys
from pathlib import Path

import pytest

DASH_DIR = Path(__file__).resolve().parent.parent
if str(DASH_DIR) not in sys.path:
    sys.path.insert(0, str(DASH_DIR))

from tracking_detection_monitor import (
    build_detection_fleet_snapshot,
    get_service_status_normalized,
    is_service_running,
)
from media_pipeline_monitor import get_link_monitoring_metrics
from gcp_sync import merge_firestore_hosts_into_cache
from version_governance import get_desired_versions, get_service_fleet_evolution


def test_disabled_service_normalization():
    """Garante que serviços 'Desativado' no Windows (services.msc) nunca sejam confundidos com 'Em Execução' ou 'Parado'."""
    assert get_service_status_normalized("Desativado") == "Desativado"
    assert get_service_status_normalized("Disabled") == "Desativado"
    assert is_service_running("Desativado") is False


def test_florianopolis_cs01_fastmatching_nominal():
    """Valida que Florianópolis CS01 (CS-BRSC-FNS-DT0) reporta FastMatchingSvc ativo (PRIMARY / NOMINAL) sem falso P0."""
    snap = build_detection_fleet_snapshot()
    fns = next((s for s in snap["sites"] if s["hostname"] == "CS-BRSC-FNS-DT0"), None)
    assert fns is not None, "Florianópolis CS-BRSC-FNS-DT0 deve existir no snapshot CS01"
    assert fns["active_engine"] == "FastMatchingSvc"
    assert fns["engine_tier"] == "PRIMARY"
    assert fns["health_status"] == "NOMINAL"
    assert fns["pipeline_services"]["fast_matching"]["running"] is True
    assert fns["pipeline_services"]["fast_matching"]["status"] == "Em Execução"


def test_campo_grande_cs01_no_false_conflict():
    """Valida que Campo Grande CS01 (BRMS-CPE-DT01) com FastMatching Desativado opera em FALLBACK sem falso Conflito Concorrente."""
    snap = build_detection_fleet_snapshot()
    cpe = next((s for s in snap["sites"] if s["hostname"] == "BRMS-CPE-DT01"), None)
    assert cpe is not None, "Campo Grande BRMS-CPE-DT01 deve existir no snapshot CS01"
    assert cpe["active_engine"] == "DNA.DetectionSVC"
    assert cpe["engine_tier"] == "FALLBACK"
    assert cpe["pipeline_services"]["fast_matching"]["running"] is False
    assert cpe["pipeline_services"]["fast_matching"]["status"] == "Desativado"
    assert cpe["pipeline_services"]["detection_svc"]["running"] is True


def test_zero_false_conflicts_and_zero_false_p0_across_fleet():
    """Auditoria global: 0 conflitos concorrentes falsos, 0 P0 falsos e exclusão de nós puramente CS02/CS03."""
    snap = build_detection_fleet_snapshot()
    summary = snap["summary"]
    assert summary["concurrent_conflict"] == 0
    assert summary["inoperant_p0"] == 0
    assert summary["stalled_tracking"] == 0
    assert summary["nominal_fastmatching"] + summary["fallback_detection_svc"] == summary["total_sites"]

    hostnames = {s["hostname"] for s in snap["sites"]}
    assert "CS-BRSP-SOR-DT0" not in hostnames, "Host puramente CS02 não deve aparecer na aba CS01"
    assert "BRSP-RADIO-BKP1" not in hostnames, "Host puramente CS03 não deve aparecer na aba CS01"


def test_gcp_sync_parses_services_json_and_prevents_synthetic_conflict(monkeypatch):
    """Garante que merge_firestore_hosts_into_cache respeita services_json real e nunca sintetiza ambos motores ativos."""
    import gcp_sync

    fake_hosts_map = {
        "TEST-HOST-CS01": {
            "hostname": "TEST-HOST-CS01",
            "praca": "Praça Teste",
            "cs": 1,
            "agent_version": "1.0.21.4",
            "last_heartbeat": "2026-11-13T21:00:00Z",
            "services_json": json.dumps([
                {"nome_servico": "FastMatchingSvc", "status_servico": "Em Execução", "versao_instalada": "1.1.0.0", "cpu_uso": "9%", "ram_uso": "140 MB"},
                {"nome_servico": "DNA.DetectionSVC", "status_servico": "Desativado", "versao_instalada": "3.4.6040.21056", "cpu_uso": "0%", "ram_uso": "0 MB"},
            ]),
        },
        "TEST-SYNTH-CS01": {
            "hostname": "TEST-SYNTH-CS01",
            "praca": "Praça Synth",
            "cs": 1,
            "agent_version": "1.0.21.3",
            "last_heartbeat": "2026-11-13T21:00:00Z",
        },
    }
    import time
    monkeypatch.setattr(gcp_sync, "_cached_firestore_hosts", fake_hosts_map)
    monkeypatch.setattr(gcp_sync, "_last_firestore_pull_ts", time.time())

    mock_services = []
    mock_channels = []
    merge_firestore_hosts_into_cache(mock_services, mock_channels)

    fm = next(s for s in mock_services if s["hostname"] == "TEST-HOST-CS01" and s["nome_servico"] == "FastMatchingSvc")
    det = next(s for s in mock_services if s["hostname"] == "TEST-HOST-CS01" and s["nome_servico"] == "DNA.DetectionSVC")
    assert fm["status_servico"] == "Em Execução"
    assert fm["ram_uso"] == "140 MB"
    assert det["status_servico"] == "Desativado"

    fm_syn = next(s for s in mock_services if s["hostname"] == "TEST-SYNTH-CS01" and s["nome_servico"] == "FastMatchingSvc")
    det_syn = next(s for s in mock_services if s["hostname"] == "TEST-SYNTH-CS01" and s["nome_servico"] == "DNA.DetectionSVC")
    assert fm_syn["status_servico"] == "Desativado"
    assert det_syn["status_servico"] == "Em Execução"


def test_links_monitoring_no_fake_hash_packet_loss():
    """Garante que get_link_monitoring_metrics não inventa perda de pacotes por hash MD5 para hosts saudáveis."""
    healthy_services = []
    for i in range(1, 15):
        healthy_services.extend([
            {"hostname": f"BRSP-TST-DT{i:02d}", "praca": "São Paulo", "cs": 1, "nome_servico": "DNA.MonitorServiceSVC", "status_servico": "Em Execução"},
            {"hostname": f"BRSP-TST-DT{i:02d}", "praca": "São Paulo", "cs": 1, "nome_servico": "DNA.FiletransferSVC", "status_servico": "Em Execução"},
            {"hostname": f"BRSP-TST-DT{i:02d}", "praca": "São Paulo", "cs": 1, "nome_servico": "DNA.ConfigMonitorSVC", "status_servico": "Em Execução", "status_wcf": "Conectado"},
        ])
    metrics = get_link_monitoring_metrics(services=healthy_services, channels=[])
    assert len(metrics) == 14
    assert all(m["status"] == "estavel" for m in metrics)
    assert all(m["packet_loss_pct"] == 0.0 for m in metrics)


def test_version_governance_v10214():
    """Verifica alinhamento da governança central na versão 1.0.21.4."""
    desired = get_desired_versions()
    assert desired["DNA.MonitorServiceSVC"] == "1.0.21.4"
    evol = get_service_fleet_evolution("DNA.MonitorServiceSVC", "1.0.21.4")
    assert evol["updated_pct"] >= 98.0
