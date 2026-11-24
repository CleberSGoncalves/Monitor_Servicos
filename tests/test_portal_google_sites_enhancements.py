import os
import re
import json
import pytest

INDEX_PATH = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
PORTAL_WEB_PATH = r'E:\desenvolvimento\Monitor_Esportes\portal_web\index.html'
RDP_JSON_PATH = r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json'

@pytest.fixture(scope="module")
def portal_html():
    assert os.path.exists(INDEX_PATH), f"Arquivo index.html não encontrado em {INDEX_PATH}"
    with open(INDEX_PATH, 'r', encoding='utf-8') as f:
        return f.read()

def test_rdp_dataset_integrity():
    assert os.path.exists(RDP_JSON_PATH), f"JSON RDP não encontrado em {RDP_JSON_PATH}"
    with open(RDP_JSON_PATH, 'r', encoding='utf-8') as f:
        hosts = json.load(f)
    assert len(hosts) >= 150, f"Esperado ao menos 150 hosts no dataset RDP, encontrado: {len(hosts)}"
    
    # Validar presença de hosts brasileiros e LATAM via chave 'praca'
    pracas = [h["praca"] for h in hosts]
    assert any("Uberlândia" in p for p in pracas)
    assert any("Campinas" in p or "Bauru" in p or "Brasília" in p for p in pracas)
    assert any("Costa Rica" in p for p in pracas)
    assert any("Guatemala" in p for p in pracas)
    assert any("Panamá" in p for p in pracas)

def test_pane_remoto_in_dom(portal_html):
    assert 'id="pane-remoto"' in portal_html, "Painel dedicado #pane-remoto não encontrado no HTML"
    assert 'triggerRdpConnect' in portal_html, "Função triggerRdpConnect não encontrada no HTML"
    assert 'copyTextToClipboard' in portal_html, "Função copyTextToClipboard não encontrada no HTML"
    assert 'renderRdpTable' in portal_html, "Função renderRdpTable não encontrada no HTML"
    assert 'RDP_MASTER_DATASET' in portal_html, "RDP_MASTER_DATASET não injetado no JS do portal"

def test_quick_close_modal_in_dom(portal_html):
    assert 'id="modal-quick-close-oco"' in portal_html, "Modal de encerramento rápido não encontrado"
    assert 'openQuickCloseOcoModal' in portal_html, "Função openQuickCloseOcoModal não encontrada"
    assert 'submitQuickCloseOco' in portal_html, "Função submitQuickCloseOco não encontrada"
    assert 'openQuickCloseOcoModal(' in portal_html, "Status badges não configurados para disparar o quick-close"

def test_new_oco_modal_smart_dropdowns(portal_html):
    assert 'id="new-oco-host"' in portal_html, "Select de Host/Praça não encontrado"
    assert '<select id="new-oco-host"' in portal_html, "Host/Praça deve ser um elemento <select> com opções"
    assert '<select id="new-oco-cs"' in portal_html, "CS deve ser um elemento <select>"
    assert '<select id="new-oco-equipamento"' in portal_html, "Equipamento deve ser um elemento <select>"
    assert '<select id="new-oco-veiculo"' in portal_html, "Veículo deve ser um elemento <select>"
    assert '<select id="new-oco-area"' in portal_html, "Área/Responsável deve ser um elemento <select>"

def test_refresh_button_and_function(portal_html):
    assert 'refreshOcorrenciasData' in portal_html, "Função refreshOcorrenciasData não encontrada"
    assert 'id="btn-refresh-oco"' in portal_html, "Botão com ID btn-refresh-oco não encontrado"

def test_redmine_and_falhas_colors(portal_html):
    assert 'handleMenuClick(\'redmine\'' in portal_html, "Link do Redmine não encontrado no menu"
    assert 'Dentro do Prazo' in portal_html, "Badge Dentro do Prazo não tratado em formatCellContent"
    assert 'SLA Estourado' in portal_html, "Badge SLA Estourado não tratado em formatCellContent"
    assert 'Pendente' in portal_html, "Badge Pendente não tratado em formatCellContent"

def test_smart_list_fields_and_edit_modal(portal_html):
    assert 'buildSmartFieldHtml' in portal_html, "Função buildSmartFieldHtml não encontrada"
    assert 'openEditListItemModal' in portal_html, "Função openEditListItemModal não encontrada"
    assert 'setFieldNow' in portal_html, "Função de atalho 'Agora' (setFieldNow) não encontrada"

def test_portal_web_sync():
    assert os.path.exists(PORTAL_WEB_PATH), "portal_web/index.html não encontrado"
    size_docs = os.path.getsize(INDEX_PATH)
    size_portal = os.path.getsize(PORTAL_WEB_PATH)
    assert abs(size_docs - size_portal) < 50, f"Divergência entre docs ({size_docs}) e portal_web ({size_portal})"
