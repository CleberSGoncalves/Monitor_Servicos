import sys
import os
import io
import json
import time
from pathlib import Path
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from config import SITE_ID, LIST_SERVICES_ID
from sharepoint_sync import get_graph_token

TARGET_VERSION = "1.0.19.0"
CACHE_FILE = ROOT_DIR / "dashboard" / "data" / "fleet_cache.json"

def remediate_cs1():
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    services = data.get("services", [])
    
    # Filtra os que tem sufixo _cs1 no ID
    cs1_agents = []
    seen = set()
    for s in services:
        srv = (s.get("nome_servico") or "").strip()
        item_id = str(s.get("id") or "")
        if srv in ("DNA.MonitorServiceSVC", "MonitorServiceSVC") and "_" in item_id:
            clean_id = item_id.split("_")[0]
            if clean_id not in seen and clean_id.isdigit():
                seen.add(clean_id)
                cs1_agents.append({"id": clean_id, "hostname": s.get("hostname") or "Host"})
                
    print(f"Total de itens CS1 desambiguados para atualizar: {len(cs1_agents)}", flush=True)
    
    token = get_graph_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    
    for a in cs1_agents:
        item_id = a["id"]
        host = a["hostname"]
        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        
        patch_body = {
            "Versao_Desejada": TARGET_VERSION,
            "Acao_Solicitada": "Atualizar",
            "Status_Atualizacao": "Desatualizado",
            "Ultima_atualizacao": now_iso
        }
        
        for attempt in range(3):
            try:
                r = requests.patch(url, headers=headers, json=patch_body, timeout=15)
                if r.status_code == 429:
                    wait_sec = int(r.headers.get("Retry-After", 10))
                    print(f"  ⏳ Throttled ao atualizar {host} (ID {item_id}). Aguardando {wait_sec}s...", flush=True)
                    time.sleep(wait_sec + 1)
                    continue
                if r.ok:
                    print(f"  ✅ OK {host} (ID {item_id}): Atualizado para v{TARGET_VERSION}!", flush=True)
                    break
                else:
                    print(f"  ⚠️ Erro {host} (ID {item_id}): HTTP {r.status_code}", flush=True)
                    break
            except Exception as e:
                print(f"  ⚠️ Excecao em {host}: {e}", flush=True)
                time.sleep(2)
                
        time.sleep(0.3)
        
    print("\n✅ Finalizada a sincronização de todos os itens desambiguados!", flush=True)

if __name__ == "__main__":
    remediate_cs1()
