import sys
from pathlib import Path

DASHBOARD_DIR = Path("dashboard")
sys.path.insert(0, str(DASHBOARD_DIR.resolve()))

from tracking_detection_monitor import build_detection_fleet_snapshot, get_fleet_services

services = get_fleet_services()
snapshot = build_detection_fleet_snapshot()
sites = snapshot.get("sites", [])

print(f"=== TOTAL CS01 SITES: {len(sites)} ===")

# 1. Filtro exato do JavaScript no dashboard:
fm_sites_js = []
for s in sites:
    if s.get("engine_tier") == "FALLBACK" or s.get("active_engine") == "DNA.DetectionSVC":
        continue
    pipe = s.get("pipeline_services", {})
    fm = pipe.get("fast_matching") or pipe.get("fastmatching", {})
    is_uninstalled = fm.get("is_uninstalled", False)
    st = fm.get("status", "")
    running = fm.get("running", False)
    tier = s.get("engine_tier", "")
    if fm and not is_uninstalled and st not in ["Não Encontrado", "Desativado"] and (running or tier == "PRIMARY"):
        fm_sites_js.append(s)

print(f"\n1. PRAÇAS CONSIDERADAS OFICIAIS NO FASTMATCHING HOJE ({len(fm_sites_js)} nós):")
for i, s in enumerate(fm_sites_js, 1):
    h = s.get("hostname")
    p = s.get("praca")
    fm = s.get("pipeline_services", {}).get("fastmatching", {})
    st = fm.get("status")
    print(f"{i:2d}. {p:25s} | {h:30s} | Status: {st} | Tier: {s.get('engine_tier')}")

# 2. Praças onde FastMatching está instalado como serviço mas NÃO está contando como oficial no filtro atual:
other_fm = []
for s in sites:
    if s in fm_sites_js:
        continue
    pipe = s.get("pipeline_services", {})
    fm = pipe.get("fast_matching") or pipe.get("fastmatching", {})
    st = fm.get("status", "")
    if fm and st not in ["Não Encontrado", "Inexistente", "Desinstalado", "N/A"]:
        other_fm.append((s, st, s.get("engine_tier"), s.get("active_engine")))

print(f"\n2. PRAÇAS COM FASTMATCHING INSTALADO MAS FORA DO OFICIAL ATUAL ({len(other_fm)} nós):")
for s, st, tier, active in other_fm:
    print(f"   {s.get('praca'):25s} | {s.get('hostname'):30s} | FM Status: {st:15s} | Tier: {tier} | Active: {active}")
