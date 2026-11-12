import pytest
from playwright.sync_api import sync_playwright

def test_rf_modal_sao_luis_5_muxes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # Acessa o dashboard local
        page.goto("http://localhost:8092", wait_until="networkidle", timeout=30000)

        # Abre o modal de topologia RF de São Luís diretamente
        page.evaluate("openMarketRfModal('BRMA-SLS', 'all')")
        page.wait_for_selector("#rfTopographyModal", state="visible", timeout=10000)
        page.wait_for_timeout(1000)

        # Verifica se o seletor de CS tem Todas as CSs (10) ou 5 canais
        cs_bar_text = page.locator("#rfModalCsSelectorContainer").inner_text()
        print("CS Bar Text:", cs_bar_text)
        assert "Todas as CSs (10)" in cs_bar_text
        assert "CS01 (Principal) (5 canais)" in cs_bar_text
        assert "CS02 (BKP) (5 canais)" in cs_bar_text

        # Clica em CS01 (Principal)
        page.evaluate("switchRfModalCs(1)")
        page.wait_for_timeout(800)

        # Valida que na tabela de canais aparecem os 5 multiplexes ativos
        table_text = page.locator("#rfModalChannelsTableBody").inner_text()
        print("Table Text CS01:\n", table_text)
        assert "Record TV" in table_text
        assert "Rede TV" in table_text
        assert "SBT" in table_text
        assert "BAND MA" in table_text
        assert "MIRANTE DIGITAL" in table_text

        # Tira screenshot do modal aberto provando os 5 multiplexes em CS01
        screenshot_path = "C:/Users/Cleber/.gemini/antigravity/brain/69a25dad-6420-47a9-86ae-6c86aeed62ba/modal_topologia_rf_sao_luis_5_muxes_comprovado.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot salvo em {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    test_rf_modal_sao_luis_5_muxes()
