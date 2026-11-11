"""
Suíte de Testes Automatizados — Auditoria de Pré-requisito Universal de Telemetria e Supressão de Falsos Incidentes
Diretriz GEMINI.md: Proibição estrita de suposições sem validação prática.
"""

import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
import pytest

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from media_pipeline_monitor import get_fleet_pipeline_incidents
from signals_analysis import diagnose_channel_with_ai
from tracking_detection_monitor import build_detection_fleet_snapshot
from incident_manager import track_channel_anomalies_cycle, init_anomaly_telemetry_db, DB_PATH
import sqlite3


def _build_service(name, status, update_time=None, hostname="BRSP-SPO-DT01", praca="São Paulo", cs=1):
    if not update_time:
        update_time = datetime.now(timezone.utc).isoformat()
    return {
        "id": f"svc_{name}_{hostname}",
        "title": "Brasil",
        "hostname": hostname,
        "praca": praca,
        "cs": cs,
        "nome_servico": name,
        "versao_instalada": "1.0.20.0",
        "versao_desejada": "1.0.20.0",
        "status_servico": status,
        "status_atualizacao": "Atualizado",
        "acao_solicitada": "Nenhuma",
        "ultima_atualizacao": update_time,
        "cpu_uso": "<1%",
        "ram_uso": "64 MB",
        "disco_d_livre": "N/A",
        "uptime": "N/A",
        "status_wcf": "Conectado",
        "log_erro": ""
    }


# ==============================================================================
# 1. MEDIA PIPELINE MONITOR: DNA.MonitorServiceSVC COMO PRÉ-REQUISITO UNIVERSAL
# ==============================================================================

def test_pipeline_incidents_suppressed_when_agent_not_installed():
    """
    Host com FileTransferSVC Parado, mas SEM DNA.MonitorServiceSVC instalado.
    PRÉ-REQUISITO UNIVERSAL: Sem agente = Telemetria suspensa = ZERO incidentes de pipeline.
    """
    now = datetime.now(timezone.utc)
    fresh_date = (now - timedelta(minutes=5)).isoformat()
    mock_services = [
        _build_service("DNA.FileTransferSVC", "Parado", update_time=fresh_date, hostname="BRRS-PLT-DT01"),
        _build_service("DNA.MediaRecorderSVC", "Parado", update_time=fresh_date, hostname="BRRS-PLT-DT01"),
    ]

    with patch("media_pipeline_monitor.scan_local_pipeline_media", return_value=[]):
        incidents = get_fleet_pipeline_incidents(mock_services, threshold_delay_min=10.0)
        # Não pode emitir incidente de serviço parado sem agente de monitoramento!
        ft_incidents = [i for i in incidents if i["type"] in ("servico_transfer_parado", "ausencia_geracao_30min")]
        assert len(ft_incidents) == 0, f"Host sem agente nunca pode gerar incidente de pipeline! Encontrados: {ft_incidents}"


def test_pipeline_incidents_suppressed_when_agent_stopped():
    """
    Host com FileTransferSVC Parado e DNA.MonitorServiceSVC PARADO.
    Agente inativo = Telemetria suspensa = ZERO incidentes de pipeline.
    """
    now = datetime.now(timezone.utc)
    fresh_date = (now - timedelta(minutes=5)).isoformat()
    mock_services = [
        _build_service("DNA.MonitorServiceSVC", "Parado", update_time=fresh_date, hostname="BRRS-PLT-DT01"),
        _build_service("DNA.FileTransferSVC", "Parado", update_time=fresh_date, hostname="BRRS-PLT-DT01"),
    ]

    with patch("media_pipeline_monitor.scan_local_pipeline_media", return_value=[]):
        incidents = get_fleet_pipeline_incidents(mock_services, threshold_delay_min=10.0)
        ft_incidents = [i for i in incidents if i["type"] == "servico_transfer_parado"]
        assert len(ft_incidents) == 0, "Host com agente parado não pode gerar incidente de pipeline!"


def test_pipeline_incidents_suppressed_when_agent_stale_over_20_minutes():
    """
    Host com FileTransferSVC Parado e DNA.MonitorServiceSVC com última atualização há 35 minutos (> 20 min).
    Telemetria estagnada = Estado local INDETERMINADO = ZERO incidentes de pipeline.
    """
    now = datetime.now(timezone.utc)
    stale_date = (now - timedelta(minutes=35)).isoformat()
    mock_services = [
        _build_service("DNA.MonitorServiceSVC", "Em Execução", update_time=stale_date, hostname="BRRS-PLT-DT01"),
        _build_service("DNA.FileTransferSVC", "Parado", update_time=stale_date, hostname="BRRS-PLT-DT01"),
    ]

    with patch("media_pipeline_monitor.scan_local_pipeline_media", return_value=[]):
        incidents = get_fleet_pipeline_incidents(mock_services, threshold_delay_min=10.0)
        ft_incidents = [i for i in incidents if i["type"] == "servico_transfer_parado"]
        assert len(ft_incidents) == 0, "Host com telemetria > 20 min não pode gerar incidente de pipeline!"


def test_pipeline_incidents_active_when_agent_fresh_and_running():
    """
    Host com FileTransferSVC Parado, DNA.MonitorServiceSVC Em Execução e telemetria de 5 minutos (< 20 min).
    Telemetria fresca e agente ativo = Incidente de pipeline DEVE ser emitido normalmente.
    """
    now = datetime.now(timezone.utc)
    fresh_date = (now - timedelta(minutes=5)).isoformat()
    mock_services = [
        _build_service("DNA.MonitorServiceSVC", "Em Execução", update_time=fresh_date, hostname="BRRS-PLT-DT01"),
        _build_service("DNA.FileTransferSVC", "Parado", update_time=fresh_date, hostname="BRRS-PLT-DT01"),
    ]

    with patch("media_pipeline_monitor.scan_local_pipeline_media", return_value=[]):
        incidents = get_fleet_pipeline_incidents(mock_services, threshold_delay_min=10.0)
        ft_incidents = [i for i in incidents if i["type"] == "servico_transfer_parado"]
        assert len(ft_incidents) == 1
        assert ft_incidents[0]["hostname"] == "BRRS-PLT-DT01"
        assert ft_incidents[0]["badge_label"] == "FILETRANSFER PARADO"


# ==============================================================================
# 2. SIGNALS ANALYSIS: DIAGNÓSTICO IA COM PRÉ-REQUISITO DE COMUNICAÇÃO
# ==============================================================================

def test_ai_channel_diagnose_returns_indeterminate_on_stale_agent():
    """
    Ao executar diagnóstico de canal com IA (ex: Pelotas RBS TV),
    se o host estiver com DNA.MonitorServiceSVC sem comunicação recente (> 20 min),
    o diagnóstico DEVE retornar status INDETERMINADO / Telemetria Suspensa, sem falso alarme físico de RF.
    """
    now = datetime.now(timezone.utc)
    stale_date = (now - timedelta(minutes=45)).isoformat()
    mock_cached = {
        "services": [
            _build_service("DNA.MonitorServiceSVC", "Em Execução", update_time=stale_date, hostname="BRRS-PLT-DT01", praca="Pelotas", cs=1)
        ],
        "channels": []
    }

    with patch("sharepoint_sync.get_cached_data", return_value=mock_cached):
        diag = diagnose_channel_with_ai("Pelotas", "RBS TV HD", period="24h", cs=1, host="BRRS-PLT-DT01")
        assert diag["status"] == "indeterminado"
        assert diag["status_diagnostico"] == "INDETERMINADO"
        assert diag["is_stale"] is True
        assert "Telemetria Suspensa" in diag["causa_raiz"]
        assert "Telemetria Suspensa" in diag["diagnostico_tecnico"]
        assert "DNA.MonitorServiceSVC" in diag["diagnostico_tecnico"]


# ==============================================================================
# 3. INCIDENT MANAGER: ANOMALY TELEMETRY SUPPRESSION
# ==============================================================================

def test_anomaly_telemetry_suppressed_when_channel_is_stale_or_degraded():
    """
    Canais marcados com is_degraded=True ou has_outage=False (telemetria atrasada)
    NÃO podem registrar Video Congelado nem Áudio Mudo na base SQLite de anomalias temporais.
    """
    init_anomaly_telemetry_db()
    mock_channel = {
        "cidade": "Caxias do Sul",
        "canal": "RBS TV Caxias",
        "id_cs": 1,
        "meio": "Digital Terrestre",
        "video_congelado": "Sim",  # Dado bruto diz Sim
        "audio_mudo": "Não",
        "is_degraded": True,       # Mas a telemetria do host está atrasada
        "has_outage": False,
        "motivo": "Telemetria Atrasada (>20m sem novo reporte)"
    }

    track_channel_anomalies_cycle([mock_channel])

    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM channel_anomaly_telemetry
            WHERE channel_key LIKE '%caxias%' AND is_active = 1
        """)
        active_count = cursor.fetchone()[0]
        assert active_count == 0, "Canal com telemetria estagnada/is_degraded não pode registrar anomalia ativa!"


# ==============================================================================
# 4. TRACKING DETECTION MONITOR: STATUS INDETERMINADO PARA SERVIÇOS EM HOST COMM_LOST
# ==============================================================================

def test_tracking_detection_services_reported_indeterminate_when_comm_lost():
    """
    Host CS01 sem telemetria conclusiva (COMM_LOST, > 20 min).
    Os serviços locais que constam como 'Parado' ou 'Inexistente'
    devem ser apresentados como 'Indeterminado' no pipeline_services.
    """
    now = datetime.now(timezone.utc)
    delayed_date = (now - timedelta(minutes=50)).isoformat()
    mock_services = [
        _build_service("FastMatchingSvc", "Parado", update_time=delayed_date, hostname="BRPA-CAH-DT01", praca="Castanhal", cs=1),
        _build_service("DNA.DetectionSVC", "Inexistente", update_time=delayed_date, hostname="BRPA-CAH-DT01", praca="Castanhal", cs=1),
        _build_service("DNA.ConfigMonitorSVC", "Parado", update_time=delayed_date, hostname="BRPA-CAH-DT01", praca="Castanhal", cs=1),
        _build_service("DNA.MonitorServiceSVC", "Em Execução", update_time=delayed_date, hostname="BRPA-CAH-DT01", praca="Castanhal", cs=1),
    ]

    with patch("tracking_detection_monitor.get_fleet_services", return_value=mock_services):
        snap = build_detection_fleet_snapshot()
        site = snap["sites"][0]

        assert site["health_status"] == "COMM_LOST"
        ps = site["pipeline_services"]
        assert ps["fast_matching"]["status"] == "Indeterminado"
        assert ps["detection_svc"]["status"] == "Indeterminado"
        assert ps["config_monitor"]["status"] == "Indeterminado"


# ==============================================================================
# 5. FRONTEND APP.JS AUDIT: REGRAS RÍGIDAS DE SUPRESSÃO
# ==============================================================================

def test_app_js_contains_stale_comm_hosts_set():
    """
    Valida que dashboard/static/js/app.js define staleCommHostsSet (diff_hours > 0.33)
    e o utiliza para suprimir falsos alarmes de canal, pipeline e limiares de hardware.
    """
    js_path = DASHBOARD_DIR / "static" / "js" / "app.js"
    content = js_path.read_text(encoding="utf-8")

    assert "const staleCommHostsSet = new Set(" in content, "staleCommHostsSet deve estar definido no app.js"
    assert "h.diff_hours > 0.33 || !h.agent_running" in content, "Critério de > 20 min (0.33h) ou agente inativo deve existir no app.js"
    assert "staleCommHostsSet.has(chHost)" in content, "Filtro de canais deve suprimir hosts sem comunicação recente"
    assert "staleCommHostsSet.has(pHost)" in content, "Filtro de pipeline deve suprimir hosts sem comunicação recente"
    assert "staleCommHostsSet.has(bHost)" in content, "Filtro de threshold deve suprimir hosts sem comunicação recente"
    assert "⚪ Indeterminado" in content, "Tabela de serviços deve exibir badge de Indeterminado para hosts sem comunicação"
