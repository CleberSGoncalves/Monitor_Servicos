import os
import json
import hashlib
import zipfile
import requests
from pathlib import Path
from datetime import datetime, timezone
from google.oauth2 import service_account
from google.auth.transport.requests import Request

BASE_DIR = Path(__file__).resolve().parent.parent
KEY_FILE = BASE_DIR / "bamboo-dryad-494619-c9-f3fd4fb51715.json"
PUBLISH_DIR = BASE_DIR / "publish"
SERVICOS_DIR = PUBLISH_DIR / "servicos"
BUCKET_NAME = "kantar-fleet-releases"

SERVICES_MAP = {
    "ConfigMonitorSVC": {
        "canonical_names": ["DNA.ConfigMonitorSVC", "ConfigMonitorSVC"],
        "version": "4.8.0.0",
        "zip_name": "DNA.ConfigMonitorSVC_v4.8.0.0.zip"
    },
    "DetectionSVC": {
        "canonical_names": ["DNA.DetectionSVC", "DetectionSVC"],
        "version": "3.4.6040.21056",
        "zip_name": "DNA.DetectionSVC_v3.4.6040.21056.zip"
    },
    "FileTransferSVC": {
        "canonical_names": ["DNA.FiletransferSVC", "DNA.FileTransferSVC", "FileTransferSVC", "FiletransferSVC"],
        "version": "3.6.6828.34652",
        "zip_name": "DNA.FiletransferSVC_v3.6.6828.34652.zip"
    },
    "MediaConverterSVC": {
        "canonical_names": ["DNA.MediaConverterSVC", "MediaConverterSVC"],
        "version": "2.0.2.4",
        "zip_name": "DNA.MediaConverterSVC_v2.0.2.4.zip"
    },
    "MediaRecorderSVC": {
        "canonical_names": ["DNA.MediaRecorderSVC", "MediaRecorderSVC"],
        "version": "6.1.4.9",
        "zip_name": "DNA.MediaRecorderSVC_v6.1.4.9.zip"
    },
    "RemoteCommandSVC": {
        "canonical_names": ["DNA.RemoteCommandSVC", "RemoteCommandSVC"],
        "version": "3.0.6079.30614",
        "zip_name": "DNA.RemoteCommandSVC_v3.0.6079.30614.zip"
    },
    "TimeSyncSVC": {
        "canonical_names": ["DNA.TimeSyncSVC", "TimeSyncSVC"],
        "version": "3.1.6040.21436",
        "zip_name": "DNA.TimeSyncSVC_v3.1.6040.21436.zip"
    },
    "TrackingSVC": {
        "canonical_names": ["DNA.TrackingSVC", "TrackingSVC"],
        "version": "3.2.6040.21460",
        "zip_name": "DNA.TrackingSVC_v3.2.6040.21460.zip"
    },
    "Tanium": {
        "canonical_names": ["Tanium Client", "Tanium"],
        "version": "7.8.2.1152",
        "zip_name": "Tanium_v7.8.2.1152.zip"
    },
    "Zabbix": {
        "canonical_names": ["Zabbix Agent", "Zabbix"],
        "version": "7.0.0.49955f1fb5c",
        "zip_name": "Zabbix_v7.0.0.49955f1fb5c.zip"
    }
}


def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest().lower()


def create_zip_from_folder(folder_path: Path, zip_path: Path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(folder_path):
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(folder_path)
                zf.write(full_path, str(rel_path))


def upload_to_gcs(token: str, file_path: Path, object_name: str, content_type: str = "application/zip", no_cache: bool = False):
    url = f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET_NAME}/o?uploadType=media&name={object_name}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": content_type
    }
    if no_cache:
        headers["Cache-Control"] = "no-cache, max-age=0, must-revalidate"
    with open(file_path, "rb") as f:
        resp = requests.post(url, headers=headers, data=f, timeout=180)
    resp.raise_for_status()

    if no_cache:
        meta_url = f"https://storage.googleapis.com/storage/v1/b/{BUCKET_NAME}/o/{object_name}"
        requests.patch(
            meta_url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"cacheControl": "no-cache, max-age=0, must-revalidate"},
            timeout=30
        )


def main():
    creds = service_account.Credentials.from_service_account_file(
        str(KEY_FILE),
        scopes=["https://www.googleapis.com/auth/devstorage.full_control"]
    )
    creds.refresh(Request())
    token = creds.token

    # Base manifest with DNA.MonitorServiceSVC v1.0.21.3 and Atria Capture
    agent_zip = PUBLISH_DIR / "DNA.MonitorServiceSVC_v1.0.21.3.zip"
    agent_sha = compute_sha256(agent_zip)

    manifest = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "services": {
            "DNA.MonitorServiceSVC": {
                "version": "1.0.21.3",
                "package_name": "DNA.MonitorServiceSVC_v1.0.21.3.zip",
                "download_url": f"https://storage.googleapis.com/{BUCKET_NAME}/DNA.MonitorServiceSVC_v1.0.21.3.zip",
                "sha256": agent_sha
            },
            "Atria Capture": {
                "version": "2.0.0.2",
                "install_url": "https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1",
                "download_url": "https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1"
            }
        }
    }

    for folder_name, info in SERVICES_MAP.items():
        src_folder = SERVICOS_DIR / folder_name
        if not src_folder.exists():
            print(f"[AVISO] Pasta nao encontrada: {src_folder}")
            continue

        zip_name = info["zip_name"]
        zip_path = PUBLISH_DIR / zip_name
        print(f"Compactando {folder_name} -> {zip_name}...")
        create_zip_from_folder(src_folder, zip_path)
        sha256_hash = compute_sha256(zip_path)
        size_mb = zip_path.stat().st_size / (1024 * 1024)
        print(f"  Tamanho: {size_mb:.2f} MB | SHA-256: {sha256_hash}")

        print(f"  Enviando {zip_name} para Google Cloud Storage...")
        upload_to_gcs(token, zip_path, zip_name)

        dl_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{zip_name}"
        for cname in info["canonical_names"]:
            manifest["services"][cname] = {
                "version": info["version"],
                "package_name": zip_name,
                "file_name": zip_name,
                "download_url": dl_url,
                "sha256": sha256_hash
            }

    manifest_path = PUBLISH_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print("Enviando manifest.json atualizado para Google Cloud Storage...")
    upload_to_gcs(token, manifest_path, "manifest.json", content_type="application/json", no_cache=True)
    print("[OK] Todos os servicos foram empacotados e publicados no Google Cloud Storage com sucesso!")


if __name__ == "__main__":
    main()
