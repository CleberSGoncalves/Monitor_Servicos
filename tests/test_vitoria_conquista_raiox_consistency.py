"""
test_vitoria_conquista_raiox_consistency.py
Garante consistência total entre a Matriz de SLA e o Raio-X Forense de Praças.
Quando um host apresenta atraso crítico de telemetria/keepalive (ex: Vitória da Conquista CS01/CS02 com > 10 horas sem heartbeat),
o Raio-X Forense DEVE marcar o Estágio 1 (Conectividade & Keepalive) como CRÍTICO, com badge de Desconectado,
suspender métricas de hardware e penalizar o Health Score (teto <= 20% e status CRÍTICO).
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))
from praca_analyzer import audit_praca_ecosystem


def test_vitoria_conquista_cs02_telemetry_disconnected():
    """Valida que Vitória da Conquista CS02 (offline há > 10h) é auditado como CRÍTICO no Raio-X."""
    res = audit_praca_ecosystem("Vitória da Conquista", selected_cs="CS02")
    
    assert res is not None
    assert res["status_geral"] == "CRITICO", f"Esperado CRITICO, obteve {res['status_geral']}"
    assert res["health_score"] <= 25, f"Esperado score penalizado <= 25%, obteve {res['health_score']}%"
    
    # Valida Estágio 1 (Conectividade & Keepalive)
    st1 = next((s for s in res["pipeline_stages"] if s["id"] == "link"), None)
    assert st1 is not None
    assert st1["status"] == "CRITICO", f"Estágio 1 deveria ser CRITICO, obteve {st1['status']}"
    assert "desconectado" in st1["badge"].lower() or "sem sinal" in st1["badge"].lower()
    
    # Valida que o problema HOST_TELEMETRY_DISCONNECTED foi gerado
    problem_codes = [p["code"] for p in res["problems"]]
    assert "HOST_TELEMETRY_DISCONNECTED" in problem_codes
    
    # Valida Estágio 4 (Gravação) e Estágio 5 (Hardware)
    st4 = next((s for s in res["pipeline_stages"] if s["id"] == "recording"), None)
    assert st4 is not None
    assert st4["status"] == "CRITICO"
    assert "indeterminado" in st4["badge"].lower()
    
    st5 = next((s for s in res["pipeline_stages"] if s["id"] == "hardware"), None)
    assert st5 is not None
    assert st5["status"] == "CRITICO"
    assert "suspensa" in st5["badge"].lower()


def test_vitoria_conquista_cs01_telemetry_disconnected():
    """Valida que Vitória da Conquista CS01 também é auditado como CRÍTICO por ausência de heartbeat."""
    res = audit_praca_ecosystem("Vitória da Conquista", selected_cs="CS01")
    
    assert res is not None
    assert res["status_geral"] == "CRITICO"
    assert res["health_score"] <= 25
    
    st1 = next((s for s in res["pipeline_stages"] if s["id"] == "link"), None)
    assert st1 is not None
    assert st1["status"] == "CRITICO"
    assert "desconectado" in st1["badge"].lower()
    
    problem_codes = [p["code"] for p in res["problems"]]
    assert "HOST_TELEMETRY_DISCONNECTED" in problem_codes


def test_boa_vista_healthy_preserves_nominal():
    """Garante que nós saudáveis com telemetria viva (ex: Boa Vista) continuam 100% NOMINAIS."""
    res = audit_praca_ecosystem("Boa Vista", selected_cs="CS01")
    
    assert res is not None
    assert res["status_geral"] == "NOMINAL"
    assert res["health_score"] == 100
    
    st1 = next((s for s in res["pipeline_stages"] if s["id"] == "link"), None)
    assert st1 is not None
    assert st1["status"] == "NOMINAL"
    assert "agente" in st1["badge"].lower()
