import sys, io, requests, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID, SITE_ID, LIST_SERVICES_ID

print("=== Sincronização dos 35 Hosts com ID Sanitizado no SharePoint ===", flush=True)

with open("dashboard/data/fleet_cache.json", "r", encoding="utf-8") as f:
    cache = json.load(f)

hosts_failed = [
    'BRSP-SRR-DT01', 'BRES-VIT-DT01', 'BRGO-LZA-DT-02-DT01', 'BRRJ-RSD-DT01', 'BRPR-LDA-DT-02-DT01',
    'BRGO-GNA-ATRIA--DT01', 'BRMG-GVS-DT01', 'BRPB-JPA-02-DT01', 'BRES-CIM-DT01', 'BRPI-FLO-DT01',
    'BRMG-BHE-DT-02-DT01', 'BRPR-GRP-DT1', 'BRBA-BES-DT-02-DT01', 'BRRO-JIP-DT01', 'BRMS-CPE-DT01',
    'BRSP-FAC-DT01', 'BRGO-CTL-DT01', 'CS-BRAM-PAR-DT--DT01', 'BRGO-JT-ATRIA-D-DT01', 'BRPA-CAH-DT01',
    'CS-BRBA-ITB-DT--DT01', 'BRRO-COA-DT01', 'BRSP-BRU-DT01', 'BRGO-ANA-DT01', 'BRMG-UBA-DT01-DT01',
    'BRRO-VHA-DT01', 'CS-BRSP-SOR-DT0-DT01', 'BRRS-BGE-TDT-02-DT01', 'BRSP-STS-ATRIA--DT01',
    'BRCE-FLA-DT-02-DT01', 'CS-BRSP-TTE-DT0-DT01', 'CS-BRMG-MCL-DT--DT01', 'CS-BRAM-MNS-DT--DT01',
    'BRGO-RVD-ATRIA--DT01', 'BRRS-PAE-ATRIA--DT01'
]

targets = []
for s in cache.get("services", []):
    h = s.get("hostname")
    if h in hosts_failed and "MonitorService" in str(s.get("nome_servico")):
        raw_id = str(s.get("id"))
        clean_id = raw_id.split("_")[0]
        if clean_id.isdigit():
            targets.append((h, clean_id))

print(f"Alvos identificados para sanitização: {len(targets)}")

def get_token():
    url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default"
    }
    r = requests.post(url, data=data, timeout=15)
    return r.json().get("access_token")

token = get_token()
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

sucessos = 0
for idx, (hname, clean_id) in enumerate(targets, 1):
    patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{clean_id}/fields"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    payload = {
        "Versao_Instalada": "1.0.19.0",
        "Versao_Desejada": "1.0.19.0",
        "Status_Atualizacao": "Atualizado",
        "Acao_Solicitada": "Nenhuma",
        "Ultima_atualizacao": now_iso
    }

    try:
        r = requests.patch(patch_url, headers=headers, json=payload, timeout=15)
        if r.status_code in [200, 204]:
            sucessos += 1
            print(f"[{idx}/{len(targets)}] ✅ {hname} (ID {clean_id}) -> 1.0.19.0 Atualizado", flush=True)
        elif r.status_code == 429:
            retry_after = int(r.headers.get("Retry-After", 15))
            wait_time = max(retry_after + 2, 10)
            print(f"⚠️ [429 Throttling] Aguardando {wait_time}s...", flush=True)
            time.sleep(wait_time)
            token = get_token()
            headers["Authorization"] = f"Bearer {token}"
            # retenta uma vez
            r2 = requests.patch(patch_url, headers=headers, json=payload, timeout=15)
            if r2.status_code in [200, 204]:
                sucessos += 1
                print(f"[{idx}/{len(targets)}] ✅ {hname} (ID {clean_id}) -> 1.0.19.0 Atualizado (após 429)", flush=True)
        else:
            print(f"❌ {hname} HTTP {r.status_code}: {r.text[:120]}", flush=True)
    except Exception as ex:
        print(f"❌ {hname} Erro: {ex}", flush=True)

    time.sleep(0.75)

print(f"\nFinalizado! Sanitizados e atualizados: {sucessos}/{len(targets)}", flush=True)
