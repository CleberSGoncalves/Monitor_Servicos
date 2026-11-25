import sys
import json
from pathlib import Path
from datetime import datetime, timezone

DASHBOARD_DIR = Path("dashboard")
sys.path.insert(0, str(DASHBOARD_DIR.resolve()))

from gcp_sync import get_latest_command_for_host, get_firestore_client, _gcp_project_id
import requests
from config import DATA_DIR

CACHE_FILE = DATA_DIR / "fleet_cache.json"
cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
services = cache.get("services", [])

# Identificar todos os CS01 legados:
# Regra: cs == 1 e NÃO é praça 100% FastMatching
# Vamos checar o status de DNA.DetectionSVC e FastMatchingSvc no fleet_cache para cada CS1
cs1_hosts = {}
for s in services:
    if s.get("cs") != 1:
        continue
    h = s.get("hostname")
    if not h:
        continue
    if h not in cs1_hosts:
        cs1_hosts[h] = {
            "hostname": h,
            "praca": s.get("praca"),
            "id_host": s.get("id_host"),
            "raw_hostname": s.get("raw_hostname"),
            "services": {},
            "last_heartbeat": s.get("ultima_atualizacao")
        }
    cs1_hosts[h]["services"][s.get("nome_servico")] = {
        "status": s.get("status_servico"),
        "versao": s.get("versao_instalada")
    }

# Classificar em FastMatching vs Legado
# Praças modernas de FastMatching têm FastMatchingSvc 'Em Execução' e Detection 'Desativado'
legacy_cs1 = {}
fastmatching_cs1 = {}

for h, info in cs1_hosts.items():
    det = info["services"].get("DNA.DetectionSVC", {}).get("status")
    fm = info["services"].get("FastMatchingSvc", {}).get("status")
    
    # Se FastMatching está Em Execução e Detection está Desativado/Inexistente -> FastMatching
    if fm == "Em Execução" and det in ("Desativado", "Inexistente"):
        fastmatching_cs1[h] = info
    else:
        legacy_cs1[h] = info

print(f"Total CS01 na frota: {len(cs1_hosts)}")
print(f"CS01 FastMatching (Não alterar, usam 1min): {len(fastmatching_cs1)}")
print(f"CS01 Legados (Necessitam emu_mdna): {len(legacy_cs1)}")

# Agora vamos varrer o Firestore para ver o status REAL de cada CS01 legado
client = get_firestore_client()
completed_hosts = []
pending_hosts = []
never_dispatched_hosts = []
stale_offline_hosts = []

now = datetime.now(timezone.utc)

for h, info in sorted(legacy_cs1.items()):
    hb_str = info["last_heartbeat"]
    is_offline = True
    if hb_str:
        try:
            # Parse ISO date
            hb_dt = datetime.fromisoformat(hb_str.replace("Z", "+00:00"))
            age_hours = (now - hb_dt).total_seconds() / 3600.0
            if age_hours < 2.0:
                is_offline = False
        except Exception:
            pass
            
    latest = get_latest_command_for_host(h, "Atria Capture")
    if not latest:
        never_dispatched_hosts.append((h, info["praca"], info["id_host"], is_offline, hb_str))
    else:
        st = latest.get("status")
        if st == "completed":
            completed_hosts.append((h, info["praca"], latest.get("output", "")))
        elif st in ("pending", "processing"):
            pending_hosts.append((h, info["praca"], info["id_host"], st, is_offline, hb_str))
        else:
            pending_hosts.append((h, info["praca"], info["id_host"], st, is_offline, hb_str))

print("\n" + "="*50)
print(f"STATUS REAL FIRESTORE - VARREDURA COMPLETA CS01 LEGADOS:")
print(f"✅ CONCLUÍDOS COM SUCESSO NO HOST REAL : {len(completed_hosts)}")
print(f"⏳ DISPARADOS MAS AINDA PENDENTES     : {len(pending_hosts)}")
print(f"❌ NUNCA DISPARADOS NO FIRESTORE      : {len(never_dispatched_hosts)}")
print("="*50)

print("\n--- ✅ JÁ CONCLUÍDAS COM SUCESSO (REAL) ---")
for h, praca, out in completed_hosts:
    print(f"  [OK] {praca:25s} ({h})")

print("\n--- ⏳ PENDENTES NO FIRESTORE (Aguardando agente pegar ou offline) ---")
for h, praca, id_h, st, off, hb in pending_hosts:
    off_tag = "🔴 OFFLINE/SEM HB" if off else "🟢 ONLINE"
    print(f"  [PENDENTE] {praca:25s} (ID {id_h}) -> status: {st} | {off_tag} (último hb: {hb})")

print("\n--- ❌ NUNCA DISPARADOS NO FIRESTORE (Precisam ser disparados agora!) ---")
for h, praca, id_h, off, hb in never_dispatched_hosts:
    off_tag = "🔴 OFFLINE" if off else "🟢 ONLINE"
    print(f"  [NAO DISPARADO] {praca:25s} (ID {id_h}) | Host: {h} | {off_tag}")
