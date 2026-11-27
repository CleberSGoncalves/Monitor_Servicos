import urllib.request
import json
import time
import ssl

def run_tests():
    ctx = ssl._create_unverified_context()

    # Test 1: Action Status for Natal Atria Capture
    print("Testing Test 1: /api/fleet/action/status ...")
    t0 = time.time()
    req1 = urllib.request.Request("http://127.0.0.1:8092/api/fleet/action/status?host=Natal-SMME-234-CS1&service_name=Atria%20Capture")
    with urllib.request.urlopen(req1, timeout=6, context=ctx) as r:
        data1 = json.loads(r.read())
    dt1 = time.time() - t0
    print(f"[TEST 1 PASS] Action status in {dt1:.3f}s: success={data1.get('success')}, praca={data1.get('praca')}, badge={data1.get('status_badge')}")
    assert data1.get("success") is True
    assert "Natal" in data1.get("praca", "")

    # Test 2: Detection Pipeline Live for Aracaju
    print("Testing Test 2: /api/detection/fma-live ...")
    t0 = time.time()
    req2 = urllib.request.Request("http://127.0.0.1:8092/api/detection/fma-live/ARACAJU-SMME-328-CS1?lines=30")
    with urllib.request.urlopen(req2, timeout=6, context=ctx) as r:
        data2 = json.loads(r.read())
    dt2 = time.time() - t0
    dets = data2.get("recent_detections", [])
    print(f"[TEST 2 PASS] Pipeline Live in {dt2:.3f}s: {len(dets)} detecções carregadas.")
    assert len(dets) > 0, "Deveria ter detecções carregadas"
    first_det = dets[0]
    print(f"         Primeira detecção: {first_det.get('timestamp')} | {first_det.get('channel')} | {first_det.get('spot_name')} | advertiser='{first_det.get('advertiser')}'")
    # Verify no fake advertiser
    assert first_det.get("advertiser") == "", f"Advertiser deve ser limpo/vazio para evitar mock, obteve: {first_det.get('advertiser')}"

    logs = data2.get("raw_logs", [])
    print(f"         Logs tail: {len(logs)} linhas.")
    if logs:
        print(f"         Último log: {logs[-1]}")
    assert len(logs) > 0

    print("ALL TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_tests()
