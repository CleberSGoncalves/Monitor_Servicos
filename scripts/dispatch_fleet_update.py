"""
Script de Disparo Remoto de Atualizacao e Auto-Healing da Frota (Zero GitHub)
Kantar IBOPE Media — Monitor_Servicos
"""

import sys
from pathlib import Path

# Adiciona dashboard ao path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from fleet_auto_healing import execute_auto_healing_batch, audit_and_diagnose_fleet

if __name__ == "__main__":
    print("=" * 70)
    print("DISPARO REMOTO DE ATUALIZACAO DA FROTA — 100% SHAREPOINT CORPORATIVO")
    print("=" * 70)

    print("\n[1/2] Diagnosticando frota...")
    diag = audit_and_diagnose_fleet()
    total_hosts = diag["summary"]["total_hosts"]
    up_to_date = diag["summary"]["up_to_date"]
    to_update = diag["summary"]["eligible_for_update"]
    stopped = diag["summary"]["stopped_services"]

    print(f"Total Hosts: {total_hosts} | Atualizados (1.0.18.0): {up_to_date} | A Atualizar: {to_update} | Servicos Parados: {stopped}")

    print("\n[2/2] Executando lote de auto-healing remoto (Versao Alvo: 1.0.18.0)...")
    res = execute_auto_healing_batch(max_hosts=150)

    print(f"\nResultado:")
    print(f"Status: {res.get('status')}")
    print(f"Total processados: {res.get('total_processed')}")
    print(f"Acoes executadas: {len(res.get('actions_taken', []))}")
    print(f"Erros: {len(res.get('errors', []))}")

    updates = [a for a in res.get('actions_taken', []) if a['tipo'] == 'AUTO_UPDATE_AGENT']
    restarts = [a for a in res.get('actions_taken', []) if a['tipo'] == 'AUTO_RESTART_SERVICE']

    print(f"  -> Atualizacoes de Agente disparadas: {len(updates)}")
    print(f"  -> Reinicializacoes de servicos criticos: {len(restarts)}")

    if res.get('errors'):
        print("\nErros encontrados:")
        for err in res['errors'][:10]:
            print("  *", err)

    print("\nExemplo de acoes disparadas:")
    for a in res.get('actions_taken', [])[:10]:
        print(f"  * [{a['tipo']}] {a['hostname']} ({a['praca']}) - {a['detalhe']}")

    print("\n" + "=" * 70)
    print("DISPARO REMOTO CONCLUIDO COM SUCESSO!")
    print("=" * 70)
