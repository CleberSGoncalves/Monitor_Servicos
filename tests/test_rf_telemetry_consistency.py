import pytest
import sys
import os
import json

sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("dashboard"))

from geo_topology import get_markets_map_data, diagnose_topology_aiming_tradeoff_with_ai
from sharepoint_sync import get_cached_data
from signals_analysis import get_channel_telemetry_history
from failure_classifier_service import classify_fleet_quality_failures

def test_cache_contains_cim_cs01_and_cs02():
    data = get_cached_data()
    channels = data.get("channels", [])
    cim_channels = [c for c in channels if "itapemirim" in str(c.get("cidade", "")).lower()]
    
    assert len(cim_channels) >= 2, f"Esperado ao menos 2 canais em Cachoeiro de Itapemirim (CS01 e CS02), obtido: {len(cim_channels)}"
    
    cs_values = {int(c.get("cs") or c.get("id_cs") or 1) for c in cim_channels}
    assert 1 in cs_values, "CS01 ausente nos canais de Cachoeiro de Itapemirim"
    assert 2 in cs_values, "CS02 ausente nos canais de Cachoeiro de Itapemirim"
    
    for c in cim_channels:
        assert c.get("qualidade_sinal") == 52.0, f"Qualidade esperada 52.0%, obtida: {c.get('qualidade_sinal')}"
        assert c.get("forca_sinal") == 80.0, f"Força esperada 80.0%, obtida: {c.get('forca_sinal')}"

def test_topology_map_market_consistency():
    data = get_cached_data()
    channels = data.get("channels", [])
    services = data.get("services", [])
    markets = get_markets_map_data(channels, services)
    
    cim = next((m for m in markets if "itapemirim" in m["cidade"].lower()), None)
    assert cim is not None, "Cachoeiro de Itapemirim ausente no mapa topográfico"
    
    assert cim.get("available_cs") == [1, 2], f"Available CSs esperado [1, 2], obtido: {cim.get('available_cs')}"
    
    rf_channels = cim.get("channels_rf_detail", [])
    assert len(rf_channels) >= 2, f"Esperado ao menos 2 canais RF em CIM, obtido: {len(rf_channels)}"
    
    rf_cs = {c.get("cs") for c in rf_channels}
    assert 1 in rf_cs, "CS01 ausente no detalhe RF da topologia em CIM"
    assert 2 in rf_cs, "CS02 ausente no detalhe RF da topologia em CIM"
    
    for ch in rf_channels:
        assert ch.get("rx_level_measured_pct") == 80, f"Nível de força medido deve ser 80%, obtido: {ch.get('rx_level_measured_pct')}"
        assert ch.get("rx_quality_pct") == 52, f"Nível de qualidade medido deve ser 52%, obtido: {ch.get('rx_quality_pct')}"

def test_signals_history_telemetry_accuracy():
    for cs_num in [1, 2]:
        res = get_channel_telemetry_history("Cachoeiro de Itapemirim", "TV Gazeta Sul (Rede Globo)", "24h", cs=cs_num)
        assert res.get("avg_qualidade") >= 50.0, f"CS0{cs_num}: avg_qualidade deve ser >= 50.0%, obtido {res.get('avg_qualidade')}"
        assert res.get("avg_forca") >= 75.0, f"CS0{cs_num}: avg_forca deve ser >= 75.0%, obtido {res.get('avg_forca')}"
        assert res.get("stability_index_pct") >= 90.0, f"CS0{cs_num}: estabilidade deve ser >= 90%, obtido {res.get('stability_index_pct')}"
        points = res.get("history_points", [])
        assert len(points) > 0, f"CS0{cs_num}: deve conter pontos históricos"
        last_p = points[-1]
        assert last_p.get("qualidade") >= 50.0, f"Último ponto de qualidade deve ser >= 50%, obtido {last_p.get('qualidade')}"
        assert last_p.get("forca") >= 75.0, f"Último ponto de força deve ser >= 75%, obtido {last_p.get('forca')}"

def test_failure_classifier_service_health():
    res = classify_fleet_quality_failures()
    assert res.get("status") == "success"
    assert res.get("total_canais_auditados") > 500
    assert len(res.get("tipos_falha_catalogados", [])) >= 9
    assert len(res.get("pracas_resumo", [])) >= 50

def test_topology_ai_tradeoff_payload():
    res = diagnose_topology_aiming_tradeoff_with_ai("Salvador", current_mast_m=25.0)
    assert res.get("status") == "success"
    assert res.get("total_channels") > 0
    assert res.get("actionable_summary") is not None and len(res.get("actionable_summary")) > 10
    assert res.get("ai_report_markdown") is not None and len(res.get("ai_report_markdown")) > 50
