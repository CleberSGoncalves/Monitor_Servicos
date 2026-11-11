import pytest
import sys
from pathlib import Path

# Garantir que dashboard esteja no path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from tracking_detection_monitor import (
    generate_fastmatching_playbook,
    get_site_troubleshooting_playbook,
    get_fastmatching_node_telemetry,
    build_detection_fleet_snapshot
)
from media_pipeline_monitor import get_fleet_pipeline_incidents


def test_generate_fastmatching_playbook_delayed_candidates():
    """Valida playbook para atraso de candidatos/buffer no fma.log."""
    mock_parsed = {
        "has_detections": True,
        "has_delayed_warning": True,
        "delayed_candidates_count": 3,
        "last_detection": {"proc_time_ms": 1037},
        "ram_usage": {"private_mb": 4000}
    }
    pb = generate_fastmatching_playbook(mock_parsed, "BRRJ-CPS-DT01")
    assert pb["severity"] == "WARNING"
    assert "Candidatos Atrasados" in pb["problem_title"]
    assert any("TimeSync" in s or "w32tm" in s for s in pb["steps"])
    assert any("Data\\emu" in s or "Data\\\\emu" in s for s in pb["steps"])
    assert any("FastMachingSvc" in s for s in pb["steps"])
    assert pb["quick_action"] == "restart_fastmatching"


def test_generate_fastmatching_playbook_high_proctime():
    """Valida playbook para sobrecarga de varredura/CPU (>3000ms)."""
    mock_parsed = {
        "has_detections": True,
        "has_delayed_warning": False,
        "last_detection": {"proc_time_ms": 4200},
        "ram_usage": {"private_mb": 4000}
    }
    pb = generate_fastmatching_playbook(mock_parsed, "BRRJ-CPS-DT01")
    assert pb["severity"] == "WARNING"
    assert "Sobrecarga de CPU" in pb["problem_title"]
    assert any("DetectionSVC" in s for s in pb["steps"])
    assert any("CPU" in s for s in pb["steps"])


def test_generate_fastmatching_playbook_memory_leak():
    """Valida playbook para consumo crítico de RAM (>10 GB)."""
    mock_parsed = {
        "has_detections": True,
        "has_delayed_warning": False,
        "last_detection": {"proc_time_ms": 1100},
        "ram_usage": {"private_mb": 11500}
    }
    pb = generate_fastmatching_playbook(mock_parsed, "BRRJ-CPS-DT01")
    assert pb["severity"] == "CRITICAL"
    assert "Consumo Crítico de Memória" in pb["problem_title"]
    assert any("Reciclagem Imediata" in s or "FastMachingSvc" in s for s in pb["steps"])


def test_generate_fastmatching_playbook_engine_conflict():
    """Valida playbook para conflito concorrente de motores."""
    mock_parsed = {"has_detections": True, "has_delayed_warning": False}
    pb = generate_fastmatching_playbook(mock_parsed, "BRRJ-CPS-DT01", engine_tier="CONFLICT")
    assert pb["severity"] == "CRITICAL"
    assert "Conflito Concorrente" in pb["problem_title"]
    assert any("Parar o serviço DNA.DetectionSVC" in s or "DNA.DetectionSVC" in s for s in pb["steps"])
    assert pb["quick_action"] == "stop_detection_svc"


def test_site_troubleshooting_playbook_stalled_wcf():
    """Valida playbook para fila de tracking represada em D:\\MediaDNA_V2\\Data\\tracking."""
    site = {
        "hostname": "BRSP-CAS-DT01",
        "praca": "Campinas",
        "is_stalled": True,
        "tracking_age_minutes": 52,
        "pipeline_bottleneck": "CONFIGMONITOR_WCF",
        "engine_tier": "PRIMARY",
        "health_status": "STALLED",
        "pipeline_services": {
            "fast_matching": {"running": True},
            "detection_svc": {"running": False},
            "config_monitor": {"running": True},
            "tracking_svc": {"running": True}
        },
        "agent_comm": {"is_stale": False}
    }
    pb = get_site_troubleshooting_playbook(site)
    assert pb["severity"] == "P1"
    assert "Fila de Tracking Represada" in pb["problem_title"]
    assert any("Destravar Fila" in s or "Destravar" in s for s in pb["steps"])
    assert any("exception" in s for s in pb["steps"])
    assert pb["quick_action"] == "recycle_tracking"


def test_site_troubleshooting_playbook_critical_blackout():
    """Valida playbook para apagão de detecção (motores inoperantes)."""
    site = {
        "hostname": "BRDF-BSA-DT01",
        "praca": "Brasília",
        "is_stalled": False,
        "engine_tier": "NONE",
        "health_status": "CRITICAL",
        "pipeline_services": {
            "fast_matching": {"running": False},
            "detection_svc": {"running": False},
            "config_monitor": {"running": True},
            "tracking_svc": {"running": True}
        },
        "agent_comm": {"is_stale": False}
    }
    pb = get_site_troubleshooting_playbook(site)
    assert pb["severity"] == "P0"
    assert "Apagão de Detecção" in pb["problem_title"]
    assert any("FastMachingSvc" in s for s in pb["steps"])
    assert pb["quick_action"] == "start_fastmatching"


def test_detection_fleet_snapshot_embeds_playbook_in_all_sites():
    """Valida que todos os sites no snapshot de detecção recebem playbook estruturado."""
    snapshot = build_detection_fleet_snapshot()
    sites = snapshot.get("sites", [])
    assert len(sites) > 0

    for s in sites:
        pb = s.get("playbook_solution")
        assert pb is not None, f"Site {s['hostname']} sem playbook_solution!"
        assert "problem_title" in pb
        assert "steps" in pb
        assert len(pb["steps"]) > 0


def test_fastmatching_node_telemetry_embeds_playbook():
    """Valida que get_fastmatching_node_telemetry embute playbook com passos How-To."""
    tel = get_fastmatching_node_telemetry("BRPE-CRU-DT01", "Caruaru")
    assert "playbook" in tel
    pb = tel["playbook"]
    assert "problem_title" in pb
    assert "steps" in pb
    assert len(pb["steps"]) > 0


def test_media_pipeline_incidents_embeds_how_to_steps():
    """Valida que incidentes de pipeline de mídia embutem how_to_steps."""
    # Simula chamada
    incidents = get_fleet_pipeline_incidents(force_refresh=True)
    # Todos os incidentes gerados (se houver) devem conter how_to_steps
    for inc in incidents:
        assert "how_to_steps" in inc, f"Incidente {inc['id']} sem how_to_steps!"
        assert len(inc["how_to_steps"]) > 0


def test_frontend_ui_elements_for_how_to_playbooks():
    """Valida que os templates e scripts frontend contêm a renderização do How-To."""
    with open("dashboard/static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    assert "worklogHowToSolveContainer" in html_content
    assert "worklogHowToSolveList" in html_content

    with open("dashboard/static/js/detection_monitor.js", "r", encoding="utf-8") as f:
        det_js = f.read()
    assert "GUIA DE SOLUÇÃO / PLAYBOOK OPERACIONAL" in det_js
    assert "Roteiro de Resolução Passo a Passo (How-To)" in det_js

    with open("dashboard/static/js/app.js", "r", encoding="utf-8") as f:
        app_js = f.read()
    assert "worklogHowToSolveContainer" in app_js
    assert "Como Resolver (Passo a Passo Técnico)" in app_js
