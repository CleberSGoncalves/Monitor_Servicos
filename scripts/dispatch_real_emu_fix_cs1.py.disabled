"""
Publica o script de reversão EMU diretamente no SharePoint Drive (Fila_Comandos)
para execução REAL pelo agente C# em cada host CS1 apenas.
"""
import sys
import json
import time
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from fleet_actions import build_legacy_stack_remediation_script
from remote_queue import enqueue_command_on_sharepoint, sign_command_payload
from config import CLIENT_SECRET

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("RealEMUFix")

# APENAS CS1 — CS2 não tem DNA.DetectionSVC nem DNA.TrackingSVC
PENDING_HOSTS_CS1_ONLY = [
    "Londrina-SMME-216-CS1",
    "Campo_Grande-SMME-232-CS1",
    "Natal-SMME-234-CS1",
    "Cuiaba-SMME-252-CS1",
    "Campina_Grande-SMME-253-CS1",
    "Maceio-SMME-254-CS1",
    "JOAO_PESSOA-SMME-264-CS1",
    "Macapa-SMME-268-CS1",
    "Tangara_da_Serra-SMME-272-CS1",
    "Santa_Maria-SMME-274-CS1",
    "Joacaba-SMME-278-CS1",
    "Foz_do_Iguacu-SMME-282-CS1",
    "Teresina-SMME-285-CS1",
    "Resende-SMME-296-CS1",
    "Pelotas-SMME-297-CS1",
    "Varginha-SMME-299-CS1",
    "Montes_Claros-SMME-251-CS1",
    "Ribeirao_Preto-SMME-327-CS1",
    "Juiz_de_Fora-SMME-334-CS1",
    "Sinop-SMME-335-CS1",
    "Paranavai-SMME-336-CS1",
    "Blumenau-SMME-359-CS1",
    "Porto_Velho-SMME-246-CS1",
    "Passo_Fundo-SMME-332-CS1",
    "Mogi_das_Cruzes-SMME-172-CS1",
    "Itabuna-SMME-213-CS1",
    "Paragominas-SMME-235-CS1",
    "Juazeiro_do_Norte-SMME-242-CS1",
    "Cacoal-SMME-259-CS1",
    "Rondonopolis-SMME-269-CS1",
    "Rio_Grande-SMME-270-CS1",
    "Linhares-SMME-280-CS1",
    "Redencao-SMME-290-CS1",
    "Colatina-SMME-304-CS1",
    "Vitoria_da_Conquista-SMME-313-CS1",
    "Cruzeiro_do_Sul-SMME-314-CS1",
    "Santarem-SMME-392-CS1",
]

STATE_FILE = Path(__file__).resolve().parent.parent / "dashboard" / "data" / "emu_real_queue_state.json"


def dispatch_real(dry_run=False):
    script = build_legacy_stack_remediation_script()
    exec_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    title = "Reversão EMU emu_mdna - CS1 Only - URGENTE"
    
    results = []
    for host in PENDING_HOSTS_CS1_ONLY:
        if dry_run:
            logger.info(f"[DRY-RUN] Enfileiraria {host}")
            results.append({"host": host, "queued": True, "dry_run": True})
            continue
        
        ok = enqueue_command_on_sharepoint(
            exec_id=exec_id,
            host=host,
            title=title,
            shell_type="powershell",
            script=script,
            requested_by="NOC-Emergencial-CS1-Only",
            timeout_s=180,
        )
        status = "✅ Enfileirado" if ok else "❌ Falha no enfileiramento"
        logger.info(f"{status} -> {host}")
        results.append({"host": host, "queued": ok})
        time.sleep(0.2)  # Rate limiting
    
    record = {
        "exec_id": exec_id,
        "dispatched_at": created_at,
        "hosts": PENDING_HOSTS_CS1_ONLY,
        "results": results,
        "total": len(PENDING_HOSTS_CS1_ONLY),
        "queued_ok": sum(1 for r in results if r["queued"]),
    }
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return record


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    
    print(f"\n🚨 DISPARO REAL NA FILA SHAREPOINT — {len(PENDING_HOSTS_CS1_ONLY)} hosts CS1")
    print(f"{'[DRY-RUN]' if args.dry_run else ''}")
    rec = dispatch_real(dry_run=args.dry_run)
    
    print(f"\n=== RESUMO ===")
    print(f"Exec ID         : {rec['exec_id']}")
    print(f"Total Hosts CS1 : {rec['total']}")
    print(f"Enfileirados OK : {rec['queued_ok']}")
    print(f"Falhas          : {rec['total'] - rec['queued_ok']}")
    print()
    for r in rec["results"]:
        icon = "✅" if r["queued"] else "❌"
        print(f"  {icon} {r['host']}")
