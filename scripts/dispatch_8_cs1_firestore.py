"""
Despacha a reversão real de perfil EMU (emu_mdna + Detection/Tracking Automático +
FastMatching/FileCleaner Desativado + Reinício do Atria) via Google Cloud Firestore
('fleet_commands') apenas para as 8 CS01 solicitadas.
"""
import sys
import json
import uuid
from pathlib import Path
from datetime import datetime, timezone

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from fleet_actions import build_legacy_stack_remediation_script
from gcp_sync import dispatch_remote_command_to_firestore, get_latest_command_for_host

TARGET_HOSTS_CS1 = [
    "Tangara_da_Serra-SMME-272-CS1",
    "Santa_Maria-SMME-274-CS1",
    "Joacaba-SMME-278-CS1",
    "Foz_do_Iguacu-SMME-282-CS1",
    "Teresina-SMME-285-CS1",
    "Resende-SMME-296-CS1",
    "Pelotas-SMME-297-CS1",
    "Varginha-SMME-299-CS1",
]

STATE_FILE = DASHBOARD_DIR / "data" / "emu_8_cs1_firestore_state.json"


def dispatch():
    script = build_legacy_stack_remediation_script()
    batch_ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    records = []
    for host in TARGET_HOSTS_CS1:
        cmd_id = f"emu_fix_{host}_{batch_ts}_{uuid.uuid4().hex[:6]}"
        ok = dispatch_remote_command_to_firestore(
            command_id=cmd_id,
            hostname=host,
            service_name="Atria Capture",
            action="run_script",
            shell_type="powershell",
            script=script,
            requested_by="NOC-Cleber-CS1-Direct",
        )
        records.append({
            "host": host,
            "command_id": cmd_id,
            "dispatched": ok,
            "dispatched_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"{'✅' if ok else '❌'} Firestore dispatch -> {host} (cmd_id={cmd_id})")

    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    return records


def check_live():
    if not STATE_FILE.exists():
        print("Estado nao encontrado.")
        return
    records = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    print(f"\n=== STATUS REAL FIRESTORE ({datetime.now().strftime('%H:%M:%S')}) ===")
    for r in records:
        host = r["host"]
        latest = get_latest_command_for_host(host, "Atria Capture")
        if not latest:
            print(f"  ⏳ {host:32s} | sem registro no Firestore")
            continue
        st = latest.get("status", "?")
        cmd_id = latest.get("command_id", "")
        exit_c = latest.get("exit_code")
        out = (latest.get("output") or "").strip().splitlines()
        last_line = out[-1][:90] if out else ""
        icon = "✅" if st == "completed" else ("⚡" if st == "processing" else ("❌" if st == "failed" else "⏳"))
        print(f"  {icon} {host:32s} | status={st:10s} | exit={exit_c} | {last_line}")


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    if args.check:
        check_live()
    else:
        dispatch()
        check_live()
