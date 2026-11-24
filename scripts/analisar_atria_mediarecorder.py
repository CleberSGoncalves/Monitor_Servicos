import json
import os
from collections import Counter

cache_path = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'data', 'fleet_cache.json')
with open(cache_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

services = data.get('services', [])
print(f"Total registros em fleet_cache: {len(services)}")

svc_counts = Counter(s.get('nome_servico') for s in services)
print("\n--- Contagem por Serviço ---")
for k, v in svc_counts.most_common():
    print(f"  {k}: {v}")

atria_svcs = [s for s in services if s.get('nome_servico') == 'Atria Capture']
print(f"\n--- Atria Capture (Total: {len(atria_svcs)}) ---")
atria_ver = Counter(s.get('versao_instalada') for s in atria_svcs)
for ver, cnt in atria_ver.most_common():
    pct = (cnt / len(atria_svcs)) * 100
    print(f"  Versão {ver}: {cnt} ({pct:.2f}%)")

status_ver = Counter(s.get('status_servico') for s in atria_svcs)
print("\n--- Status de Execução do Atria ---")
for st, cnt in status_ver.most_common():
    print(f"  {st}: {cnt}")

# Hosts com MediaRecorder ou sem Atria
hosts_with_atria = set(s.get('hostname') for s in atria_svcs if s.get('hostname'))
all_hosts = set(s.get('hostname') for s in services if s.get('hostname'))
hosts_without_atria = all_hosts - hosts_with_atria

print(f"\nTotal hosts distintos no fleet_cache: {len(all_hosts)}")
print(f"Hosts COM Atria Capture cadastrado: {len(hosts_with_atria)}")
print(f"Hosts SEM Atria Capture cadastrado: {len(hosts_without_atria)}")

print("\n--- Detalhes dos Hosts sem Atria Capture ---")
for h in sorted(hosts_without_atria):
    h_svcs = [s for s in services if s.get('hostname') == h]
    praca = h_svcs[0].get('praca') if h_svcs else 'N/A'
    cs = h_svcs[0].get('cs') if h_svcs else 'N/A'
    svcs_names = [f"{s.get('nome_servico')} [{s.get('versao_instalada')}] ({s.get('status_servico')})" for s in h_svcs]
    print(f"  • {h} | Praça: {praca} | CS: {cs} -> {', '.join(svcs_names)}")

# Procurar explicitamente menções a MediaRecorder ou Capture Site
mediarec_svcs = [s for s in services if 'mediarecorder' in (s.get('nome_servico') or '').lower() or 'recorder' in (s.get('nome_servico') or '').lower()]
print(f"\nServiços com nome 'MediaRecorder': {len(mediarec_svcs)}")
for s in mediarec_svcs:
    print(f"  {s.get('hostname')} - {s.get('praca')} - {s.get('nome_servico')} ({s.get('versao_instalada')})")
