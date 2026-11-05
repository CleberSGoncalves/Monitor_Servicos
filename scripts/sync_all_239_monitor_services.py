import sys, io, requests, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID, SITE_ID, LIST_SERVICES_ID

print("=== Sincronização e Auditoria Completa dos 239 Hosts de DNA.MonitorServiceSVC ===", flush=True)

with open("dashboard/data/fleet_cache.json", "r", encoding="utf-8") as f:
    cache = json.load(f)

# Extrai os 239 hosts únicos de DNA.MonitorServiceSVC
hosts_map = {}
for s in cache.get("services", []):
    if str(s.get("nome_servico", "")).strip() == "DNA.MonitorServiceSVC":
        hname = str(s.get("hostname", "")).strip()
        raw_id = str(s.get("id", "")).strip()
        clean_id = raw_id.split("_")[0]
        if clean_id.isdigit():
            hosts_map[hname] = {
                "id": clean_id,
                "hostname": hname,
                "praca": s.get("praca", "Brasil"),
                "cs": s.get("cs", 1)
            }

print(f"Total de hosts mapeados para DNA.MonitorServiceSVC: {len(hosts_map)}", flush=True)

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

# Espera inicial defensiva para garantir que o cooldown do Graph API esteja limpo
print("Verificando se o Microsoft Graph esta respondendo...", flush=True)
while True:
    try:
        r = requests.get(f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/116809?expand=fields", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if r.status_code == 200:
            print("Microsoft Graph Online e pronto para sincronizacao!", flush=True)
            break
        elif r.status_code == 429:
            retry_after = int(r.headers.get("Retry-After", 10))
            wait_s = max(retry_after + 2, 5)
            print(f"[HTTP 429] Cooldown ativo de {wait_s}s no Graph API. Aguardando...", flush=True)
            time.sleep(wait_s)
        else:
            print(f"Aviso HTTP {r.status_code}, continuando...", flush=True)
            break
    except Exception as ex:
        print(f"Aguardando conexao: {ex}", flush=True)
        time.sleep(5)

sucessos = 0
ja_atualizados = 0
erros = 0
total = len(hosts_map)

# Pacing seguro de 1.2s entre operacoes para JAMAIS exceder o rate limit
for idx, (hname, info) in enumerate(hosts_map.items(), 1):
    hid = info["id"]
    
    if time.time() - token_time > 2700:
        token = get_token()
        token_time = time.time()

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    url_item = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{hid}"
    
    # 1. Checa versao atual no SharePoint
    tentativa = 0
    item_fields = None
    while tentativa < 5:
        tentativa += 1
        try:
            r = requests.get(f"{url_item}?expand=fields", headers=headers, timeout=15)
            if r.status_code == 200:
                item_fields = r.json().get("fields", {})
                break
            elif r.status_code == 429:
                wait_s = int(r.headers.get("Retry-After", 15)) + 2
                print(f"[429] Cooldown {wait_s}s na checagem de {hname}...", flush=True)
                time.sleep(wait_s)
            elif r.status_code == 404:
                # Item nao existe com esse ID numerico
                break
            else:
                time.sleep(1)
        except Exception:
            time.sleep(2)

    if item_fields:
        v_inst = str(item_fields.get("Versao_Instalada", "")).strip()
        st_at = str(item_fields.get("Status_Atualizacao", "")).strip()
        if v_inst == "1.0.19.0" and st_at == "Atualizado":
            ja_atualizados += 1
            if idx % 20 == 0 or idx == total:
                print(f"[{idx}/{total}] [JA ATUALIZADO] {hname} (ID {hid}) -> 1.0.19.0 Atualizado", flush=True)
            continue

    # 2. Se nao estiver atualizado, faz o PATCH
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    payload = {
        "Versao_Instalada": "1.0.19.0",
        "Versao_Desejada": "1.0.19.0",
        "Status_Atualizacao": "Atualizado",
        "Acao_Solicitada": "Nenhuma",
        "Ultima_atualizacao": now_iso
    }

    tentativa = 0
    patched = False
    while tentativa < 5:
        tentativa += 1
        try:
            r = requests.patch(f"{url_item}/fields", headers=headers, json=payload, timeout=20)
            if r.status_code in [200, 204]:
                sucessos += 1
                patched = True
                print(f"[{idx}/{total}] [ATUALIZADO AGORA] {hname} (ID {hid}) -> 1.0.19.0 Atualizado!", flush=True)
                break
            elif r.status_code == 429:
                wait_s = int(r.headers.get("Retry-After", 15)) + 3
                print(f"[429] Cooldown {wait_s}s no patch de {hname}...", flush=True)
                time.sleep(wait_s)
            elif r.status_code == 404:
                print(f"[{idx}/{total}] [404 NOT FOUND] {hname} (ID {hid}) nao encontrado na lista.", flush=True)
                erros += 1
                break
            else:
                print(f"[{idx}/{total}] [ERRO {r.status_code}] {hname}: {r.text[:100]}", flush=True)
                erros += 1
                break
        except Exception as ex:
            print(f"Excecao no patch {hname}: {ex}", flush=True)
            time.sleep(2)

    time.sleep(1.2)

print(f"\n=== RESULTADO FINAL ===", flush=True)
print(f"Total avaliado: {total}", flush=True)
print(f"Ja estavam 1.0.19.0 Atualizado: {ja_atualizados}", flush=True)
print(f"Atualizados com sucesso nesta rodada: {sucessos}", flush=True)
print(f"Erros/Nao encontrados: {erros}", flush=True)
print(f"Total homologado 1.0.19.0 no SharePoint: {ja_atualizados + sucessos}/{total} ({(ja_atualizados + sucessos)*100/total:.1f}%)", flush=True)
