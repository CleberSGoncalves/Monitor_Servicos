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

def check_progress():
    token = get_graph_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items?expand=fields&$top=500"
    items = []
    
    while url:
        for attempt in range(3):
            try:
                r = requests.get(url, headers=headers, timeout=25)
                if r.status_code == 429:
                    wait_sec = int(r.headers.get("Retry-After", 10))
                    print(f"  ⏳ Throttled. Aguardando {wait_sec}s...")
                    time.sleep(wait_sec + 1)
                    continue
                if r.ok:
                    data = r.json()
                    items.extend(data.get("value", []))
                    url = data.get("@odata.nextLink")
                    break
                else:
                    url = None
                    break
            except Exception as e:
                time.sleep(2)
                
    agents = []
    for it in items:
        f = it.get("fields", {})
        srv = (f.get("Nome_Servico") or "").strip()
        if srv.lower() in ("dna.monitorservicesvc", "monitorservicesvc"):
            agents.append(f)
            
    total = len(agents)
    v19 = [a for a in agents if (a.get("Versao_Instalada") or "").strip().lstrip("vV") == "1.0.19.0"]
    v18 = [a for a in agents if (a.get("Versao_Instalada") or "").strip().lstrip("vV") == "1.0.18.0"]
    older = [a for a in agents if a not in v19 and a not in v18]
    in_prog = [a for a in agents if (a.get("Status_Atualizacao") or "").lower() in ("em progresso", "atualizando")]
    target_v19 = [a for a in agents if (a.get("Versao_Desejada") or "").strip().lstrip("vV") == "1.0.19.0"]
    
    print("=" * 60)
    print("STATUS ATUAL DO ROLLOUT NACIONAL (DNA.MonitorServiceSVC)")
    print("=" * 60)
    print(f"Total de máquinas monitoradas: {total}")
    print(f"  -> Já Atualizadas na v1.0.19.0 : {len(v19)} ({len(v19)/max(total,1)*100:.1f}%)")
    print(f"  -> Em Progresso de Upgrade     : {len(in_prog)}")
    print(f"  -> Na v1.0.18.0 (Fila/Próx Ciclo): {len(v18)}")
    print(f"  -> Outras Versões Legadas      : {len(older)}")
    print(f"  -> Com Versão Desejada 1.0.19.0: {len(target_v19)} ({len(target_v19)/max(total,1)*100:.1f}%)")
    print("=" * 60)
    
    # Amostra dos atualizados
    if v19:
        print("\nExemplos de Hosts já atualizados na v1.0.19.0:")
        for a in v19[:10]:
            print(f"  ✅ {a.get('Hostname')} ({a.get('Praca')}): Instalada={a.get('Versao_Instalada')}, Status={a.get('Status_Atualizacao')}")
            
    # Checagem específica de Boa Vista
    bva_list = [a for a in agents if "BVA" in (a.get("Hostname") or "")]
    if bva_list:
        print("\nStatus específico de Boa Vista (BRRR-BVA):")
        for b in bva_list:
            print(f"  📌 Host: {b.get('Hostname')} ({b.get('Praca')}) | Instalada: {b.get('Versao_Instalada')} | Desejada: {b.get('Versao_Desejada')} | Ação: {b.get('Acao_Solicitada')} | Status: {b.get('Status_Atualizacao')}")

if __name__ == "__main__":
    check_progress()
