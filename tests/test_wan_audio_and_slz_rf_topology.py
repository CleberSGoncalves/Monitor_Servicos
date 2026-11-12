import pytest
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DASHBOARD_DIR = ROOT_DIR / "dashboard"
if str(DASHBOARD_DIR) not in sys.path:
    sys.path.insert(0, str(DASHBOARD_DIR))

from media_pipeline_monitor import get_link_monitoring_metrics
from geo_topology import get_markets_map_data
from sharepoint_sync import get_cached_data


def test_link_wan_audio_count_is_positive_and_valid():
    """Valida que o cálculo de canais de áudio na Matriz Link WAN não fica zerado (0 Áudio) para a frota."""
    cached = get_cached_data()
    services = cached.get("services", [])
    channels = cached.get("channels", [])
    assert len(services) > 0, "Deve haver serviços no cache"
    assert len(channels) > 0, "Deve haver canais no cache"

    metrics = get_link_monitoring_metrics(services, channels)
    assert len(metrics) > 0, "Deve gerar métricas de Link WAN"

    # Pelo menos 90% dos nós com vídeo devem reportar áudio capturado (.mp3)
    nodes_with_video = [m for m in metrics if m.get("ch_video_count", 0) > 0]
    nodes_with_audio = [m for m in metrics if m.get("ch_audio_count", 0) > 0]
    assert len(nodes_with_audio) > 0, "Não pode haver 0 nós com áudio na frota"
    assert len(nodes_with_audio) >= len(nodes_with_video) * 0.9, (
        f"Esperado que pelo menos 90% dos nós com vídeo tenham áudio (.mp3), "
        f"obtido: {len(nodes_with_audio)} / {len(nodes_with_video)}"
    )

    # Verifica especificamente São Luís, Pelotas e Caxias do Sul
    csl = next((m for m in metrics if "CSL" in m.get("hostname", "")), None)
    if csl:
        assert csl["ch_audio_count"] > 0, "Caxias do Sul deve ter contagem de áudio > 0"

    plt = next((m for m in metrics if "PLT" in m.get("hostname", "")), None)
    if plt:
        assert plt["ch_audio_count"] > 0, "Pelotas deve ter contagem de áudio > 0"

    slz = next((m for m in metrics if "SLS" in m.get("hostname", "")), None)
    if slz:
        assert slz["ch_audio_count"] >= 5, "São Luís deve reportar 5 canais de áudio capturados (.mp3)"


def test_sao_luis_rf_topology_has_5_muxes_on_both_cs():
    """Valida que São Luís possui os 5 multiplexes completos no CS01 e CS02 correspondentes ao Atria Capture."""
    cached = get_cached_data()
    channels = cached.get("channels", [])
    services = cached.get("services", [])

    markets = get_markets_map_data(channels, services)
    slz_market = next((m for m in markets if m.get("cidade") == "São Luís"), None)
    assert slz_market is not None, "São Luís deve estar presente no catálogo topográfico"

    cs_info = slz_market.get("available_cs_info", [])
    assert len(cs_info) >= 2, "São Luís deve ter pelo menos CS01 e CS02"

    cs1 = next((c for c in cs_info if c.get("cs") == 1), None)
    cs2 = next((c for c in cs_info if c.get("cs") == 2), None)
    assert cs1 is not None and cs1.get("channels_count") == 5, (
        f"CS01 de São Luís deve ter 5 canais, obtido: {cs1.get('channels_count') if cs1 else None}"
    )
    assert cs2 is not None and cs2.get("channels_count") == 5, (
        f"CS02 de São Luís deve ter 5 canais, obtido: {cs2.get('channels_count') if cs2 else None}"
    )

    rf_details = slz_market.get("channels_rf_detail", [])
    assert len(rf_details) == 10, f"São Luís deve ter 10 registros consolidados (5 CS01 + 5 CS02), obtido: {len(rf_details)}"

    expected_channels = ["Record TV", "Rede TV", "SBT", "BAND", "MIRANTE"]
    for expected in expected_channels:
        matched = [ch for ch in rf_details if expected.lower() in ch.get("emissora", "").lower() or expected.lower() in ch.get("raw_channel_name", "").lower()]
        assert len(matched) >= 2, f"Canal '{expected}' deve estar presente na CS01 e CS02 de São Luís"
