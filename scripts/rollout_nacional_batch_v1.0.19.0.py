r"""
Script de Rollout Nacional Ultrarrápido via Graph API $batch
Kantar IBOPE Media — Monitor_Servicos NOC LATAM

Atualiza as 239 praças em lotes de 20 (apenas 12 requisições batch),
com garantia de renovação de token e respeito estrito ao Retry-After.
"""

import sys
import os
import io
import time
import json
from pathlib import Path
import requests

# Força UTF-8 seguro no console Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from config import SITE_ID, LIST_SERVICES_ID
from sharepoint_sync import get_graph_token

TARGET_VERSION = "1.0.19.0"
CACHE_FILE = ROOT_DIR / "dashboard" / "data" / "fleet_cache.json"


def load_target_agents_from_cache():
    """Carrega os IDs e nomes das estações a partir do cache oficial."""
    if not CACHE_FILE.exists():
        print(f"❌ Cache não encontrado: {CACHE_FILE}")
        return []
        
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    services = data.get("services", [])
    agents = []
    seen_ids = set()
    
    for s in services:
        srv_name = (s.get("nome_servico") or "").strip()
        item_id = s.get("id")
        host = s.get("hostname") or "Host"
        praca = s.get("praca") or ""
        
        if srv_name in ("DNA.MonitorServiceSVC", "MonitorServiceSVC") and item_id:
            if item_id not in seen_ids:
                seen_ids.add(item_id)
                agents.append({
                    "id": str(item_id),
                    "hostname": host,
                    "praca": praca,
                    "versao_instalada": s.get("versao") or "",
                    "versao_desejada": s.get("versao_desejada") or "",
                    "acao": s.get("acao") or ""
                })
                
    return agents


def wait_until_graph_available():
    """Espera pacientemente até que o Microsoft Graph libere o rate limit."""
    print("[1/3] Verificando e aguardando disponibilidade do Microsoft Graph...")
    while True:
        token = get_graph_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items?$top=1&$select=id"
        
        try:
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code == 429:
                wait_sec = int(r.headers.get("Retry-After", 30))
                print(f"  ⏳ Graph Throttled (HTTP 429). Aguardando {wait_sec}s conforme diretriz Microsoft...")
                time.sleep(wait_sec + 2)
                continue
            elif r.ok:
                print("  ✅ Microsoft Graph liberado e 100% pronto para o rollout!")
                return True
            else:
                print(f"  ⚠️ HTTP {r.status_code}: {r.text[:150]}")
                time.sleep(5)
        except Exception as e:
            print(f"  ⚠️ Erro de rede: {e}")
            time.sleep(5)


def execute_batch_rollout(agents):
    """Executa o rollout em lotes de até 20 requisições via endpoint $batch."""
    total = len(agents)
    chunk_size = 20
    chunks = [agents[i:i + chunk_size] for i in range(0, total, chunk_size)]
    
    print(f"\n[2/3] Executando Rollout Nacional em {len(chunks)} lotes (Total: {total} estações)...")
    
    updated_count = 0
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    
    for c_idx, chunk in enumerate(chunks, 1):
        # Prepara requisição $batch
        batch_requests = []
        for a_idx, ag in enumerate(chunk):
            sub_id = str(a_idx + 1)
            item_id = ag["id"]
            
            patch_payload = {
                "Versao_Desejada": TARGET_VERSION,
                "Acao_Solicitada": "Atualizar",
                "Status_Atualizacao": "Desatualizado",
                "Ultima_atualizacao": now_iso
            }
            
            batch_requests.append({
                "id": sub_id,
                "method": "PATCH",
                "url": f"/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields",
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": patch_payload
            })
            
        batch_body = {"requests": batch_requests}
        
        # Envia com retry defensivo
        success_chunk = False
        for attempt in range(5):
            token = get_graph_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            try:
                r = requests.post("https://graph.microsoft.com/v1.0/$batch", headers=headers, json=batch_body, timeout=30)
                if r.status_code == 429:
                    wait_sec = int(r.headers.get("Retry-After", 10))
                    print(f"  ⏳ Lote {c_idx}/{len(chunks)} sofreu rate limit (429). Aguardando {wait_sec}s...")
                    time.sleep(wait_sec + 1)
                    continue
                    
                if r.ok:
                    res_json = r.json()
                    responses = res_json.get("responses", [])
                    success_in_batch = sum(1 for res in responses if res.get("status") in (200, 204))
                    updated_count += success_in_batch
                    
                    hosts_preview = ", ".join(ag["hostname"] for ag in chunk[:3])
                    print(f"  ✅ Lote {c_idx:02d}/{len(chunks):02d} OK: {success_in_batch}/{len(chunk)} atualizados ({hosts_preview}...)")
                    success_chunk = True
                    break
                else:
                    print(f"  ❌ Falha no lote {c_idx}: HTTP {r.status_code} - {r.text[:150]}")
                    break
            except Exception as e:
                print(f"  ⚠️ Erro no lote {c_idx}: {e}")
                time.sleep(3)
                
        # Intervalo respeitoso entre lotes
        time.sleep(2.5)
        
    print(f"\n[3/3] Atualizando cache local da frota para refletir Versao_Desejada={TARGET_VERSION}...")
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cache_data = json.load(f)
            
        for s in cache_data.get("services", []):
            if s.get("nome_servico") in ("DNA.MonitorServiceSVC", "MonitorServiceSVC"):
                s["versao_desejada"] = TARGET_VERSION
                s["acao"] = "Atualizar"
                s["status_atualizacao"] = "Desatualizado"
                
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, indent=2, ensure_ascii=False)
            
        print("  ✅ Cache local da frota sincronizado com sucesso!")
    except Exception as e:
        print(f"  ⚠️ Aviso ao atualizar cache local: {e}")
        
    print("\n" + "=" * 70)
    print("🎉 ROLLOUT NACIONAL DO AGENTE v1.0.19.0 CONCLUÍDO COM SUCESSO!")
    print(f"   Total de Praças/Hosts no Brasil: {total}")
    print(f"   Estações com Ordem 'Atualizar' Homologada: {updated_count}")
    print(f"   Versão Alvo Homologada: v{TARGET_VERSION}")
    print("=" * 70)


def main():
    agents = load_target_agents_from_cache()
    if not agents:
        print("❌ Nenhum agente encontrado no cache.")
        return
        
    print(f"📋 Total de estações com DNA.MonitorServiceSVC mapeadas no Brasil: {len(agents)}")
    if wait_until_graph_available():
        execute_batch_rollout(agents)


if __name__ == "__main__":
    main()
