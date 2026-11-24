import json
import os
from collections import Counter

cache_path = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'data', 'fleet_cache.json')
with open(cache_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

services = data.get('services', [])

# MediaRecorder em Execução
mr_running = [s for s in services if s.get('nome_servico') == 'DNA.MediaRecorderSVC' and s.get('status_servico') == 'Em Execução']
print(f"Total DNA.MediaRecorderSVC 'Em Execução': {len(mr_running)}")
for s in mr_running:
    print(f"  • {s.get('hostname')} ({s.get('praca')} CS{s.get('cs')}) - Versão: {s.get('versao_instalada')}")

# MediaRecorder Status Geral
mr_svcs = [s for s in services if s.get('nome_servico') == 'DNA.MediaRecorderSVC']
print(f"\nTotal DNA.MediaRecorderSVC monitorados: {len(mr_svcs)}")
mr_status = Counter(s.get('status_servico') for s in mr_svcs)
for st, cnt in mr_status.most_common():
    print(f"  Status '{st}': {cnt}")

mr_versions = Counter(s.get('versao_instalada') for s in mr_svcs)
print("\nVersões cadastradas de DNA.MediaRecorderSVC:")
for v, cnt in mr_versions.most_common():
    print(f"  {v}: {cnt}")

# Cruzamento: Existe algum host onde MediaRecorder roda e Atria NÃO roda?
atria_running_hosts = set(s.get('hostname') for s in services if s.get('nome_servico') == 'Atria Capture' and s.get('status_servico') == 'Em Execução')
mr_running_hosts = set(s.get('hostname') for s in mr_running)

only_mr = mr_running_hosts - atria_running_hosts
both = mr_running_hosts & atria_running_hosts

print(f"\nHosts rodando SOMENTE MediaRecorder (Sem Atria): {len(only_mr)}")
for h in only_mr:
    print(f"  - {h}")

print(f"\nHosts rodando TANTO MediaRecorder QUANTO Atria Capture: {len(both)}")
for h in both:
    print(f"  - {h}")
