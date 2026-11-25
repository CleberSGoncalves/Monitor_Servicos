import asyncio
import os
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await context.new_page()

        print("1. Acessando Dashboard local...")
        await page.goto("http://localhost:8092", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)

        print("2. Ativando a aba Detecção Comercial e dispensando login modal se houver...")
        await page.evaluate("""
            const login = document.getElementById('loginModal');
            if (login) login.classList.remove('active');
            if (login) login.style.display = 'none';

            document.querySelectorAll('.content-section').forEach(s => {
                s.classList.remove('active');
                s.style.display = 'none';
            });
            const tab = document.getElementById('tab-deteccao');
            if (tab) {
                tab.classList.add('active');
                tab.style.display = 'block';
            }
        """)
        await page.wait_for_timeout(1000)

        print("3. Localizando o botão 'Pipeline Live (fma.log & EMU)'...")
        btn_live = page.locator("#btnOpenDetectionLiveGlobal")
        assert await btn_live.count() > 0, "Botão #btnOpenDetectionLiveGlobal não encontrado na página"

        print("4. Clicando no botão Pipeline Live...")
        await btn_live.click(force=True)
        await page.wait_for_timeout(2000)

        print("5. Verificando visibilidade do modal...")
        modal = page.locator("#detectionPipelineLiveModal")
        assert await modal.is_visible(), "Modal #detectionPipelineLiveModal não ficou visível após clique!"

        print("6. Verificando opções do seletor de CS01...")
        select_host = page.locator("#fmaLiveHostSelect")
        options_count = await select_host.locator("option").count()
        print(f"   -> Opções carregadas no seletor: {options_count}")
        assert options_count > 0, "Seletor de hosts CS01 vazio!"

        print("7. Verificando renderização do corpo da telemetria...")
        body = page.locator("#fmaLiveModalBody")
        body_text = await body.inner_text()
        print(f"   -> Texto inicial do corpo: {body_text[:120]}...")
        assert len(body_text) > 10, "Corpo do modal não foi preenchido!"

        shot_path = os.path.join(r"C:\Users\Cleber\.gemini\antigravity\brain\69a25dad-6420-47a9-86ae-6c86aeed62ba", "pipeline_live_modal_open.png")
        await page.screenshot(path=shot_path)
        print(f"8. Screenshot salvo com sucesso em: {shot_path}")

        await browser.close()
        print("Teste E2E Playwright CONCLUÍDO COM 100% DE SUCESSO!")

if __name__ == "__main__":
    asyncio.run(run())
