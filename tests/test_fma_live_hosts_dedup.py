import os
import sys
import pytest

# Ajusta path para importar módulos do dashboard
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))

def test_get_cs01_fastmatching_hosts_dedup():
    from tracking_detection_monitor import get_cs01_fastmatching_hosts

    hosts = get_cs01_fastmatching_hosts()
    assert len(hosts) > 0, "Deveria retornar ao menos 1 host CS01"

    # 1. Verifica se Campinas aparece estritamente UMA ÚNICA VEZ
    campinas_entries = [h for h in hosts if h.get("praca", "").strip().lower() == "campinas"]
    assert len(campinas_entries) == 1, f"Campinas deve aparecer exatamente UMA vez! Encontrado: {campinas_entries}"
    assert campinas_entries[0]["hostname"] == "Campinas-SMME-52-CS1", f"O nó de Campinas deve ser o canônico Campinas-SMME-52-CS1, veio {campinas_entries[0]['hostname']}"

    # 2. Verifica ausência absoluta de duplicatas em todas as praças
    pracas = [h.get("praca", "").strip().lower() for h in hosts if h.get("praca")]
    duplicates = [p for p in set(pracas) if pracas.count(p) > 1]
    assert len(duplicates) == 0, f"Existem praças duplicadas na lista de CS01: {duplicates}"

    # 3. Verifica ausência de duplicatas em hostnames
    hostnames = [h.get("hostname", "").strip().upper() for h in hosts if h.get("hostname")]
    dup_hosts = [h for h in set(hostnames) if hostnames.count(h) > 1]
    assert len(dup_hosts) == 0, f"Existem hostnames duplicados na lista de CS01: {dup_hosts}"


def test_fma_live_payload_null_safety():
    from tracking_detection_monitor import get_fastmatching_pipeline_live

    # Testa com Aracaju (que gerou o erro de num_fingers null na imagem do usuário)
    payload = get_fastmatching_pipeline_live("Aracaju-SMME-328-CS1", max_lines=80)
    assert payload.get("success") is True
    assert payload.get("hostname") == "ARACAJU-SMME-328-CS1"
    
    # Valida estrutura de engine_performance
    perf = payload.get("engine_performance", {})
    assert "ram_working_set_mb" in perf
    assert "num_fingers" in perf
    
    # Valida que o payload é JSON-serializável
    import json
    json_str = json.dumps(payload)
    assert len(json_str) > 0
