import pytest
from datetime import datetime, timezone
import sys
from pathlib import Path

# Garantir que dashboard esteja no path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from tracking_detection_monitor import (
    parse_fma_log_content,
    get_fastmatching_node_telemetry,
    build_detection_fleet_snapshot
)


def test_parse_fma_log_content_nominal_detections():
    """Valida extração cirúrgica de NEW DETECTION e ProcTimeMs do fma.log."""
    sample_lines = [
        "376 2026-11-05 00:33:01: [3128,399,001](V101) NEW DETECTION 17738882,0,1793849540819,29000ms,'2026-11-05T03:32:29.839' (UTC),Bin=06/Emu=88(1),V101 ProcTimeMs 1037, Val",
        "377 2026-11-05 00:33:01: [3128,399,001](V101) NEW DETECTION 17956907,0,1793849488911,60304ms,'2026-11-05T03:31:28.911' (UTC),Bin=08/Emu=94(2),V101 ProcTimeMs 998, Val"
    ]
    parsed = parse_fma_log_content(sample_lines)

    assert parsed["has_detections"] is True
    assert parsed["last_detection"] is not None
    assert parsed["last_detection"]["spot_id"] == "17956907"
    assert parsed["last_detection"]["proc_time_ms"] == 998
    assert parsed["last_detection"]["duration_ms"] == 60304
    assert parsed["last_detection"]["channel_code"] == "3128,399,001"
    assert len(parsed["events"]) == 2
    assert parsed["events"][0]["badge"] == "NEW MATCH"


def test_parse_fma_log_content_delayed_candidates_warning():
    """Valida detecção de alertas de candidatos atrasados (buffer defasado)."""
    sample_lines = [
        "404 2026-11-05 00:38:08: [3127,399,001](V30) *WARNING* DELAYED NEW DETECTION CANDIDATE 17957735,0,1793846599664,9648ms,'2026-11-05T02:43:19.664' (UTC),69",
        "405 2026-11-05 00:38:08: [3127,399,001](V30) *WARNING* DELAYED NEW DETECTION CANDIDATE 17957735,0,1793846535871,12672ms,'2026-11-05T02:42:15.871' (UTC),69"
    ]
    parsed = parse_fma_log_content(sample_lines)

    assert parsed["has_delayed_warning"] is True
    assert parsed["delayed_candidates_count"] == 2
    assert len(parsed["delayed_candidates"]) == 2
    assert parsed["delayed_candidates"][0]["spot_id"] == "17957735"
    assert parsed["delayed_candidates"][0]["confidence"] == 69
    assert parsed["events"][0]["badge"] == "DELAYED MATCH"
    assert parsed["events"][0]["color"] == "yellow"


def test_parse_fma_log_content_search_stats_and_ram():
    """Valida estatísticas de busca, NumFingers e consumo de memória RAM."""
    sample_lines = [
        "383 2026-11-05 00:34:00: FromRecon [3127,399,001](V30): SearchStats V30: 2 ccd packets searched with 120000ms of content in 87.95ms. OptLevel=5. NumFingers=8442",
        "399 2026-11-05 00:36:22: RAM usage. Private Working Set: 9534Mb",
        "400 2026-11-05 00:36:22: RAM usage. Working Set: 1161Mb"
    ]
    parsed = parse_fma_log_content(sample_lines)

    assert parsed["search_stats"] is not None
    assert parsed["search_stats"]["num_fingers"] == 8442
    assert parsed["search_stats"]["search_ms"] == 87.95
    assert parsed["search_stats"]["packets"] == 2

    assert parsed["ram_usage"] is not None
    assert parsed["ram_usage"]["private_mb"] == 9534
    assert parsed["ram_usage"]["working_set_mb"] == 1161


def test_parse_fma_log_content_catalog_reload():
    """Valida eventos de recarga do catálogo ConfigXml.xml."""
    sample_lines = [
        "401 2026-11-05 00:36:52: DNAConfigXmlProvider. Detected a change in 'D:\\MediaDNA_V2\\Data\\Config\\ConfigXml.xml'. Updating spots...",
        "402 2026-11-05 00:38:07: XmlUpdate: Updated '2' spots from config XML file in 75 seconds. (recon=0)",
        "403 2026-11-05 00:38:07: DNAConfigXmlProvider. Loaded spots '17957733,17957735'"
    ]
    parsed = parse_fma_log_content(sample_lines)

    assert parsed["catalog_reload"] is not None
    assert parsed["catalog_reload"]["spots_count"] == 2
    assert parsed["catalog_reload"]["duration_sec"] == 75
    assert parsed["catalog_reload"]["loaded_spots"] == ["17957733", "17957735"]
    assert any(ev["badge"] == "CONFIG RELOAD" for ev in parsed["events"])


def test_get_fastmatching_node_telemetry_structure():
    """Valida estrutura completa retornada por get_fastmatching_node_telemetry."""
    tel = get_fastmatching_node_telemetry("BRPE-CRU-DT01", "Caruaru")
    assert "has_detections" in tel
    assert "last_detection" in tel
    assert "delayed_candidates_count" in tel
    assert "search_stats" in tel
    assert "ram_usage" in tel
    assert "events" in tel


def test_build_detection_fleet_snapshot_enriches_fastmatching():
    """Valida que o snapshot da frota embute fastmatching_telemetry nos nós primários."""
    snapshot = build_detection_fleet_snapshot()
    sites = snapshot.get("sites", [])
    assert len(sites) > 0

    fm_sites = [s for s in sites if s.get("fastmatching_telemetry")]
    assert len(fm_sites) > 0
    sample = fm_sites[0]
    assert sample["fastmatching_telemetry"]["has_detections"] is True


def test_fastmatching_logs_api_endpoint():
    """Valida endpoint HTTP FastAPI /api/fleet/detection/fastmatching/logs/{hostname}."""
    from fastapi.testclient import TestClient
    from app import app

    client = TestClient(app)
    response = client.get("/api/fleet/detection/fastmatching/logs/BRPE-CRU-DT01")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["hostname"] == "BRPE-CRU-DT01"
    assert "telemetry" in data
    assert data["telemetry"]["has_detections"] is True
