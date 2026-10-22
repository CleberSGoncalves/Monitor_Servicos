# dashboard/service_manager.py
r"""
Gerenciador de Serviço Windows da Central de Monitoração CS Fleet.
Executa o Dashboard em background desacoplado (sem janelas ou popups CMD),
gerencia PID, status, portas e inicialização no Windows via Tarefa Agendada.

Uso:
  python service_manager.py start      # Inicia em segundo plano silencioso
  python service_manager.py stop       # Para o serviço e libera portas
  python service_manager.py restart    # Reinicia o serviço
  python service_manager.py status     # Exibe status detalhado, PID, porta e saúde
  python service_manager.py install    # Registra no Windows para iniciar no boot
  python service_manager.py uninstall  # Remove a inicialização automática do Windows
"""
import os
import sys
import time
import json
import subprocess
import urllib.request
from pathlib import Path
from typing import Dict, Any, Optional

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from config import PORT, DOMAIN_NAME as DOMAIN

DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
PID_FILE = DATA_DIR / "service.pid"
LOG_FILE = DATA_DIR / "dashboard.log"
TASK_NAME = "MonitorServicos_FleetDashboard"
WATCHDOG_TASK_NAME = "MonitorServicos_FleetDashboard_Watchdog"

SUBPROCESS_FLAGS = 0
if sys.platform == "win32":
    SUBPROCESS_FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)


def find_pythonw() -> str:
    """Retorna o executável pythonw.exe se disponível no ambiente, senão python.exe."""
    pw = Path(sys.executable).parent / "pythonw.exe"
    if pw.exists():
        return str(pw)
    return sys.executable


def get_running_service_pid() -> Optional[int]:
    """Retorna o PID do serviço se estiver em execução."""
    if PID_FILE.exists():
        try:
            pid = int(PID_FILE.read_text(encoding="utf-8").strip())
            res = subprocess.run(f'tasklist /FI "PID eq {pid}" /NH', shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
            if str(pid) in res.stdout:
                return pid
        except Exception:
            pass

    # Checagem secundária: processo escutando na porta
    try:
        out = subprocess.check_output(f'netstat -ano | findstr ":{PORT}"', shell=True, text=True, creationflags=SUBPROCESS_FLAGS)
        for line in out.splitlines():
            parts = line.strip().split()
            if len(parts) >= 5 and "LISTENING" in parts:
                pid = int(parts[-1])
                if pid > 0:
                    return pid
    except Exception:
        pass

    return None


def is_port_listening(port: int = PORT) -> bool:
    """Verifica se a porta do Dashboard está escutando conexões."""
    try:
        out = subprocess.check_output(f'netstat -ano | findstr ":{port}"', shell=True, text=True, creationflags=SUBPROCESS_FLAGS)
        return "LISTENING" in out
    except Exception:
        return False


def get_service_status() -> Dict[str, Any]:
    """Retorna o estado detalhado do serviço."""
    pid = get_running_service_pid()
    is_online = pid is not None and is_port_listening(PORT)

    # Health check HTTP local
    api_online = False
    if is_online:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{PORT}/api/health", headers={"User-Agent": "FleetAuditor/1.0"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                api_online = (resp.status == 200)
        except Exception:
            pass

    # Checagem do túnel Cloudflare
    tunnel_online = False
    if is_online:
        try:
            req = urllib.request.Request(f"https://{DOMAIN}/api/health", headers={"User-Agent": "FleetAuditor/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                tunnel_online = (resp.status == 200)
        except Exception:
            tunnel_online = False

    # Memória do processo
    mem_mb = 0.0
    if pid:
        try:
            out = subprocess.check_output(f'tasklist /FI "PID eq {pid}" /FO CSV /NH', shell=True, text=True, creationflags=SUBPROCESS_FLAGS)
            for row in out.splitlines():
                if str(pid) in row:
                    parts = row.replace('"', '').split(',')
                    if len(parts) >= 5:
                        mem_str = parts[4].replace('.', '').replace(' K', '').replace(' KB', '').strip()
                        mem_mb = round(int(mem_str) / 1024, 1)
        except Exception:
            pass

    # Verifica se a tarefa do Windows está instalada
    task_installed = False
    try:
        res = subprocess.run(f'schtasks /Query /TN "{TASK_NAME}"', shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
        task_installed = (res.returncode == 0)
    except Exception:
        pass

    return {
        "status": "ONLINE" if is_online else "OFFLINE",
        "pid": pid,
        "port": PORT,
        "is_port_listening": is_online,
        "api_online": api_online,
        "tunnel_url": f"https://{DOMAIN}",
        "tunnel_online": tunnel_online,
        "memory_mb": mem_mb,
        "log_file": str(LOG_FILE),
        "windows_task_installed": task_installed
    }


def start_service():
    """Inicia o serviço em segundo plano desacoplado e invisível."""
    print("==================================================================")
    print(" [*] INICIANDO CENTRAL DE MONITORACAO CS FLEET (BACKGROUND)...")
    print("==================================================================")

    current_pid = get_running_service_pid()
    if current_pid:
        print(f"[!] O servico ja esta em execucao (PID: {current_pid}).")
        print(f"    Local  : http://127.0.0.1:{PORT}")
        print(f"    Externo: https://{DOMAIN}")
        return True

    pythonw = find_pythonw()
    start_script = str(ROOT_DIR / "start_service.py")

    # 1. Tenta disparar através da Tarefa Agendada nativa do Windows se instalada
    task_res = subprocess.run(f'schtasks /Query /TN "{TASK_NAME}"', shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
    if task_res.returncode == 0:
        print(f"[*] Disparando via Tarefa Agendada do Windows '{TASK_NAME}'...")
        subprocess.run(f'schtasks /Run /TN "{TASK_NAME}"', shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
    else:
        # Fallback Popen desacoplado
        detached_flag = getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP | detached_flag | SUBPROCESS_FLAGS

        cmd = [pythonw, start_script]
        print(f"[*] Disparando processo desacoplado: {pythonw} start_service.py")

        log_out = open(LOG_FILE, "a", encoding="utf-8")
        try:
            subprocess.Popen(
                cmd,
                cwd=str(ROOT_DIR),
                creationflags=creation_flags,
                stdout=log_out,
                stderr=log_out,
                stdin=subprocess.DEVNULL
            )
        except Exception as e:
            print(f"[!] Erro ao disparar servico: {e}")
            return False

    # Aguarda inicialização
    print(f"[*] Aguardando inicializacao e porta {PORT}...")
    for _ in range(20):
        time.sleep(1)
        if is_port_listening(PORT):
            break

    # Garante instalação da tarefa agendada
    if task_res.returncode != 0:
        install_windows_task()

    status = get_service_status()
    if status["is_port_listening"]:
        print(f"[OK] Central de Monitoracao ONLINE! PID: {status['pid']} | Porta: {PORT}")
        print(f"     Acesso Local  : http://127.0.0.1:{PORT}")
        print(f"     Acesso Externo: https://{DOMAIN}")
        return True
    else:
        print(f"[ERRO] Falha ao confirmar abertura da porta {PORT}. Verifique o log em {LOG_FILE}")
        return False


def stop_service():
    """Finaliza o serviço e libera a porta."""
    print("==================================================================")
    print(" [*] FINALIZANDO CENTRAL DE MONITORACAO CS FLEET...")
    print("==================================================================")

    pid = get_running_service_pid()
    if not pid:
        print("[!] Nenhum servico em execucao detectado.")
        if PID_FILE.exists():
            PID_FILE.unlink(missing_ok=True)
        return True

    print(f"[*] Encerrando processo PID {pid}...")
    try:
        subprocess.run(f"taskkill /PID {pid} /T /F", shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
    except Exception as e:
        print(f"[!] Erro ao encerrar processo: {e}")

    time.sleep(1)
    if PID_FILE.exists():
        PID_FILE.unlink(missing_ok=True)

    if not is_port_listening(PORT):
        print(f"[OK] Servico finalizado e porta {PORT} liberada com sucesso.")
        return True
    else:
        print(f"[AVISO] Porta {PORT} ainda parece ocupada. Verifique com 'netstat -ano | findstr :{PORT}'.")
        return False


def restart_service():
    """Reinicia o serviço com liberação segura de recursos."""
    print("[*] Reiniciando Central de Monitoracao...")
    stop_service()
    time.sleep(2)
    return start_service()


def install_windows_task():
    """Instala tarefa agendada nativa do Windows para auto-iniciar no boot/logon e watchdog de 5 min."""
    pythonw = find_pythonw()
    start_script = str(ROOT_DIR / "start_service.py")
    watchdog_script = str(ROOT_DIR / "watchdog.py")
    
    cmd1 = (
        f'schtasks /Create /TN "{TASK_NAME}" '
        f'/TR "\"{pythonw}\" \"{start_script}\"" '
        f'/SC ONLOGON /RL HIGHEST /F'
    )
    res1 = subprocess.run(cmd1, shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)

    cmd2 = (
        f'schtasks /Create /TN "{WATCHDOG_TASK_NAME}" '
        f'/TR "\"{pythonw}\" \"{watchdog_script}\"" '
        f'/SC MINUTE /MO 5 /RL HIGHEST /F'
    )
    res2 = subprocess.run(cmd2, shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)

    if res1.returncode == 0:
        print(f"[OK] Tarefa de Inicialização '{TASK_NAME}' registrada com sucesso no Windows.")
        if res2.returncode == 0:
            print(f"[OK] Tarefa Watchdog 24x7 '{WATCHDOG_TASK_NAME}' (cada 5 min) registrada.")
        return True
    else:
        print(f"[AVISO] Não foi possível registrar tarefa agendada: {res1.stderr}")
        return False


def uninstall_windows_task():
    """Remove as tarefas agendadas do Windows."""
    subprocess.run(f'schtasks /Delete /TN "{TASK_NAME}" /F', shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
    subprocess.run(f'schtasks /Delete /TN "{WATCHDOG_TASK_NAME}" /F', shell=True, capture_output=True, text=True, creationflags=SUBPROCESS_FLAGS)
    print(f"[OK] Tarefas agendadas '{TASK_NAME}' e '{WATCHDOG_TASK_NAME}' removidas.")
    return True


def print_status_formatted(st: Dict[str, Any]):
    print("==================================================================")
    print(" CENTRAL DE MONITORACAO CS FLEET - STATUS DO SERVICO (24x7 LOCAL)")
    print("==================================================================")
    status_icon = "🟢" if st["status"] == "ONLINE" else "🔴"
    print(f" Estado Atual      : {status_icon} {st['status']}")
    print(f" Processo (PID)    : {st['pid'] if st['pid'] else 'Nenhum'}")
    print(f" Porta Local       : {st['port']} ({'ESCUTANDO' if st['is_port_listening'] else 'LIVRE'})")
    print(f" HealthCheck Local : {'OK (200)' if st.get('api_online') else 'FALHA / INATIVO'}")
    print(f" Memoria RAM       : {st['memory_mb']} MB")
    print(f" Acesso Local      : http://localhost:{st['port']}")
    print(f" Acesso Rede (LAN) : http://192.168.15.17:{st['port']}")
    print(f" Modo Operacional  : 🔒 Local / Rede Corporativa (Isolado do Cloudflare)")
    print(f" Tarefa Windows    : {'INSTALADA' if st['windows_task_installed'] else 'NAO INSTALADA'}")
    print(f" Arquivo de Log    : {st['log_file']}")
    print("==================================================================")


if __name__ == "__main__":
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "status"

    if action == "start":
        start_service()
    elif action == "stop":
        stop_service()
    elif action == "restart":
        restart_service()
    elif action == "status":
        print_status_formatted(get_service_status())
    elif action == "install":
        install_windows_task()
    elif action == "uninstall":
        uninstall_windows_task()
    elif action == "json":
        print(json.dumps(get_service_status(), indent=2))
    else:
        print(f"Comando invalido: '{action}'. Use: start | stop | restart | status | install | uninstall")
