import pytest
from datetime import datetime, timezone
import sys
from pathlib import Path

# Adiciona dashboard ao path
DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
if str(DASHBOARD_DIR) not in sys.path:
    sys.path.insert(0, str(DASHBOARD_DIR))

def test_pipeline_live_initial_15_detections_for_remote_hosts():
    """Valida que um nó remoto inicializa com no mínimo 15 detecções reais do catálogo acústico SGG."""
    from tracking_detection_monitor import get_fastmatching_pipeline_live
    
    st = get_fastmatching_pipeline_live("Cascavel-SMME-215-CS1")
    recent = st.get("recent_detections", [])
    assert len(recent) >= 15, f"Esperado pelo menos 15 detecções, obteve {len(recent)}"
    
    # Valida estrutura do primeiro comercial
    first = recent[0]
    assert "timestamp" in first
    assert "channel" in first
    assert "spot_name" in first
    assert first["confidence_score"] >= 98.0
    assert first["status"] == "CONFIRMED"

def test_rf_analysis_empty_history_does_not_have_null_crash():
    """Valida que o backend de RF retorna dicionário sanitizado com chaves padronizadas quando não há dados suficientes."""
    from signals_analysis import get_channel_telemetry_history
    
    res = get_channel_telemetry_history("Cachoeiro de Itapemirim", "Canal Inexistente Fake", "7d", cs=1)
    assert res.get("sem_dados") is True
    assert "stability_index_pct" in res
    assert "lock_drops_count" in res
    assert "history_points" in res
    assert res.get("lock_drops_count") == 0

def test_streaming_portal_files_do_not_contain_hardcoded_date():
    """Valida que os arquivos de portal de streaming não contêm 'const hojeStr = \"25/11/2026\"' hardcoded."""
    docs_path = Path(r"E:\desenvolvimento\Monitor_Esportes\docs\index.html")
    portal_path = Path(r"E:\desenvolvimento\Monitor_Esportes\portal_web\index.html")
    
    for p in [docs_path, portal_path]:
        if p.exists():
            text = p.read_text(encoding="utf-8")
            assert 'const hojeStr = "25/11/2026";' not in text, f"Encontrado hardcoded em {p}"
            assert "getFormatBrDate" in text, f"Faltando função getFormatBrDate dinâmica em {p}"
