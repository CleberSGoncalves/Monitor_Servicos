"""
test_vitoria_conquista_raiox_consistency.py
Garante consistência total entre a Matriz de SLA e o Raio-X Forense de Praças.
Quando um host apresenta ausência de comunicação/heartbeat (ex: Vitória da Conquista com > 10 horas offline),
o Raio-X Forense NÃO PODE fingir que sintonizadores estão saudáveis ou que a conexão WAN está operando nominalmente!
Todos os estágios dependentes de telemetria local devem ser marcados como CRÍTICO (Telemetria Suspensa / Link Inacessível).
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))
from praca_analyzer import audit_praca_ecosystem


def test_vitoria_conquista_cs02_telemetry_disconnected():
    """Valida que Vitória da Conquista CS02 (offline há > 10h) suspende telemetria em TODOS os estágios."""
    res = audit_praca_ecosystem("Vitória da Conquista", selected_cs="CS02")
    
    assert res is not None
    assert res["status_geral"] == "CRITICO", f"Esperado CRITICO, obteve {res['status_geral']}"
    assert res["health_score"] <= 25, f"Esperado score penalizado <= 25%, obteve {res['health_score']}%"
    
    # 1. Conectividade & Keepalive
    st1 = next((s for s in res["pipeline_stages"] if s["id"] == "link"), None)
    assert st1 is not None
    assert st1["status"] == "CRITICO"
    assert "desconectado" in st1["badge"].lower()
    
    # 2. Link de Internet WAN
    st2 = next((s for s in res["pipeline_stages"] if s["id"] == "wan_link"), None)
    assert st2 is not None
    assert st2["status"] == "CRITICO", "Link WAN não pode ser nominal se o host está offline!"
    assert "inacessível" in st2["badge"].lower() or "inacessivel" in st2["badge"].lower()
    
    # 3. Sintonizadores & Sinal
    st3 = next((s for s in res["pipeline_stages"] if s["id"] == "signal"), None)
    assert st3 is not None
    assert st3["status"] == "CRITICO", "Sintonizadores não podem ser declarados saudáveis se a máquina está offline!"
    assert "suspensa" in st3["badge"].lower()
    
    # 4. Fluxo de Gravação
    st4 = next((s for s in res["pipeline_stages"] if s["id"] == "recording"), None)
    assert st4 is not None
    assert st4["status"] == "CRITICO"
    assert "suspensa" in st4["badge"].lower()
    
    # 5. Recursos de Hardware
    st5 = next((s for s in res["pipeline_stages"] if s["id"] == "hardware"), None)
    assert st5 is not None
    assert st5["status"] == "CRITICO"
    assert "suspensa" in st5["badge"].lower()
    
    # Valida que o problema HOST_TELEMETRY_DISCONNECTED foi gerado
    problem_codes = [p["code"] for p in res["problems"]]
    assert "HOST_TELEMETRY_DISCONNECTED" in problem_codes


def test_vitoria_conquista_cs01_telemetry_disconnected():
    """Valida que Vitória da Conquista CS01 (nó de detecção offline) suspende matching e WCF."""
    res = audit_praca_ecosystem("Vitória da Conquista", selected_cs="CS01")
    
    assert res is not None
    assert res["status_geral"] == "CRITICO"
    assert res["health_score"] <= 25
    
    st1 = next((s for s in res["pipeline_stages"] if s["id"] == "link"), None)
    assert st1["status"] == "CRITICO"
    
    st2 = next((s for s in res["pipeline_stages"] if s["id"] == "wan_link"), None)
    assert st2["status"] == "CRITICO"
    
    st3 = next((s for s in res["pipeline_stages"] if s["id"] == "signal"), None)
    assert st3["status"] == "CRITICO"
    
    st6 = next((s for s in res["pipeline_stages"] if s["id"] == "detection"), None)
    assert st6["status"] == "CRITICO"
    assert "suspensa" in st6["badge"].lower()
    
    st7 = next((s for s in res["pipeline_stages"] if s["id"] == "dispatch"), None)
    assert st7["status"] == "CRITICO"
    assert "suspensa" in st7["badge"].lower()


def test_boa_vista_healthy_preserves_nominal():
    """Garante que nós saudáveis com telemetria viva (ex: Boa Vista) continuam 100% NOMINAIS."""
    res = audit_praca_ecosystem("Boa Vista", selected_cs="CS01")
    
    assert res is not None
    assert res["status_geral"] == "NOMINAL"
    assert res["health_score"] == 100
    
    st1 = next((s for s in res["pipeline_stages"] if s["id"] == "link"), None)
    assert st1["status"] == "NOMINAL"
    
    st2 = next((s for s in res["pipeline_stages"] if s["id"] == "wan_link"), None)
    assert st2["status"] == "NOMINAL"
    
    st3 = next((s for s in res["pipeline_stages"] if s["id"] == "signal"), None)
    assert st3["status"] == "NOMINAL"
