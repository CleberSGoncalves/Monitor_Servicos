import sys
import json
from pathlib import Path
from datetime import datetime, timezone

DASHBOARD_DIR = Path("dashboard")
sys.path.insert(0, str(DASHBOARD_DIR.resolve()))

from gcp_sync import get_latest_command_for_host, get_firestore_client
from config import DATA_DIR

CACHE_FILE = DATA_DIR / "fleet_cache.json"
cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
services = cache.get("services", [])

# Mapear todos os CS01
cs1_map = {}
for s in services:
    if s.get("cs") != 1:
        continue
    h = s.get("hostname")
    if not h:
        continue
    if h not in cs1_map:
        cs1_map[h] = {
            "hostname": h,
            "praca": s.get("praca"),
            "id_host": s.get("id_host"),
            "raw_hostname": s.get("raw_hostname"),
            "services": {},
            "last_heartbeat": s.get("ultima_atualizacao")
        }
    cs1_map[h]["services"][s.get("nome_servico")] = {
        "status": s.get("status_servico"),
        "versao": s.get("versao_instalada"),
        "uptime": s.get("uptime")
    }

# Filtrar legadas (excluir as 33 FastMatching)
legacy_cs1 = {}
for h, info in cs1_map.items():
    det = info["services"].get("DNA.DetectionSVC", {}).get("status")
    fm = info["services"].get("FastMatchingSvc", {}).get("status")
    if fm == "Em Execução" and det in ("Desativado", "Inexistente"):
        continue
    legacy_cs1[h] = info

now = datetime.now(timezone.utc)
results = []

for h, info in sorted(legacy_cs1.items(), key=lambda x: x[1]["praca"]):
    praca = info["praca"]
    id_h = info["id_host"]
    
    # 1. Status dos serviços no heartbeat
    atria_st = info["services"].get("Atria Capture", {}).get("status", "N/A")
    det_st = info["services"].get("DNA.DetectionSVC", {}).get("status", "N/A")
    trk_st = info["services"].get("DNA.TrackingSVC", {}).get("status", "N/A")
    fm_st = info["services"].get("FastMatchingSvc", {}).get("status", "N/A")
    
    # Heartbeat
    hb_str = info["last_heartbeat"]
    is_online = False
    hb_age_min = 9999
    if hb_str:
        try:
            hb_dt = datetime.fromisoformat(hb_str.replace("Z", "+00:00"))
            hb_age_min = (now - hb_dt).total_seconds() / 60.0
            if hb_age_min < 120:
                is_online = True
        except Exception:
            pass

    # 2. Status no Firestore do comando de reversão
    latest = get_latest_command_for_host(h, "Atria Capture")
    cmd_st = "NÃO_DISPARADO"
    cmd_out = ""
    exit_c = None
    if latest:
        cmd_st = latest.get("status", "desconhecido")
        cmd_out = latest.get("output", "")
        exit_c = latest.get("exit_code")

    # Avaliação dos 4 pilares:
    # Pilar 1: Perfil EMU corrigido? (Apenas se o script rodou com sucesso no host ou se comprovado)
    pilar_emu = "SIM (Confirmado)" if (cmd_st == "completed" and exit_c == 0) else ("EM AVALIAÇÃO / PENDENTE" if cmd_st in ("pending", "processing") else "NÃO APLICADO")
    
    # Pilar 2: Atria reiniciado e em execução?
    pilar_atria = "OK (Em Execução)" if atria_st == "Em Execução" else f"ALERTA ({atria_st})"
    
    # Pilar 3: Detection e Tracking funcionando juntos?
    both_running = (det_st == "Em Execução" and trk_st == "Em Execução")
    pilar_det_trk = "OK (Ambos Ativos)" if both_running else f"DIVERGENTE (Det: {det_st} | Trk: {trk_st})"
    
    # Pilar 4: Detection no Automático?
    # O comando powershell aplica 'sc.exe config DNA.DetectionSVC start= auto'. Se completed, foi aplicado.
    # Caso contrário, pode ainda estar em manual/legado.
    pilar_startup = "SIM (Automático Confirmado)" if (cmd_st == "completed" and exit_c == 0) else "NÃO GARANTIDO (Pode estar Manual)"

    results.append({
        "id_host": id_h,
        "praca": praca,
        "hostname": h,
        "online": is_online,
        "hb_age_min": round(hb_age_min, 1),
        "cmd_status": cmd_st,
        "atria_status": atria_st,
        "det_status": det_st,
        "trk_status": trk_st,
        "fm_status": fm_st,
        "pilar_emu": pilar_emu,
        "pilar_atria": pilar_atria,
        "pilar_det_trk": pilar_det_trk,
        "pilar_startup": pilar_startup
    })

OUTPUT_FILE = DASHBOARD_DIR / "data" / "fleet_audit_4_pilares.json"
OUTPUT_FILE.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

# Estatísticas gerais
total = len(results)
emu_ok = sum(1 for r in results if "Confirmado" in r["pilar_emu"])
atria_ok = sum(1 for r in results if "OK" in r["pilar_atria"])
det_trk_ok = sum(1 for r in results if "OK" in r["pilar_det_trk"])
startup_ok = sum(1 for r in results if "Confirmado" in r["pilar_startup"])

print(f"Total Praças Legadas Avaliadas: {total}")
print(f"Pilar 1 (Perfil EMU emu_mdna confirmado)       : {emu_ok}/{total}")
print(f"Pilar 2 (Atria Capture Em Execução)            : {atria_ok}/{total}")
print(f"Pilar 3 (Detection e Tracking Ativos em Dupla) : {det_trk_ok}/{total}")
print(f"Pilar 4 (Detection no Automático Confirmado)   : {startup_ok}/{total}")
