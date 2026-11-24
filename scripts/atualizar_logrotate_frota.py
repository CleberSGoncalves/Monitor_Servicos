"""
Orquestrador em Lote de Correção de LogRotate FastMatching (Frota Completa)
Kantar IBOPE Media — Monitor_Servicos

Aplica o novo logrotate.conf apontando para:
D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMatchingSvc\\fma.log com rotate 10
em todas as praças, e reinicia o FastMatchingSvc exclusivamente nas praças onde ele estiver ativo (Running).
"""

import sys
import argparse
from pathlib import Path

# Adiciona diretório dashboard ao sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from sharepoint_sync import get_cached_data
from remote_commands import dispatch_remote_command, init_remote_command_db


def carregar_hosts_frota(apenas_cs1: bool = True):
    """Carrega os hosts da frota a partir do cache higienizado."""
    data = get_cached_data()
    services = data.get("services", [])
    
    hosts_dict = {}
    for s in services:
        h = s.get("hostname")
        if not h or h == "N/A":
            continue
        praca = s.get("praca") or "Nacional"
        raw_cs = s.get("cs") or 1
        try:
            cs = int(float(raw_cs))
        except Exception:
            cs = 1
        
        # Identifica se possui FastMatching
        sn = (s.get("nome_servico") or s.get("servico") or "").lower()
        st = (s.get("status_servico") or s.get("status") or "").lower()
        has_fma = "fastmatching" in sn
        fma_running = has_fma and any(w in st for w in ["execu", "running", "ativo"])

        if h not in hosts_dict:
            hosts_dict[h] = {
                "hostname": h,
                "raw_hostname": s.get("raw_hostname") or h,
                "praca": praca,
                "cs": cs,
                "has_fastmatching": False,
                "fastmatching_running": False
            }
        if has_fma:
            hosts_dict[h]["has_fastmatching"] = True
            if fma_running:
                hosts_dict[h]["fastmatching_running"] = True

    hosts_list = list(hosts_dict.values())
    if apenas_cs1:
        hosts_list = [h for h in hosts_list if h["cs"] == 1]
    
    return hosts_list


def main():
    parser = argparse.ArgumentParser(description="Atualizar LogRotate FastMatching para rotate 10 em D: em toda a frota.")
    parser.add_argument("--all-fleet", action="store_true", help="Disparar para TODOS os hosts (CS01, CS02, CS03). Padrão: todos os CS01.")
    parser.add_argument("--hosts", type=str, default="", help="Lista separada por vírgula de hosts ou praças específicas.")
    parser.add_argument("--dry-run", action="store_true", help="Simula o planejamento sem disparar comandos na fila.")
    args = parser.parse_args()

    print("=" * 80)
    print(" [ORQUESTRADOR DE FROTA] CORREÇÃO DE LOGROTATE FASTMATCHING (ROTATE 10 EM D:)")
    print("=" * 80)

    # 1. Carrega o script PowerShell oficial
    ps_script_path = Path(__file__).resolve().parent / "Corrigir_LogRotate_FastMatching.ps1"
    if not ps_script_path.exists():
        print(f"[ERRO] Script PowerShell não encontrado em: {ps_script_path}")
        sys.exit(1)
    
    command_script = ps_script_path.read_text(encoding="utf-8")

    # 2. Seleciona os hosts alvos
    apenas_cs1 = not args.all_fleet
    todos_hosts = carregar_hosts_frota(apenas_cs1=apenas_cs1)

    if args.hosts:
        alvo_termos = [t.strip().lower() for t in args.hosts.split(",") if t.strip()]
        hosts_alvos = [
            h for h in todos_hosts
            if any(t in h["hostname"].lower() or t in h["praca"].lower() for t in alvo_termos)
        ]
    else:
        hosts_alvos = todos_hosts

    print(f"\n[Planejamento] Total de hosts selecionados: {len(hosts_alvos)}")
    fma_ativos = [h for h in hosts_alvos if h["fastmatching_running"]]
    fma_inativos = [h for h in hosts_alvos if not h["fastmatching_running"]]
    print(f"  -> Hosts com FastMatchingSvc EM EXECUÇÃO (Receberão reinício): {len(fma_ativos)}")
    print(f"  -> Demais hosts (Receberão apenas ajuste de logrotate.conf sem reinício): {len(fma_inativos)}")

    print("\n[Amostra de nós com FastMatchingSvc Ativo]:")
    for h in fma_ativos[:8]:
        print(f"  • {h['praca']} (CS {h['cs']}) -> {h['hostname']}")
    if len(fma_ativos) > 8:
        print(f"  ... e mais {len(fma_ativos) - 8} praças ativas.")

    if args.dry_run:
        print("\n[DRY-RUN] Modo de simulação ativado. Nenhum comando foi despachado.")
        return

    # 3. Dispara a execução via pipeline unificado de comandos remotos
    print("\n[Disparo] Enfileirando comando remoto em lote na Central...")
    target_hostnames = [h["hostname"] for h in hosts_alvos]
    
    exec_id = dispatch_remote_command(
        hosts=target_hostnames,
        shell_type="powershell",
        command_script=command_script,
        command_title="🛠️ Correção LogRotate FastMatching (rotate 10 em D:)",
        requested_by="Engenharia Broadcast / Operador NOC"
    )

    print(f"\n[SUCESSO] Comando em lote despachado com sucesso!")
    print(f"  Execution ID : {exec_id}")
    print(f"  Total de Nós : {len(target_hostnames)}")
    print(f"  Regra Ativa  : logrotate.conf atualizado em 100% dos nós; FastMatching reiniciado apenas onde estiver rodando.")
    print(f"\nAcompanhe o status e logs detalhados na aba 'Comandos Remotos' do Dashboard.")


if __name__ == "__main__":
    main()
