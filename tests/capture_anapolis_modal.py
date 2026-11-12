from playwright.sync_api import sync_playwright

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        page.goto("http://localhost:8092", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # Open update progress modal for Anápolis CS 2 (BRGO-ANA-DT02) with target 2.0.0.2
        page.evaluate("openFleetUpdateProgressModal('BRGO-ANA-DT02', 'Atria Capture', '2.0.0.2')")
        page.wait_for_selector("#fleetUpdateProgressModal", state="visible", timeout=10000)
        page.wait_for_timeout(3500)

        screenshot_path = "C:/Users/Cleber/.gemini/antigravity/brain/69a25dad-6420-47a9-86ae-6c86aeed62ba/modal_progresso_atualizacao_anapolis_corrigido.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot successfully saved to {screenshot_path}")
        browser.close()

if __name__ == "__main__":
    capture()
