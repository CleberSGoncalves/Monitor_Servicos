import sys
sys.path.insert(0, 'dashboard')
from sharepoint_sync import get_cached_data, get_graph_token, SITE_ID, LIST_SERVICES_ID
import requests
from datetime import datetime, timezone

data = get_cached_data()
srvs = data.get('services', [])
ana_srvs = [s for s in srvs if 'BRGO-ANA-DT02' in s.get('hostname', '').upper()]
print(f'Total services for BRGO-ANA-DT02: {len(ana_srvs)}')
for s in ana_srvs:
    print(f"Service: {s.get('nome_servico')} [Status: {s.get('status_servico')}] [Inst: {s.get('versao_instalada')}] [Des: {s.get('versao_desejada')}] [Acao: {s.get('acao_solicitada')}] [Upd: {s.get('status_atualizacao')}] [Last: {s.get('ultima_atualizacao')}]")

token = get_graph_token()
headers = {'Authorization': f'Bearer {token}'}
r = requests.get(f'https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/194518/fields', headers=headers, timeout=10)
print('SharePoint Item 194518 status:', r.status_code)
if r.ok:
    f = r.json()
    print('  Hostname:', f.get('Hostname'))
    print('  Nome_Servico:', f.get('Nome_Servico'))
    print('  Versao_Instalada:', f.get('Versao_Instalada'))
    print('  Versao_Desejada:', f.get('Versao_Desejada'))
    print('  Acao_Solicitada:', f.get('Acao_Solicitada'))
    print('  Status_Atualizacao:', f.get('Status_Atualizacao'))
    print('  Ultima_atualizacao:', f.get('Ultima_atualizacao'))
    print('  Modified:', f.get('Modified'))
