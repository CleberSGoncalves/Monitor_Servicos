# -*- coding: utf-8 -*-
"""
test_incident_consistency_e2e.py
Auditoria E2E e Validação Automatizada de Consistência da Tela de Incidentes,
Base SQLite fleet.db e Sincronismo com Matriz de SLA e Raio-X Forense.
"""
import os
import sys
import sqlite3
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))
from incident_manager import (
    init_incidents_db,
    sync_live_fleet_to_incident_events,
    get_incident_history,
    DB_PATH
)


def test_no_ghost_or_invalid_seeds_open_in_db():
    """Valida se não existem registros fantasmas nem seeds legados abertos no banco fleet.db."""
    init_incidents_db()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        
        # 1. Registros fantasmas com prefixo ad-hoc 'rf_c_' ou 'rf_s_' não devem existir
        cursor.execute("SELECT incident_code FROM incident_events WHERE incident_code LIKE 'rf_c_%' OR incident_code LIKE 'rf_s_%'")
        ghosts = cursor.fetchall()
        assert len(ghosts) == 0, f"Registros fantasmas encontrados no fleet.db: {ghosts}"

        # 2. Seeds legados de teste não devem estar com status 'aberto' ou 'em_tratamento'
        cursor.execute("""
            SELECT incident_code, status FROM incident_events 
            WHERE incident_code IN ('INC-2026-0011', 'INC-2026-0012', 'INC-2026-0013', 'INC-2026-0014', 'INC-2026-0015')
              AND status != 'resolvido'
        """)
        open_seeds = cursor.fetchall()
        assert len(open_seeds) == 0, f"Seeds legados inválidos ainda abertos: {open_seeds}"

        # 3. Falsos positivos de gravação em CS3 (Brasília) não devem estar abertos
        cursor.execute("SELECT incident_code, status FROM incident_events WHERE incident_code = 'INC-SRV-REC-BRASILIASMME186CS3' AND status != 'resolvido'")
        fp_rec = cursor.fetchall()
        assert len(fp_rec) == 0, f"Falso positivo de CS3 ainda aberto: {fp_rec}"


def test_sync_live_fleet_vitoria_da_conquista_keepalive():
    """Valida se a sincronização ativa detecta os hosts desconectados de Vitória da Conquista."""
    init_incidents_db()
    active_count = sync_live_fleet_to_incident_events()
    assert active_count > 0, "Deveria haver incidentes ativos mapeados na frota."

    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT incident_code, praca, host, target_name, incident_type, severity, status, duration_minutes
            FROM incident_events
            WHERE praca = 'Vitória da Conquista' AND status = 'aberto'
        """)
        vca_incidents = cursor.fetchall()
        
        assert len(vca_incidents) >= 2, f"Esperado ao menos 2 incidentes abertos para Vitória da Conquista (CS1 e CS2), obtido: {vca_incidents}"
        
        codes = [row[0] for row in vca_incidents]
        assert any("VITORIADACONQUISTASMME313CS1" in c for c in codes), f"CS1 de VCA ausente nos incidentes: {codes}"
        assert any("VITORIADACONQUISTASMME313CS2" in c for c in codes), f"CS2 de VCA ausente nos incidentes: {codes}"
        
        for row in vca_incidents:
            inc_code, praca, host, target, itype, sev, status, dur = row
            assert itype == "host_offline", f"Tipo esperado host_offline, obtido: {itype}"
            assert sev == "critico", f"Severidade de VCA desconectado há >600m deve ser critico, obtido: {sev}"
            assert dur > 500, f"Duração em minutos deveria refletir o atraso real (>500m), obtido: {dur}"


def test_get_incident_history_consistency():
    """Valida o payload de get_incident_history garantindo consistência com métricas e itens."""
    res = get_incident_history(period="30d")
    assert "total_incidents" in res
    assert "open_incidents" in res
    assert "resolved_incidents" in res
    assert "items" in res
    assert res["total_incidents"] > 0
    assert res["open_incidents"] > 0

    items = res["items"]
    open_items = [it for it in items if it.get("status") == "aberto"]
    assert len(open_items) == res["open_incidents"]

    # Verifica se os incidentes abertos possuem código válido e duração consistente
    for it in open_items:
        code = it.get("incident_code")
        assert code.startswith("INC-"), f"Código de incidente deve iniciar com INC-: {code}"
        assert not code.startswith("rf_"), f"Código não pode ser formato legado rf_: {code}"
        assert it.get("duration_minutes", 0) > 0, f"Duração deve ser positiva: {code}"


def test_auto_resolution_when_normalized():
    """Valida se incidentes de serviço/host fecham automaticamente quando não estão mais na lista ativa."""
    now_str = "2026-11-24 02:00:00"
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        
        # Insere incidente fictício de serviço que acabou de normalizar
        test_code = "INC-SRV-REC-TESTEAUTORESOLVEHOST"
        cursor.execute("""
            INSERT OR REPLACE INTO incident_events (
                incident_code, praca, host, target_name, incident_type,
                severity, status, duration_minutes, impact_summary, root_cause,
                tower_reference, distance_km, azimuth_deg, operator_assigned, created_at
            ) VALUES (?, 'Teste', 'Host-Teste', 'Motor de Gravação', 'service_stopped', 'critico', 'aberto', 30, 'Impacto', 'Causa', 'Torre Teste', 0.0, 0.0, 'N1', ?)
        """, (test_code, now_str))
        conn.commit()

        # Executa sincronização real da frota
        sync_live_fleet_to_incident_events()

        # Verifica se o incidente fictício foi auto-resolvido porque não está nos serviços parados reais
        cursor.execute("SELECT status, resolved_at FROM incident_events WHERE incident_code = ?", (test_code,))
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == "resolvido", f"Incidente deveria ter sido auto-resolvido, mas status é: {row[0]}"
        assert row[1] is not None, "resolved_at deve estar preenchido no fechamento"

        # Limpa o registro de teste
        cursor.execute("DELETE FROM incident_events WHERE incident_code = ?", (test_code,))
        conn.commit()
