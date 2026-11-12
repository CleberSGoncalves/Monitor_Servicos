import sys
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from auth import create_session

ARTIFACT_DIR = Path(r"C:\Users\Cleber\.gemini\antigravity\brain\69a25dad-6420-47a9-86ae-6c86aeed62ba")

def run():
    token = create_session("cleber.goncalves", "admin")
    print(f"[*] Token gerado: {token[:15]}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        print("[*] Acessando dashboard...")
        page.goto("http://localhost:8092", wait_until="networkidle")
        time.sleep(1)

        # Login automático via token real
        page.evaluate(f"""() => {{
            localStorage.setItem('fleet_token', '{token}');
            localStorage.setItem('fleet_user', JSON.stringify({{
                username: 'cleber.goncalves',
                role: 'admin',
                display_name: 'Cleber Gonçalves'
            }}));
            authToken = '{token}';
            currentUser = {{ username: 'cleber.goncalves', role: 'admin' }};
            const authModal = document.getElementById('authModal');
            if (authModal) {{
                authModal.style.display = 'none';
                authModal.classList.add('hidden');
            }}
        }}""")
        page.reload(wait_until="networkidle")
        time.sleep(3)

        # 1. Abre o Modal de Progresso de Atualização de Anápolis
        print("[*] Abrindo Modal de Progresso de Atualização de Anápolis...")
        page.evaluate("""() => {
            const authModal = document.getElementById('authModal');
            if (authModal) authModal.style.display = 'none';
            if (typeof openFleetUpdateProgressModal === 'function') {
                openFleetUpdateProgressModal('BRGO-ANA-DT02', 'Atria Capture', '2.0.0.2');
            }
        }""")
        time.sleep(3)

        modal_path = ARTIFACT_DIR / "modal_progresso_atualizacao_anapolis.png"
        page.screenshot(path=str(modal_path))
        print(f"[OK] Screenshot do modal salva em: {modal_path}")

        # Fecha modal de progresso
        page.evaluate("""() => {
            if (typeof closeFleetUpdateProgressModal === 'function') closeFleetUpdateProgressModal();
        }""")
        time.sleep(1)

        # 2. Navega para Topologia RF de São Luís (5 Multiplexes)
        print("[*] Abrindo Topologia RF de São Luís via openMarketRfModal...")
        page.evaluate("""async () => {
            if (typeof openMarketRfModal === 'function') {
                await openMarketRfModal('BRMA-SLS', 'all');
            }
        }""")
        time.sleep(4)

        rf_path = ARTIFACT_DIR / "topologia_rf_todas_pracas_e_sao_luis_5_muxes.png"
        page.screenshot(path=str(rf_path))
        print(f"[OK] Screenshot da topologia RF salva em: {rf_path}")

        browser.close()

if __name__ == "__main__":
    run()
