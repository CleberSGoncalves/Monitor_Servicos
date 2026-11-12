import pytest
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from tracking_detection_monitor import (
    get_fastmatching_node_telemetry,
    build_detection_fleet_snapshot,
    _FASTMATCHING_FLEET_CACHE
)

def test_sao_paulo_telemetry_coherence_fleet_vs_direct_log():
    """
    Garante que a telemetria do nó seja rigorosamente consistente
    entre o snapshot da frota e a consulta direta de logs/telemetria (Single Source of Truth).
    """
    snapshot = build_detection_fleet_snapshot()
    sites = snapshot.get("sites", [])
    fm_sites = [s for s in sites if s.get("fastmatching_telemetry")]
    assert len(fm_sites) > 0, "Deve existir ao menos um nó FastMatching na frota"

    sample = fm_sites[0]
    host = sample.get("hostname")
    t_fleet = sample.get("fastmatching_telemetry")
    t_direct = get_fastmatching_node_telemetry(host, sample.get("praca"))

    assert t_fleet is not None
    assert t_direct is not None
    assert t_fleet["ram_usage"]["formatted"] == t_direct["ram_usage"]["formatted"]
    assert t_fleet["service_status"] == t_direct["service_status"]
    assert t_fleet["is_running"] == t_direct["is_running"]
    assert t_fleet["is_installed"] == t_direct["is_installed"]


def test_fastmatching_howto_frontend_script_contains_remote_remediation_and_single_log_button():
    """
    Valida se os scripts frontend contêm a lógica de remediação remota PowerShell
    e se os botões duplicados inuteis foram substituídos por comandos remotos.
    """
    js_path = Path("dashboard/static/js/detection_monitor.js")
    assert js_path.exists()
    content = js_path.read_text(encoding="utf-8")

    # Single source of truth em cache enriquecido
    assert "currentFmFleetEnrichedList" in content

    # Função de remediação remota PowerShell
    assert "triggerFmRemoteRemediation" in content
    assert "/api/remote-commands/execute" in content
    assert "restart_fastmatching" in content
    assert "reset_buffers" in content

    # Diagnóstico explícito de Sobrecarga Crítica de CPU (ProcTime >= 3000ms)
    assert "Sobrecarga de CPU / Varredura Lenta" in content
    assert "DNA.DetectionSVC" in content

    # Botão de terminal fma.log sem duplicidade
    assert "Ver Terminal fma.log" in content
    # O antigo botão duplicado foi removido
    assert 'onclick="selectAndAuditFmSite(\'${hostname}\'); closeFmHowToModal();" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 8px 14px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">\n                🔍 Abrir Inspeção Detalhada' not in content
