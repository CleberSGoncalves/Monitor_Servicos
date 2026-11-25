import sqlite3
import json
from pathlib import Path
from datetime import datetime, timezone

DB_PATH = Path("dashboard/data/fleet.db")
STATE_PATH = Path("dashboard/data/emu_recovery_rollout_state.json")

def get_snapshot():
    if not DB_PATH.exists() or not STATE_PATH.exists():
        return {"error": "Dados nao encontrados"}
    
    state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    history = state.get("history", [])
    exec_ids = [h["exec_id"] for h in history[-18:]]
    if not exec_ids:
        return {"error": "Sem execucoes registradas"}

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    placeholders = ",".join(["?"] * len(exec_ids))
    
    cursor.execute(f"""
        SELECT r.host, r.status, r.duration_ms, r.executed_at, e.command_title, e.id
        FROM remote_command_results r
        JOIN remote_command_executions e ON r.execution_id = e.id
        WHERE r.execution_id IN ({placeholders})
        ORDER BY r.id ASC
    """, exec_ids)
    rows = cursor.fetchall()

    by_lote = {}
    total_sucesso = 0
    total_pendente = 0

    for r in rows:
        host, status, dur, ex_at, cmd_title, eid = r
        lote_num = cmd_title.split("Lote")[-1].strip() if "Lote" in cmd_title else "Geral"
        if lote_num not in by_lote:
            by_lote[lote_num] = []
        by_lote[lote_num].append({
            "host": host,
            "cidade": host.split("-")[0],
            "status": status,
            "duration_ms": dur,
            "executed_at": ex_at
        })
        if status in ("sucesso", "concluido"):
            total_sucesso += 1
        else:
            total_pendente += 1

    return {
        "timestamp": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "total_hosts": len(rows),
        "total_sucesso": total_sucesso,
        "total_pendente": total_pendente,
        "lotes": by_lote
    }

if __name__ == "__main__":
    snap = get_snapshot()
    print(json.dumps(snap, indent=2, ensure_ascii=False))
