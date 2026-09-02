import sys
import os
import json
import time
import servicemanager
from pathlib import Path

try:
    import win32service
    import win32serviceutil
    import win32event
except ImportError:
    win32service = None
    win32serviceutil = None
    win32event = None

# Adicionar o diretório agent ao sys.path para garantir import dos submódulos
agent_dir = Path(__file__).resolve().parent
if str(agent_dir) not in sys.path:
    sys.path.insert(0, str(agent_dir))

from core.orchestrator import FleetOrchestrator


def load_config() -> dict:
    config_file = agent_dir / "config.json"
    if not config_file.exists():
        print(f"[service_host] Erro: Arquivo de configuração '{config_file}' não encontrado.")
        sys.exit(1)
    with open(config_file, "r", encoding="utf-8") as f:
        return json.load(f)


if win32serviceutil is not None:
    class WinServiceFleetAgentHost(win32serviceutil.ServiceFramework):
        _svc_name_ = "WinServiceFleetAgent"
        _svc_display_name_ = "Windows Service Fleet Agent"
        _svc_description_ = "Agente nativo para inventário, monitoramento e atualização remota da frota de serviços Windows."

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
            self.is_running = True

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            servicemanager.LogInfoMsg("WinServiceFleetAgent - Recebido sinal para parar serviço.")
            self.is_running = False
            win32event.SetEvent(self.hWaitStop)

        def SvcDoRun(self):
            servicemanager.LogInfoMsg("WinServiceFleetAgent - Serviço iniciado.")
            config = load_config()
            polling_interval = config.get("polling_interval_seconds", 120)
            orchestrator = FleetOrchestrator(config)

            while self.is_running:
                try:
                    orchestrator.run_cycle()
                except Exception as e:
                    servicemanager.LogErrorMsg(f"WinServiceFleetAgent - Erro no ciclo: {e}")

                # Aguardar polling_interval ou até receber o sinal de parada SvcStop
                timeout_ms = polling_interval * 1000
                rc = win32event.WaitForSingleObject(self.hWaitStop, timeout_ms)
                if rc == win32event.WAIT_OBJECT_0:
                    # Sinal de interrupção amigável acionado
                    break

            servicemanager.LogInfoMsg("WinServiceFleetAgent - Serviço finalizado com segurança.")
else:
    WinServiceFleetAgentHost = None


def run_debug_mode():
    """
    Roda o agente em modo Standalone/Debug interativo no terminal sem registrar como serviço Windows.
    """
    print("[service_host] Modos Debug/Standalone ativado. Pressione Ctrl+C para encerrar.")
    config = load_config()
    polling_interval = config.get("polling_interval_seconds", 120)
    orchestrator = FleetOrchestrator(config)

    try:
        while True:
            orchestrator.run_cycle()
            print(f"\n[service_host] Aguardando próximo ciclo em {polling_interval} segundos...")
            time.sleep(polling_interval)
    except KeyboardInterrupt:
        print("\n[service_host] Execução debug encerrada pelo usuário.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1].lower() in ("debug", "--debug", "-d"):
        run_debug_mode()
    elif win32serviceutil is not None:
        if len(sys.argv) == 1:
            try:
                servicemanager.Initialize()
                servicemanager.PrepareToHostSingle(WinServiceFleetAgentHost)
                servicemanager.StartServiceCtrlDispatcher()
            except Exception as ex:
                print(f"[service_host] Não foi possível iniciar dispatcher de serviço ({ex}). Executando modo debug...")
                run_debug_mode()
        else:
            win32serviceutil.HandleCommandLine(WinServiceFleetAgentHost)
    else:
        print("[service_host] pywin32 não detectado. Iniciando em modo debug standalone...")
        run_debug_mode()
