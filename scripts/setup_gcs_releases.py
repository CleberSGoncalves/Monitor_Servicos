import os
import sys
import json
import time
import requests
from pathlib import Path

# Setup paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "dashboard"))

KEY_FILE = PROJECT_ROOT / "bamboo-dryad-494619-c9-f3fd4fb51715.json"
PROJECT_ID = "bamboo-dryad-494619-c9"
BUCKET_NAME = "kantar-fleet-releases"
REGION = "southamerica-east1"

def get_gcs_token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    creds = service_account.Credentials.from_service_account_file(
        str(KEY_FILE),
        scopes=["https://www.googleapis.com/auth/devstorage.full_control", "https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(Request())
    return creds.token

def create_bucket():
    token = get_gcs_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "name": BUCKET_NAME,
        "location": REGION,
        "storageClass": "STANDARD",
        "iamConfiguration": {
            "uniformBucketLevelAccess": {"enabled": False}
        }
    }
    r = requests.post(
        f"https://storage.googleapis.com/storage/v1/b?project={PROJECT_ID}",
        headers=headers,
        json=payload
    )
    if r.status_code in [200, 201]:
        print(f"✅ Bucket {BUCKET_NAME} criado com sucesso na região {REGION}!")
        return True
    elif r.status_code == 409:
        print(f"ℹ️ Bucket {BUCKET_NAME} já existe.")
        return True
    else:
        print(f"❌ Erro ao criar bucket ({r.status_code}): {r.text}")
        return False

def make_bucket_public():
    token = get_gcs_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    acl_payload = {"entity": "allUsers", "role": "READER"}
    r = requests.post(
        f"https://storage.googleapis.com/storage/v1/b/{BUCKET_NAME}/defaultObjectAccessControls",
        headers=headers,
        json=acl_payload
    )
    print(f"Permissão pública de download configurada (Status: {r.status_code}).")

def upload_file(local_path: Path, dest_name: str, content_type: str = "application/zip", cache_control: str = "public, max-age=3600"):
    token = get_gcs_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": content_type
    }
    data = local_path.read_bytes()
    upload_url = f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET_NAME}/o?uploadType=media&name={dest_name}"
    
    print(f"Enviando {dest_name} ({len(data) / (1024*1024):.2f} MB) para o Google Cloud Storage...")
    r = requests.post(upload_url, headers=headers, data=data)
    if r.status_code in [200, 201]:
        print(f"✅ {dest_name} enviado com sucesso!")
        # Set public read ACL on object and cache control
        patch_url = f"https://storage.googleapis.com/storage/v1/b/{BUCKET_NAME}/o/{dest_name}"
        patch_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        requests.patch(patch_url, headers=patch_headers, json={"cacheControl": cache_control})

        acl_r = requests.post(
            f"https://storage.googleapis.com/storage/v1/b/{BUCKET_NAME}/o/{dest_name}/acl",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"entity": "allUsers", "role": "READER"}
        )
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{dest_name}"
        print(f"🔗 URL Pública Google: {public_url}")
        return public_url
    else:
        print(f"❌ Falha no upload de {dest_name} ({r.status_code}): {r.text}")
        return None

if __name__ == "__main__":
    print("=== Inicializando Repositório Oficial no Google Cloud Storage ===")
    if create_bucket():
        make_bucket_public()
        zip_21 = PROJECT_ROOT / "publish" / "DNA.MonitorServiceSVC_v1.0.21.0.zip"
        if zip_21.exists():
            upload_file(zip_21, "DNA.MonitorServiceSVC_v1.0.21.0.zip")
            upload_file(zip_21, "DNA.MonitorServiceSVC.zip")
        manifest_path = PROJECT_ROOT / "publish" / "manifest.json"
        if manifest_path.exists():
            upload_file(manifest_path, "manifest.json", content_type="application/json")
