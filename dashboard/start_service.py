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
import uvicorn
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))
os.chdir(ROOT_DIR)

DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
PID_FILE = DATA_DIR / "service.pid"
LOG_FILE = DATA_DIR / "dashboard.log"

# Garante compatibilidade total com pythonw.exe
_log_out = open(LOG_FILE, "a", encoding="utf-8", buffering=1)

if sys.stdout is None or getattr(sys.stdout, "closed", False):
    sys.stdout = _log_out
else:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

if sys.stderr is None or getattr(sys.stderr, "closed", False):
    sys.stderr = _log_out
else:
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

if sys.stdin is None or getattr(sys.stdin, "closed", False):
    sys.stdin = open(os.devnull, "r", encoding="utf-8")


def write_pid():
    pid = os.getpid()
    PID_FILE.write_text(str(pid), encoding="utf-8")
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Iniciado com PID: {pid}")


def cleanup(*args):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Finalizando serviço...")
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
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Subindo FastAPI em {HOST}:{PORT}")
    try:
        uvicorn.run("app:app", host=HOST, port=PORT, log_level="info", access_log=True)
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [FleetService] Erro fatal: {e}")
    finally:
        cleanup()
