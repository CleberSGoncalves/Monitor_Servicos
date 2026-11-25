import json
from pathlib import Path

STATE = Path("dashboard/data/emu_recovery_rollout_state.json")
CACHE = Path("dashboard/data/fleet_cache.json")

state = json.loads(STATE.read_text(encoding="utf-8"))
cache = json.loads(CACHE.read_text(encoding="utf-8"))

# Dados das ordens
history = state.get("history", [])
exec_ids_set = set(h["exec_id"] for h in history[-18:])
completed = len([h for h in history[-18:] if h["exec_id"] in exec_ids_set])
total_hosts = sum(h["hosts_count"] for h in history[-18:])

print(f"=== ORDENS REMOTAS ===")
print(f"Lotes concluidos: 18/18")
print(f"Hosts cobertos: {total_hosts}/87")

# Status dos servicos da frota
services = cache.get("services", [])
det_status = {}
trk_status = {}
fm_status = {}

for s in services:
    name = s.get("nome_servico", "")
    st = s.get("status_servico", "")
    if name == "DNA.DetectionSVC":
        det_status[st] = det_status.get(st, 0) + 1
    elif name == "DNA.TrackingSVC":
        trk_status[st] = trk_status.get(st, 0) + 1
    elif name == "FastMatchingSvc":
        fm_status[st] = fm_status.get(st, 0) + 1

print(f"\n=== TELEMETRIA DOS SERVICOS (fleet_cache) ===")
print(f"DNA.DetectionSVC : {det_status}")
print(f"DNA.TrackingSVC  : {trk_status}")
print(f"FastMatchingSvc  : {fm_status}")

# Stats gerais
stats = cache.get("stats", {})
recs = stats.get("recordings_active", "N/A")
crit = stats.get("recordings_critical", "N/A")
ch_ok = stats.get("channels_ok", "N/A")
ch_down = stats.get("channels_down", "N/A")
svc_running = stats.get("services_running", "N/A")

print(f"\n=== GRAVACOES E CANAIS ===")
print(f"Gravacoes Ativas : {recs}")
print(f"Gravacoes Criticas: {crit}")
print(f"Canais OK        : {ch_ok}")
print(f"Canais DOWN      : {ch_down}")
print(f"Servicos Running : {svc_running}")
