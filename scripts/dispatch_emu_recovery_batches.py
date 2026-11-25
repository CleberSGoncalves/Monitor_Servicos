"""
Orquestrador de Rollout e Reversao de Perfis EMU e Servicos de Deteccao
Executa em lotes estritos de 5 pracas a cada 20 minutos para as 87 pracas legadas da frota.
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Adiciona o diretorio dashboard ao path
DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
sys.path.insert(0, str(DASHBOARD_DIR))

from fleet_actions import build_legacy_stack_remediation_script
from remote_commands import dispatch_remote_command, get_execution_details

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("EMURecoveryOrchestrator")

STATE_FILE = Path(__file__).resolve().parent.parent / "dashboard" / "data" / "emu_recovery_rollout_state.json"

LEGACY_BATCHES = [
    # Lote 1
    ["ALTAMIRA-SMME-271-CS1", "Aracatuba-SMME-239-CS1", "Bage-SMME-279-CS1", "Barreiras-SMME-288-CS1", "Bauru-SMME-248-CS1"],
    # Lote 2
    ["Belem-SMME-221-CS1", "Blumenau-SMME-359-CS1", "Boa_Vista-SMME-225-CS1", "Brasilia-SMME-186-CS1", "Cachoeiro_de_Itapemirim-SMME-312-CS1"],
    # Lote 3
    ["Cacoal-SMME-259-CS1", "Campina_Grande-SMME-253-CS1", "Campo_Grande-SMME-232-CS1", "Campos-SMME-194-CS1", "Caruaru-SMME-267-CS1"],
    # Lote 4
    ["Catalao-SMME-275-CS1", "Chapeco-SMME-302-CS1", "Codo-SMME-277-CS1", "Colatina-SMME-304-CS1", "Coronel_Fabriciano-SMME-326-CS1"],
    # Lote 5
    ["Criciuma-SMME-396-CS1", "Cruzeiro_do_Sul-SMME-314-CS1", "Cuiaba-SMME-252-CS1", "Curitiba-SMME-251-CS1", "Erechim-SMME-322-CS1"],
    # Lote 6
    ["FRANCA-SMME-309-CS1", "Floriano-SMME-131-CS1", "Foz_do_Iguacu-SMME-282-CS1", "GOIANIA-SMME-324-CS1", "G_Valadares-SMME-260-CS1"],
    # Lote 7
    ["Gurupi-SMME-237-CS1", "HOMOLOG_2_0-SMME-398-CS1", "Imperatriz-SMME-233-CS1", "Itabuna-SMME-213-CS1", "Itacoatiara-SMME-323-CS1"],
    # Lote 8
    ["Ituiutaba-SMME-305-CS1", "Itumbiara-SMME-289-CS1", "JATAI-SMME-178-CS1", "JOAO_PESSOA-SMME-264-CS1", "Joacaba-SMME-278-CS1"],
    # Lote 9
    ["Joinville-SMME-258-CS1", "Juazeiro-SMME-308-CS1", "Juazeiro_do_Norte-SMME-242-CS1", "Juiz_de_Fora-SMME-334-CS1", "Linhares-SMME-280-CS1"],
    # Lote 10
    ["Londrina-SMME-216-CS1", "Luziania-SMME-177-CS1", "Macapa-SMME-268-CS1", "Maceio-SMME-254-CS1", "Manaus-SMME-287-CS1"],
    # Lote 11
    ["Maringa-SMME-263-CS1", "Mogi_das_Cruzes-SMME-172-CS1", "Montes_Claros-SMME-251-CS1", "Mossoro-SMME-197-CS1", "Natal-SMME-234-CS1"],
    # Lote 12
    ["Nova_Friburgo-SMME-315-CS1", "PORTO_ALEGRE-SMME-196-CS1", "Palmas-SMME-168-CS1", "Paragominas-SMME-235-CS1", "Parintins-SMME-291-CS1"],
    # Lote 13
    ["Passo_Fundo-SMME-332-CS1", "Pelotas-SMME-297-CS1", "Ponta_Grossa-SMME-247-CS1", "Porangatu-SMME-281-CS1", "Porto_Velho-SMME-246-CS1"],
    # Lote 14
    ["Recife-SMME-176-CS1", "Redencao-SMME-290-CS1", "Ribeirao_Preto-SMME-327-CS1", "Rio_Branco-SMME-265-CS1", "Rio_Grande-SMME-270-CS1"],
    # Lote 15
    ["Rondonopolis-SMME-269-CS1", "SAO_PAULO-SMME-390-CS1", "S_J_Rio_Preto-SMME-316-CS1", "S_J_dos_Campos-SMME-262-CS1", "Santa_Maria-SMME-274-CS1"],
    # Lote 16
    ["Santa_Rosa-SMME-294-CS1", "Santarem-SMME-392-CS1", "Sao_Carlos-SMME-286-CS1", "Sao_Luis-SMME-222-CS1", "Sinop-SMME-335-CS1"],
    # Lote 17
    ["Sorocaba-SMME-273-CS1", "Tangara_da_Serra-SMME-272-CS1", "Teresina-SMME-285-CS1", "Varginha-SMME-299-CS1", "Vilhena-SMME-300-CS1"],
    # Lote 18
    ["Vitoria-SMME-223-CS1", "Vitoria_da_Conquista-SMME-313-CS1"]
]


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"completed_batches": [], "last_batch_index": 0, "history": []}


def save_state(state: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def dispatch_batch(batch_idx: int) -> dict:
    if batch_idx < 1 or batch_idx > len(LEGACY_BATCHES):
        raise ValueError(f"Lote {batch_idx} invalido. Total de lotes disponiveis: {len(LEGACY_BATCHES)}")
    
    hosts = LEGACY_BATCHES[batch_idx - 1]
    title = f"Reversao EMU (emu_mdna) & Restauracao Stack Legada - Lote {batch_idx}/{len(LEGACY_BATCHES)}"
    script = build_legacy_stack_remediation_script()
    
    logger.info(f"Disparando {title} para {len(hosts)} hosts: {hosts}")
    exec_id = dispatch_remote_command(
        hosts=hosts,
        shell_type="powershell",
        command_script=script,
        command_title=title,
        requested_by="Orquestrador Emergencial NOC"
    )
    
    record = {
        "batch_index": batch_idx,
        "title": title,
        "exec_id": exec_id,
        "dispatched_at": datetime.now(timezone.utc).isoformat(),
        "hosts": hosts,
        "hosts_count": len(hosts)
    }
    
    state = load_state()
    state["last_batch_index"] = batch_idx
    if batch_idx not in state["completed_batches"]:
        state["completed_batches"].append(batch_idx)
    state["history"].append(record)
    save_state(state)
    
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Disparo de Lote de Reversao EMU")
    parser.add_argument("--batch", type=int, default=1, help="Numero do lote a ser disparado (1 a 18)")
    parser.add_argument("--status", action="store_true", help="Exibe o status dos lotes disparados")
    args = parser.parse_args()
    
    if args.status:
        state = load_state()
        print(json.dumps(state, indent=2, ensure_ascii=False))
    else:
        res = dispatch_batch(args.batch)
        print("\n=== LOTE DISPARADO COM SUCESSO ===")
        print(f"Exec ID       : {res['exec_id']}")
        print(f"Lote          : {res['batch_index']} de {len(LEGACY_BATCHES)}")
        print(f"Hosts Alvo    : {', '.join(res['hosts'])}")
        print(f"Hora Disparo  : {res['dispatched_at']}")
