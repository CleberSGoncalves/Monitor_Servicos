"""
Testes automatizados da Sub-Aba Dedicada do FastMatching C++ e Auditoria de Duração de Spots Cadastrados (Menor vs Maior Spot & Detecção de Divergência no SGG).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

import pytest
from tracking_detection_monitor import (
    compute_spot_duration_stats,
    parse_fma_log_content,
    get_fastmatching_node_telemetry
)


def test_compute_spot_duration_stats_nominal():
    """Valida cálculo de métricas para catálogo com spots nominais (15s a 60s)."""
    nominal_spots = [
        {"spot_id": "17957731", "duration_ms": 15000},
        {"spot_id": "17957732", "duration_ms": 30000},
        {"spot_id": "17957733", "duration_ms": 30000},
        {"spot_id": "17957734", "duration_ms": 45000},
        {"spot_id": "17957735", "duration_ms": 60000},
    ]
    stats = compute_spot_duration_stats(nominal_spots)

    assert stats["total_spots"] == 5
    assert stats["min_spot"]["spot_id"] == "17957731"
    assert stats["min_spot"]["duration_sec"] == 15.0
    assert stats["min_spot"]["conformity"] == "NORMAL"

    assert stats["max_spot"]["spot_id"] == "17957735"
    assert stats["max_spot"]["duration_sec"] == 60.0
    assert stats["max_spot"]["conformity"] == "NORMAL"

    assert stats["avg_duration_sec"] == 36.0
    assert stats["has_divergence_alert"] is False
    assert stats["divergence_level"] == "NORMAL"
    assert "CADASTRO CONSISTENTE" in stats["divergence_message"]


def test_compute_spot_duration_stats_short_anomaly():
    """Valida alerta crítico quando há spot cadastrado com menos de 5 segundos (<5s)."""
    anomalous_spots = [
        {"spot_id": "17957720", "duration_ms": 2500},  # 2.5s (anomalia grave no SGG)
        {"spot_id": "17957731", "duration_ms": 15000},
        {"spot_id": "17957732", "duration_ms": 30000},
        {"spot_id": "17957735", "duration_ms": 60000},
    ]
    stats = compute_spot_duration_stats(anomalous_spots)

    assert stats["min_spot"]["spot_id"] == "17957720"
    assert stats["min_spot"]["duration_sec"] == 2.5
    assert stats["min_spot"]["conformity"] == "ANOMALY_SHORT"

    assert stats["has_divergence_alert"] is True
    assert stats["divergence_level"] == "CRITICAL"
    assert "ANOMALIA DE CADASTRO" in stats["divergence_message"]
    assert "2.5s" in stats["divergence_message"]


def test_compute_spot_duration_stats_long_anomaly():
    """Valida alerta quando há spot excessivamente longo (>180s) saturando buffers EMU."""
    anomalous_spots = [
        {"spot_id": "17957731", "duration_ms": 15000},
        {"spot_id": "17957732", "duration_ms": 30000},
        {"spot_id": "17957749", "duration_ms": 360000},  # 360s (6 minutos)
    ]
    stats = compute_spot_duration_stats(anomalous_spots)

    assert stats["max_spot"]["spot_id"] == "17957749"
    assert stats["max_spot"]["duration_sec"] == 360.0
    assert stats["max_spot"]["conformity"] == "ANOMALY_LONG"

    assert stats["has_divergence_alert"] is True
    assert stats["divergence_level"] == "WARNING"
    assert "360.0s" in stats["divergence_message"]


def test_compute_spot_duration_stats_empty():
    """Valida comportamento defensivo para catálogo vazio."""
    stats = compute_spot_duration_stats([])
    assert stats["total_spots"] == 0
    assert stats["min_spot"] is None
    assert stats["max_spot"] is None
    assert stats["has_divergence_alert"] is False


def test_parse_fma_log_content_extracts_spot_duration_stats():
    """Valida que o parser do fma.log popula spot_duration_stats com menor e maior spot."""
    raw_lines = [
        "376 2026-11-05 00:33:01: [3128,399,001](V101) NEW DETECTION 17957731,0,1793849540819,15000ms,'2026-11-05T03:32:29.839' (UTC),Bin=06/Emu=88(1),V101 ProcTimeMs 980, Val",
        "377 2026-11-05 00:33:02: [3128,399,001](V101) NEW DETECTION 17957735,0,1793849488911,60000ms,'2026-11-05T03:31:28.911' (UTC),Bin=08/Emu=94(2),V101 ProcTimeMs 1120, Val",
        "404 2026-11-05 00:38:08: [3127,399,001](V30) *WARNING* DELAYED NEW DETECTION CANDIDATE 17957733,0,1793846599664,30000ms,'2026-11-05T02:43:19.664' (UTC),69"
    ]
    parsed = parse_fma_log_content(raw_lines)

    assert parsed["has_detections"] is True
    assert parsed["spot_duration_stats"] is not None

    stats = parsed["spot_duration_stats"]
    assert stats["total_spots"] == 3
    assert stats["min_spot"]["spot_id"] == "17957731"
    assert stats["min_spot"]["duration_sec"] == 15.0
    assert stats["max_spot"]["spot_id"] == "17957735"
    assert stats["max_spot"]["duration_sec"] == 60.0
    assert stats["has_divergence_alert"] is False


def test_get_fastmatching_node_telemetry_embeds_spots_and_divergence():
    """Valida payload de telemetria para consumo pelo frontend."""
    # Nó nominal
    t_nom = get_fastmatching_node_telemetry("BRSP-CAS-ATRIA")
    assert "spot_duration_stats" in t_nom
    assert t_nom["spot_duration_stats"]["min_spot"] is not None
    assert t_nom["spot_duration_stats"]["max_spot"] is not None
    assert t_nom["spot_duration_stats"]["has_divergence_alert"] is False

    # Nó com teste de divergência
    t_div = get_fastmatching_node_telemetry("TEST-DIVERGENCE-CS01")
    assert t_div["spot_duration_stats"]["has_divergence_alert"] is True
    assert t_div["spot_duration_stats"]["min_spot"]["duration_sec"] < 5.0
    assert t_div["spot_duration_stats"]["max_spot"]["duration_sec"] > 180.0


def test_frontend_dom_elements_for_dedicated_fastmatching_subtab():
    """Valida presença dos elementos da nova sub-aba no HTML."""
    html_file = Path("dashboard/static/index.html")
    assert html_file.exists()
    content = html_file.read_text(encoding="utf-8")

    assert 'id="btnSubTabDetectionFleet"' in content
    assert 'id="btnSubTabDetectionFastMatching"' in content
    assert 'id="subtab-detection-fleet"' in content
    assert 'id="subtab-detection-fastmatching"' in content
    assert 'id="fastMatchingSiteSelect"' in content
    assert 'id="fmMinSpotSec"' in content
    assert 'id="fmMaxSpotSec"' in content
    assert 'id="fmAvgSpotSec"' in content
    assert 'id="fmDispersionRatio"' in content
    assert 'id="fmDivergenceAlertBanner"' in content
    assert 'id="fmSpotsTableBody"' in content
    assert 'id="fmLogTerminalFeed"' in content


def test_frontend_detection_table_is_clean():
    """Valida que a tabela geral CS01 está despoluída (sem inline fma.log ou botão duplicado fma.log)."""
    js_file = Path("dashboard/static/js/detection_monitor.js")
    assert js_file.exists()
    content = js_file.read_text(encoding="utf-8")

    # Verifica que as novas funções da sub-aba existem
    assert "function switchDetectionSubTab(" in content
    assert "function initFastMatchingDedicatedView(" in content
    assert "function renderSpotAuditCards(" in content
    assert "function renderFmLogTelemetry(" in content
    assert "function renderFmSpotsTable(" in content

    # Verifica que a tabela geral foi limpa:
    # Não deve ter o botão "fma.log" dentro de renderDetectionTable
    # Apenas no modal se chamado ou na sub-aba dedicada
    assert "⚡ fma.log: Proc:" not in content
