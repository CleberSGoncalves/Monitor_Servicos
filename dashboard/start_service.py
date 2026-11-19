# dashboard/start_service.py
"""
Serviço Principal em Segundo Plano da Central de Monitoração CS Fleet.
Executa de forma headless (sem janelas ou popups) iniciando:
1. Uvicorn FastAPI Server (Porta 8096)
2. Gerenciamento de PID em data/service.pid
3. Redirecionamento de logs para data/dashboard.log
"""
import os
import sys
import time
import signal
import traceback
import uvicorn
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))
os.chdir(ROOT_DIR)

DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
PID_FILE = DATA_DIR / "service.pid"
LOG_FILE = DATA_DIR / "dashboard.log"

# Garante compatibilidade total e incondicional com pythonw.exe e consoles
_log_out = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
try:
    sys.stdout = _log_out
    sys.stderr = _log_out
except Exception:
    pass

if sys.stdin is None or getattr(sys.stdin, "closed", False):
    try:
        sys.stdin = open(os.devnull, "r", encoding="utf-8")
    except Exception:
        pass


def write_pid():
    pid = os.getpid()
    PID_FILE.write_text(str(pid), encoding="utf-8")
    _log_out.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Iniciado com PID: {pid}\n")
    _log_out.flush()


def cleanup(*args):
    _log_out.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Finalizando serviço...\n")
    _log_out.flush()
    if PID_FILE.exists():
        try:
            PID_FILE.unlink(missing_ok=True)
        except Exception:
            pass
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

if __name__ == "__main__":
    write_pid()
    from config import PORT, HOST
    _log_out.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Subindo FastAPI em {HOST}:{PORT}\n")
    _log_out.flush()
    try:
        uvicorn.run("app:app", host=HOST, port=PORT, log_level="info", access_log=True)
    except Exception as e:
        _log_out.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Erro fatal: {e}\n")
        traceback.print_exc(file=_log_out)
        _log_out.flush()
    finally:
        cleanup()
