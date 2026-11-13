import requests

login = requests.post('http://127.0.0.1:8092/api/login', json={'username': 'cleber.goncalves', 'password': 'Password123!'})
token = login.json().get('token')
headers = {'Authorization': f'Bearer {token}'}

status_url = 'http://127.0.0.1:8092/api/fleet/action/status?host=BRGO-ANA-DT02&service_name=Atria%20Capture&target_version=2.0.0.2'
res = requests.get(status_url, headers=headers)
data = res.json()
print('Status Badge:', data.get('status_badge'))
print('Current Step:', data.get('current_step'))
print('Message:', data.get('message'))
for s in data.get('steps', []):
    print(f"Step {s['step']}: {s['title']} -> {s['status']} ({s['description']})")
