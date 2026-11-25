import os
import pytest
from playwright.sync_api import sync_playwright

INDEX_FILE_URI = f"file:///{os.path.abspath('E:/desenvolvimento/Monitor_Esportes/docs/index.html').replace(os.sep, '/')}"

def test_portal_e2e_all_features():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Coletar erros de console
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        print(f"Navegando para: {INDEX_FILE_URI}")
        page.goto(INDEX_FILE_URI, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)

        assert len(errors) == 0, f"Erros JS no console: {errors}"

        # -------------------------------------------------------------
        # 1. VALIDAÇÃO: PROGRAMAÇÃO STREAMING (CARDS E CORES DAS LINHAS)
        # -------------------------------------------------------------
        print("Testando Programação Streaming...")
        page.evaluate("showPane('streaming')")
        page.wait_for_timeout(1000)

        # Validar labels e contadores dos cards
        lbl_hoje = page.locator("#label-data-hoje").inner_text()
        badge_hoje = page.locator("#badge-count-hoje").inner_text()
        lbl_amanha = page.locator("#label-data-amanha").inner_text()
        badge_amanha = page.locator("#badge-count-amanha").inner_text()

        print(f"Card Hoje: Data={lbl_hoje}, Badge={badge_hoje}")
        print(f"Card Amanhã: Data={lbl_amanha}, Badge={badge_amanha}")

        assert lbl_hoje == "25/11/2026", f"Data de hoje incorreta: {lbl_hoje}"
        assert "jogo" in badge_hoje, f"Badge hoje não reporta jogos: {badge_hoje}"
        assert lbl_amanha == "26/11/2026", f"Data de amanhã incorreta: {lbl_amanha}"
        assert "jogo" in badge_amanha, f"Badge amanhã não reporta jogos: {badge_amanha}"

        # Validar que a lista não contém o texto de loading
        list_hoje_text = page.locator("#list-eventos-hoje").inner_text()
        list_amanha_text = page.locator("#list-eventos-amanha").inner_text()
        assert "Carregando eventos" not in list_hoje_text, "Card hoje ainda exibe texto de loading!"
        assert "Carregando eventos" not in list_amanha_text, "Card amanhã ainda exibe texto de loading!"
        assert "Atlético-MG" in list_hoje_text or "Green Bay" in list_hoje_text, "Confronto de hoje ausente no card"
        assert "Corinthians" in list_amanha_text or "Dallas Mavericks" in list_amanha_text, "Confronto de amanhã ausente no card"

        # Validar classes/cores das linhas na tabela de streaming
        today_rows = page.locator(".stream-row-today")
        past_rows = page.locator(".stream-row-past")
        future_rows = page.locator(".stream-row-future")

        print(f"Linhas Hoje (.stream-row-today): {today_rows.count()}")
        print(f"Linhas Passadas (.stream-row-past): {past_rows.count()}")
        print(f"Linhas Futuras (.stream-row-future): {future_rows.count()}")

        assert today_rows.count() >= 1, "Nenhuma linha marcada com estilo de hoje!"
        assert past_rows.count() >= 10, "Linhas de datas passadas não formatadas!"

        # Screenshot Streaming
        page.screenshot(path="C:/Users/Cleber/.gemini/antigravity/brain/69a25dad-6420-47a9-86ae-6c86aeed62ba/portal_streaming_cards_e_cores.png")
        print("Screenshot salvo: portal_streaming_cards_e_cores.png")

        # -------------------------------------------------------------
        # 2. VALIDAÇÃO: CENTRAL RDP (151 NÓS, MSTSC E ZERO SHAREPOINT)
        # -------------------------------------------------------------
        print("Testando Central RDP & Acesso Remoto...")
        page.evaluate("showPane('remoto')")
        page.wait_for_timeout(1000)

        rdp_rows = page.locator("#rdp-table-body tr")
        print(f"Linhas renderizadas na tabela RDP: {rdp_rows.count()}")
        assert rdp_rows.count() >= 150, f"Esperado ao menos 150 nós na tabela RDP, encontrado: {rdp_rows.count()}"

        # Validar que o botão 'Abrir Pasta no SharePoint' não existe no DOM
        sp_rdp_btn = page.locator("text='Abrir Pasta no SharePoint'")
        assert sp_rdp_btn.count() == 0, "Botão proibido 'Abrir Pasta no SharePoint' ainda existe na tela RDP!"

        # Validar botões de MSTSC
        mstsc_quick_btn = page.locator("text='Conexão Rápida MSTSC'")
        assert mstsc_quick_btn.count() >= 1, "Botão Conexão Rápida MSTSC ausente"

        # Testar filtro América Central & LATAM
        page.evaluate("setRdpCategory('América Central', null)")
        page.wait_for_timeout(500)
        latam_rows = page.locator("#rdp-table-body tr")
        print(f"Linhas LATAM na tabela RDP: {latam_rows.count()}")
        assert latam_rows.count() == 14, f"Esperado 14 nós LATAM, encontrado: {latam_rows.count()}"

        # Retornar para todas as praças
        page.evaluate("setRdpCategory('Todas', null)")
        page.wait_for_timeout(500)

        # Screenshot RDP
        page.screenshot(path="C:/Users/Cleber/.gemini/antigravity/brain/69a25dad-6420-47a9-86ae-6c86aeed62ba/portal_rdp_central_151_nos.png")
        print("Screenshot salvo: portal_rdp_central_151_nos.png")

        # -------------------------------------------------------------
        # 3. VALIDAÇÃO: ESCALA DE TRABALHO (KPIS, HOJE DESTACADO E ZERO SP)
        # -------------------------------------------------------------
        print("Testando Escala de Trabalho...")
        page.evaluate("showPane('escala')")
        page.wait_for_timeout(1000)

        # Validar KPIs
        kpi_total = page.locator("#kpi-escala-total").inner_text()
        kpi_hoje = page.locator("#kpi-escala-hoje").inner_text()
        print(f"KPIs Escala: Total={kpi_total}, Hoje={kpi_hoje}")
        assert "15" in kpi_total, "KPI total de operadores incorreto"
        assert "Turno" in kpi_hoje, "KPI escalados hoje incorreto"

        # Validar destaque da coluna do dia 25 (Hoje)
        today_th = page.locator("#escala-table-head th:has-text('HOJE')")
        assert today_th.count() >= 1, "Cabeçalho da coluna 25 (HOJE) não está destacado na escala!"

        # Validar botão de baixar planilha local
        btn_dl_escala = page.locator("a:has-text('Baixar Planilha (.xlsx)')")
        assert btn_dl_escala.count() >= 1, "Botão de download autônomo da escala ausente"

        # Screenshot Escala
        page.screenshot(path="C:/Users/Cleber/.gemini/antigravity/brain/69a25dad-6420-47a9-86ae-6c86aeed62ba/portal_escala_trabalho_otimizada.png")
        print("Screenshot salvo: portal_escala_trabalho_otimizada.png")

        # -------------------------------------------------------------
        # 4. VALIDAÇÃO: RELATÓRIO TÉCNICO OFICIAL NA ABA DEV
        # -------------------------------------------------------------
        print("Testando Relatório Técnico Oficial (Segurança / DEV)...")
        # Abrir modal do relatório
        page.evaluate("openRelatorioTecnicoModal()")
        page.wait_for_timeout(1000)

        modal_pdf = page.locator("#modal-relatorio-tecnico-pdf")
        assert modal_pdf.is_visible(), "Modal do Relatório Técnico PDF não abriu!"
        iframe_src = page.locator("#iframe-relatorio-pdf").get_attribute("src")
        assert "Relatorio_Tecnico_Arquitetura_Fluxo_Dados_Seguranca_NOC.pdf" in iframe_src, f"Iframe com src incorreto: {iframe_src}"

        # Screenshot Modal Relatório Técnico PDF
        page.screenshot(path="C:/Users/Cleber/.gemini/antigravity/brain/69a25dad-6420-47a9-86ae-6c86aeed62ba/portal_relatorio_tecnico_seguranca_modal.png")
        print("Screenshot salvo: portal_relatorio_tecnico_seguranca_modal.png")

        page.evaluate("closeRelatorioTecnicoModal()")
        page.wait_for_timeout(500)

        # -------------------------------------------------------------
        # 5. VALIDAÇÃO: QUALIDADE & ZERO SHAREPOINT
        # -------------------------------------------------------------
        print("Testando Biblioteca de Qualidade...")
        page.evaluate("showPane('sla')")
        page.wait_for_timeout(1000)

        # Validar que nenhum link aponta para adgbl.sharepoint.com
        sp_links_count = page.locator("a[href*='adgbl.sharepoint.com']").count()
        assert sp_links_count == 0, f"Ainda existem {sp_links_count} links para o SharePoint na página!"

        browser.close()
        print("Todos os testes E2E do Portal foram executados com 100% de aprovação!")

if __name__ == "__main__":
    test_portal_e2e_all_features()
