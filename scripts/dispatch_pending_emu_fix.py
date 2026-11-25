"""
Dispara a reversão de perfil EMU para a lista exata de praças pendentes informadas,
incluindo CS1 e CS2 onde existirem, e reporta em tempo real.
"""
import sys
import json
import time
import sqlite3
import logging
from pathlib import Path
from datetime import datetime, timezone

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from fleet_actions import build_legacy_stack_remediation_script
from remote_commands import dispatch_remote_command

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("PendingEMUFix")

# Lista exata de hosts pendentes (CS1 + CS2 onde existirem no fleet_cache)
PENDING_HOSTS = [
    "Londrina-SMME-216-CS1", "Londrina-SMME-216-CS2",
    "Campo_Grande-SMME-232-CS1", "Campo_Grande-SMME-232-CS2",
    "Natal-SMME-234-CS1", "Natal-SMME-234-CS2",
    "Cuiaba-SMME-252-CS1",
    "Campina_Grande-SMME-253-CS1", "Campina_Grande-SMME-253-CS2",
    "Maceio-SMME-254-CS1",
    "JOAO_PESSOA-SMME-264-CS1",
    "Macapa-SMME-268-CS1",
    "Tangara_da_Serra-SMME-272-CS1", "Tangara_da_Serra-SMME-272-CS2",
    "Santa_Maria-SMME-274-CS1", "Santa_Maria-SMME-274-CS2",
    "Joacaba-SMME-278-CS1",
    "Foz_do_Iguacu-SMME-282-CS1",
    "Teresina-SMME-285-CS1", "Teresina-SMME-285-CS2",
    "Resende-SMME-296-CS1", "Resende-SMME-296-CS2",
    "Pelotas-SMME-297-CS1", "Pelotas-SMME-297-CS2",
    "Varginha-SMME-299-CS1", "Varginha-SMME-299-CS2",
    "Montes_Claros-SMME-251-CS1",
    "Ribeirao_Preto-SMME-327-CS1",
    "Juiz_de_Fora-SMME-334-CS1", "Juiz_de_Fora-SMME-334-CS2",
    "Sinop-SMME-335-CS1", "Sinop-SMME-335-CS2",
    "Paranavai-SMME-336-CS1", "Paranavai-SMME-336-CS2",
    "Blumenau-SMME-359-CS1", "Blumenau-SMME-359-CS2",
    "Porto_Velho-SMME-246-CS1", "Porto_Velho-SMME-246-CS2",
    "Passo_Fundo-SMME-332-CS1", "Passo_Fundo-SMME-332-CS2",
    "Mogi_das_Cruzes-SMME-172-CS1", "Mogi_das_Cruzes-SMME-172-CS2",
    "Itabuna-SMME-213-CS1", "Itabuna-SMME-214-CS2",
    "Paragominas-SMME-235-CS1", "Paragominas-SMME-235-CS2",
    "Juazeiro_do_Norte-SMME-242-CS1", "Juazeiro_do_Norte-SMME-242-CS2",
    "Cacoal-SMME-259-CS1", "Cacoal-SMME-259-CS2",
    "Rondonopolis-SMME-269-CS1",
    "Rio_Grande-SMME-270-CS1", "Rio_Grande-SMME-270-CS2",
    "Linhares-SMME-280-CS1", "Linhares-SMME-280-CS2",
    "Redencao-SMME-290-CS1",
    "Colatina-SMME-304-CS1", "Colatina-SMME-304-CS2",
    "Vitoria_da_Conquista-SMME-313-CS1",
    "Cruzeiro_do_Sul-SMME-314-CS1", "Cruzeiro_do_Sul-SMME-314-CS2",
    "Santarem-SMME-392-CS1",
]

STATE_FILE = Path(__file__).resolve().parent.parent / "dashboard" / "data" / "emu_pending_fix_state.json"


def dispatch_all():
    script = build_legacy_stack_remediation_script()
    logger.info(f"Disparando reversão EMU para {len(PENDING_HOSTS)} hosts pendentes...")
    exec_id = dispatch_remote_command(
        hosts=PENDING_HOSTS,
        shell_type="powershell",
        command_script=script,
        command_title="Reversão EMU (emu_mdna) - Praças Pendentes URGENTE",
        requested_by="NOC Emergencial"
    )
    record = {
        "exec_id": exec_id,
        "dispatched_at": datetime.now(timezone.utc).isoformat(),
        "hosts": PENDING_HOSTS,
        "total": len(PENDING_HOSTS)
    }
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return exec_id, record


def check_status(exec_id):
    db_path = Path("dashboard/data/fleet.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT host, status, executed_at FROM remote_command_results WHERE execution_id=? ORDER BY host",
        (exec_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    by_status = {}
    for host, status, ts in rows:
        if status not in by_status:
            by_status[status] = []
        by_status[status].append(host)
    return rows, by_status


if __name__ == "__main__":
    print(f"\n🚨 DISPARO EMERGENCIAL — {len(PENDING_HOSTS)} hosts pendentes")
    exec_id, rec = dispatch_all()
    print(f"✅ Exec ID: {exec_id}")
    print(f"⏰ Disparado em: {rec['dispatched_at']}")
    print(f"\n--- STATUS INICIAL ---")
    
    for ciclo in range(1, 20):
        time.sleep(10)
        rows, by_status = check_status(exec_id)
        sucesso = len(by_status.get("sucesso", []))
        total = len(PENDING_HOSTS)
        pendente = total - sucesso
        now = datetime.now().strftime("%H:%M:%S")
        print(f"\n[{now}] Ciclo {ciclo} | ✅ Sucesso: {sucesso}/{total} | ⏳ Pendente: {pendente}")
        for host in by_status.get("sucesso", []):
            cidade = host.split("-")[0].replace("_", " ")
            print(f"  ✅ {cidade:30s} ({host})")
        if sucesso >= total:
            print("\n🏁 TODOS OS HOSTS CONCLUÍDOS COM SUCESSO!")
            break
