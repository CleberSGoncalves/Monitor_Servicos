import sys
import time
import random
import requests
import json
sys.path.insert(0, 'dashboard')
from sharepoint_sync import get_graph_token, sync_fleet_data
from config import SITE_ID, LIST_SERVICES_ID

def log(msg):
    print(msg, flush=True)

def patch_with_retry(url, headers, payload, max_retries=6):
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.patch(url, headers=headers, json=payload, timeout=20)
            if resp.ok:
                return resp
            
            if resp.status_code == 429 or "activityLimitReached" in resp.text:
                retry_after_str = resp.headers.get("Retry-After", "")
                try:
                    retry_secs = int(retry_after_str)
                except Exception:
                    retry_secs = 5
                
                # Backoff exponencial suave com jitter
                wait_time = max(retry_secs, 3) + random.uniform(1.0, 3.0) + (attempt * 1.5)
                log(f"    [Throttling 429] Graph pediu espera. Tentativa {attempt}/{max_retries} em {wait_time:.1f}s...")
                time.sleep(wait_time)
                continue
            else:
                return resp
        except Exception as ex:
            log(f"    [Excecao de rede] {ex}. Aguardando 4s...")
            time.sleep(4)
            
    return resp

def main():
    token = get_graph_token()
    if not token:
        log("ERRO: Nao foi possivel obter token de autenticacao SPN.")
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    remediations = [
        {
            "host": "BRPA-PUP-DT01",
            "cs": "CS01",
            "service": "DNA.MonitorServiceSVC",
            "item_id": "158927",
            "payload": {
                "Versao_Desejada": "1.0.18.0",
                "Acao_Solicitada": "Atualizar",
                "Status_Atualizacao": "Pendente"
            },
            "desc": "Atualizar agente local de Parauapebas CS01 para v1.0.18.0"
        },
        {
            "host": "BRPA-PUP-DT01",
            "cs": "CS01",
            "service": "DNA.DetectionSVC",
            "item_id": "160123",
            "payload": {
                "Acao_Solicitada": "Parar"
            },
            "desc": "Parar DNA.DetectionSVC (conflito com FastMatchingSvc)"
        },
        {
            "host": "BRPA-PUP-DT02",
            "cs": "CS02",
            "service": "DNA.MonitorServiceSVC",
            "item_id": "153754",
            "payload": {
                "Versao_Desejada": "1.0.18.0",
                "Acao_Solicitada": "Atualizar",
                "Status_Atualizacao": "Pendente"
            },
            "desc": "Atualizar agente local de Parauapebas CS02 para v1.0.18.0"
        },
        {
            "host": "BRPA-PUP-DT02",
            "cs": "CS02",
            "service": "Atria Capture",
            "item_id": "157393",
            "payload": {
                "Acao_Solicitada": "Iniciar"
            },
            "desc": "Iniciar servico Atria Capture em Parauapebas CS02"
        }
    ]

    log("==================================================================")
    log(" EXECUTANDO REMEDIACAO OFICIAL DE PARAUAPEBAS CS01 E CS02")
    log("==================================================================")

    sucessos = 0
    for r in remediations:
        item_id = r["item_id"]
        patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        log(f"\n[Remediacao] {r['host']} ({r['cs']}) - {r['service']} (ID {item_id})")
        log(f"  Motivo: {r['desc']}")
        log(f"  Payload: {r['payload']}")

        resp = patch_with_retry(patch_url, headers, r["payload"])
        if resp and resp.ok:
            log(f"  --> SUCESSO! Registro atualizado com exito no SharePoint (HTTP {resp.status_code}).")
            sucessos += 1
        else:
            status = resp.status_code if resp else 0
            err_text = resp.text[:200] if resp else "Sem resposta"
            log(f"  --> FALHA (HTTP {status}): {err_text}")
        
        time.sleep(1.5)

    log("\n==================================================================")
    log(f" Resultado: {sucessos}/{len(remediations)} operacoes concluidas com exito.")
    log("==================================================================")

    if sucessos > 0:
        log("\nSincronizando cache local da Central de Monitoramento...")
        sync_fleet_data()
        log("Sincronizacao concluida!")

if __name__ == "__main__":
    main()
