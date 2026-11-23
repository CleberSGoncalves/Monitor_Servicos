import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys

sys.path.insert(0, "dashboard")
from app import app
from detection_safe_heal import build_safe_detection_heal_script
from remote_commands import validate_script_syntax
from incident_manager import evaluate_post_signal_detection_gate
from praca_analyzer import list_active_pracas, audit_praca_ecosystem, generate_ai_solutions_plan

client = TestClient(app)

def test_safe_heal_script_guarantees_emu_preservation():
    """Valida que o script de Auto-Cura Segura contem blindagem explicita anti-exclusao de .EMU."""
    script = build_safe_detection_heal_script("safe_cascade_restart")
    assert script is not None
    assert "[PRE_CHECK]" in script
    assert "[EMU_INTEGRITY]" in script
    assert "ZERO toque em data\\emu" in script or "ZERO exclusao" in script
    assert "fma_rot_" in script, "Deve conter rotacao preventiva de fma.log"
    assert "250" in script, "Limiar de 250 MB para rotacao"

def test_guardrail_blocks_destructive_emu_deletion():
    """Valida que o validador de comandos bloqueia expressamente comandos com del ou Remove-Item sobre data\\emu."""
    bad_cmd_1 = "Remove-Item -Path 'D:\\MediaDNA_V2\\data\\emu\\*' -Force"
    bad_cmd_2 = "del /f /q D:\\MediaDNA_V2\\data\\emu\\*.emu"
    good_cmd = "Restart-Service 'DNA.ConfigMonitorSVC' -Force"

    res1 = validate_script_syntax("powershell", bad_cmd_1)
    assert not res1["valid"]
    assert any("BLOQUEIO DE INTEGRIDADE OPERACIONAL" in err for err in res1["errors"])

    res2 = validate_script_syntax("cmd", bad_cmd_2)
    assert not res2["valid"]
    assert any("BLOQUEIO DE INTEGRIDADE OPERACIONAL" in err for err in res2["errors"])

    res_good = validate_script_syntax("powershell", good_cmd)
    assert res_good["valid"]

def test_evaluate_post_signal_detection_gate():
    """Valida que o Gate Anti-Itumbiara avalia a saude do CS01 corretamente."""
    # Teste com praca conhecida
    gate = evaluate_post_signal_detection_gate("Itumbiara")
    assert isinstance(gate, dict)
    assert "passed" in gate
    assert "cs01_host" in gate
    assert "message" in gate

def test_praca_analyzer_list_and_audit():
    """Valida a listagem de pracas e o Raio-X de uma praca."""
    pracas = list_active_pracas()
    assert isinstance(pracas, list)
    assert len(pracas) > 0, "Deve listar pracas do cache da frota"
    first_praca = pracas[0]["praca"]

    audit = audit_praca_ecosystem(first_praca)
    assert audit["praca"].lower() == first_praca.lower()
    assert "health_score" in audit
    assert "active_engine" in audit
    assert "problems" in audit

def test_ai_solutions_plan_generation():
    """Valida a geracao do plano de solucoes inteligente passo a passo."""
    mock_audit = {
        "praca": "Itumbiara",
        "cs01_host": "BRGO-ITB-DT01",
        "health_score": 45,
        "problems": [
            {
                "code": "DETECTION_ENGINE_STOPPED",
                "severity": "CRITICO",
                "category": "Deteccao Comercial",
                "host": "BRGO-ITB-DT01",
                "title": "Nenhum Motor de Detecção Comercial Ativo no CS01",
                "detail": "Motor parado",
                "recommended_action": "safe_cascade_restart",
                "action_label": "Iniciar Motor"
            },
            {
                "code": "CHANNEL_SIGNAL_OUTAGE",
                "severity": "CRITICO",
                "category": "Sinal & Sintonia",
                "host": "BRGO-ITB-DT01",
                "canal": "Rede Globo",
                "title": "Quebra de Sinal: Rede Globo",
                "detail": "Tuner sem lock",
                "recommended_action": "restart_tuner",
                "action_label": "Reiniciar Sintonizador"
            }
        ]
    }
    plan = generate_ai_solutions_plan(mock_audit)
    assert plan["praca"] == "Itumbiara"
    assert len(plan["pipeline_steps"]) >= 2
    # Confirma que contem botoes de 1 clique
    assert any("btn_label" in s for s in plan["pipeline_steps"])
    assert any("action_type" in s for s in plan["pipeline_steps"])

def test_api_endpoints_praca_and_safe_heal():
    """Valida os novos endpoints HTTP no FastAPI."""
    # Listagem de pracas
    resp = client.get("/api/fleet/praca/list")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0

    target_praca = data[0]["praca"]

    # Auditoria de praca
    resp_audit = client.get(f"/api/fleet/praca/audit/{target_praca}")
    assert resp_audit.status_code == 200
    audit_data = resp_audit.json()
    assert "health_score" in audit_data

    # Central de solucoes IA
    resp_sol = client.post("/api/fleet/praca/ai-solution", json={"praca": target_praca})
    assert resp_sol.status_code == 200
    sol_data = resp_sol.json()
    assert "pipeline_steps" in sol_data
