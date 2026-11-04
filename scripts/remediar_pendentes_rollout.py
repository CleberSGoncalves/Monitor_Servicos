import sys
import os
import json
import time
from pathlib import Path
import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from config import SITE_ID, LIST_SERVICES_ID
from sharepoint_sync import get_graph_token

TARGET_VERSION = "1.0.19.0"
CACHE_FILE = ROOT_DIR / "dashboard" / "data" / "fleet_cache.json"

def get_agents():
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    services = data.get("services", [])
    agents = []
    seen = set()
    for s in services:
        srv = (s.get("nome_servico") or "").strip()
        item_id = s.get("id")
        if srv in ("DNA.MonitorServiceSVC", "MonitorServiceSVC") and item_id:
            if item_id not in seen:
                seen.add(item_id)
                agents.append({"id": str(item_id), "hostname": s.get("hostname") or "Host"})
    return agents

def remediate():
    agents = get_agents()
    chunk = agents[180:] # Pega os 59 finais
    print(f"Verificando {len(chunk)} agentes finais...", flush=True)
    
    token = get_graph_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    
    for a in chunk:
        item_id = a["id"]
        host = a["hostname"]
        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        
        try:
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code == 429:
                wait_sec = int(r.headers.get("Retry-After", 10))
                print(f"  Throttled ao ler {host}. Aguardando {wait_sec}s...", flush=True)
                time.sleep(wait_sec + 1)
                continue
            if r.ok:
                f = r.json()
                des = f.get("Versao_Desejada")
                act = f.get("Acao_Solicitada")
                if des == TARGET_VERSION and act == "Atualizar":
                    print(f"  OK {host}: Ja configurado.", flush=True)
                    continue
                    
                patch_body = {
                    "Versao_Desejada": TARGET_VERSION,
                    "Acao_Solicitada": "Atualizar",
                    "Status_Atualizacao": "Desatualizado",
                    "Ultima_atualizacao": now_iso
                }
                r_patch = requests.patch(url, headers=headers, json=patch_body, timeout=15)
                if r_patch.ok:
                    print(f"  OK {host}: Atualizado para v{TARGET_VERSION}!", flush=True)
                else:
                    print(f"  Erro PATCH {host}: {r_patch.status_code}", flush=True)
            elif r.status_code == 404:
                print(f"  Item {host} (ID {item_id}) 404 (ID legado).", flush=True)
            else:
                print(f"  {host}: HTTP {r.status_code}", flush=True)
        except Exception as e:
            print(f"  {host}: Erro: {e}", flush=True)
            
        time.sleep(0.3)

if __name__ == "__main__":
    remediate()
