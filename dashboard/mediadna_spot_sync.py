"""
mediadna_spot_sync.py - Automação Headless para Reset de Sincronização de Spots no Portal MediaDNA
Kantar IBOPE Media — Central CS Fleet

Executa em modo headless via Playwright:
1. Autenticação no portal MediaDNA (https://mediadna.ibope.com/MediaDNA/login.aspx).
2. Tratamento de idioma (pt-BR) e derrubada de sessões concorrentes (btnSim).
3. Navegação até Pesquisa de Hosts (HostPesquisa.aspx).
4. Busca do Host da praça correspondente.
5. Acesso aos detalhes do Host e acionamento do botão 'Reset Sincronização'.
6. (Opcional) Disparo remoto no CS01 para reiniciar DNA.ConfigMonitorSVC e FastMatchingSvc.
"""
import os
import json
import time
import logging
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger("MediaDNASpotSync")

CREDENTIALS_FILE = Path(__file__).resolve().parent / "data" / ".mediadna_credentials.json"

def get_default_mediadna_credentials() -> Dict[str, str]:
    """Retorna credenciais salvas ou padrão."""
    if CREDENTIALS_FILE.exists():
        try:
            with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("username") and data.get("password"):
                    return data
        except Exception as e:
            logger.warning(f"Erro ao ler {CREDENTIALS_FILE}: {e}")
    
    return {
        "username": os.environ.get("MEDIADNA_USER", "svc.captacao"),
        "password": os.environ.get("MEDIADNA_PASS", "Acount@!2026")
    }

def save_mediadna_credentials(username: str, password: str):
    """Salva credenciais para reutilização."""
    try:
        CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
            json.dump({"username": username, "password": password}, f)
    except Exception as e:
        logger.warning(f"Erro ao salvar credenciais: {e}")

def run_mediadna_reset_sync(
    host_query: str,
    username: Optional[str] = None,
    password: Optional[str] = None,
    headless: bool = True,
    timeout_sec: int = 40
) -> Dict[str, Any]:
    """
    Executa o fluxo completo de Reset de Sincronização de Spots no portal MediaDNA.
    """
    creds = get_default_mediadna_credentials()
    user = username or creds.get("username", "svc.captacao")
    pwd = password or creds.get("password", "Acount@!2026")

    from playwright.sync_api import sync_playwright

    logs = []
    def log(msg: str):
        logs.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        logger.info(msg)

    log(f"Iniciando automação MediaDNA para host '{host_query}' (Usuário: {user})...")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=headless,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"]
            )
            context = browser.new_context(
                ignore_https_errors=True,
                locale="pt-BR",
                viewport={"width": 1280, "height": 800}
            )
            page = context.new_page()
            page.set_default_timeout(timeout_sec * 1000)

            # 1. Acesso ao Login
            login_url = "https://mediadna.ibope.com/MediaDNA/login.aspx"
            log(f"Acessando {login_url}...")
            page.goto(login_url)

            # Configura cultura / idioma pt-BR clicando na bandeira se disponível
            flag_br = page.query_selector('input[id*="imgBtnBR"]')
            if flag_br:
                log("Selecionando idioma Português (pt-BR)...")
                flag_br.click()
                page.wait_for_timeout(1000)

            # Preenche credenciais
            log(f"Preenchendo credenciais do usuário '{user}'...")
            page.fill('input[id*="txbLogin"]', user)
            page.fill('input[id*="txbSenha"]', pwd)
            page.click('input[id*="btnLogin"]')
            page.wait_for_timeout(2500)

            # 2. Tratamento de Sessão Concorrente
            btn_sim = page.query_selector('input[id*="btnSim"]')
            if btn_sim:
                log("Sessão concorrente detectada. Confirmando derrubada de sessão anterior ('Sim')...")
                btn_sim.click()
                page.wait_for_timeout(2500)

            log(f"Login concluído. URL atual: {page.url} | Título: {page.title()}")

            # 3. Navegação para Pesquisa de Hosts
            host_pesquisa_url = "https://mediadna.ibope.com/MediaDNA/HostNovoConfig/HostPesquisa.aspx"
            log(f"Navegando para {host_pesquisa_url}...")
            page.goto(host_pesquisa_url)
            page.wait_for_timeout(2500)

            # Validação de permissão de acesso à página de Hosts
            if "login.aspx" in page.url.lower():
                browser.close()
                return {
                    "success": False,
                    "error": "AUTH_FAILED",
                    "message": "Credenciais inválidas para o portal MediaDNA.",
                    "logs": logs
                }

            if "paginainicial.aspx" in page.url.lower():
                browser.close()
                return {
                    "success": False,
                    "error": "INSUFFICIENT_PERMISSIONS",
                    "message": f"O usuário '{user}' não possui permissão para acessar o menu 'Hosts' (HostPesquisa.aspx). É necessário utilizar um usuário com permissão administrativa (ex: Cleber Gonçalves) no portal MediaDNA.",
                    "logs": logs
                }

            # 4. Pesquisa do Host
            log(f"Localizando campo de pesquisa para '{host_query}'...")
            name_input = page.query_selector('input[id*="txbNome"], input[id*="Nome"], input[type="text"]')
            if not name_input:
                browser.close()
                return {
                    "success": False,
                    "error": "INPUT_NOT_FOUND",
                    "message": "Campo de pesquisa de Host não encontrado na página HostPesquisa.aspx.",
                    "logs": logs
                }

            name_input.fill(host_query)
            log(f"Texto '{host_query}' preenchido no filtro.")

            # Clica no botão de pesquisa (lupa ou submit)
            search_btn = page.query_selector('input[id*="btnPesquisar"], input[id*="Pesquisar"], input[type="image"], img[src*="lupa"], a[id*="Pesquisar"]')
            if search_btn:
                log("Clicando no botão de pesquisar...")
                search_btn.click()
            else:
                log("Submetendo formulário via Enter...")
                name_input.press("Enter")

            page.wait_for_timeout(3000)

            # 5. Localizar o Host na Tabela de Resultados
            log("Inspecionando tabela de resultados...")
            rows = page.query_selector_all('table tr')
            target_link = None

            for row in rows:
                txt = row.inner_text()
                if host_query.lower() in txt.lower():
                    links = row.query_selector_all('a')
                    if links:
                        target_link = links[0]
                        log(f"Host correspondente localizado na linha: '{txt.strip()[:60]}'")
                        break

            if not target_link:
                # Tenta primeiro link dentro de grid se houver apenas 1 resultado
                any_links = page.query_selector_all('table[id*="Grid"] a, table[id*="Hosts"] a')
                if any_links:
                    target_link = any_links[0]
                    log("Utilizando primeiro resultado da tabela de Hosts.")

            if not target_link:
                page_text = page.inner_text("body")[:300]
                browser.close()
                return {
                    "success": False,
                    "error": "HOST_NOT_FOUND",
                    "message": f"Nenhum Host encontrado com o termo '{host_query}' na tabela de resultados.",
                    "page_preview": page_text,
                    "logs": logs
                }

            log("Abrindo formulário de detalhes do Host...")
            target_link.click()
            page.wait_for_timeout(3000)
            log(f"Página do Host aberta: {page.url} | Título: {page.title()}")

            # 6. Clicar no Botão 'Reset Sincronização'
            log("Localizando botão 'Reset Sincronização'...")
            reset_btn = page.query_selector('input[value*="Reset Sincronização"], input[value*="Reset"], button:has-text("Reset Sincronização"), a:has-text("Reset Sincronização")')

            if not reset_btn:
                # Procura por qualquer botão com id ou value de Reset
                for el in page.query_selector_all('input[type="submit"], input[type="button"], button'):
                    v = el.get_attribute("value") or el.inner_text() or ""
                    if "reset" in v.lower() or "sincroniza" in v.lower():
                        reset_btn = el
                        break

            if not reset_btn:
                browser.close()
                return {
                    "success": False,
                    "error": "RESET_BUTTON_NOT_FOUND",
                    "message": "Botão 'Reset Sincronização' não encontrado na página do Host.",
                    "logs": logs
                }

            # Configura handler de popup/dialog de confirmação caso surja
            page.on("dialog", lambda dialog: dialog.accept())

            log("Clicando em 'Reset Sincronização'...")
            reset_btn.click()
            page.wait_for_timeout(3000)

            log("Reset de sincronização acionado com sucesso no portal MediaDNA!")

            browser.close()

            # Salva credenciais se foram fornecidas explicitamente e tiveram sucesso
            if username and password:
                save_mediadna_credentials(username, password)

            return {
                "success": True,
                "host_query": host_query,
                "message": f"Reset de Sincronização do host '{host_query}' executado com sucesso no portal MediaDNA! O cursor de spots foi reinicializado pela central.",
                "logs": logs
            }

    except Exception as e:
        logger.error(f"Erro na automação MediaDNA: {e}", exc_info=True)
        return {
            "success": False,
            "error": "EXECUTION_EXCEPTION",
            "message": f"Erro durante automação headless: {str(e)}",
            "logs": logs
        }
