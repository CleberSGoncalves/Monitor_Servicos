import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

# Injeta dashboard no path
dashboard_dir = Path(__file__).resolve().parent.parent / "dashboard"
if str(dashboard_dir) not in sys.path:
    sys.path.insert(0, str(dashboard_dir))

from auth import create_session

OUTPUT_DIR = Path(r"C:\Users\Cleber\.gemini\antigravity\brain\69a25dad-6420-47a9-86ae-6c86aeed62ba")

async def run_e2e():
    token = create_session("cleber.goncalves", "admin")
    print(f"Token de sessão gerado com sucesso: {token[:20]}...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1400, "height": 950})
        
        # Injeta cookie de autenticação
        await context.add_cookies([
            {"name": "session_token", "value": token, "domain": "localhost", "path": "/"}
        ])

        page = await context.new_page()

        print("1. Acessando dashboard em http://localhost:8092/ ...")
        await page.goto("http://localhost:8092/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2000)

        # Injeta token no localStorage e descarta qualquer modal residual
        await page.evaluate(f"""
            localStorage.setItem('fleet_token', '{token}');
            const login = document.getElementById('loginModal');
            if (login) {{
                login.classList.remove('active');
                login.style.display = 'none';
            }}
        """)
        await page.wait_for_timeout(500)

        print("2. Abrindo modal Pipeline Live para Cascavel...")
        await page.evaluate("openDetectionPipelineLiveModal('Cascavel-SMME-215-CS1', 'Cascavel')")
        
        # Aguarda renderização dos cards
        await page.wait_for_selector("#fmaLiveModalBody .badge, #fmaLiveModalBody table", timeout=10000)
        await page.wait_for_timeout(2000)

        # Captura screenshot do modal aberto para Cascavel
        cascavel_screenshot = OUTPUT_DIR / "pipeline_live_cascavel_sem_sbt.png"
        await page.screenshot(path=str(cascavel_screenshot))
        print(f"3. Screenshot do Pipeline Live (Cascavel) salvo em: {cascavel_screenshot.name}")

        # Validações no DOM do modal
        modal_body = await page.locator("#fmaLiveModalBody").inner_text()
        print("--- CONTEÚDO DO MODAL BODY ---")
        print(modal_body[:400])
        print("-------------------------------")

        assert "CATÁLOGO SGG" in modal_body.upper(), "Falta identificação clara de Catálogo SGG em RAM"
        assert "DETECÇÕES NO AR" in modal_body.upper(), "Falta identificação de NEW DETECTION"
        assert "GLOBO" in modal_body, "GLOBO deve estar presente em Cascavel"
        assert "RECORD" in modal_body, "RECORD deve estar presente em Cascavel"
        assert "BAND" in modal_body, "BAND deve estar presente em Cascavel"
        assert "SBT" not in modal_body, "ERRO: SBT não pode aparecer em Cascavel!"

        print("4. Clicando no botão do Guia Técnico & Playbook...")
        await page.evaluate("openPipelineLiveGuideModal()")
        await page.wait_for_timeout(1000)

        # Captura screenshot do Guia Técnico aberto
        guide_screenshot = OUTPUT_DIR / "pipeline_live_guide_modal_open.png"
        await page.screenshot(path=str(guide_screenshot))
        print(f"5. Screenshot do Guia Técnico salvo em: {guide_screenshot.name}")

        guide_modal = page.locator("#pipelineLiveGuideModal")
        assert await guide_modal.is_visible(), "Modal do Guia Técnico deve estar visível!"
        guide_text = await guide_modal.inner_text()
        print("--- CONTEÚDO DO GUIA TÉCNICO ---")
        print(guide_text[:350])
        print("---------------------------------")
        assert "GUIA TÉCNICO" in guide_text.upper()
        assert "CATÁLOGO EM MEMÓRIA" in guide_text.upper()
        assert "NEW DETECTION" in guide_text.upper()
        assert "CASCAVEL" in guide_text.upper()

        print("6. Fechando modal do Guia Técnico...")
        await page.evaluate("closePipelineLiveGuideModal()")
        await page.wait_for_timeout(500)
        assert not await guide_modal.is_visible(), "Modal do Guia Técnico deve estar oculto!"

        await browser.close()
        print("7. E2E CONCLUÍDO COM 100% DE SUCESSO!")

if __name__ == "__main__":
    asyncio.run(run_e2e())
