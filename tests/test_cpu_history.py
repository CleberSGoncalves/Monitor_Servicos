"""
test_cpu_history.py
Validação automatizada do serviço de histórico forense de CPU (24h, 7d, 30d)
e detecção de falsos picos estáticos.
"""

import sys
from pathlib import Path
sys.path.insert(0, "dashboard")

import pytest
from cpu_history_service import get_host_cpu_history


def test_cpu_history_nominal_generation():
    """
    Verifica que o histórico de CPU gera as séries temporais corretas para 24h, 7d e 30d
    com limites e veredito forense adequado.
    """
    for period, expected_points in [("24h", 24), ("7d", 8), ("30d", 16)]:
        data = get_host_cpu_history("Vitoria-SMME-223-CS2", period=period)

        assert data["hostname"] == "Vitoria-SMME-223-CS2"
        assert data["period"] == period
        assert len(data["history"]) == expected_points
        assert data["limit_threshold"] == 90

        summary = data["summary"]
        assert "current_cpu" in summary
        assert "avg_cpu" in summary
        assert "max_cpu" in summary
        assert "spikes_over_90" in summary

        # Vitoria CS2 deve operar em nível nominal após saneamento de cache
        assert summary["current_cpu"] <= 50
        assert summary["spikes_over_90"] == 0

        # Processos do Capture Site devem estar listados
        assert len(data["processes"]) >= 3
        proc_names = [p["name"] for p in data["processes"]]
        assert any("Atria Capture" in p for p in proc_names)
        assert any("DNA.MonitorServiceSVC" in p for p in proc_names)

        # Veredito forense deve indicar estabilidade
        assert "estável" in data["verdict"].lower() or "nominal" in data["verdict"].lower()


def test_cpu_history_invalid_period_fallback():
    """
    Verifica que período inválido faz fallback seguro para 24h.
    """
    data = get_host_cpu_history("QualquerHost", period="invalid_period")
    assert data["period"] == "24h"
    assert len(data["history"]) == 24
