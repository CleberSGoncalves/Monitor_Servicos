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


def test_gcp_consumption_zero_cost_free_tier():
    """Garante que o consumo Google Cloud opera 100% dentro do Free Tier ($0.00 / R$ 0,00) com Smart Delta."""
    from gcp_sync import get_gcp_consumption_and_cost_metrics

    data = get_gcp_consumption_and_cost_metrics()
    assert data["success"] is True
    assert data["firestore"]["daily_writes"] <= data["firestore"]["free_tier_writes"]
    assert data["firestore"]["billable_daily_writes"] == 0
    assert data["firestore"]["daily_reads"] <= data["firestore"]["free_tier_reads"]
    assert data["firestore"]["billable_daily_reads"] == 0
    assert data["firestore"]["monthly_cost_usd"] == 0.0
    assert data["storage"]["monthly_cost_usd"] == 0.0
    assert data["cost_summary"]["monthly_usd"] == 0.0
    assert data["cost_summary"]["monthly_brl"] == 0.0
    assert data["free_tier_compliant"] is True


def test_fleet_rbac_permissions_and_audit_log():
    """Valida regras de permissionamento RBAC e persistência na Trilha de Auditoria."""
    from version_governance import (
        check_fleet_rbac_permission,
        get_fleet_audit_log,
        record_fleet_audit_event,
    )

    # 1. N1 / Viewer bloqueado para ações destrutivas/escrita
    allowed_n1, _ = check_fleet_rbac_permission({"username": "op_n1", "role": "n1"}, "UPDATE_SINGLE")
    assert allowed_n1 is False
    allowed_viewer, _ = check_fleet_rbac_permission({"username": "visitante", "role": "viewer"}, "REMOTE_COMMAND")
    assert allowed_viewer is False

    # 2. N2 permitido em UPDATE_SINGLE e REMOTE_COMMAND, mas bloqueado em REMOVE_HOST e UPDATE_BATCH
    allowed_n2_single, _ = check_fleet_rbac_permission({"username": "op_n2", "role": "n2"}, "UPDATE_SINGLE")
    assert allowed_n2_single is True
    allowed_n2_rc, _ = check_fleet_rbac_permission({"username": "op_n2", "role": "n2"}, "REMOTE_COMMAND")
    assert allowed_n2_rc is True
    allowed_n2_remove, _ = check_fleet_rbac_permission({"username": "op_n2", "role": "n2"}, "REMOVE_HOST")
    assert allowed_n2_remove is False
    allowed_n2_batch, _ = check_fleet_rbac_permission({"username": "op_n2", "role": "n2"}, "UPDATE_BATCH")
    assert allowed_n2_batch is False

    # 3. ADMIN / N3 permitido em todas as operações
    for act in ["UPDATE_SINGLE", "UPDATE_BATCH", "SET_VERSION", "REMOVE_HOST", "REMOTE_COMMAND"]:
        ok_adm, _ = check_fleet_rbac_permission({"username": "suportesmme", "role": "admin"}, act)
        assert ok_adm is True

    # 4. Gravação e leitura de evento auditado
    entry = record_fleet_audit_event(
        user={"username": "suportesmme", "full_name": "Suporte SMME", "role": "admin"},
        action_type="UPDATE_SINGLE",
        target="BRGO-ANA-DT02",
        service_name="DNA.MonitorServiceSVC",
        target_version="1.0.21.4",
        reason="Teste automatizado de auditoria RBAC",
        details="Validação unitária de governança",
        status="Sucesso",
    )
    assert entry["username"] == "suportesmme"
    assert entry["role"] == "ADMIN"
    logs = get_fleet_audit_log(limit=10)
    assert any(l["audit_id"] == entry["audit_id"] for l in logs)


def test_auto_healing_respects_cs02_and_mutual_exclusion():
    """Garante que audit_and_diagnose_fleet não marca 1.0.21.3/1.0.21.4 como desatualizado nem CS02 como serviço parado."""
    from fleet_auto_healing import audit_and_diagnose_fleet

    diag = audit_and_diagnose_fleet()
    assert diag["summary"]["up_to_date"] >= 230
    # CS02 hosts nunca devem acusar FastMatchingSvc ou DetectionSVC parado
    cs02_hosts = [h for h in diag["hosts"] if str(h.get("cs")) in ("2", "2.0")]
    for h in cs02_hosts:
        stopped = h.get("stopped_critical_services") or []
        assert "FastMatchingSvc" not in stopped
        assert "DNA.DetectionSVC" not in stopped

