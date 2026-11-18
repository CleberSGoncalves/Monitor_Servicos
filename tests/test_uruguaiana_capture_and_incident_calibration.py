import os
import sys
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("dashboard"))
import pytest
from dashboard.gcp_sync import _FALLBACK_IDHOST_MAP, _RAW_HOST_IDENTITY_OVERRIDES
from dashboard.tracking_detection_monitor import build_detection_fleet_snapshot

def test_uruguaiana_identity_and_engine_mapping():
    """Valida mapeamento correto de IDs e motor de captura de Uruguaiana."""
    # IDs reais
    assert _FALLBACK_IDHOST_MAP.get(("uruguaiana", 1)) == 306
    assert _FALLBACK_IDHOST_MAP.get(("uruguaiana", 2)) == 307

    # Overrides de NetBIOS
    assert _RAW_HOST_IDENTITY_OVERRIDES.get("BRRS-UGN-ATRIA-") == ("Uruguaiana", 307, 2)
    assert _RAW_HOST_IDENTITY_OVERRIDES.get("BRRS-UGN-ATRIA--DT01") == ("Uruguaiana", 306, 1)
    assert _RAW_HOST_IDENTITY_OVERRIDES.get("BRRS-UGN-ATRIA--DT02") == ("Uruguaiana", 307, 2)

    # Restauração de colisão 15 chars em gcp_sync.py: Uruguaiana opera Atria Capture (e não DNA.DetectionSVC)
    gcp_sync_path = os.path.join("dashboard", "gcp_sync.py")
    with open(gcp_sync_path, "r", encoding="utf-8") as f:
        src = f.read()
    assert '"BRRS-UGN-ATRIA-": ("Uruguaiana", 306, 1, "Atria Capture")' in src

def test_rio_de_janeiro_uses_fastmatching_engine():
    """Valida que Rio de Janeiro CS1 opera com FastMatching e não com DetectionSVC legado."""
    gcp_sync_path = os.path.join("dashboard", "gcp_sync.py")
    with open(gcp_sync_path, "r", encoding="utf-8") as f:
        src = f.read()
    assert '"BRRJ-RJO-ATRIA-": ("Rio de Janeiro", 237, 1, "FastMatchingSvc")' in src

def test_detection_pipeline_no_synthetic_bottlenecks():
    """Valida que a esteira de detecção não gera falsos gargalos sintéticos para Florianópolis, Rio e Uruguaiana."""
    snapshot = build_detection_fleet_snapshot()
    sites = {s.get("praca"): s for s in snapshot.get("sites", [])}

    # Florianópolis CS1 deve estar NOMINAL sem CONFIGMONITOR_WCF sintético
    if "Florianópolis" in sites:
        fln = sites["Florianópolis"]
        assert fln.get("pipeline_bottleneck") != "CONFIGMONITOR_WCF"
        assert fln.get("health_status") in ("NOMINAL", "COMM_LOST")

    # Rio de Janeiro CS1 não pode emitir gargalo falso de TRACKING
    if "Rio de Janeiro" in sites:
        rio = sites["Rio de Janeiro"]
        assert rio.get("pipeline_bottleneck") != "TRACKING"

    # Uruguaiana CS1 deve estar NOMINAL
    if "Uruguaiana" in sites:
        ugn = sites["Uruguaiana"]
        assert ugn.get("health_status") in ("NOMINAL", "COMM_LOST")

def test_csharp_agent_atria_process_and_tmp_audit():
    """Valida que o agente C# reconhece DigitalTVReceiver e arquivos .tmp de gravação aberta."""
    launcher_cs = os.path.join("WinServiceFleetAgent", "Core", "InteractiveProcessLauncher.cs")
    with open(launcher_cs, "r", encoding="utf-8") as f:
        content = f.read()
    assert '"DigitalTVReceiver"' in content
    # Deve constar em AtriaMainProcessNames
    assert 'AtriaMainProcessNames = { "DigitalTVCapture", "AtriaCapture", "Atria", "DigitalTVReceiver" }' in content

    channel_cs = os.path.join("WinServiceFleetAgent", "Core", "ChannelOrchestrator.cs")
    with open(channel_cs, "r", encoding="utf-8") as f:
        ch_content = f.read()
    # Deve auditar arquivos .tmp
    assert '.Extension.Equals(".tmp"' in ch_content
    assert 'Sim (Captura Ativa .TMP)' in ch_content

def test_frontend_app_js_rules():
    """Valida que app.js possui regras de supressão de falsos alarmes de gravação e telemetria zumbi."""
    app_js = os.path.join("dashboard", "static", "js", "app.js")
    with open(app_js, "r", encoding="utf-8") as f:
        js = f.read()

    # Broaden Atria
    assert 'sn === "atria capture" || sn.includes("atria") || sn.includes("digitaltv") || sn.includes("dtvcapture")' in js
    # Reconhece .tmp na gravação
    assert 'mp4.includes("tmp")' in js
    # Reconhece canais da mesma praça para validar captura
    assert 'pracaHasActiveRecording' in js
    # Supressão de telemetria zumbi > 2880 min (48h)
    assert 'diffMin > 2880' in js
