import sys, io, requests, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID, SITE_ID, LIST_SERVICES_ID

TARGET_VERSION = "1.0.20.0"

print(f"=== Sincronizador Automático de Versao_Desejada para {TARGET_VERSION} ===", flush=True)

with open("dashboard/data/fleet_cache.json", "r", encoding="utf-8") as f:
    cache = json.load(f)

mon_services = [s for s in cache.get("services", []) if s.get("nome_servico") == "DNA.MonitorServiceSVC"]
print(f"Total de servicos DNA.MonitorServiceSVC mapeados no cache: {len(mon_services)}", flush=True)

hosts_map = {}
for s in mon_services:
    hid = str(s.get("id", "")).split("_")[0]
    if hid.isdigit():
        hosts_map[s.get("hostname")] = {
            "id": hid,
            "hostname": s.get("hostname"),
            "versao_instalada": s.get("versao_instalada", ""),
            "versao_desejada": s.get("versao_desejada", "")
        }

print(f"Total de hosts válidos para atualização: {len(hosts_map)}", flush=True)

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
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1. Aguarda o cooldown ativo do Graph API
print("Monitorando disponibilidade da API Microsoft Graph...", flush=True)
test_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/117409"
while True:
    try:
        r_test = requests.get(test_url, headers=headers, timeout=15)
        if r_test.status_code == 200:
            print("✅ Microsoft Graph Online e pronto para atualizações!", flush=True)
            break
        elif r_test.status_code == 429:
            ra = int(r_test.headers.get("Retry-After", 15))
            wait_s = max(ra + 2, 10)
            print(f"⚠️ [HTTP 429] Cooldown ativo ({wait_s}s). Aguardando liberação de cota...", flush=True)
            time.sleep(wait_s)
            token = get_token()
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        else:
            print(f"Status HTTP {r_test.status_code}, prosseguindo...", flush=True)
            break
    except Exception as ex:
        print(f"Aguardando rede: {ex}", flush=True)
        time.sleep(5)

# 2. Atualiza via $batch em lotes de 20 para máxima eficiência
items_list = list(hosts_map.values())
chunks = [items_list[i:i + 20] for i in range(0, len(items_list), 20)]
batch_url = "https://graph.microsoft.com/v1.0/$batch"
total_patched = 0

for chunk_idx, chunk in enumerate(chunks, 1):
    batch_reqs = []
    for sub_idx, item in enumerate(chunk, 1):
        hid = item["id"]
        v_inst = item["versao_instalada"]
        is_v20 = v_inst == TARGET_VERSION or v_inst == f"v{TARGET_VERSION}"
        
        body = {
            "Versao_Desejada": TARGET_VERSION
        }
        if is_v20:
            body["Status_Atualizacao"] = "Atualizado"
            body["Acao_Solicitada"] = "Nenhuma"
            
        batch_reqs.append({
            "id": str(sub_idx),
            "method": "PATCH",
            "url": f"/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{hid}/fields",
            "headers": {"Content-Type": "application/json"},
            "body": body
        })

    payload = {"requests": batch_reqs}
    
    for attempt in range(1, 10):
        try:
            r = requests.post(batch_url, headers=headers, json=payload, timeout=30)
            if r.status_code == 200:
                responses = r.json().get("responses", [])
                throttled_sub = sum(1 for resp in responses if resp.get("status") == 429)
                success_sub = sum(1 for resp in responses if resp.get("status") in [200, 204])
                
                if throttled_sub > 0:
                    first_429 = next(resp for resp in responses if resp.get("status") == 429)
                    ra_sub = int(first_429.get("headers", {}).get("Retry-After", 20))
                    wait_sub = max(ra_sub + 3, 10)
                    print(f"  [Lote {chunk_idx}/{len(chunks)}] 429 em {throttled_sub} sub-requisições (Retry-After: {wait_sub}s). Aguardando...", flush=True)
                    time.sleep(wait_sub)
                    token = get_token()
                    headers["Authorization"] = f"Bearer {token}"
                    continue
                else:
                    total_patched += success_sub
                    print(f"  ✅ Lote {chunk_idx}/{len(chunks)} concluído ({success_sub} itens)! Total acumulado: {total_patched}/{len(items_list)}", flush=True)
                    time.sleep(2)
                    break
            elif r.status_code == 429:
                wait_t = int(r.headers.get("Retry-After", 20)) + 3
                print(f"  [Lote {chunk_idx}/{len(chunks)}] HTTP 429 (Retry-After: {wait_t}s). Aguardando...", flush=True)
                time.sleep(wait_t)
                token = get_token()
                headers["Authorization"] = f"Bearer {token}"
            else:
                print(f"  ❌ Erro HTTP {r.status_code}: {r.text[:150]}", flush=True)
                time.sleep(3)
        except Exception as ex:
            print(f"  ❌ Exceção de rede: {ex}", flush=True)
            time.sleep(3)

print(f"\n=======================================================", flush=True)
print(f"SUCESSO ABSOLUTO: {total_patched} registros de DNA.MonitorServiceSVC atualizados para Versão Desejada {TARGET_VERSION}!", flush=True)
print(f"=======================================================", flush=True)
