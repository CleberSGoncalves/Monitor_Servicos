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
    assert get_country_flag("Guatemala") == "🇬🇹"
    assert get_country_flag("Peru") == "🇵🇪"
    assert get_country_flag("Panamá") == "🇵🇦"
    assert get_country_flag("Uruguai") == "🇺🇾"
    assert get_country_flag("Desconhecido") == "🌐"

    # 3. Inferência de país a partir de registros e hosts LATAM
    rec1 = {"pais": "Argentina", "hostname": "ARBA-CS1"}
    assert infer_country_from_record(rec1) == "Argentina"

    rec2 = {"hostname": "Guatemala / CGT-BL1"}
    assert infer_country_from_record(rec2) == "Guatemala"

    rec3 = {"hostname": "Lima / CS-PELM-LIM-BL01"}
    assert infer_country_from_record(rec3) == "Peru"

    rec4 = {"hostname": "TV_Bogotá / CS-COBO-BL01"}
    assert infer_country_from_record(rec4) == "Colômbia"

    rec5 = {"hostname": "Costa Rica / CRSJ-BL01"}
    assert infer_country_from_record(rec5) == "Costa Rica"

    rec6 = {"hostname": "Uberlandia-SMME-284-CS1"}
    assert infer_country_from_record(rec6) == "Brasil"


def test_latam_fleet_loader_and_matrix():
    from latam_fleet import get_latam_services, get_latam_matrix

    svcs = get_latam_services()
    matrix = get_latam_matrix()

    assert len(svcs) > 1000, "Deve carregar mais de 1000 instâncias de serviços LATAM"
    assert len(matrix) >= 150, "Deve conter pelo menos 150 hosts na matriz LATAM"

    # Valida presença dos países oficiais
    paises = set(m["pais"] for m in matrix)
    assert "Peru" in paises
    assert "Colômbia" in paises
    assert "Argentina" in paises
    assert "Costa Rica" in paises
    assert "Guatemala" in paises
    assert "Panamá" in paises
    assert "Uruguai" in paises


def test_fleet_inventory_data_and_distribution_structure():
    from fleet_inventory import get_fleet_inventory_data

    # Teste de inventário de MediaRecorder e Atria Capture
    data = get_fleet_inventory_data(service_name="DNA.MediaRecorderSVC")
    assert data["success"] is True
    assert data["service_name"] == "DNA.MediaRecorderSVC"
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
    assert len(data["available_countries"]) >= 7
    country_names = [c["name"] for c in data["available_countries"]]
    assert "Brasil" in country_names
    assert "Guatemala" in country_names
    assert "Peru" in country_names
    assert "Colômbia" in country_names

    # Verifica itens granulares
    assert "items" in data
    assert len(data["items"]) > 0
    first = data["items"][0]
    assert "pais" in first
    assert "praca" in first
    assert "hostname" in first
    assert "versao_instalada" in first
    assert "versao_desejada" in first


def test_fleet_matrix_pivot_data():
    from fleet_inventory import get_fleet_matrix_data

    matrix_res = get_fleet_matrix_data()
    assert matrix_res["success"] is True
    assert len(matrix_res["columns"]) >= 15
    assert len(matrix_res["rows"]) >= 350, "Deve agregar servidores de Brasil e LATAM"

    sample_row = matrix_res["rows"][0]
    assert "pais" in sample_row
    assert "praca" in sample_row
    assert "hostname" in sample_row
    assert "cs" in sample_row
    assert "servicos" in sample_row

    # Teste de filtro por país na matriz
    guatemala_matrix = get_fleet_matrix_data(country="Guatemala")
    assert len(guatemala_matrix["rows"]) == 15
    for r in guatemala_matrix["rows"]:
        assert r["pais"] == "Guatemala"


def test_fleet_inventory_excel_generation_3_sheets():
    from fleet_inventory import generate_fleet_inventory_excel

    xlsx_bytes = generate_fleet_inventory_excel(service_name="DNA.MediaRecorderSVC", country="Todos os Países (LATAM)")
    assert isinstance(xlsx_bytes, bytes)
    assert len(xlsx_bytes) > 20000
    assert xlsx_bytes.startswith(b"PK")

    wb = openpyxl.load_workbook(BytesIO(xlsx_bytes))
    sheet_names = wb.sheetnames
    assert "Resumo - Distribuição" in sheet_names
    assert "Matriz Multi-Serviço LATAM" in sheet_names
    assert "Inventário Granular (Hosts)" in sheet_names

    # Valida Aba 1: Resumo
    ws1 = wb["Resumo - Distribuição"]
    assert "KANTAR IBOPE MEDIA" in str(ws1["A1"].value)
    assert "DISTRIBUIÇÃO OFICIAL DE VERSÕES" in str(ws1["A8"].value)

    # Valida Aba 2: Matriz Multi-Serviços
    ws2 = wb["Matriz Multi-Serviço LATAM"]
    headers_ws2 = [cell.value for cell in ws2[1]]
    assert "País" in headers_ws2
    assert "Praça" in headers_ws2
    assert "Host / Blade" in headers_ws2
    assert "CS" in headers_ws2
    assert "DNA.MediaRecorderSVC" in headers_ws2
    assert ws2.max_row > 100

    # Valida Aba 3: Granular
    ws3 = wb["Inventário Granular (Hosts)"]
    headers_ws3 = [cell.value for cell in ws3[1]]
    assert "País" in headers_ws3
    assert "Praça" in headers_ws3
    assert "Hostname" in headers_ws3
    assert "Versão Instalada" in headers_ws3
    assert "Status do Serviço" in headers_ws3
    assert ws3.max_row > 50


def test_index_html_contains_inventory_subtab_matrix_and_scripts():
    html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard", "static", "index.html"))
    with open(html_path, "r", encoding="utf-8") as fp:
        html = fp.read()

    # Subaba e Containers de Inventário e Matriz
    assert 'id="btn-fleet-subtab-inventory"' in html
    assert 'id="fleetSubtabInventoryContainer"' in html
    assert 'id="btnInvViewExecutive"' in html
    assert 'id="btnInvViewMatrix"' in html
    assert 'id="invExecutiveViewsContainer"' in html
    assert 'id="invMatrixContainer"' in html
    assert 'id="invMatrixTableBody"' in html
    assert 'exportFleetInventoryToExcel()' in html
    assert 'copyExecutiveInventoryTable()' in html
