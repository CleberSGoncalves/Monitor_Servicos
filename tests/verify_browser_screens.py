import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = Path(r"C:\Users\Cleber\.gemini\antigravity\brain\69a25dad-6420-47a9-86ae-6c86aeed62ba")

def run_browser_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 950})
        page = context.new_page()

        # Injeta auth e vai para a página principal
        page.goto("http://localhost:8092", wait_until="domcontentloaded")
        page.evaluate("""() => {
            localStorage.setItem("fleet_token", "fake_admin_token");
            localStorage.setItem("access_token", "fake_admin_token");
            const modal = document.getElementById("loginModal");
            if (modal) modal.classList.remove("active");
        }""")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        # 1. Navega para a aba Infra & Frota via switchTab
        page.evaluate("switchTab('fleet')")
        page.wait_for_timeout(2500)

        # Captura screenshot da Matriz de Governança
        page.screenshot(path=str(ARTIFACTS_DIR / "governanca_matriz_e_servicos_resolvido.png"))
        print("[OK] Screenshot 1: governanca_matriz_e_servicos_resolvido.png salvo.")

        # 2. Seleciona Atria Capture no dropdown de evolução
        page.evaluate("""() => {
            if (typeof selectGovernanceService === 'function') {
                selectGovernanceService('Atria Capture');
            }
        }""")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(ARTIFACTS_DIR / "governanca_atria_capture_v2002_resolvido.png"))
        print("[OK] Screenshot 2: governanca_atria_capture_v2002_resolvido.png salvo.")

        # 3. Navega para a aba Broadcast & RF e abre São Luís
        page.evaluate("switchTab('map')")
        page.wait_for_timeout(2500)

        # Abre modal de São Luís
        page.evaluate("""() => {
            if (typeof openMarketRfModal === 'function') {
                openMarketRfModal('BRMA-SLS', 'all');
            }
        }""")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(ARTIFACTS_DIR / "topologia_rf_sao_luis_5_muxes_resolvido.png"))
        print("[OK] Screenshot 3: topologia_rf_sao_luis_5_muxes_resolvido.png salvo.")

        # Fecha o modal antes de ir para a próxima aba
        page.evaluate("""() => {
            if (typeof closeMarketRfModal === 'function') {
                closeMarketRfModal();
            } else {
                const m = document.getElementById('marketRfModal');
                if (m) m.classList.remove('active');
            }
        }""")
        page.wait_for_timeout(500)

        # 4. Navega para a aba Link WAN
        page.evaluate("switchTab('network')")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(ARTIFACTS_DIR / "link_wan_audio_contabilizado_resolvido.png"))
        print("[OK] Screenshot 4: link_wan_audio_contabilizado_resolvido.png salvo.")

        # 5. Volta para a aba Infra & Frota e rola até a tabela de evolução
        page.evaluate("switchTab('fleet')")
        page.wait_for_timeout(2000)
        page.evaluate("window.scrollTo(0, 1500)")
        page.wait_for_timeout(1000)
        page.screenshot(path=str(ARTIFACTS_DIR / "evolucao_tabela_e_acoes_sharepoint.png"))
        print("[OK] Screenshot 5: evolucao_tabela_e_acoes_sharepoint.png salvo.")

        browser.close()

if __name__ == "__main__":
    run_browser_verification()
