import os
import sys
import pytest
from playwright.sync_api import sync_playwright

# Importa create_session do dashboard/auth.py
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))
from auth import create_session

def test_modal_live_playwright():
    console_errors = []
    token = create_session("cleber.goncalves", "admin")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Monitora logs de erro no console
        def _on_console(msg):
            if msg.type in ("error",) and "favicon" not in msg.text.lower():
                console_errors.append(f"[{msg.type.upper()}] {msg.text}")

        page.on("console", _on_console)

        # 1. Acessa dashboard local e injeta tokens de autenticação
        page.goto("http://127.0.0.1:8092", wait_until="domcontentloaded", timeout=15000)
        page.evaluate(f"""() => {{
            localStorage.setItem('fleet_token', '{token}');
            localStorage.setItem('authToken', '{token}');
            localStorage.setItem('access_token', '{token}');
            document.cookie = 'session_token={token}; path=/';
            window.authToken = '{token}';
            const login = document.getElementById('loginModal');
            if (login) {{ login.classList.remove('active'); login.style.display = 'none'; }}
        }}""")
        page.wait_for_timeout(500)

        # 2. Abre o modal Detection Pipeline Live diretamente via JavaScript aguardando o carregamento completo
        page.evaluate("""async () => {
            if (window.openDetectionPipelineLiveModal) {
                await window.openDetectionPipelineLiveModal('Aracaju-SMME-328-CS1', 'Aracaju');
            }
        }""")
        page.wait_for_timeout(3000)

        # 3. Verifica se o modal está visível
        modal = page.locator("#detectionPipelineLiveModal")
        assert modal.is_visible(), "Modal detectionPipelineLiveModal deveria estar visível"

        # 4. Inspeciona as opções do dropdown fmaLiveHostSelect
        select_locator = page.locator("#fmaLiveHostSelect")
        assert select_locator.is_visible(), "Dropdown fmaLiveHostSelect deveria estar visível"

        options_texts = page.evaluate("() => Array.from(document.querySelectorAll('#fmaLiveHostSelect option')).map(o => o.text)")
        print(f"Total de opções no dropdown: {len(options_texts)}")
        assert len(options_texts) > 5, f"Dropdown deveria conter lista de praças CS01! Veio apenas: {options_texts}"

        # Verifica Campinas no dropdown
        campinas_options = [t for t in options_texts if "campinas" in t.lower()]
        print(f"Opções de Campinas no dropdown: {campinas_options}")
        assert len(campinas_options) == 1, f"Campinas deve aparecer EXATAMENTE UMA VEZ no seletor! Veio: {campinas_options}"
        assert "Campinas-SMME-52-CS1" in campinas_options[0], f"Deve ser o nó canônico Campinas-SMME-52-CS1! Veio: {campinas_options[0]}"

        # 5. Verifica se o footer foi renderizado com sucesso (sem o erro 'Cannot read properties of null')
        footer_text = page.locator("#fmaLiveFooterStatus").text_content() or ""
        print(f"Texto do footer: {footer_text}")
        assert "cannot read properties of null" not in footer_text.lower(), f"Erro de toLocaleString detectado na tela: {footer_text}"
        assert "erro na sincronização" not in footer_text.lower(), f"Erro de sincronização exibido no footer: {footer_text}"
        assert "Modo:" in footer_text, f"Footer deveria conter o modo de telemetria! Veio: {footer_text}"
        assert "RAM Motor:" in footer_text, f"Footer deveria conter RAM Motor! Veio: {footer_text}"

        # 7. Verifica se o quadro de telemetria carregou (sem travar em 'Carregando telemetria ao vivo...')
        modal_body = page.locator("#fmaLiveModalBody").inner_html()
        assert "Carregando telemetria ao vivo" not in modal_body, "O corpo do modal não deveria ter ficado travado em Carregando telemetria ao vivo"
        assert "Catálogo SGG (RAM)" in modal_body, "Deveria ter renderizado o card de Catálogo SGG"
        assert "Geração de .EMU (1 min)" in modal_body, "Deveria ter renderizado o card de Geração de .EMU"

        # 8. Tira screenshot de comprovação do teste
        screenshot_path = "tests/evidence_modal_playwright.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot salvo em {screenshot_path}")

        # Valida que não houve erros não tratados no console
        fatal_errors = [e for e in console_errors if "toLocaleString" in e or "TypeError" in e]
        assert len(fatal_errors) == 0, f"Erros graves no console: {fatal_errors}"

        browser.close()

    print("✅ Teste E2E Playwright APROVADO com 100% de sucesso!")

if __name__ == "__main__":
    test_modal_live_playwright()
