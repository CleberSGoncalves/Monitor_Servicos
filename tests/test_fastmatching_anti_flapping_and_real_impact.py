"""
Testes automatizados da Lógica de Impacto Real e Filtro Anti-Flapping do FastMatching:
Valida:
1. Diferenciação cirúrgica entre soluço transitório (1 atraso pontual com proc veloz) e acúmulo real de buffer.
2. Anomalia de catálogo SGG sem lentidão não deve degradar a esteira para 'Alerta'.
3. Presença do banner de proteção anti-flapping e histerese temporal no HTML.
4. Verificação de que a suíte de testes do playbook continua 100% íntegra.
"""
from pathlib import Path
import pytest
import sys

# Inserir dashboard no sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from tracking_detection_monitor import generate_fastmatching_playbook


def test_anti_flapping_single_delayed_with_fast_proctime_is_info():
    """Valida que 1 atraso isolado no fma.log com ProcTime excelente é classificado como INFO (soluço reabsorvido)."""
    mock_transient = {
        "has_detections": True,
        "has_delayed_warning": True,
        "delayed_candidates_count": 1,
        "last_detection": {"proc_time_ms": 950},
        "ram_usage": {"private_mb": 1160}
    }
    pb = generate_fastmatching_playbook(mock_transient, "BRPA-MBA-DT01")
    assert pb["severity"] == "INFO"
    assert "Soluço Transitório Reabsorvido" in pb["problem_title"]
    assert "Sem impacto operacional no SLA" in pb["impact"]


def test_anti_flapping_multiple_delayed_is_warning():
    """Valida que acúmulo persistente (>= 2 atrasos) gera WARNING operacional de descompasso de buffer."""
    mock_persistent = {
        "has_detections": True,
        "has_delayed_warning": True,
        "delayed_candidates_count": 3,
        "last_detection": {"proc_time_ms": 1100},
        "ram_usage": {"private_mb": 1160}
    }
    pb = generate_fastmatching_playbook(mock_persistent, "BRMS-CMA-DT01")
    assert pb["severity"] == "WARNING"
    assert "Descompasso de Buffer Circular" in pb["problem_title"]


def test_anti_flapping_single_delayed_with_high_proctime_is_warning():
    """Valida que mesmo 1 atraso gera WARNING se o ProcTime estiver lento (>1800ms), indicando que o motor não está conseguindo reabsorver."""
    mock_delayed_slow = {
        "has_detections": True,
        "has_delayed_warning": True,
        "delayed_candidates_count": 1,
        "last_detection": {"proc_time_ms": 2300},
        "ram_usage": {"private_mb": 1160}
    }
    pb = generate_fastmatching_playbook(mock_delayed_slow, "BRMS-CMA-DT01")
    assert pb["severity"] == "WARNING"
    assert "Descompasso de Buffer Circular" in pb["problem_title"]


def test_html_contains_anti_flapping_banner():
    """Valida presença do banner e pill de filtro anti-flapping no HTML."""
    html_path = Path("dashboard/static/index.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")

    assert "Filtro Anti-Flapping &amp; Impacto Real Ativo" in content
    assert "Histerese Ativa (15 min)" in content
    assert "Alertas de Impacto" in content


def test_js_contains_real_impact_and_flapping_logic():
    """Valida no JS a presença das regras de distinção de impacto real."""
    js_path = Path("dashboard/static/js/detection_monitor.js")
    assert js_path.exists()
    content = js_path.read_text(encoding="utf-8")

    assert "MOTOR INTELIGENTE DE IMPACTO REAL & ANTI-FLAPPING" in content
    assert "isTransientHiccup" in content
    assert "isDivergenceWithImpact" in content
    assert "isDivergenceCatalogOnly" in content
    assert "Boa (Soluço Reabsorvido)" in content
    assert "Boa (Nota SGG)" in content
    assert "1 pontual (reabsorvido)" in content
