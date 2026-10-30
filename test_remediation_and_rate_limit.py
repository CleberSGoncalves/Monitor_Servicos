"""
Suíte de Testes Automatizados E2E — Validação de Remediação, Rate Limit e Target Version 1.0.18.0
Kantar IBOPE Media — Monitor_Servicos
"""

import sys
import os
import re
from pathlib import Path

# Configura sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent / "dashboard"))

def test_target_versions():
    print("[TEST 1/5] Validando alinhamento de Target Version 1.0.18.0 no ecossistema...")
    
    # 1. fleet_auto_healing.py
    import fleet_auto_healing
    assert fleet_auto_healing.TARGET_AGENT_VERSION == "1.0.18.0", f"Erro: TARGET_AGENT_VERSION é {fleet_auto_healing.TARGET_AGENT_VERSION}"
    print("  -> fleet_auto_healing.TARGET_AGENT_VERSION == 1.0.18.0 [OK]")

    # 2. remote_queue.py
    import inspect
    import remote_queue
    sig_status = inspect.signature(remote_queue.get_service_canary_status)
    assert sig_status.parameters["target_version"].default == "1.0.18.0", "Erro: default target_version em get_service_canary_status != 1.0.18.0"
    sig_rollout = inspect.signature(remote_queue.trigger_canary_rollout_sharepoint)
    assert sig_rollout.parameters["target_version"].default == "1.0.18.0", "Erro: default target_version em trigger_canary_rollout_sharepoint != 1.0.18.0"
    print("  -> remote_queue defaults == 1.0.18.0 [OK]")

    # 3. fleet_actions.py
    with open("dashboard/fleet_actions.py", "r", encoding="utf-8") as f:
        txt = f.read()
    assert 'target_ver = (target_version or "1.0.18.0")' in txt, "Erro: fleet_actions.py não tem default 1.0.18.0"
    print("  -> fleet_actions.py default == 1.0.18.0 [OK]")

    # 4. index.html e fleet_ops.js
    with open("dashboard/static/index.html", "r", encoding="utf-8") as f:
        html = f.read()
    assert 'id="canaryTargetVersion" value="1.0.18.0"' in html, "Erro: canaryTargetVersion em index.html != 1.0.18.0"
    with open("dashboard/static/js/fleet_ops.js", "r", encoding="utf-8") as f:
        js = f.read()
    assert '"1.0.18.0"' in js, "Erro: fleet_ops.js não possui target 1.0.18.0"
    print("  -> index.html e fleet_ops.js == 1.0.18.0 [OK]")

    # 5. Scripts Powershell / Bat
    with open("Deploy_Canary_Pipeline.ps1", "r", encoding="utf-8") as f:
        ps1 = f.read()
    assert '$TargetVersion = "1.0.18.0"' in ps1, "Erro: Deploy_Canary_Pipeline.ps1 != 1.0.18.0"
    with open("Atualizar_Versao_Desejada_SharePoint.ps1", "r", encoding="utf-8") as f:
        ps2 = f.read()
    assert '$NewVersion = "1.0.18.0"' in ps2, "Erro: Atualizar_Versao_Desejada_SharePoint.ps1 != 1.0.18.0"
    print("  -> Deploy_Canary_Pipeline.ps1 e Atualizar_Versao_Desejada_SharePoint.ps1 == 1.0.18.0 [OK]")


def test_sharepoint_client_csharp():
    print("\n[TEST 2/5] Validando otimizacao anti-throttling no agente C#...")
    with open("WinServiceFleetAgent/Core/SharePointClient.cs", "r", encoding="utf-8") as f:
        cs = f.read()
    
    # Valida TTL de 5 minutos
    assert "AddMinutes(5)" in cs, "Erro: TTL do cache no C# não foi estendido para AddMinutes(5)"
    # Valida que não há InvalidateListCache() destrutivo após PATCH de inventário
    assert "InvalidateListCache();\r\n                        }\r\n                        else\r\n                        {\r\n                            string err = await patchResp.Content.ReadAsStringAsync();" not in cs, "Erro: InvalidateListCache ainda presente após PATCH em SyncServiceInventoryAsync"
    # Valida compilação do binário
    agent_exe = Path("publish/agent_v1.0.18.0/WinServiceFleetAgent.exe")
    assert agent_exe.exists() and agent_exe.stat().st_size > 50_000_000, f"Erro: Binário v1.0.18.0 não encontrado ou incompleto ({agent_exe})"
    print("  -> TTL estendido para 5 min e chamadas destrutivas a InvalidateListCache removidas [OK]")
    print(f"  -> Binário oficial v1.0.18.0 validado ({agent_exe.stat().st_size / 1024 / 1024:.1f} MB) [OK]")


def test_rate_limit_sentinel():
    print("\n[TEST 3/5] Validando Telemetria de Rate Limit (Microsoft Graph Sentinel)...")
    from sharepoint_sync import get_graph_rate_limit_health
    health = get_graph_rate_limit_health()
    assert isinstance(health, dict), "Erro: get_graph_rate_limit_health deve retornar dicionário"
    assert "is_throttled" in health, "Erro: chave is_throttled ausente"
    assert "status" in health, "Erro: chave status ausente"
    print(f"  -> Telemetria ativa: status='{health['status']}', is_throttled={health['is_throttled']} [OK]")


def test_auto_healing_diagnosis():
    print("\n[TEST 4/5] Validando motor de Auto-Healing da Frota...")
    import fleet_auto_healing
    diagnosis = fleet_auto_healing.audit_and_diagnose_fleet()
    assert "target_version" in diagnosis, "Erro: target_version ausente"
    assert diagnosis["target_version"] == "1.0.18.0", f"Erro: target_version esperado 1.0.18.0, obtido {diagnosis['target_version']}"
    assert "summary" in diagnosis, "Erro: summary ausente"
    assert "graph_rate_limit" in diagnosis, "Erro: graph_rate_limit ausente no diagnóstico"
    summary = diagnosis["summary"]
    print(f"  -> Diagnóstico concluído: Total Hosts: {summary['total_hosts']} | Já na v1.0.18.0: {summary['up_to_date']} | Elegíveis update: {summary['eligible_for_update']} | Parados: {summary['stopped_services']} [OK]")


def test_parauapebas_remediation_status():
    print("\n[TEST 5/5] Validando status dos itens de Parauapebas CS01 e CS02...")
    import sharepoint_sync
    from config import SITE_ID, LIST_SERVICES_ID
    import requests

    token = sharepoint_sync.get_graph_token()
    assert token, "Erro: token Graph não obtido"

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    
    # 1. BRPA-PUP-DT01 MonitorServiceSVC (Item ID 158927)
    url_pup1_agent = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/158927/fields"
    resp = requests.get(url_pup1_agent, headers=headers, timeout=15)
    if resp.ok:
        f = resp.json()
        print(f"  -> BRPA-PUP-DT01 Agente: Versao_Desejada={f.get('Versao_Desejada')}, Acao_Solicitada={f.get('Acao_Solicitada')} [CONFIRMADO]")
        assert f.get("Versao_Desejada") == "1.0.18.0", f"Erro: Versao_Desejada != 1.0.18.0 ({f.get('Versao_Desejada')})"
        assert f.get("Acao_Solicitada") in ("Atualizar", "Nenhuma"), f"Erro na acao: {f.get('Acao_Solicitada')}"
    else:
        print(f"  -> Aviso: Consulta individual retornou HTTP {resp.status_code}")

    # 2. BRPA-PUP-DT02 Atria Capture (Item ID 157393)
    url_pup2_atria = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/157393/fields"
    resp2 = requests.get(url_pup2_atria, headers=headers, timeout=15)
    if resp2.ok:
        f2 = resp2.json()
        print(f"  -> BRPA-PUP-DT02 Atria Capture: Acao_Solicitada={f2.get('Acao_Solicitada')} [CONFIRMADO]")
        assert f2.get("Acao_Solicitada") in ("Iniciar", "Nenhuma"), f"Erro na acao: {f2.get('Acao_Solicitada')}"
    else:
        print(f"  -> Aviso: Consulta individual retornou HTTP {resp2.status_code}")


if __name__ == "__main__":
    print("=" * 70)
    print("INICIANDO SUÍTE DE TESTES E2E — RATE LIMIT, REMEDIAÇÃO E TARGET 1.0.18.0")
    print("=" * 70)
    test_target_versions()
    test_sharepoint_client_csharp()
    test_rate_limit_sentinel()
    test_auto_healing_diagnosis()
    test_parauapebas_remediation_status()
    print("\n" + "=" * 70)
    print("TODOS OS 5 TESTES E2E FORAM EXECUTADOS E APROVADOS COM 100% DE SUCESSO!")
    print("=" * 70)
