import os
import sys
import subprocess
import time

def main():
    # Identifica a localização do app.py
    if getattr(sys, 'frozen', False):
        # Se estiver rodando empacotado como .exe pelo PyInstaller
        base_dir = os.path.dirname(sys.executable)
        app_path = os.path.join(base_dir, "publisher", "app.py")
        if not os.path.exists(app_path):
            app_path = os.path.join(base_dir, "app.py")
        if not os.path.exists(app_path):
            # Se empacotado junto no _MEIPASS
            app_path = os.path.join(getattr(sys, '_MEIPASS', base_dir), "publisher", "app.py")
    else:
        # Se estiver rodando via script python normal
        base_dir = os.path.dirname(os.path.abspath(__file__))
        app_path = os.path.join(base_dir, "app.py")

    print(f"==================================================")
    print(f"  Iniciando Windows Service Fleet Manager Publisher")
    print(f"==================================================")
    print(f"Caminho da aplicação: {app_path}")

    try:
        from streamlit.web import cli as stcli
        sys.argv = [
            "streamlit",
            "run",
            app_path,
            "--browser.gatherUsageStats=false",
            "--server.headless=false"
        ]
        sys.exit(stcli.main())
    except Exception as e:
        print(f"Executando fallback via subprocess: {e}")
        subprocess.run([sys.executable, "-m", "streamlit", "run", app_path])

if __name__ == "__main__":
    main()
