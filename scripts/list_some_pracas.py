import json
with open(r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json', 'r', encoding='utf-8') as f:
    hosts = json.load(f)

print([h['praca'] for h in hosts[:30]])
