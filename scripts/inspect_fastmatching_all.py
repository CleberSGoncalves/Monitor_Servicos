import sys
from pathlib import Path

DASHBOARD_DIR = Path("dashboard")
sys.path.insert(0, str(DASHBOARD_DIR.resolve()))

from sharepoint_sync import get_cached_data
from tracking_detection_monitor import build_detection_fleet_snapshot

data = get_cached_data()
services = data.get("services", [])

fm_svcs = [
    s for s in services 
    if "fastmatch" in str(s.get("nome_servico") or "").lower() or "fastmach" in str(s.get("nome_servico") or "").lower()
]

print(f"=== ANÁLISE COMPLETA DO PARQUE FASTMATCHING ===")
print(f"Total de registros FastMatching no SharePoint/Cache: {len(fm_svcs)}")

# Status breakdown
by_status = {}
for s in fm_svcs:
    st = str(s.get("status_servico") or "Vazio").strip()
    by_status[st] = by_status.get(st, 0) + 1

for st, cnt in sorted(by_status.items(), key=lambda x: -x[1]):
    print(f"  • {st}: {cnt} registros")

# 1. Os que estão Em Execução
running_svcs = [s for s in fm_svcs if any(w in str(s.get("status_servico") or "").lower() for w in ["execu", "running"])]
print(f"\n--- 1. REGISTROS 'EM EXECUÇÃO' ({len(running_svcs)}) ---")
for i, s in enumerate(running_svcs, 1):
    cs = s.get("cs")
    h = s.get("hostname")
    p = s.get("praca")
    v = s.get("versao_instalada")
    r = s.get("ram_uso")
    print(f"{i:2d}. Praça: {p:25s} | Host: {h:30s} | CS: {str(cs):3s} | Versão: {str(v):10s} | RAM: {str(r)}")

# 2. Os que estão Desativados (instalados, mas parados/desativados para usar o legado)
disabled_svcs = [s for s in fm_svcs if "desativado" in str(s.get("status_servico") or "").lower()]
print(f"\n--- 2. REGISTROS 'DESATIVADO' (INSTALADO MAS EM STANDBY/FALLBACK) ({len(disabled_svcs)}) ---")
for i, s in enumerate(disabled_svcs[:15], 1):
    cs = s.get("cs")
    h = s.get("hostname")
    p = s.get("praca")
    v = s.get("versao_instalada")
    print(f"{i:2d}. Praça: {p:25s} | Host: {h:30s} | CS: {str(cs):3s} | Versão: {str(v):10s}")
if len(disabled_svcs) > 15:
    print(f"... e mais {len(disabled_svcs) - 15} praças desativadas.")

# 3. Snapshot oficial do CS01
snapshot = build_detection_fleet_snapshot()
sites = snapshot.get("sites", [])

fm_primary = [s for s in sites if s.get("engine_tier") == "PRIMARY"]
fm_conflict = [s for s in sites if s.get("engine_tier") == "CONFLICT"]
det_fallback = [s for s in sites if s.get("engine_tier") == "FALLBACK"]

print(f"\n--- 3. CLASSIFICAÇÃO NO SNAPSHOT DE CS01 ({len(sites)} praças avaliadas) ---")
print(f"  • PRIMARY (FastMatching Oficial): {len(fm_primary)}")
print(f"  • CONFLICT (Ambos Ativos): {len(fm_conflict)}")
print(f"  • FALLBACK (DetectionSVC Legado): {len(det_fallback)}")

print("\n--- DETALHES DOS 30 NÓS PRIMARY ---")
for s in fm_primary:
    fm = s.get("pipeline_services", {}).get("fastmatching", {})
    det = s.get("pipeline_services", {}).get("detection", {})
    p = s.get("praca")
    h = s.get("hostname")
    fm_st = fm.get("status")
    det_st = det.get("status")
    ram = s.get("ram_uso")
    print(f"{p:22s} | {h:30s} | FM: {str(fm_st):15s} | Det: {str(det_st):15s} | RAM: {str(ram)}")
