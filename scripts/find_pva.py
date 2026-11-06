import sys, requests, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID, SITE_ID, LIST_SERVICES_ID

url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
data = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET, 'scope': 'https://graph.microsoft.com/.default'}
token = requests.post(url, data=data, timeout=15).json().get('access_token')

headers = {'Authorization': f'Bearer {token}'}
fields = "id,Hostname,Nome_Servico,Versao_Instalada,Status_Atualizacao,Ultima_atualizacao"
next_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items?$select=id,fields&$expand=fields($select={fields})&$top=500"

found_items = []
page = 1
while next_url:
    r = requests.get(next_url, headers=headers, timeout=20)
    if not r.ok:
        print(f"Page {page} failed: {r.status_code}")
        break
    data = r.json()
    val = data.get('value', [])
    for it in val:
        f = it.get('fields', {})
        h = f.get('Hostname', '')
        if 'BRPR-PVA' in h:
            found_items.append((it.get('id'), h, f.get('Nome_Servico'), f.get('Versao_Instalada'), f.get('Status_Atualizacao'), f.get('Ultima_atualizacao')))
    next_url = data.get('@odata.nextLink')
    print(f"Page {page}: checked {len(val)} items. Total PVA found: {len(found_items)}")
    page += 1

print("\nAll PVA items found:")
for it in found_items:
    print(" ", it)
