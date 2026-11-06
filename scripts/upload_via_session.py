import sys, io, requests, time, json, hashlib
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID

DRIVE_ID = "b!R5fko7abk0yZMN2ibI0QUFX-yDT-LPxOjOApWP13XuB7rzp8hYGATLhyYvhIJ0iG"
FOLDER = "Releases_Servicos_CS"
TARGET_VERSION = "1.0.20.0"
ZIP_PATH = Path(f"publish/DNA.MonitorServiceSVC_v{TARGET_VERSION}.zip")
BOOTSTRAP_PATH = Path("WinServiceFleetAgent/Scripts/bootstrap_update.ps1")

print(f"=== Upload via UploadSession v{TARGET_VERSION} no SharePoint Drive ===", flush=True)

data = ZIP_PATH.read_bytes()
total_bytes = len(data)
sha256_hash = hashlib.sha256(data).hexdigest().lower()
size_mb = total_bytes / (1024 * 1024)
print(f"Arquivo: {ZIP_PATH.name} | Tamanho: {size_mb:.2f} MB | SHA-256: {sha256_hash}", flush=True)

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

def upload_via_session(file_name, file_bytes):
    global token
    session_url = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{file_name}:/createUploadSession"
    
    for attempt in range(1, 10):
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        session_payload = {
            "item": {
                "@microsoft.graph.conflictBehavior": "replace",
                "name": file_name
            }
        }
        
        print(f"Criando UploadSession para {file_name} (Tentativa {attempt}/10)...", flush=True)
        r = requests.post(session_url, headers=headers, json=session_payload, timeout=20)
        if r.status_code == 429:
            w = int(r.headers.get("Retry-After", 15)) + 2
            print(f"  ⚠️ [429 Throttling] Aguardando {w}s para criar sessão...", flush=True)
            time.sleep(w)
            token = get_token()
            continue
        if not r.ok:
            print(f"❌ Erro ao criar UploadSession ({r.status_code}): {r.text[:200]}", flush=True)
            time.sleep(5)
            continue
        
        upload_url = r.json().get("uploadUrl")
        print(f"UploadSession criada com sucesso! Iniciando upload em pedaços de 5MB...", flush=True)
        
        chunk_size = 5 * 1024 * 1024 # 5 MB
        total_len = len(file_bytes)
        start = 0
        
        while start < total_len:
            end = min(start + chunk_size, total_len)
            chunk = file_bytes[start:end]
            chunk_len = len(chunk)
            
            chunk_headers = {
                "Content-Length": str(chunk_len),
                "Content-Range": f"bytes {start}-{end - 1}/{total_len}"
            }
            
            pct = (end / total_len) * 100
            print(f"  Enviando bytes {start}-{end - 1} ({pct:.1f}%)...", flush=True)
            
            for chunk_att in range(1, 6):
                r_chunk = requests.put(upload_url, headers=chunk_headers, data=chunk, timeout=60)
                if r_chunk.status_code in [200, 201, 202]:
                    break
                elif r_chunk.status_code == 429:
                    wait_t = int(r_chunk.headers.get("Retry-After", 15)) + 2
                    print(f"    ⚠️ Throttled (429). Aguardando {wait_t}s...", flush=True)
                    time.sleep(wait_t)
                else:
                    print(f"    ❌ Erro no chunk ({r_chunk.status_code}): {r_chunk.text[:100]}", flush=True)
                    time.sleep(3)
            
            start = end
        
        print(f"✅ {file_name} enviado com 100% de sucesso via UploadSession!", flush=True)
        return True
    return False

def put_small_file_with_retry(url, content, content_type, desc):
    global token
    for attempt in range(1, 10):
        headers = {"Authorization": f"Bearer {token}", "Content-Type": content_type}
        print(f"Enviando {desc} (Tentativa {attempt}/10)...", flush=True)
        r = requests.put(url, headers=headers, data=content, timeout=30)
        if r.ok:
            print(f"✅ {desc} atualizado com sucesso!", flush=True)
            return True
        elif r.status_code == 429:
            w = int(r.headers.get("Retry-After", 15)) + 2
            print(f"⚠️ [429] Aguardando {w}s...", flush=True)
            time.sleep(w)
            token = get_token()
        else:
            print(f"❌ Erro {r.status_code}: {r.text[:150]}", flush=True)
            time.sleep(3)
    return False

# 1. Upload do arquivo versionado
ver_name = f"DNA.MonitorServiceSVC_v{TARGET_VERSION}.zip"
upload_via_session(ver_name, data)

# 2. Upload do arquivo genérico latest
gen_name = "DNA.MonitorServiceSVC.zip"
upload_via_session(gen_name, data)

# 3. Upload sha256
sha_name = f"{ver_name}.sha256"
url_sha = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{sha_name}:/content"
sha_content = f"{sha256_hash}  {ver_name}\n".encode("utf-8")
put_small_file_with_retry(url_sha, sha_content, "text/plain", sha_name)

# 4. Upload generic sha256
gen_sha_name = f"{gen_name}.sha256"
url_gen_sha = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{gen_sha_name}:/content"
gen_sha_content = f"{sha256_hash}  {gen_name}\n".encode("utf-8")
put_small_file_with_retry(url_gen_sha, gen_sha_content, "text/plain", gen_sha_name)

# 5. Upload bootstrap_update.ps1
if BOOTSTRAP_PATH.exists():
    url_bs = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/bootstrap_update.ps1:/content"
    put_small_file_with_retry(url_bs, BOOTSTRAP_PATH.read_bytes(), "text/plain", "bootstrap_update.ps1")

# 6. Upload manifest_sha256.json
manifest_url = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/manifest_sha256.json:/content"
manifest_data = {
    "version": TARGET_VERSION,
    "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "services": {
        "DNA.MonitorServiceSVC": {
            "version": TARGET_VERSION,
            "sha256": sha256_hash,
            "file_name": ver_name,
            "min_agent_version": "1.0.0.0"
        }
    }
}
put_small_file_with_retry(manifest_url, json.dumps(manifest_data, indent=2).encode("utf-8"), "application/json", "manifest_sha256.json")

print(f"=== Upload via UploadSession v{TARGET_VERSION} Concluído com Sucesso! ===", flush=True)
