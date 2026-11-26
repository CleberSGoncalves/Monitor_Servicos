"""
Dispara e monitora a execução real no Google Cloud Firestore para as 20 praças CS01 pendentes.
"""
import sys
import json
import uuid
import time
from pathlib import Path
from datetime import datetime, timezone

DASHBOARD_DIR = Path("dashboard")
sys.path.insert(0, str(DASHBOARD_DIR.resolve()))

from fleet_actions import build_legacy_stack_remediation_script
from gcp_sync import dispatch_remote_command_to_firestore, get_latest_command_for_host

PENDING_20_CS1 = [
    ("Brasília", "Brasilia-SMME-186-CS1"),
    ("Curitiba", "Curitiba-SMME-251-CS1"),
    ("Palmas", "Palmas-SMME-168-CS1"),
    ("Mossoró", "Mossoro-SMME-197-CS1"),
    ("Londrina", "Londrina-SMME-216-CS1"),
    ("Natal", "Natal-SMME-234-CS1"),
    ("Maceió", "Maceio-SMME-254-CS1"),
    ("Macapá", "Macapa-SMME-268-CS1"),
    ("Sinop", "Sinop-SMME-335-CS1"),
    ("Paranavaí", "Paranavai-SMME-336-CS1"),
    ("Cuiabá", "Cuiaba-SMME-252-CS1"),
    ("João Pessoa", "JOAO_PESSOA-SMME-264-CS1"),
    ("Passo Fundo", "Passo_Fundo-SMME-332-CS1"),
    ("Floriano", "Floriano-SMME-131-CS1"),
    ("Mogi das Cruzes", "Mogi_das_Cruzes-SMME-172-CS1"),
    ("Itabuna", "Itabuna-SMME-213-CS1"),
    ("Paragominas", "Paragominas-SMME-235-CS1"),
    ("Cacoal", "Cacoal-SMME-259-CS1"),
    ("Rondonópolis", "Rondonopolis-SMME-269-CS1"),
    ("Rio Grande", "Rio_Grande-SMME-270-CS1"),
    ("Tangará da Serra", "Tangara_da_Serra-SMME-272-CS1"), # Incluído também
]

STATE_FILE = DASHBOARD_DIR / "data" / "emu_20_pending_firestore_state.json"

def dispatch():
    script = build_legacy_stack_remediation_script()
    batch_ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    records = []
    
    print(f"\n🚀 DISPARANDO ORDEM EMERGENCIAL VIA FIRESTORE PARA {len(PENDING_20_CS1)} PRAÇAS...")
    for praca, host in PENDING_20_CS1:
        cmd_id = f"emu_fix_{host}_{batch_ts}_{uuid.uuid4().hex[:6]}"
        ok = dispatch_remote_command_to_firestore(
            command_id=cmd_id,
            hostname=host,
            service_name="Atria Capture",
            action="run_script",
            shell_type="powershell",
            script=script,
            requested_by="NOC-Cleber-20-CS1-Final",
        )
        records.append({
            "praca": praca,
            "host": host,
            "command_id": cmd_id,
            "dispatched": ok,
            "dispatched_at": datetime.now(timezone.utc).isoformat(),
        })
        status_icon = "✅ Enfileirado" if ok else "❌ Erro"
        print(f"  {status_icon} | {praca:18s} ({host})")

    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    return records

def check():
    if not STATE_FILE.exists():
        print("Arquivo de estado não encontrado.")
        return
    records = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    
    completed = 0
    processing = 0
    pending = 0
    failed = 0
    
    print(f"\n=== STATUS REAL FIRESTORE ({datetime.now().strftime('%H:%M:%S')}) ===")
    for r in records:
        praca = r["praca"]
        host = r["host"]
        latest = get_latest_command_for_host(host, "Atria Capture")
        st = latest.get("status", "sem_registro") if latest else "sem_registro"
        exit_c = latest.get("exit_code") if latest else None
        out = (latest.get("output") or "").strip().splitlines() if latest else []
        last_line = out[-1][:70] if out else ""
        
        if st == "completed":
            completed += 1
            icon = "✅"
        elif st == "processing":
            processing += 1
            icon = "⚡"
        elif st == "failed":
            failed += 1
            icon = "❌"
        else:
            pending += 1
            icon = "⏳"
            
        print(f"  {icon} {praca:18s} ({host:28s}) | {st:10s} | exit={str(exit_c):4s} | {last_line}")
        
    print(f"\nResumo: ✅ Concluídas: {completed}/{len(records)} | ⚡ Executando: {processing} | ⏳ Pendentes: {pending} | ❌ Falhas: {failed}")
    return completed, processing, pending, failed

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    if args.check:
        check()
    else:
        dispatch()
        time.sleep(2)
        check()
