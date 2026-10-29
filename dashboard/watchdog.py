# dashboard/watchdog.py
"""
Watchdog de Alta Disponibilidade (24x7) da Central de Monitoração CS Fleet.
Executado periodicamente pelo Agendador de Tarefas do Windows a cada 5 minutos.
Verifica se a aplicação está escutando na porta local e respondendo ao /api/health.
Se estiver inativa ou travada, recupera o serviço automaticamente em background.
"""
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from config import PORT
import service_manager

def check_and_revive():
    status = service_manager.get_service_status()
    is_healthy = status.get("is_port_listening") and status.get("api_online")
    
    # Retry defensivo com backoff para evitar falso-positivo durante bursts ou sincronizações
    if not is_healthy:
        time.sleep(4)
        status = service_manager.get_service_status()
        is_healthy = status.get("is_port_listening") and status.get("api_online")

    if not is_healthy:
        log_file = ROOT_DIR / "data" / "watchdog.log"
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [Watchdog] Central inativa ou sem resposta na porta {PORT}. Auto-recuperando servico...\n")
        except Exception:
            pass
        service_manager.restart_service()

if __name__ == "__main__":
    check_and_revive()
