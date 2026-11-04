r"""
Script Oficial de Publicação e Rollout Nacional do Agente v1.0.19.0
Kantar IBOPE Media — Monitor_Servicos NOC LATAM

Objetivos:
1. Respeitar o período de cooldown do Microsoft Graph API (Retry-After)
2. Publicar o pacote oficial DNA.MonitorServiceSVC_v1.0.19.0.zip no SharePoint Corporativo
3. Atualizar o manifest_sha256.json com o hash SHA-256 homologado
4. Atualizar a Versao_Desejada = 1.0.19.0 e Acao_Solicitada = 'Atualizar' em todas as praças da frota
"""

import sys
import os
import io
import time
import json
import hashlib
from pathlib import Path
import requests

# Força UTF-8 seguro no console Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Ajusta path para importar módulos do dashboard
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from config import SITE_ID, LIST_SERVICES_ID
from sharepoint_sync import get_graph_token

DRIVE_ID = "b!R5fko7abk0yZMN2ibI0QUFX-yDT-LPxOjOApWP13XuB7rzp8hYGATLhyYvhIJ0iG"
FOLDER = "Releases_Servicos_CS"
TARGET_VERSION = "1.0.19.0"
ZIP_PATH = ROOT_DIR / "publish" / "DNA.MonitorServiceSVC_v1.0.19.0.zip"


def wait_for_rate_limit(max_wait=300):
    """Aguarda até que a cota do Microsoft Graph API esteja liberada."""
    print("[1/5] Verificando status de Rate Limit no Microsoft Graph API...")
    start = time.time()
    
    while time.time() - start < max_wait:
        token = get_graph_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}:/children?$top=1"
        
        try:
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code == 429:
                retry_after = int(r.headers.get("Retry-After", 30))
                print(f"  ⏳ Graph API Throttled (HTTP 429). Aguardando {retry_after}s conforme orientação da Microsoft...")
                time.sleep(retry_after + 2)
                continue
            elif r.ok:
                print("  ✅ Microsoft Graph API operacional e liberada para escrita!")
                return True
            else:
                print(f"  ⚠️ Resposta HTTP {r.status_code}: {r.text[:200]}")
                time.sleep(5)
        except Exception as e:
            print(f"  ⚠️ Erro de rede ao verificar Graph: {e}")
            time.sleep(5)
            
    print("❌ Tempo limite de espera pelo rate limit excedido.")
    return False


def upload_release_package(token: str, sha256_hash: str):
    """Faz o upload dos pacotes zip e sha256 para o SharePoint Drive."""
    print(f"\n[2/5] Publicando pacote oficial v{TARGET_VERSION} no SharePoint Drive...")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/zip"
    }
    
    data = ZIP_PATH.read_bytes()
    size_mb = len(data) / (1024 * 1024)
    print(f"  -> Tamanho do pacote: {size_mb:.2f} MB | SHA-256: {sha256_hash}")
    
    # 1. Upload do arquivo versionado
    ver_name = f"DNA.MonitorServiceSVC_v{TARGET_VERSION}.zip"
    url_ver = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{ver_name}:/content"
    print(f"  -> Enviando {ver_name}...")
    r1 = requests.put(url_ver, headers=headers, data=data, timeout=120)
    if not r1.ok:
        print(f"  ❌ Erro ao enviar {ver_name}: {r1.status_code} - {r1.text}")
        return False
    print(f"  ✅ {ver_name} enviado com sucesso!")
    
    # 2. Upload do arquivo genérico latest
    gen_name = "DNA.MonitorServiceSVC.zip"
    url_gen = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{gen_name}:/content"
    print(f"  -> Enviando {gen_name}...")
    r2 = requests.put(url_gen, headers=headers, data=data, timeout=120)
    if not r2.ok:
        print(f"  ❌ Erro ao enviar {gen_name}: {r2.status_code} - {r2.text}")
        return False
    print(f"  ✅ {gen_name} enviado com sucesso!")
    
    # 3. Upload do arquivo de hash .sha256
    sha_name = f"{ver_name}.sha256"
    url_sha = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/{sha_name}:/content"
    sha_headers = {"Authorization": f"Bearer {token}", "Content-Type": "text/plain"}
    sha_content = f"{sha256_hash}  {ver_name}\n".encode("utf-8")
    r3 = requests.put(url_sha, headers=sha_headers, data=sha_content, timeout=30)
    if r3.ok:
        print(f"  ✅ {sha_name} enviado com sucesso!")
        
    return True


def update_manifest_file(token: str, sha256_hash: str):
    """Atualiza o manifest_sha256.json corporativo no SharePoint."""
    print(f"\n[3/5] Atualizando manifesto corporativo de releases (manifest_sha256.json)...")
    headers = {"Authorization": f"Bearer {token}"}
    manifest_url = f"https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/{FOLDER}/manifest_sha256.json:/content"
    
    manifest_data = {"services": {}}
    try:
        r = requests.get(manifest_url, headers=headers, timeout=20)
        if r.ok:
            manifest_data = r.json()
    except Exception as e:
        print(f"  ⚠️ Aviso ao ler manifesto atual: {e}")
        
    if "services" not in manifest_data:
        manifest_data["services"] = {}
        
    manifest_data["services"]["DNA.MonitorServiceSVC"] = {
        "latest_version": TARGET_VERSION,
        "file_name": f"DNA.MonitorServiceSVC_v{TARGET_VERSION}.zip",
        "sha256": sha256_hash,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "description": "Release v1.0.19.0 - Remocao total de uploads continuos de logs, polling 180s, jitter dinamico 0-30s e eliminacao de HTTP 429."
    }
    
    manifest_bytes = json.dumps(manifest_data, indent=2).encode("utf-8")
    put_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r_put = requests.put(manifest_url, headers=put_headers, data=manifest_bytes, timeout=30)
    if r_put.ok:
        print("  ✅ manifest_sha256.json atualizado e homologado com sucesso no SharePoint!")
        return True
    else:
        print(f"  ❌ Erro ao atualizar manifesto: {r_put.status_code} - {r_put.text}")
        return False


def get_all_agent_service_items(token: str):
    """Carrega todos os itens de DNA.MonitorServiceSVC da lista do SharePoint."""
    print(f"\n[4/5] Localizando hosts de 'DNA.MonitorServiceSVC' em todo o Brasil...")
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    items = []
    next_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items?expand=fields&$top=500"
    
    while next_url:
        for attempt in range(5):
            try:
                r = requests.get(next_url, headers=headers, timeout=30)
                if r.status_code == 429:
                    retry_wait = int(r.headers.get("Retry-After", 10))
                    print(f"  ⏳ Throttling ao consultar lista. Aguardando {retry_wait}s...")
                    time.sleep(retry_wait + 1)
                    continue
                if r.ok:
                    data = r.json()
                    val = data.get("value", [])
                    items.extend(val)
                    next_url = data.get("@odata.nextLink")
                    break
                else:
                    print(f"  ❌ Erro na listagem: {r.status_code}")
                    next_url = None
                    break
            except Exception as e:
                print(f"  ⚠️ Erro de rede ao buscar itens: {e}")
                time.sleep(3)
                
    # Filtra por DNA.MonitorServiceSVC
    agent_items = []
    for it in items:
        f = it.get("fields", {})
        srv = (f.get("Nome_Servico") or "").strip()
        if srv.lower() in ("dna.monitorservicesvc", "monitorservicesvc"):
            agent_items.append(it)
            
    print(f"  -> Total de estações com o serviço de monitoramento encontradas: {len(agent_items)}")
    return agent_items


def rollout_update_to_fleet(token: str, agent_items: list):
    """Dispara a atualização de Versao_Desejada e Acao_Solicitada nas praças."""
    print(f"\n[5/5] Disparando ordem de atualização para v{TARGET_VERSION} nas praças...")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    total = len(agent_items)
    updated_count = 0
    already_current = 0
    errors = 0
    
    for idx, item in enumerate(agent_items, 1):
        item_id = item.get("id")
        f = item.get("fields", {})
        host = f.get("Hostname", "Desconhecido")
        praca = f.get("Praca", "")
        installed = (f.get("Versao_Instalada") or "").strip().lstrip("vV")
        desired = (f.get("Versao_Desejada") or "").strip().lstrip("vV")
        action = (f.get("Acao_Solicitada") or "").strip()
        
        is_up_to_date = (installed == TARGET_VERSION)
        
        if is_up_to_date and desired == TARGET_VERSION and action in ("Nenhuma", ""):
            already_current += 1
            print(f"  [{idx}/{total}] ⏩ {host} ({praca}): Já atualizado na v{TARGET_VERSION}")
            continue
            
        status_atualizacao = "Atualizado" if is_up_to_date else "Desatualizado"
        acao_solicitada = "Nenhuma" if is_up_to_date else "Atualizar"
        
        patch_body = {
            "Versao_Desejada": TARGET_VERSION,
            "Status_Atualizacao": status_atualizacao,
            "Acao_Solicitada": acao_solicitada,
            "Ultima_atualizacao": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        
        url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        
        success = False
        for attempt in range(5):
            try:
                r = requests.patch(url, headers=headers, json=patch_body, timeout=20)
                if r.status_code == 429:
                    wait_sec = int(r.headers.get("Retry-After", 5))
                    print(f"  ⏳ Throttling ao atualizar {host}. Aguardando {wait_sec}s...")
                    time.sleep(wait_sec + 1)
                    continue
                if r.ok:
                    success = True
                    updated_count += 1
                    print(f"  [{idx}/{total}] ✅ {host} ({praca}): Versão Desejada = v{TARGET_VERSION} | Ação = {acao_solicitada}")
                    break
                else:
                    print(f"  [{idx}/{total}] ⚠️ Falha ao atualizar {host}: HTTP {r.status_code}")
                    break
            except Exception as e:
                print(f"  [{idx}/{total}] ⚠️ Erro de rede em {host}: {e}")
                time.sleep(2)
                
        if not success:
            errors += 1
            
        # Pequena pausa deliberada para não estourar taxa de escrita no Graph API
        time.sleep(0.15)
        
    print("\n" + "=" * 70)
    print("RESUMO DO ROLLOUT NACIONAL:")
    print(f"  Total de Estações Processadas: {total}")
    print(f"  Estações com Ordem de Atualização Aplicada: {updated_count}")
    print(f"  Estações que Já Estavam na Versão: {already_current}")
    print(f"  Falhas: {errors}")
    print("=" * 70)


def main():
    print("=" * 70)
    print(f"INICIANDO PUBLICAÇÃO E ROLLOUT NACIONAL DO AGENTE v{TARGET_VERSION}")
    print("=" * 70)
    
    if not ZIP_PATH.exists():
        print(f"❌ Arquivo não encontrado: {ZIP_PATH}")
        sys.exit(1)
        
    sha256_hash = hashlib.sha256(ZIP_PATH.read_bytes()).hexdigest()
    
    if not wait_for_rate_limit(max_wait=360):
        sys.exit(1)
        
    token = get_graph_token()
    if not token:
        print("❌ Erro ao obter token do Microsoft Graph")
        sys.exit(1)
        
    if not upload_release_package(token, sha256_hash):
        print("❌ Falha no upload do pacote. Abortando.")
        sys.exit(1)
        
    if not update_manifest_file(token, sha256_hash):
        print("❌ Falha na atualização do manifesto. Abortando.")
        sys.exit(1)
        
    # Re-obtém token fresco se necessário e aplica rollout
    token = get_graph_token()
    agent_items = get_all_agent_service_items(token)
    rollout_update_to_fleet(token, agent_items)
    print("\n🚀 PROCESSO CONCLUÍDO COM SUCESSO!")


if __name__ == "__main__":
    main()
