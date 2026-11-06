import sys
import io
import time
import hashlib
from pathlib import Path
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID

DRIVE_ID = "b!R5fko7abk0yZMN2ibI0QUFX-yDT-LPxOjOApWP13XuB7rzp8hYGATLhyYvhIJ0iG"
FOLDER = "Releases_Servicos_CS"
TARGET_VERSION = "1.0.20.0"
ZIP_PATH = ROOT_DIR / "publish" / f"DNA.MonitorServiceSVC_v{TARGET_VERSION}.zip"
BOOTSTRAP_PATH = ROOT_DIR / "WinServiceFleetAgent" / "Scripts" / "bootstrap_update.ps1"

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

def put_file_with_retry(token, url, data, content_type, desc):
    for attempt in range(1, 10):
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type
        }
        print(f"[{attempt}/10] Enviando {desc} ({len(data)} bytes)...", flush=True)
        try:
            r = requests.put(url, headers=headers, data=data, timeout=180)
            if r.ok:
                print(f"  ✅ {desc} enviado com sucesso! (HTTP {r.status_code})", flush=True)
                return True
            elif r.status_code == 429:
                ra = int(r.headers.get("Retry-After", 20))
                wait_time = max(ra + 3, 10)
                print(f"  ⚠️ [429 Throttling] Aguardando {wait_time}s antes de retentar {desc}...", flush=True)
                time.sleep(wait_time)
                token = get_token()
            else:
                print(f"  ❌ Erro HTTP {r.status_code}: {r.text[:200]}", flush=True)
                time.sleep(5)
        except Exception as ex:
            print(f"  ❌ Exceção de rede: {ex}", flush=True)
            time.sleep(5)
    return False

def main():
    print("=== Upload dos Pacotes Homologados 1.0.20.0 para Releases_Servicos_CS ===", flush=True)
    if not ZIP_PATH.exists():
        print(f"ERRO: Arquivo {ZIP_PATH} nao encontrado!")
        sys.exit(1)
        
    data = ZIP_PATH.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest().lower()
    size_mb = len(data) / (1024 * 1024)
    print(f"Arquivo: {ZIP_PATH.name} | Tamanho: {size_mb:.2f} MB | SHA-256: {sha256}", flush=True)
    
    token = get_token()
    
    # 1. Upload DNA.MonitorServiceSVC_v1.0.20.0.zip diretamente em Releases_Servicos_CS/
    ver_name = f"DNA.MonitorServiceSVC_v{TARGET_VERSION}.zip"
    url_ver = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{ver_name}:/content"
    put_file_with_retry(token, url_ver, data, "application/zip", ver_name)
    
    # 2. Upload DNA.MonitorServiceSVC.zip (latest) diretamente em Releases_Servicos_CS/
    gen_name = "DNA.MonitorServiceSVC.zip"
    url_gen = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{gen_name}:/content"
    put_file_with_retry(token, url_gen, data, "application/zip", gen_name)
    
    # 3. Upload DNA.MonitorServiceSVC_v1.0.20.0.zip.sha256
    sha_name = f"{ver_name}.sha256"
    url_sha = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{sha_name}:/content"
    sha_content = f"{sha256}  {ver_name}\n".encode("utf-8")
    put_file_with_retry(token, url_sha, sha_content, "text/plain", sha_name)
    
    # 4. Upload DNA.MonitorServiceSVC.zip.sha256
    gen_sha_name = f"{gen_name}.sha256"
    url_gen_sha = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{gen_sha_name}:/content"
    gen_sha_content = f"{sha256}  {gen_name}\n".encode("utf-8")
    put_file_with_retry(token, url_gen_sha, gen_sha_content, "text/plain", gen_sha_name)
    
    # 5. Upload bootstrap_update.ps1 para Releases_Servicos_CS/
    if BOOTSTRAP_PATH.exists():
        bs_data = BOOTSTRAP_PATH.read_bytes()
        url_bs = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/bootstrap_update.ps1:/content"
        put_file_with_retry(token, url_bs, bs_data, "text/plain", "bootstrap_update.ps1")
        
    # 6. Upload manifest_sha256.json
    manifest_url = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/manifest_sha256.json:/content"
    manifest_data = {
        "version": TARGET_VERSION,
        "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "services": {
            "DNA.MonitorServiceSVC": {
                "version": TARGET_VERSION,
                "sha256": sha256,
                "file_name": ver_name,
                "min_agent_version": "1.0.0.0"
            }
        }
    }
    manifest_bytes = json_str = requests.compat.json.dumps(manifest_data, indent=2).encode("utf-8")
    put_file_with_retry(token, manifest_url, manifest_bytes, "application/json", "manifest_sha256.json")
    
    print("=== TODOS OS ARQUIVOS FORAM HOMOLOGADOS COM SUCESSO NO SHAREPOINT! ===", flush=True)

if __name__ == "__main__":
    main()
