import sys, io, requests, time, json, hashlib
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID

DRIVE_ID = "b!R5fko7abk0yZMN2ibI0QUFX-yDT-LPxOjOApWP13XuB7rzp8hYGATLhyYvhIJ0iG"
FOLDER = "Releases_Servicos_CS"
TARGET_VERSION = "1.0.19.0"
ZIP_PATH = Path("publish/DNA.MonitorServiceSVC_v1.0.19.0.zip")

print("=== Upload Resiliente do Pacote 1.0.19.0 para o SharePoint Drive ===", flush=True)

data = ZIP_PATH.read_bytes()
sha256_hash = hashlib.sha256(data).hexdigest().lower()
size_mb = len(data) / (1024 * 1024)
print(f"Tamanho: {size_mb:.2f} MB | SHA-256: {sha256_hash}", flush=True)

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

def put_with_retry(url, content, content_type, desc):
    global token
    for attempt in range(1, 10):
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type
        }
        print(f"Enviando {desc} (Tentativa {attempt}/10)...", flush=True)
        try:
            r = requests.put(url, headers=headers, data=content, timeout=180)
            if r.ok:
                print(f"✅ {desc} enviado com sucesso!", flush=True)
                return True
            elif r.status_code == 429:
                ra = int(r.headers.get("Retry-After", 30))
                wait_time = max(ra + 2, 10)
                print(f"⚠️ [429 Throttling] Aguardando {wait_time}s antes de retentar {desc}...", flush=True)
                time.sleep(wait_time)
                token = get_token()
            else:
                print(f"❌ Erro HTTP {r.status_code}: {r.text[:200]}", flush=True)
                time.sleep(3)
        except Exception as ex:
            print(f"❌ Exceção de rede: {ex}", flush=True)
            time.sleep(5)
    return False

# 1. Upload do arquivo versionado
ver_name = f"DNA.MonitorServiceSVC_v{TARGET_VERSION}.zip"
url_ver = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{ver_name}:/content"
put_with_retry(url_ver, data, "application/zip", ver_name)

# 2. Upload do arquivo genérico latest
gen_name = "DNA.MonitorServiceSVC.zip"
url_gen = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{gen_name}:/content"
put_with_retry(url_gen, data, "application/zip", gen_name)

# 3. Upload do arquivo de hash .sha256
sha_name = f"{ver_name}.sha256"
url_sha = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{sha_name}:/content"
sha_content = f"{sha256_hash}  {ver_name}\n".encode("utf-8")
put_with_retry(url_sha, sha_content, "text/plain", sha_name)

# 4. Upload manifest_sha256.json
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
manifest_bytes = json.dumps(manifest_data, indent=2).encode("utf-8")
put_with_retry(manifest_url, manifest_bytes, "application/json", "manifest_sha256.json")

print("=== Processo de upload finalizado ===", flush=True)
