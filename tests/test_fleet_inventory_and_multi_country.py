import os
import sys
import pytest
from io import BytesIO
import openpyxl

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))

def test_country_utils_universal_inference():
    from country_utils import get_country_flag, normalize_country_name, infer_country_from_record

    # 1. Normalização de nomes com brackets de status
    assert normalize_country_name("Brasil [🟢 Saudável]") == "Brasil"
    assert normalize_country_name("Argentina [🔴 Alerta]") == "Argentina"
    assert normalize_country_name("costa rica") == "Costa Rica"
    assert normalize_country_name(None) == "Brasil"

    # 2. Bandeiras
    assert get_country_flag("Brasil") == "🇧🇷"
    assert get_country_flag("Argentina") == "🇦🇷"
    assert get_country_flag("Chile") == "🇨🇱"
    assert get_country_flag("Colômbia") == "🇨🇴"
    assert get_country_flag("Costa Rica") == "🇨🇷"
    assert get_country_flag("México") == "🇲🇽"
    assert get_country_flag("Desconhecido") == "🌐"

    # 3. Inferência de país a partir de registros
    rec1 = {"pais": "Argentina", "hostname": "ARBA-CS1"}
    assert infer_country_from_record(rec1) == "Argentina"

    rec2 = {"title": "Chile [🟢 Saudável]", "hostname": "CL-STG-CS2"}
    assert infer_country_from_record(rec2) == "Chile"

    rec3 = {"hostname": "AR-BUE-01"}
    assert infer_country_from_record(rec3) == "Argentina"

    rec4 = {"hostname": "Uberlandia-SMME-284-CS1"}
    assert infer_country_from_record(rec4) == "Brasil"

def test_fleet_inventory_data_and_distribution_structure():
    from fleet_inventory import get_fleet_inventory_data

    # Teste de inventário do Atria Capture (exatamente a demanda do Marcio)
    data = get_fleet_inventory_data(service_name="Atria Capture")
    assert data["success"] is True
    assert data["service_name"] == "Atria Capture"
    assert data["total_hosts"] > 0
    assert "versions_distribution" in data
    assert isinstance(data["versions_distribution"], list)
    assert len(data["versions_distribution"]) > 0

    # Verifica que a distribuição contém versão, contagem, percentual e status
    for item in data["versions_distribution"]:
        assert "version" in item
        assert "count" in item
        assert "percent" in item
        assert "status" in item
        assert "is_homologated" in item
        assert 0 <= item["percent"] <= 100

    # Verifica países e serviços disponíveis de forma dinâmica
    assert "available_countries" in data
    assert len(data["available_countries"]) > 0
    assert any(c["name"] == "Brasil" for c in data["available_countries"])

    assert "available_services" in data
    assert "Atria Capture" in data["available_services"]

    # Verifica itens granulares
    assert "items" in data
    assert len(data["items"]) > 0
    first = data["items"][0]
    assert "pais" in first
    assert "praca" in first
    assert "hostname" in first
    assert "versao_instalada" in first
    assert "versao_desejada" in first

def test_fleet_inventory_excel_generation():
    from fleet_inventory import generate_fleet_inventory_excel

    xlsx_bytes = generate_fleet_inventory_excel(service_name="Atria Capture", country="Brasil")
    assert isinstance(xlsx_bytes, bytes)
    assert len(xlsx_bytes) > 5000
    # Verifica assinatura ZIP / XLSX (PK..)
    assert xlsx_bytes.startswith(b"PK")

    # Carrega a pasta de trabalho em memória para validar as duas abas
    wb = openpyxl.load_workbook(BytesIO(xlsx_bytes))
    sheet_names = wb.sheetnames
    assert "Resumo - Distribuição" in sheet_names
    assert "Inventário Granular (Hosts)" in sheet_names

    ws1 = wb["Resumo - Distribuição"]
    assert "KANTAR IBOPE MEDIA" in str(ws1["A1"].value)
    assert "DISTRIBUIÇÃO OFICIAL DE VERSÕES" in str(ws1["A8"].value)

    ws2 = wb["Inventário Granular (Hosts)"]
    headers = [cell.value for cell in ws2[1]]
    assert "País" in headers
    assert "Praça" in headers
    assert "Hostname" in headers
    assert "Versão Instalada" in headers
    assert "Status do Serviço" in headers
    assert ws2.max_row > 10

def test_index_html_contains_inventory_subtab_and_script():
    html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "index.html"))
    with open(html_path, "r", encoding="utf-8") as fp:
        html = fp.read()

    # Subaba e Container de Inventário
    assert 'id="btn-fleet-subtab-inventory"' in html
    assert 'id="fleetSubtabInventoryContainer"' in html
    assert 'id="invFilterService"' in html
    assert 'id="invFilterCountry"' in html
    assert 'id="invExecutiveTableBody"' in html
    assert 'id="invGranularTableBody"' in html
    assert 'exportFleetInventoryToExcel()' in html
    assert 'copyExecutiveInventoryTable()' in html

    # Script tag carregado
    assert 'fleet_inventory.js?v=3.9.114' in html

def test_fleet_ops_subtab_switching():
    js_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "js", "fleet_ops.js"))
    with open(js_path, "r", encoding="utf-8") as fp:
        js = fp.read()

    assert 'btn-fleet-subtab-inventory' in js
    assert 'fleetSubtabInventoryContainer' in js
    assert 'loadFleetInventory()' in js
