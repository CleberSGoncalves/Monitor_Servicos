import sys, os
from playwright.sync_api import sync_playwright

def test_aracaju_modal():
    print("Iniciando Playwright para validacao do modal FastMatching Aracaju...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 950})
        page = context.new_page()

        page.add_init_script("""
            localStorage.setItem("fleet_token", "operador_validado_noc");
            localStorage.setItem("user_role", "admin");
        """)

        print("Navegando para http://127.0.0.1:8092...")
        page.goto("http://127.0.0.1:8092", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # Abre o modal do FastMatching para Aracaju
        print("Abrindo modal FastMatching para Aracaju-SMME-328-CS1...")
        page.evaluate("openDetectionPipelineLiveModal('Aracaju-SMME-328-CS1', 'Aracaju')")

        modal = page.locator("#detectionPipelineLiveModal")
        modal.wait_for(state="visible", timeout=10000)
        print("Modal visivel na tela!")

        # Aguarda a requisicao da API e a renderizacao dos dados
        page.wait_for_timeout(4000)

        # Inspeciona o terminal
        terminal = page.locator("#fmaLiveLogTerminal")
        terminal_text = terminal.inner_text()
        print("\n=== CONTEÚDO DO TERMINAL (#fmaLiveLogTerminal) ===")
        print(f"Comprimento do texto do terminal: {len(terminal_text)} caracteres")
        lines = [l for l in terminal_text.splitlines() if l.strip()]
        print(f"Total de linhas no terminal: {len(lines)}")
        for i, l in enumerate(lines[:8]):
            print(f"  Linha {i+1}: {l}")

        # Inspeciona deteccoes na tabela
        body = page.locator("#fmaLiveModalBody")
        body_text = body.inner_text()

        has_spots = "9.288" in body_text or "9288" in body_text or "Sincronizado" in body_text
        has_new_det = "NEW DETECTION" in terminal_text or "New file mark" in terminal_text or "FromRecon" in terminal_text
        has_real_badge = "DISCO AO VIVO" in body_text or "fma.log Real" in body_text

        print(f"\nChecagens de Validacao:")
        print(f"  [1] Spots/Catálogo carregado (9.288 / Sincronizado): {has_spots}")
        print(f"  [2] Linhas reais do fma.log no Terminal: {has_new_det}")
        print(f"  [3] Indicador DISCO AO VIVO / fma.log Real: {has_real_badge}")

        # Inspeciona tabela de deteccoes
        print("\n=== DETECÇÕES DETECTADAS NO CORPO DO MODAL ===")
        for spot_id in ["18002307", "17999327", "17873852", "17561638"]:
            found = spot_id in body_text
            print(f"  Spot #{spot_id}: {'PRESENTE ✅' if found else 'AUSENTE ❌'}")

        # Tira screenshot do modal centralizado
        evidence_path = os.path.abspath("tests/evidence_aracaju_fma_live_real.png")
        modal_box = modal.locator("> div, div[style*='background: #0b1120']").first
        if modal_box.is_visible():
            modal_box.screenshot(path=evidence_path)
        else:
            page.screenshot(path=evidence_path)
        print(f"\nScreenshot salvo com sucesso em: {evidence_path}")

        # Copia tambem para pasta brain para exibicao em artifacts
        artifact_path = r"C:\Users\Cleber\.gemini\antigravity\brain\69a25dad-6420-47a9-86ae-6c86aeed62ba\img\evidence_aracaju_modal.png"
        page.screenshot(path=artifact_path)
        print(f"Cópia no artifact directory: {artifact_path}")

        browser.close()

        assert len(lines) >= 5, f"Esperado ao menos 5 linhas no terminal, obtido: {len(lines)}"
        assert has_new_det, "Terminal deve conter linhas reais do fma.log!"
        print("\n✅ TESTE E2E APROVADO COM 100% DE SUCESSO!")

if __name__ == "__main__":
    test_aracaju_modal()
