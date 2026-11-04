import sys
import io
import time
from pathlib import Path
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from config import SITE_ID, LIST_SERVICES_ID
from sharepoint_sync import get_graph_token
import json
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
            clean_id = str(item_id).split("_")[0]
            if clean_id not in seen:
                seen.add(clean_id)
                agents.append({"id": clean_id, "hostname": s.get("hostname") or "Host"})
    return agents

def audit():
    token = get_graph_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    
    agents = get_agents()[:25]
    print(f"Auditando amostra ao vivo de 25 estações no SharePoint...", flush=True)
    
    v19_count = 0
    in_prog_count = 0
    waiting_count = 0
    
    for a in agents:
        item_id = a["id"]
        host = a["hostname"]
        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 429:
                print("  ⚠️ Throttling 429 detectado!", flush=True)
                break
            if r.ok:
                f = r.json()
                inst = (f.get("Versao_Instalada") or "").strip().lstrip("vV")
                des = (f.get("Versao_Desejada") or "").strip().lstrip("vV")
                stat = f.get("Status_Atualizacao")
                acao = f.get("Acao_Solicitada")
                ult = f.get("Ultima_atualizacao")
                
                if inst == "1.0.19.0":
                    v19_count += 1
                    print(f"  ✅ [ATUALIZADO] {host}: Instalada={inst} | Desejada={des} | Status={stat} | Ação={acao} | Última={ult}", flush=True)
                elif stat in ("Em Progresso", "Atualizando"):
                    in_prog_count += 1
                    print(f"  🚀 [EM PROGRESSO] {host}: Instalada={inst} -> Alvo={des} | Status={stat} | Ação={acao}", flush=True)
                else:
                    waiting_count += 1
                    print(f"  ⏳ [NA FILA / AGUARDANDO CICLO] {host}: Instalada={inst} | Desejada={des} | Ação={acao}", flush=True)
            else:
                print(f"  ⚠️ {host}: HTTP {r.status_code}", flush=True)
        except Exception as e:
            print(f"  ⚠️ {host}: {e}", flush=True)
            
        time.sleep(0.1)
        
    print(f"\nResumo da Amostra: Atualizados: {v19_count} | Em Progresso: {in_prog_count} | Aguardando ciclo local: {waiting_count}", flush=True)

if __name__ == "__main__":
    audit()
