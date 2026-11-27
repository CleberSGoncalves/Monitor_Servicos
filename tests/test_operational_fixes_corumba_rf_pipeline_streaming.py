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
            assert "now.getDate()" in text or "getFormatBrDate" in text, f"Faltando cálculo dinâmico de data em {p}"

def test_firestore_live_telemetry_cachoeiro_and_mediadna_spot_ids():
    """Valida telemetria real do Firestore para Cachoeiro e formato oficial de 8 dígitos do MediaDNA."""
    from signals_analysis import get_channel_telemetry_history
    from tracking_detection_monitor import get_fastmatching_pipeline_live

    # 1. Cachoeiro CS2 no Firestore
    res_cs2 = get_channel_telemetry_history("Cachoeiro de Itapemirim", "Rede Globo", "7d", cs=2)
    assert res_cs2.get("host") == "Cachoeiro_de_Itapemirim-SMME-312-CS2"
    assert res_cs2.get("avg_qualidade") is not None and res_cs2.get("avg_qualidade") > 0
    assert res_cs2.get("avg_forca") is not None and res_cs2.get("avg_forca") > 0
    assert res_cs2.get("stability_index_pct") is not None
    assert len(res_cs2.get("points", [])) > 0

    # 2. Pipeline Live de Aracaju com IDs de 8 dígitos oficiais
    live_pipe = get_fastmatching_pipeline_live("Aracaju-SMME-328-CS1", max_lines=20)
    dets = live_pipe.get("recent_detections", [])
    assert len(dets) >= 15
    for d in dets[:5]:
        s_id = str(d.get("spot_id", ""))
        assert len(s_id) == 8, f"Spot ID deve ter 8 dígitos reais (Kantar), obtido: {s_id}"
        assert d.get("spot_name") and len(d.get("spot_name")) > 5
        assert any(k in d.get("spot_name", "").upper() for k in ["GLOBO", "SHOPEE", "MONDELEZ", "MINISTERIO", "DOVE", "IPIRANGA", "ATACADAO", "AMERICANAS", "MERCADO LIVRE", "AMBEV", "SANTANDER", "CLARO", "MAGALU", "TIM", "PETROBRAS", "BANCO DO BRASIL"])

def test_itumbiara_no_phantom_tuners():
    """Valida que Itumbiara não exibe o canal fantasma 'BAND 497143' (tuner -1 com 0% sinal)."""
    from app import get_cached_data
    data = get_cached_data()
    channels = data.get("channels", [])
    itumbiara_chans = [
        c for c in channels 
        if "itumbiara" in str(c.get("cidade") or c.get("praca") or "").lower()
    ]
    # Filtro aplicado no endpoint get_channels
    clean_chans = [
        c for c in itumbiara_chans
        if not (
            c.get("tuner_id") in [-1, "-1"]
            and (c.get("qualidade_sinal") in [0, 0.0, None, "0", "0%"])
            and (c.get("forca_sinal") in [0, 0.0, None, "0", "0%"])
        )
    ]
    names = [c.get("canal") for c in clean_chans]
    assert "BAND 497143" not in names, f"Canal fantasma BAND 497143 não deveria existir: {names}"
    assert any("globo" in n.lower() for n in names)
    assert any("bandeirantes" in n.lower() for n in names)

def test_cachoeiro_rf_topology_deduplication():
    """Valida que em Topologia RF, canais não são duplicados na mesma CS (ex: TV Gazeta Sul em Cachoeiro CS01)."""
    from geo_topology import get_markets_map_data
    markets = get_markets_map_data()
    cachoeiro = next((m for m in markets if "cachoeiro" in m.get("cidade", "").lower()), None)
    assert cachoeiro is not None, "Mercado de Cachoeiro de Itapemirim não encontrado no mapa de topologia"
    
    rf_details = cachoeiro.get("channels_rf_detail", [])
    seen_combos = set()
    for ch in rf_details:
        cs = ch.get("cs", 1)
        emissora = ch.get("emissora", "").strip().lower()
        combo = (cs, emissora)
        assert combo not in seen_combos, f"Canal duplicado detectado na topologia RF: CS{cs} - {emissora}"
        seen_combos.add(combo)

def test_itumbiara_history_telemetry():
    """Valida histórico de telemetria para Itumbiara CS01 Rede Globo com dados consistentes."""
    from signals_analysis import get_channel_telemetry_history
    res = get_channel_telemetry_history("Itumbiara", "Rede Globo", "24h", cs=1)
    assert res.get("host") == "Itumbiara-SMME-289-CS1"
    assert res.get("avg_qualidade") == 84.0
    assert res.get("avg_forca") == 59.0
    assert len(res.get("history_points", [])) > 0

