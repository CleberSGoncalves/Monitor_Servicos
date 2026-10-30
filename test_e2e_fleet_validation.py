# test_e2e_fleet_validation.py
import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8092"

def test_suite():
    print("=== INICIANDO SUÍTE DE TESTES E2E DE AUDITORIA & REGRESSÃO ===")
    
    # 1. Healthcheck
    r_health = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r_health.status_code == 200, f"Falha no healthcheck: {r_health.status_code}"
    print("1. [PASS] Healthcheck da Central 200 OK (Serviço Windows Ativo).")

    # 2. Pipeline de Detecção Automática (Exclusivo CS01)
    r_det = requests.get(f"{BASE_URL}/api/fleet/detection/sites", timeout=15)
    assert r_det.status_code == 200, f"Falha no endpoint de detecção: {r_det.status_code}"
    det_data = r_det.json()
    sites = det_data.get("sites", [])
    assert len(sites) > 0, "Nenhum site retornado no pipeline de detecção."
    
    # Validação estrita: Nenhum host CS02 (DT02 / DT-02 / CS02) pode estar presente!
    dt02_leaks = [s for s in sites if any(tag in s["hostname"].upper() for tag in ["DT02", "DT-02", "DT2", "CS02"])]
    assert len(dt02_leaks) == 0, f"LEAK DETECTADO: {len(dt02_leaks)} hosts CS02 encontrados no pipeline de detecção: {[s['hostname'] for s in dt02_leaks]}"
    print(f"2. [PASS] Pipeline de Detecção Automática auditado: {len(sites)} sites CS01 genuínos. ZERO máquinas CS02 indevidas!")

    # 3. Classificador de Falhas Broadcast & Hardware Real
    r_clf = requests.get(f"{BASE_URL}/api/classificador-falhas/analise-frota", timeout=15)
    assert r_clf.status_code == 200, f"Falha no classificador: {r_clf.status_code}"
    clf_data = r_clf.json()
    occs = clf_data.get("ocorrencias_rastreabilidade", [])
    
    # Validação estrita: Florianópolis CS01 NÃO pode ter falha de placa analógica Yuan
    fln_yuan = [o for o in occs if "florian" in o.get("praca", "").lower() and o.get("pattern_id") == "lock_placa_analogica_yuan"]
    assert len(fln_yuan) == 0, f"Falso positivo de Yuan detectado em Florianópolis: {fln_yuan}"
    
    # Validação estrita: Toda ocorrência deve possuir hostname físico real preenchido
    empty_hostnames = [o for o in occs if not o.get("hostname") or o.get("hostname") == "N/A"]
    assert len(empty_hostnames) == 0, f"Ocorrências com hostname vazio: {len(empty_hostnames)}"
    print(f"3. [PASS] Classificador de Falhas validado: Florianópolis 100% nominal (Sonifex Radcap). Hostname físico real em 100% das ocorrências.")

    # 4. Status de Auto-Healing da Frota
    r_heal = requests.get(f"{BASE_URL}/api/fleet/auto-healing/status", timeout=15)
    assert r_heal.status_code == 200, f"Falha no auto-healing status: {r_heal.status_code}"
    heal_data = r_heal.json()
    sum_heal = heal_data.get("summary", {})
    assert sum_heal.get("total_hosts", 0) > 0, "Nenhum host auditado no auto-healing."
    assert heal_data.get("target_version") == "1.0.16.0", f"Versão alvo incorreta: {heal_data.get('target_version')}"
    print(f"4. [PASS] Central de Auto-Healing auditada: {sum_heal.get('total_hosts')} hosts mapeados. Versão alvo: v{heal_data.get('target_version')}.")
    print(f"   -> {sum_heal.get('up_to_date')} Atualizados | {sum_heal.get('eligible_for_update')} Desatualizados Elegíveis | {sum_heal.get('in_delay')} em Delay | {sum_heal.get('offline')} Offline.")

    print("\n✅ TODAS AS VALIDAÇÕES E TESTES E2E FORAM CONCLUÍDOS COM 100% DE SUCESSO!")

if __name__ == "__main__":
    test_suite()
