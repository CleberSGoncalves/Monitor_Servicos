import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import sys
from pathlib import Path

# Adiciona o diretório do dashboard ao path
sys.path.insert(0, str(Path(__file__).parent.parent / "dashboard"))

from tracking_detection_monitor import (
    build_detection_fleet_snapshot,
    diagnose_detection_pipeline_with_ai
)


def _build_mock_service(name, status, version="1.0.20.0", update_time=None):
    if not update_time:
        update_time = datetime.now(timezone.utc).isoformat()
    return {
        "id": f"svc_{name}",
        "title": "Brasil",
        "hostname": "BRPA-CAH-DT01",
        "praca": "Castanhal",
        "cs": 1,
        "nome_servico": name,
        "versao_instalada": version,
        "versao_desejada": "1.0.20.0",
        "status_servico": status,
        "status_atualizacao": "Atualizado",
        "acao_solicitada": "Nenhuma",
        "ultima_atualizacao": update_time,
        "autorestart": "Não",
        "cpu_uso": "<1%",
        "ram_uso": "64 MB",
        "disco_d_livre": "N/A",
        "uptime": "N/A",
        "status_wcf": "Conectado",
        "log_erro": ""
    }


def test_offline_host_classified_as_comm_lost_not_critical():
    """
    CENÁRIO CRÍTICO DE CASTANHAL:
    Host físico está com FastMatching rodando (comprovado via services.msc),
    mas a telemetria do agente no SharePoint está estagnada há dias (>24h).
    O monitor DEVE classificar como COMM_LOST e JAMAIS como CRITICAL (P0) - Sem Motor de Matching.
    """
    stale_date = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    mock_services = [
        _build_mock_service("DNA.ConfigMonitorSVC", "Em Execução", update_time=stale_date),
        _build_mock_service("FastMatchingSvc", "Parado", update_time=stale_date),
        _build_mock_service("DNA.DetectionSVC", "Inexistente", update_time=stale_date),
        _build_mock_service("DNA.MonitorServiceSVC", "Em Execução", update_time=stale_date),
    ]

    with patch("tracking_detection_monitor.get_fleet_services", return_value=mock_services):
        snapshot = build_detection_fleet_snapshot()
        sites = snapshot.get("sites", [])
        assert len(sites) == 1
        site = sites[0]

        # Garantir classificação correta de resiliência
        assert site["health_status"] == "COMM_LOST", (
            f"Esperado COMM_LOST para host offline, recebido: {site['health_status']}"
        )
        assert site["engine_tier"] == "NONE"
        assert "Host Desconectado" in site["severity_label"]
        assert "Telemetria Ausente" in site["active_engine_label"]
        assert snapshot["summary"]["critical"] == 0
        assert snapshot["summary"]["comm_lost"] >= 1


def test_online_host_with_stopped_engines_is_critical_p0():
    """
    Host online (< 2h de telemetria fresca) que realmente estiver com ambos
    os motores parados/inexistentes DEVE ser classificado como CRITICAL (P0).
    """
    fresh_date = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    mock_services = [
        _build_mock_service("DNA.ConfigMonitorSVC", "Em Execução", update_time=fresh_date),
        _build_mock_service("FastMatchingSvc", "Parado", update_time=fresh_date),
        _build_mock_service("DNA.DetectionSVC", "Inexistente", update_time=fresh_date),
        _build_mock_service("DNA.MonitorServiceSVC", "Em Execução", update_time=fresh_date),
    ]

    with patch("tracking_detection_monitor.get_fleet_services", return_value=mock_services):
        snapshot = build_detection_fleet_snapshot()
        sites = snapshot.get("sites", [])
        assert len(sites) == 1
        site = sites[0]

        assert site["health_status"] == "CRITICAL"
        assert site["engine_tier"] == "NONE"
        assert "Sem Motor de Matching" in site["severity_label"]
        assert snapshot["summary"]["critical"] == 1
        assert snapshot["summary"]["inoperant_p0"] == 1


def test_ai_diagnostic_on_offline_host_avoids_false_positive():
    """
    O laudo heurístico de IA para um host offline não pode recomendar 'iniciar FastMatching'
    já que o processo pode estar rodando normalmente no servidor.
    Deve apontar claramente a falta de telemetria e recomendar restabelecer a comunicação.
    """
    stale_date = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    mock_services = [
        _build_mock_service("DNA.ConfigMonitorSVC", "Em Execução", update_time=stale_date),
        _build_mock_service("FastMatchingSvc", "Parado", update_time=stale_date),
        _build_mock_service("DNA.DetectionSVC", "Inexistente", update_time=stale_date),
        _build_mock_service("DNA.MonitorServiceSVC", "Em Execução", update_time=stale_date),
    ]

    with patch("tracking_detection_monitor.get_fleet_services", return_value=mock_services):
        diag = diagnose_detection_pipeline_with_ai("BRPA-CAH-DT01")
        assert diag["success"] is True
        diagnosis = diag["diagnosis"]

        assert "Telemetria Suspensa" in diagnosis["root_cause"] or "Telemetria Indisponível" in diagnosis["root_cause"]
        assert "OBSERVAÇÃO OPERACIONAL CRÍTICA" in diagnosis["technical_assessment"]
        assert "NÃO PODEM ser considerados parados" in diagnosis["technical_assessment"]
        
        # Ações recomendadas não devem pedir para subir motor sem telemetria
        action_names = [a["action"] for a in diagnosis["recommended_actions"]]
        assert "restart_agent_service" in action_names
        assert "start_fastmatching" not in action_names
