import sys
from pathlib import Path

DASHBOARD_DIR = Path("dashboard")
sys.path.insert(0, str(DASHBOARD_DIR.resolve()))

from tracking_detection_monitor import build_detection_fleet_snapshot

snapshot = build_detection_fleet_snapshot()
sites = snapshot.get("sites", [])
primary = [s for s in sites if s.get("engine_tier") == "PRIMARY"]
primary.sort(key=lambda x: x.get("praca", ""))

print(f"TOTAL OFICIAIS PRIMARY: {len(primary)}")
for i, s in enumerate(primary, 1):
    fm = s.get("pipeline_services", {}).get("fastmatching", {})
    p = s.get("praca")
    h = s.get("hostname")
    v = fm.get("version", "N/A")
    st = fm.get("status")
    ram = s.get("ram_uso")
    print(f"{i:2d}. {p:25s} | Host: {h:32s} | Versão: {v:10s} | Status: {st} | RAM: {ram}")
