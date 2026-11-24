# -*- coding: utf-8 -*-
"""
tests/test_detection_incident_audit.py
Auditoria e Validação Automatizada de Incidentes de Detecção Comercial e Esteira de Matching/WCF
Kantar IBOPE Media — Monitor_Servicos NOC LATAM
"""
import sys
import sqlite3
from pathlib import Path
import pytest

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from config import DATA_DIR
from incident_manager import init_incidents_db, sync_live_fleet_to_incident_events, get_incident_history
from tracking_detection_monitor import build_detection_fleet_snapshot
from sla_matrix_service import get_fleet_sla_matrix


def test_seed_incident_inc_2026_0011_sanitized():
    """Valida que INC-2026-0011 foi higienizado, está resolvido e NUNCA cita CS 3."""
    init_incidents_db()
    with sqlite3.connect(DATA_DIR / "fleet.db", timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT incident_code, praca, host, target_name, status, impact_summary FROM incident_events WHERE incident_code = 'INC-2026-0011'")
        row = cursor.fetchone()
        assert row is not None, "INC-2026-0011 deve existir no histórico"
        code, praca, host, target, status, summary = row
        assert status == "resolvido", f"INC-2026-0011 deve estar resolvido, obtido {status}"
        assert "CS 3" not in summary, f"INC-2026-0011 não pode citar CS 3: {summary}"
        assert "CS 3" not in target, f"Target não pode citar CS 3: {target}"


def test_no_detection_incidents_on_cs2_or_cs3():
    """Regra de Ouro: Detecção Comercial roda EXCLUSIVAMENTE em CS01. CS02 e CS03 são proibidos de gerar incidentes de detecção."""
    init_incidents_db()
    sync_live_fleet_to_incident_events()
    with sqlite3.connect(DATA_DIR / "fleet.db", timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT incident_code, host, target_name, status, impact_summary
            FROM incident_events
            WHERE status IN ('aberto', 'em_tratamento')
              AND (
                  incident_type LIKE 'detection%'
                  OR target_name LIKE '%Detecção%'
                  OR target_name LIKE '%Detection%'
                  OR incident_code LIKE 'INC-DET-%'
                  OR incident_code LIKE 'INC-SRV-DET-%'
              )
        """)
        rows = cursor.fetchall()
        for r in rows:
            h = r[1].lower()
            assert not any(tag in h for tag in ["-cs2", "-cs02", "_cs2", "dt02", "dt2", "-cs3", "-cs03", "_cs3", "dt03", "dt3", "repucom", "radios"]), \
                f"Incidente de detecção indevido em host não-CS01: {r}"


def test_detection_snapshot_and_incident_events_synchronization(monkeypatch):
    """Valida a sincronização viva entre o tracking_detection_monitor e incident_events sem tempos sintéticos."""
    init_incidents_db()

    # Simula um site CS01 com gargalo de despacho WCF (STALLED) com atraso real medido de 42 min
    fake_sites = [
        {
            "hostname": "FakePraca-SMME-999-CS1",
            "raw_hostname": "BRXX-FK1-DT01",
            "praca": "FakePraca",
            "cs": 1,
            "active_engine": "FastMatchingSvc",
            "engine_tier": "PRIMARY",
            "health_status": "STALLED",
            "severity_label": "Alerta (P1) - Fila de Tracking Acumulada (42m)",
            "incident_description": "Fila de XMLs estagnada em data\\tracking (42 min) sem despacho WCF.",
            "tracking_age_minutes": 42,
            "pipeline_bottleneck": "CONFIGMONITOR_WCF"
        }
    ]
    monkeypatch.setattr("tracking_detection_monitor.build_detection_fleet_snapshot", lambda: {"summary": {}, "sites": fake_sites})

    active = sync_live_fleet_to_incident_events()
    assert active > 0

    with sqlite3.connect(DATA_DIR / "fleet.db", timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT incident_code, host, target_name, incident_type, severity, status, duration_minutes FROM incident_events WHERE incident_code = 'INC-DET-STALL-FAKEPRACASMME999CS1'")
        row = cursor.fetchone()
        assert row is not None, "Incidente de STALLED deve ser gerado no banco"
        assert row[3] == "detection_wcf_stalled"
        assert row[4] == "critico"  # >= 30min é crítico
        assert row[5] == "aberto"
        assert row[6] == 42, f"Duração deve ser 42 min (tempo real), obtido {row[6]}"

    # Agora simula a normalização (NOMINAL)
    fake_sites_nominal = [
        {
            "hostname": "FakePraca-SMME-999-CS1",
            "raw_hostname": "BRXX-FK1-DT01",
            "praca": "FakePraca",
            "cs": 1,
            "active_engine": "FastMatchingSvc",
            "engine_tier": "PRIMARY",
            "health_status": "NOMINAL",
            "severity_label": "Nominal",
            "incident_description": "Pipeline nominal.",
            "tracking_age_minutes": 0,
            "pipeline_bottleneck": "NONE"
        }
    ]
    monkeypatch.setattr("tracking_detection_monitor.build_detection_fleet_snapshot", lambda: {"summary": {}, "sites": fake_sites_nominal})

    sync_live_fleet_to_incident_events()

    with sqlite3.connect(DATA_DIR / "fleet.db", timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status, resolved_at FROM incident_events WHERE incident_code = 'INC-DET-STALL-FAKEPRACASMME999CS1'")
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == "resolvido", "Incidente deve ser auto-resolvido após normalização"
        assert row[1] is not None, "resolved_at deve ser preenchido"


def test_sla_matrix_no_synthetic_320_minutes():
    """Valida que a Matriz de SLA não possui nenhum valor sintético congelado de 320 min em DT AT."""
    sla = get_fleet_sla_matrix()
    rows = sla.get("rows", [])
    assert len(rows) > 0, "A matriz de SLA deve conter hosts"
    for r in rows:
        dt = r.get("dt_delay_min")
        if dt not in ("-", "N/A", None):
            assert dt != 320, f"Host {r.get('hostname')} possui tempo sintético congelado de 320 min em DT AT!"
            assert dt != 180, f"Host {r.get('hostname')} possui tempo sintético congelado de 180 min em DT AT!"


def test_uruguaiana_cs01_is_identified_and_nominal():
    """Valida que Uruguaiana CS01 é corretamente indexado no snapshot canônico e não descartado como CS02."""
    snap = build_detection_fleet_snapshot()
    sites = snap.get("sites", [])
    ugn_sites = [s for s in sites if s.get("praca") == "Uruguaiana"]
    assert len(ugn_sites) >= 1, "Uruguaiana CS01 deve estar presente no snapshot de detecção"
    ugn = ugn_sites[0]
    assert ugn["cs"] == 1, "Uruguaiana avaliada deve ser estritamente CS01"
    assert ugn["health_status"] == "NOMINAL", f"Uruguaiana deve estar nominal, obtido {ugn['health_status']}"
