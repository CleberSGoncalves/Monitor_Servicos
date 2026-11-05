import sys, io, requests, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID, SITE_ID, LIST_SERVICES_ID

print("=== Sincronização em Massa de Versão Instalada 1.0.19.0 no SharePoint ===", flush=True)

# 1. Carrega todos os serviços do cache
with open("dashboard/data/fleet_cache.json", "r", encoding="utf-8") as f:
    cache = json.load(f)

hosts_to_update = []
for s in cache.get("services", []):
    if str(s.get("nome_servico", "")).strip() == "DNA.MonitorServiceSVC":
        hid = s.get("id")
        hname = s.get("hostname")
        v_inst = str(s.get("versao_instalada", "")).strip()
        st_atual = str(s.get("status_atualizacao", "")).strip()
        # Se já estiver 1.0.19.0 e Atualizado, pula
        if v_inst == "1.0.19.0" and st_atual == "Atualizado":
            continue
        if hid and hname:
            hosts_to_update.append({
                "id": str(hid),
                "hostname": str(hname),
                "praca": s.get("praca", "Brasil"),
                "cs": s.get("cs", 1)
            })

print(f"Total de hosts a atualizar no SharePoint: {len(hosts_to_update)}", flush=True)

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
token_time = time.time()

sucessos = 0
erros = 0

for idx, host in enumerate(hosts_to_update, 1):
    hid = host["id"]
    hname = host["hostname"]
    
    # Renova token se mais de 45 minutos
    if time.time() - token_time > 2700:
        token = get_token()
        token_time = time.time()

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{hid}/fields"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    payload = {
        "Versao_Instalada": "1.0.19.0",
        "Versao_Desejada": "1.0.19.0",
        "Status_Atualizacao": "Atualizado",
        "Acao_Solicitada": "Nenhuma",
        "Ultima_atualizacao": now_iso
    }

    tentativa = 0
    while tentativa < 10:
        tentativa += 1
        try:
            r = requests.patch(patch_url, headers=headers, json=payload, timeout=20)
            if r.status_code in [200, 204]:
                sucessos += 1
                if idx % 10 == 0 or idx <= 5 or idx == len(hosts_to_update):
                    print(f"[{idx}/{len(hosts_to_update)}] ✅ {hname} (ID {hid}) -> 1.0.19.0 Atualizado", flush=True)
                break
            elif r.status_code == 429:
                retry_after = int(r.headers.get("Retry-After", 15))
                wait_time = max(retry_after + 3, 10)
                print(f"⚠️ [HTTP 429 Throttling] Aguardando cooldown de {wait_time}s antes de retentar {hname} (Tentativa {tentativa}/10)...", flush=True)
                time.sleep(wait_time)
                # Renova token após espera
                token = get_token()
                headers["Authorization"] = f"Bearer {token}"
            else:
                print(f"❌ Erro HTTP {r.status_code} ao atualizar {hname}: {r.text[:150]}", flush=True)
                time.sleep(2)
                break
        except Exception as ex:
            print(f"❌ Exceção ao atualizar {hname}: {ex}", flush=True)
            time.sleep(3)
            break

    # Pausa gentil de 750ms entre requisições para evitar novo 429
    time.sleep(0.75)

print(f"\n=== Sincronização concluída! Sucessos: {sucessos} | Erros: {erros} ===", flush=True)
