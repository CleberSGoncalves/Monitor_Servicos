import time
from typing import Literal

try:
    import win32service
    import win32serviceutil
except ImportError:
    win32service = None
    win32serviceutil = None


StatusType = Literal["Em Execução", "Parado", "Não Encontrado"]


def get_service_status(service_name: str) -> StatusType:
    """
    Verifica o estado atual do serviço Windows local.
    Retorna uma das opções estritas: 'Em Execução', 'Parado' ou 'Não Encontrado'.
    """
    if win32serviceutil is None or win32service is None:
        print("[win_controller] pywin32 não disponível.")
        return "Não Encontrado"

    try:
        status_code = win32serviceutil.QueryServiceStatus(service_name)[1]
        if status_code == win32service.SERVICE_RUNNING:
            return "Em Execução"
        elif status_code in (
            win32service.SERVICE_STOPPED,
            win32service.SERVICE_STOP_PENDING,
            win32service.SERVICE_PAUSED,
            win32service.SERVICE_PAUSE_PENDING
        ):
            return "Parado"
        else:
            return "Parado"
    except Exception as e:
        print(f"[win_controller] Serviço '{service_name}' não encontrado ou erro de permissão: {e}")
        return "Não Encontrado"


def stop_service(service_name: str, timeout: int = 60) -> bool:
    """
    Parar serviço Windows com timeout de polling até o estado STOPPED.
    """
    if win32serviceutil is None or win32service is None:
        raise RuntimeError("pywin32 não está instalado/disponível.")

    current = get_service_status(service_name)
    if current == "Parado":
        print(f"[win_controller] Serviço '{service_name}' já está parado.")
        return True
    elif current == "Não Encontrado":
        print(f"[win_controller] Serviço '{service_name}' não foi encontrado.")
        return False

    print(f"[win_controller] Parando serviço '{service_name}'...")
    try:
        win32serviceutil.StopService(service_name)
    except Exception as e:
        print(f"[win_controller] Erro ao enviar comando de parada para '{service_name}': {e}")

    start_time = time.time()
    while time.time() - start_time < timeout:
        status = win32serviceutil.QueryServiceStatus(service_name)[1]
        if status == win32service.SERVICE_STOPPED:
            print(f"[win_controller] Serviço '{service_name}' foi parado com sucesso.")
            return True
        time.sleep(2)

    raise TimeoutError(f"Timeout ao aguardar a parada do serviço '{service_name}'.")


def start_service(service_name: str, timeout: int = 60) -> bool:
    """
    Iniciar serviço Windows com timeout de polling até o estado RUNNING.
    """
    if win32serviceutil is None or win32service is None:
        raise RuntimeError("pywin32 não está instalado/disponível.")

    current = get_service_status(service_name)
    if current == "Em Execução":
        print(f"[win_controller] Serviço '{service_name}' já está em execução.")
        return True
    elif current == "Não Encontrado":
        print(f"[win_controller] Serviço '{service_name}' não foi encontrado.")
        return False

    print(f"[win_controller] Iniciando serviço '{service_name}'...")
    try:
        win32serviceutil.StartService(service_name)
    except Exception as e:
        print(f"[win_controller] Erro ao enviar comando de início para '{service_name}': {e}")

    start_time = time.time()
    while time.time() - start_time < timeout:
        status = win32serviceutil.QueryServiceStatus(service_name)[1]
        if status == win32service.SERVICE_RUNNING:
            print(f"[win_controller] Serviço '{service_name}' foi iniciado com sucesso.")
            return True
        time.sleep(2)

    raise TimeoutError(f"Timeout ao aguardar a inicialização do serviço '{service_name}'.")


def restart_service(service_name: str, timeout: int = 60) -> bool:
    """
    Reiniciar serviço Windows (stop e depois start).
    """
    print(f"[win_controller] Reiniciando serviço '{service_name}'...")
    stop_service(service_name, timeout=timeout)
    return start_service(service_name, timeout=timeout)
