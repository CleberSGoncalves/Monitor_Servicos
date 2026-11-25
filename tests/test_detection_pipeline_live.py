import pytest
import os
import sys

dashboard_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard"))
if dashboard_dir not in sys.path:
    sys.path.insert(0, dashboard_dir)

import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app import app
from tracking_detection_monitor import (
    get_cs01_fastmatching_hosts,
    get_fastmatching_pipeline_live,
    parse_fma_log_content
)

client = TestClient(app)

SAMPLE_FMA_LOG = """
2026-11-24 02:15:00: DNAConfigXmlProvider. Loaded spots "D:\\MediaDNA_V2\\Data\\Config\\ConfigXml.xml"
2026-11-24 02:15:05: XmlUpdate: Updated '12480' spots in 3 seconds. (recon=15)
2026-11-24 02:15:10: RAM usage. Private Working Set: 412Mb
2026-11-24 02:15:10: RAM usage. Working Set: 480Mb
2026-11-24 02:15:12: SearchStats [CH1]: 50 ccd packets, 1000ms of content in 2.5ms, NumFingers=25400
2026-11-24 02:16:30: [1047](CH1) NEW DETECTION 98124, 0, 0, 30000ms, "2026-11-24 02:16:00", ProcTimeMs 42
2026-11-24 02:18:10: [1047](CH1) NEW DETECTION 98125, 0, 0, 15000ms, "2026-11-24 02:17:50", ProcTimeMs 38
"""

def test_parse_fma_log_content():
    lines = [line for line in SAMPLE_FMA_LOG.splitlines() if line.strip()]
    parsed = parse_fma_log_content(lines)
    assert parsed is not None
    assert parsed.get("has_detections") is True
    assert parsed.get("last_detection") is not None
    assert parsed["last_detection"]["spot_id"] == "98125"
    assert parsed.get("search_stats") is not None
    assert parsed["search_stats"]["num_fingers"] == 25400
    assert parsed.get("ram_usage") is not None
    assert parsed["ram_usage"]["private_mb"] == 412

def test_get_cs01_fastmatching_hosts():
    hosts = get_cs01_fastmatching_hosts()
    assert isinstance(hosts, list)
    for h in hosts:
        assert "hostname" in h
        assert "praca" in h

def test_api_fma_cs01_hosts():
    response = client.get("/api/detection/fma-cs01-hosts")
    assert response.status_code == 200
    data = response.json()
    assert "hosts" in data
    assert isinstance(data["hosts"], list)

def test_api_fma_live_endpoint_mocked():
    with patch("tracking_detection_monitor.get_fastmatching_pipeline_live") as mock_live:
        mock_live.return_value = {
            "hostname": "Uberlandia-SMME-284-CS1",
            "praca": "Uberlândia",
            "timestamp": "2026-11-24T14:30:00Z",
            "log_path": r"D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log",
            "raw_log_tail": SAMPLE_FMA_LOG,
            "status_geral": "NOMINAL",
            "status_badge": "🟢 Operação Nominal",
            "spots": {
                "total_catalog": 12480,
                "sync_status": "Sincronizado",
                "new_spots_today": 15,
                "last_sync": "2026-11-24 02:15:05"
            },
            "detections": {
                "recon_count_total": 2,
                "recent_matches": [
                    {"spot_id": "98124", "spot_name": "COMERCIAL_COCA_COLA_30S", "channel": "TV GLOBO HD", "proc_time": "42ms", "confidence": "99.2%"}
                ]
            },
            "emu_flow": {
                "active": True,
                "cpm": 1.0,
                "last_file": "H284_PV1047_20261124142900000.EMU",
                "status": "Gravando Continuamente"
            }
        }

        res = client.get("/api/detection/fma-live/Uberlandia-SMME-284-CS1")
        assert res.status_code == 200
        data = res.json()
        assert data["hostname"] == "Uberlandia-SMME-284-CS1"
        assert data["status_geral"] == "NOMINAL"
        assert data["spots"]["total_catalog"] == 12480
        assert len(data["detections"]["recent_matches"]) == 1

def test_pipeline_live_modal_dom_elements():
    """Valida a presença obrigatória do modal detectionPipelineLiveModal e do botão global no HTML."""
    from bs4 import BeautifulSoup
    index_path = os.path.join(dashboard_dir, "static", "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    # 1. Botão do topo para abrir o modal
    btn_global = soup.find(id="btnOpenDetectionLiveGlobal")
    assert btn_global is not None, "Botão btnOpenDetectionLiveGlobal não encontrado no HTML"
    assert "openDetectionPipelineLiveModal" in btn_global.get("onclick", "")

    # 2. Container do Modal
    modal = soup.find(id="detectionPipelineLiveModal")
    assert modal is not None, "Modal detectionPipelineLiveModal não encontrado no HTML"

    # 3. Elementos internos vitais
    select_host = soup.find(id="fmaLiveHostSelect")
    assert select_host is not None, "Seletor fmaLiveHostSelect não encontrado dentro do modal"

    modal_body = soup.find(id="fmaLiveModalBody")
    assert modal_body is not None, "Container fmaLiveModalBody não encontrado dentro do modal"

    auto_refresh = soup.find(id="fmaLiveAutoRefreshToggle")
    assert auto_refresh is not None, "Toggle fmaLiveAutoRefreshToggle não encontrado dentro do modal"

    footer_status = soup.find(id="fmaLiveFooterStatus")
    assert footer_status is not None, "Status fmaLiveFooterStatus não encontrado dentro do modal"

