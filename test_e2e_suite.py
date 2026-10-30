import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8092"

def test_health():
    url = f"{BASE_URL}/api/health"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        assert resp.status == 200, f"Health check falhou: {resp.status}"
        data = json.loads(resp.read().decode())
        print(f"[TEST 1 PASS] Health check OK: {data.get('status')}")

def test_auto_healing_status():
    url = f"{BASE_URL}/api/fleet/auto-healing/status"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200, f"Auto-healing status falhou: {resp.status}"
        data = json.loads(resp.read().decode())
        summary = data.get("summary", {})
        print(f"[TEST 2 PASS] Auto-healing status OK | Hosts: {summary.get('total_hosts')} | v18 Atualizados: {summary.get('up_to_date')} | Elegíveis Auto-Update: {summary.get('eligible_for_update')} | Delay: {summary.get('in_delay')} | Offline: {summary.get('offline')}")
        assert summary.get('total_hosts') > 100, "Frota não auditada corretamente!"

def test_detection_montes_claros():
    url = f"{BASE_URL}/api/fleet/detection/sites"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as resp:
        assert resp.status == 200, f"Detection sites falhou: {resp.status}"
        data = json.loads(resp.read().decode())
        sites = data.get("sites", [])
        mcl = next((s for s in sites if "Montes Claros" in s.get("praca", "")), None)
        assert mcl is not None, "Montes Claros não encontrado na lista de sites!"
        print(f"[TEST 3 PASS] Montes Claros Detecção OK | Motor: {mcl.get('active_engine')} | Saúde: {mcl.get('health_status')} | Tracking Status: {mcl.get('tracking_status')}")
        assert mcl.get("health_status") != "INOPERANTE (P0)", "Montes Claros ainda está como INOPERANTE!"

def test_classificador_florianopolis_radio():
    url = f"{BASE_URL}/api/classificador-falhas/analise-frota"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=25) as resp:
        assert resp.status == 200, f"Classificador analise falhou: {resp.status}"
        data = json.loads(resp.read().decode())
        occs = data.get("ocorrencias_rastreabilidade", [])
        
        # Florianópolis nunca deve ter rádio com acusação indevida de Yuan
        fln_yuan = [o for o in occs if "Florian" in o.get("praca", "") and ("yuan" in o.get("hardware_tag", "").lower() or "yuan" in o.get("pattern_name", "").lower())]
        assert len(fln_yuan) == 0, f"ERRO: Encontrada falha de Yuan indevida em Florianópolis: {fln_yuan}"
        
        print(f"[TEST 4 PASS] Classificador OK: Total avaliados {data.get('total_canais_auditados')}, Falhas ativas {data.get('total_falhas_ativas')}. ZERO falsos positivos de Yuan em Florianópolis!")

if __name__ == "__main__":
    print("=== INICIANDO SUITE DE TESTES AUTOMATIZADOS E2E ===")
    try:
        test_health()
        test_auto_healing_status()
        test_detection_montes_claros()
        test_classificador_florianopolis_radio()
        print("=== TODOS OS 4 TESTES PASSARAM COM 100% DE SUCESSO! ===")
    except Exception as e:
        print(f"[TEST FAIL] {e}")
        sys.exit(1)
