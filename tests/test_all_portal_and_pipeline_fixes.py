import os
import json
import pytest

def test_escala_de_trabalho_mapping():
    json_path = r'E:\desenvolvimento\Monitor_Esportes\config\escala_completa_2026.json'
    assert os.path.exists(json_path)
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    nov = data.get('Novembro', {})
    ops = nov.get('operadores', [])
    assert len(ops) >= 10

    # O primeiro operador deve ser Rodrigo com matrícula 1015103
    first = ops[0]
    assert first['nome'] == 'Rodrigo'
    assert first['matricula'] == '1015103'
    assert '06:00' in first['horario']
    assert first['equipe'] == 'Monitoração'

    # Segundo operador deve ser Alan com matrícula 1014892
    second = ops[1]
    assert second['nome'] == 'Alan'
    assert second['matricula'] == '1014892'

    # Atividades operacionais separadas
    ativs = nov.get('atividades', [])
    assert len(ativs) >= 3
    ativ_names = [a['nome'] for a in ativs]
    assert any('Chamados' in a for a in ativ_names)
    assert any('Incidentes' in a for a in ativ_names)

def test_zero_sharepoint_links():
    docs_html = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
    assert os.path.exists(docs_html)
    with open(docs_html, 'r', encoding='utf-8') as f:
        html = f.read()

    # Não pode conter links para adgbl.sharepoint.com
    assert 'adgbl.sharepoint.com' not in html

    # Deve conter o visualizador autônomo e funções de exportação
    assert 'openAutonomousDocViewer' in html
    assert 'openReportDocument' in html
    assert 'downloadAutonomousMockDoc' in html

def test_streaming_selection_and_delete():
    docs_html = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
    with open(docs_html, 'r', encoding='utf-8') as f:
        html = f.read()

    assert 'id="chk-stream-all"' in html
    assert 'chk-stream-row' in html
    assert 'id="btn-delete-stream-selected"' in html
    assert 'deleteSelectedStreamingEvents' in html
    assert 'toggleSelectAllStreaming' in html

def test_rdp_management_spacious_and_mstsc():
    docs_html = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
    with open(docs_html, 'r', encoding='utf-8') as f:
        html = f.read()

    assert 'id="btn-rdp-view-list"' in html
    assert 'id="btn-rdp-view-folders"' in html
    assert 'id="rdp-view-folders-container"' in html
    assert 'openQuickMstscModal' in html
    assert 'switchRdpViewMode' in html
    assert 'renderRdpFolders' in html

def test_pipeline_live_and_guide_modal():
    index_html = r'E:\desenvolvimento\Monitor_Servicos\dashboard\static\index.html'
    with open(index_html, 'r', encoding='utf-8') as f:
        html = f.read()

    # O Guia Técnico não deve mencionar especificamente "Por que Cascavel não possui SBT?"
    assert 'Por que Cascavel não possui SBT' not in html
    assert 'Matriz de Veículos e Emissoras por Praça' in html

    # Teste do backend do Pipeline Live
    import sys
    sys.path.insert(0, r'E:\desenvolvimento\Monitor_Servicos\dashboard')
    from tracking_detection_monitor import get_fastmatching_pipeline_live

    casc = get_fastmatching_pipeline_live('Cascavel-SMME-215-CS1')
    caco = get_fastmatching_pipeline_live('Cacoal-SMME-259-CS1')

    assert casc['success'] is True
    assert caco['success'] is True
    assert 'channels_detail' in casc
    assert 'monitored_channels' in casc
