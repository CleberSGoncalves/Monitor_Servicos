import json
with open(r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json', 'r', encoding='utf-8') as f:
    hosts = json.load(f)

for h in hosts:
    if 'paulo' in h['praca'].lower() or 'sp' in h['id'].lower():
        print(h)
