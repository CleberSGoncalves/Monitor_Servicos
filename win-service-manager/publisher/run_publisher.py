import os
import sys

def main():
    # Identifica o caminho correto de app.py dependendo de estar congelado (PyInstaller) ou script
    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
        app_path = os.path.join(base_dir, "publisher", "app.py")
        if not os.path.exists(app_path):
            app_path = os.path.join(base_dir, "app.py")
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        app_path = os.path.join(base_dir, "app.py")

    print("==================================================")
    print("  Iniciando Windows Service Fleet Manager Publisher")
    print("==================================================")
    print(f"Caminho da aplicação: {app_path}")

    from streamlit.web import cli as stcli
    sys.argv = [
        "streamlit",
        "run",
        app_path,
        "--browser.gatherUsageStats=false",
        "--server.headless=false"
    ]
    sys.exit(stcli.main())

if __name__ == "__main__":
    main()
