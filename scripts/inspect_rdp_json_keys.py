import json
with open(r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json', 'r', encoding='utf-8') as f:
    hosts = json.load(f)

print('Hosts count:', len(hosts))
print('First host keys:', hosts[0].keys())
print('First host:', hosts[0])
