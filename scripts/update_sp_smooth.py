import sys, io, requests, time, json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID, SITE_ID, LIST_SERVICES_ID

print("=== Sincronizador Resiliente de Versão Desejada 1.0.20.0 no SharePoint ===", flush=True)

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

# Carregar serviços do fleet_cache.json
with open("dashboard/data/fleet_cache.json", "r", encoding="utf-8") as f:
    fc = json.load(f)

services = fc.get("services", [])
# Filtrar todos os DNA.MonitorServiceSVC
agent_svcs = [s for s in services if "monitorservice" in str(s.get("nome_servico", "")).lower()]
print(f"Total de serviços DNA.MonitorServiceSVC no cache: {len(agent_svcs)}", flush=True)

# Coletar itens que têm ID válido
target_items = []
for s in agent_svcs:
    raw_id = str(s.get("id", "")).split("_")[0]
    if raw_id.isdigit():
        target_items.append({
            "id": raw_id,
            "hostname": s.get("hostname"),
            "praca": s.get("praca"),
            "cs": s.get("cs", 1),
            "versao_instalada": str(s.get("versao_instalada", "")),
            "versao_desejada": str(s.get("versao_desejada", ""))
        })

print(f"Total de itens com ID válido para alinhar: {len(target_items)}", flush=True)

token = get_token()
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Testar se ainda está em 429
test_id = target_items[0]["id"]
while True:
    try:
        r = requests.get(f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{test_id}?expand=fields", headers=headers, timeout=10)
        if r.status_code == 200:
            print("Microsoft Graph liberado (Status 200)! Iniciando atualização...", flush=True)
            break
        elif r.status_code == 429:
            retry_after = int(r.headers.get("Retry-After", 20))
            print(f"Ainda throttled (HTTP 429). Aguardando {retry_after}s...", flush=True)
            time.sleep(retry_after + 2)
            token = get_token()
            headers["Authorization"] = f"Bearer {token}"
        else:
            print(f"Status inesperado: {r.status_code}. Aguardando 10s...", flush=True)
            time.sleep(10)
    except Exception as e:
        print(f"Erro no teste: {e}", flush=True)
        time.sleep(10)

# Atualizar via $batch em pacotes de 10 com espaçamento de 3s
chunks = [target_items[i:i + 10] for i in range(0, len(target_items), 10)]
print(f"Total de lotes de 10: {len(chunks)}", flush=True)

updated_count = 0
for idx, chunk in enumerate(chunks, 1):
    batch_reqs = []
    for sub_i, item in enumerate(chunk, 1):
        v_inst = item["versao_instalada"]
        is_v20 = ("1.0.20.0" in v_inst)
        
        body = {
            "Versao_Desejada": "1.0.20.0"
        }
        if is_v20:
            body["Status_Atualizacao"] = "Atualizado"
            body["Acao_Solicitada"] = "Nenhuma"
            
        batch_reqs.append({
            "id": str(sub_i),
            "method": "PATCH",
            "url": f"/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item['id']}/fields",
            "headers": {"Content-Type": "application/json"},
            "body": body
        })

    payload = {"requests": batch_reqs}
    
    for attempt in range(1, 6):
        try:
            r = requests.post("https://graph.microsoft.com/v1.0/$batch", headers=headers, json=payload, timeout=25)
            if r.status_code == 200:
                resps = r.json().get("responses", [])
                throttled = sum(1 for res in resps if res.get("status") == 429)
                successes = sum(1 for res in resps if res.get("status") in [200, 204])
                if throttled > 0:
                    print(f"  [Lote {idx}/{len(chunks)}] 429 em {throttled} sub-itens. Aguardando 15s...", flush=True)
                    time.sleep(15)
                    token = get_token()
                    headers["Authorization"] = f"Bearer {token}"
                    continue
                else:
                    updated_count += successes
                    print(f"  Lote {idx}/{len(chunks)} OK (+{successes} itens). Total acumulado: {updated_count}", flush=True)
                    time.sleep(1.5) # Respeito estrito ao rate limit
                    break
            elif r.status_code == 429:
                wait_t = int(r.headers.get("Retry-After", 20)) + 2
                print(f"  [Lote {idx}/{len(chunks)}] HTTP 429 principal. Aguardando {wait_t}s...", flush=True)
                time.sleep(wait_t)
                token = get_token()
                headers["Authorization"] = f"Bearer {token}"
            else:
                print(f"  Erro HTTP {r.status_code}: {r.text[:120]}", flush=True)
                time.sleep(2)
        except Exception as ex:
            print(f"  Exceção: {ex}", flush=True)
            time.sleep(2)

print(f"\n=== Concluído: {updated_count} registros atualizados com sucesso para Versão Desejada 1.0.20.0! ===", flush=True)
