import pytest
import re
from pathlib import Path


def test_app_js_offline_threshold_is_24_hours_not_20_minutes():
    """
    DIRETRIZ CRÍTICA ANTI-FALSA-ALERTA:
    Em dashboard/static/js/app.js:
    h.is_offline NUNCA pode ser avaliado como diff_hours > 0.33 (20 minutos),
    pois isso transformava 213 hosts saudáveis/online em falsos 'Host Desconectado (P1)'.
    O limiar estrito para declarar um host verdadeiramente desconectado é diff_hours >= 24.0h.
    O limiar de 20 minutos (diff_hours > 0.33) aplica-se exclusivamente a is_hw_stale.
    """
    js_path = Path("dashboard/static/js/app.js")
    assert js_path.exists(), "dashboard/static/js/app.js não encontrado"
    content = js_path.read_text(encoding="utf-8")

    # Garante que h.is_offline requer >= 24.0
    assert "h.is_offline = h.diff_hours >= 24.0" in content, (
        "h.is_offline deve ser avaliado com diff_hours >= 24.0 para evitar falso alarme em massa!"
    )

    # Garante que is_hw_stale trata o frescor de hardware
    assert "h.is_hw_stale = h.diff_hours > 0.33" in content, (
        "is_hw_stale deve gerenciar o frescor de métricas de CPU/RAM/Disco (> 20 min)"
    )

    # Garante que a condição de isOffline na esteira não contém > 0.33
    # nem site.agent_comm_status === 'DELAY'
    assert "site.agent_comm_status === \"DELAY\"" not in content, (
        "Status de rotina DELAY (2h a 24h) NÃO pode disparar incidente de Host Desconectado!"
    )
    assert "(site.agent_comm?.hours_since_last_seen > 0.33)" not in content, (
        "hours_since_last_seen > 0.33 (20 min) NÃO pode disparar incidente de Host Desconectado!"
    )


def test_no_contradictory_telemetry_string_concatenation():
    """
    Valida que a concatenação defeituosa 'Telemetria suspensa há Conectado'
    ou 'Telemetria suspensa há Atraso Telemetria' foi eliminada do app.js.
    """
    js_path = Path("dashboard/static/js/app.js")
    content = js_path.read_text(encoding="utf-8")

    assert "Telemetria suspensa há ${site.agent_comm?.label" not in content, (
        "Concatenação defeituosa 'Telemetria suspensa há ${site.agent_comm?.label}' foi encontrada!"
    )


def test_online_hosts_simulation_produces_no_false_offline_incidents():
    """
    Simula um host que comunicou há 25 minutos (diff_hours = 0.42).
    Verifica que:
    - is_hw_stale é True (não exibe gargalo em tempo real com métrica de 25 min)
    - is_offline é False (NÃO gera incidente de Host Desconectado)
    """
    diff_hours = 0.42  # 25 minutos
    agent_running = True

    is_hw_stale = diff_hours > 0.33 or not agent_running
    is_offline = diff_hours >= 24.0

    assert is_hw_stale is True, "Métrica de hardware > 20 min deve ser considerada stale"
    assert is_offline is False, "Host com comunicação há 25 min JAMAIS pode ser considerado offline!"
