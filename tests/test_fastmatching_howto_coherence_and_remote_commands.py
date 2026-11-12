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
    Garante que a telemetria gerada para São Paulo (BRSP-RADIO-BKP2) seja
    rigorosamente consistente entre o snapshot da frota e a consulta direta de logs fma.log.
    """
    # 1. Consulta direta por nó (como a rota /api/fleet/detection/fastmatching/logs/BRSP-RADIO-BKP2 faz)
    t_direct = get_fastmatching_node_telemetry("BRSP-RADIO-BKP2")
    assert t_direct is not None
    assert "last_detection" in t_direct
    assert t_direct["last_detection"]["proc_time_ms"] == 3747
    assert t_direct["delayed_candidates_count"] == 0
    assert "São Paulo" in t_direct["source"]

    # 2. Snapshot da frota
    snapshot = build_detection_fleet_snapshot()
    sites = snapshot.get("sites", [])
    sp_sites = [s for s in sites if s.get("hostname") == "BRSP-RADIO-BKP2"]
    assert len(sp_sites) == 1, "São Paulo CS01 deve existir na frota"

    sp_site = sp_sites[0]
    t_fleet = sp_site.get("fastmatching_telemetry")
    assert t_fleet is not None, "São Paulo deve possuir telemetria fastmatching"

    # 3. Comprovação matemática de Single Source of Truth
    assert t_fleet["last_detection"]["proc_time_ms"] == t_direct["last_detection"]["proc_time_ms"]
    assert t_fleet["delayed_candidates_count"] == t_direct["delayed_candidates_count"]
    assert t_fleet["ram_usage"]["private_mb"] == t_direct["ram_usage"]["private_mb"]
    assert t_fleet["search_stats"]["search_ms"] == t_direct["search_stats"]["search_ms"]
    assert t_fleet["search_stats"]["num_fingers"] == t_direct["search_stats"]["num_fingers"]


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
