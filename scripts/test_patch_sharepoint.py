import sys, requests, time, json
sys.path.insert(0, 'dashboard')
from config import CLIENT_ID, CLIENT_SECRET, TENANT_ID, SITE_ID, LIST_SERVICES_ID

print(f"Obtendo token para {CLIENT_ID}...", flush=True)
url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
data = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET, 'scope': 'https://graph.microsoft.com/.default'}
r = requests.post(url, data=data, timeout=15)
token = r.json().get('access_token')

item_id = '194659'
patch_url = f'https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields'
headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
payload = {
    'Versao_Instalada': '1.0.19.0',
    'Versao_Desejada': '1.0.19.0',
    'Status_Atualizacao': 'Atualizado',
    'Acao_Solicitada': 'Nenhuma'
}

print(f"Enviando PATCH para {patch_url}...", flush=True)
resp = requests.patch(patch_url, headers=headers, json=payload, timeout=15)
print(f"Status Code: {resp.status_code}", flush=True)
if resp.ok:
    print("SUCESSO! Registro 194659 atualizado para 1.0.19.0 no SharePoint!", flush=True)
    print("Campos:", resp.json())
elif resp.status_code == 429:
    print(f"[429 Throttled] Retry-After: {resp.headers.get('Retry-After')}s", flush=True)
else:
    print(f"Erro {resp.status_code}: {resp.text}", flush=True)
