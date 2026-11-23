"""
Testes Automatizados para Detecção e Auto-Cura de Falha de Spots no FastMatching (recon=0)
Baseado no caso real de Ponta Porã (CS-BRMS-PPA-DT01)
"""
import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from tracking_detection_monitor import (
    parse_fma_log_content,
    generate_fastmatching_playbook
)
from detection_safe_heal import (
    build_safe_detection_heal_script,
    execute_safe_detection_heal
)
from praca_analyzer import (
    audit_praca_ecosystem,
    generate_ai_solutions_plan
)


def test_parse_fma_log_content_ponta_pora_recon_zero():
    """Valida identificação cirúrgica da falha recon=0 no log real de Ponta Porã."""
    ponta_pora_lines = [
        "2026-11-23 16:23:45: ...",
        "2026-11-23 16:23:50: DNAConfigXmlProvider. Loaded spots '77875,17977881,17977887,17977894,17977904'",
        "2026-11-23 16:23:50: DNAConfigXmlProvider. Detected a change in 'D:\\MediaDNA_V2\\Data\\Config\\ConfigXml.xml'. Updating spots...",
        "2026-11-23 16:23:51: XmlUpdate: Updated '0' spots from config XML file in 1 seconds. (recon=0)",
        "2026-11-23 16:24:00: RAM usage. Private Working Set: 22Mb",
        "2026-11-23 16:24:00: RAM usage. Working Set: 28Mb",
        "2026-11-23 16:24:05: ..."
    ]

    parsed = parse_fma_log_content(ponta_pora_lines)

    assert parsed["catalog_reload"] is not None
    assert parsed["catalog_reload"]["spots_count"] == 0
    assert parsed["catalog_reload"]["recon_count"] == 0
    assert parsed["catalog_recon_zero"] is True
    assert parsed["has_recon_zero_warning"] is True

    # Playbook de resolução
    pb = parsed["playbook"]
    assert pb["severity"] == "CRITICAL"
    assert "recon=0" in pb["problem_title"] or "RAM Ociosa" in pb["problem_title"]
    assert pb["quick_action"] == "safe_heal_fastmatching_recon"
    assert any("SGG" in step for step in pb["steps"])
    assert any("FastMatchingSvc.ini" in step for step in pb["steps"])


def test_build_safe_detection_heal_script_fastmatching_recon_fix():
    """Valida a geração do script PowerShell de Auto-Cura para o modo fastmatching_recon_fix."""
    ps_script = build_safe_detection_heal_script(mode="fastmatching_recon_fix")

    assert "$isReconFix = $true" in ps_script
    assert "$resyncSgg = $true" in ps_script
    assert "ConfigXml.xml" in ps_script
    assert "FastMatchingSvc.ini" in ps_script
    assert "FASTMATCHING_FIX" in ps_script
    assert "FASTMATCHING_AUDIT" in ps_script

    # Blindagem absoluta de .EMU (nenhum Remove-Item em .emu)
    assert "Remove-Item *.emu" not in ps_script
    assert "Remove-Item $emuDir" not in ps_script
    assert "ZERO toque em data\\emu" in ps_script


def test_praca_analyzer_recommends_fastmatching_recon_fix():
    """Valida que a Central de Soluções / Praça Analyzer sugere o passo de Auto-Cura FastMatching."""
    mock_problems = [
        {
            "code": "FASTMATCHING_CATALOG_RECON_ZERO",
            "severity": "CRITICO",
            "category": "Deteccao Comercial",
            "host": "CS-BRMS-PPA-DT01",
            "title": "FastMatching Ocioso / Falha de Carregamento de Spots (recon=0)",
            "detail": "O FastMatchingSvc identificou o catálogo mas carregou 0 spots (recon=0, RAM ociosa).",
            "recommended_action": "fastmatching_recon_fix",
            "action_label": "Auto-Cura FastMatching (recon=0 Fix)"
        }
    ]

    with patch("praca_analyzer.audit_praca_ecosystem") as mock_audit:
        audit_res = {
            "praca": "Ponta Porã",
            "health_score": 35,
            "cs01_host": "CS-BRMS-PPA-DT01",
            "problems": mock_problems,
            "channels": []
        }
        mock_audit.return_value = audit_res

        sol = generate_ai_solutions_plan(audit_res)
        assert sol["praca"] == "Ponta Porã"
        assert len(sol["pipeline_steps"]) >= 1

        step_recon = next((s for s in sol["pipeline_steps"] if s.get("action_payload", {}).get("mode") == "fastmatching_recon_fix"), None)
        assert step_recon is not None
        assert step_recon["action_type"] == "safe_heal"
        assert "recon=0" in step_recon["title"]
        assert step_recon["action_payload"]["hostname"] == "CS-BRMS-PPA-DT01"
