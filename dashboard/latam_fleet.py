"""
latam_fleet.py - Ingestor e Gerenciador de Telemetria e Versões LATAM
Integra os hosts e serviços de Peru, Colômbia, Argentina, Costa Rica, Guatemala, Panamá e Uruguai
a partir de 'analises/Versoes LATAM.xlsx', permitindo visão unificada global (Brasil + LATAM).
"""

import os
import re
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
import openpyxl

logger = logging.getLogger("LatamFleet")

LATAM_XLSX_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "analises", "Versoes LATAM.xlsx"))
LATAM_CACHE_JSON = os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "latam_cache.json"))

_CACHED_LATAM_SERVICES: Optional[List[Dict[str, Any]]] = None
_CACHED_LATAM_MATRIX: Optional[List[Dict[str, Any]]] = None


def classify_latam_host(raw_host: str) -> Tuple[str, str, str]:
    """
    Classifica país, praça e hostname a partir do identificador bruto no Versoes LATAM.xlsx.
    Exemplos:
      - 'Guatemala / CGT-BL1' -> ('Guatemala', 'Guatemala', 'CGT-BL1')
      - 'Lima / CS-PELM-LIM-BL01' -> ('Peru', 'Lima', 'CS-PELM-LIM-BL01')
      - 'TV_Bogotá / CS-COBO-BL01' -> ('Colômbia', 'Bogotá', 'CS-COBO-BL01')
      - 'Buenos Aires - ARBA-BL01' -> ('Argentina', 'Buenos Aires', 'ARBA-BL01')
      - 'Costa Rica / CRSJ-BL01' -> ('Costa Rica', 'San José', 'CRSJ-BL01')
    """
    raw = str(raw_host).strip()
    prefix = ""
    rest = raw
    if "/" in raw:
        parts = [p.strip() for p in raw.split("/", 1)]
        prefix = parts[0]
        rest = parts[1]
    elif " - " in raw:
        parts = [p.strip() for p in raw.split(" - ", 1)]
        prefix = parts[0]
        rest = parts[1]

    combined = (prefix + " " + rest).upper()

    # 1. Determina o País
    if "GUATEMALA" in combined or "CGT" in combined or "GTCG" in combined:
        pais = "Guatemala"
    elif "COSTA RICA" in combined or "CRSJ" in combined:
        pais = "Costa Rica"
    elif "PANAMA" in combined or "PANAMÁ" in combined or "CPAN" in combined:
        pais = "Panamá"
    elif "URUGUA" in combined or "MONTEVIDEO" in combined or "UY" in combined:
        pais = "Uruguai"
    elif any(k in combined for k in ["ARGENTINA", "ARBA", "BUENOS", "DATCO"]):
        pais = "Argentina"
    elif any(k in combined for k in ["COLOMBIA", "COLÔMBIA", "COBO", "BOGOTÁ", "BOGOTA", "MEDELLIN", "CALI", "BARRANQUILLA", "BUCARAMANGA", "PEREIRA", "_COL"]):
        pais = "Colômbia"
    elif any(k in combined for k in ["PERU", "PERÚ", "PELM", "LIMA", "AREQUIPA", "CHICLAYO", "CUSCO", "HUANCAYO", "PIURA", "TRUJILLO"]):
        pais = "Peru"
    elif any(k in combined for k in ["BRASIL", "BRAZIL"]) or rest.startswith("BR"):
        pais = "Brasil"
    else:
        pais = prefix.title() if prefix else "Outro"

    # 2. Determina a Praça / Cidade
    praca = prefix if prefix else rest
    if pais == "Peru":
        for c in ["Lima", "Arequipa", "Chiclayo", "Cusco", "Huancayo", "Piura", "Trujillo"]:
            if c.upper() in combined:
                praca = c
                break
    elif pais == "Colômbia":
        for c in ["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Pereira"]:
            if c.upper() in combined.replace("BOGOTA", "BOGOTÁ").replace("MEDELLIN", "MEDELLÍN"):
                praca = c
                break
        if "STREAMING" in combined:
            praca = "Streaming Colômbia"
    elif pais == "Argentina":
        praca = "DATCO" if "DATCO" in combined else "Buenos Aires"
    elif pais == "Guatemala":
        praca = "Guatemala"
    elif pais == "Costa Rica":
        praca = "San José"
    elif pais == "Panamá":
        praca = "Cidade do Panamá"
    elif pais == "Uruguai":
        praca = "Montevidéu"

    return pais, praca, rest


def load_latam_data(force_reload: bool = False) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Carrega os dados de Versões LATAM a partir de 'analises/Versoes LATAM.xlsx'
    Retorna (lista_de_servicos_normalizados, lista_da_matriz_por_host).
    """
    global _CACHED_LATAM_SERVICES, _CACHED_LATAM_MATRIX

    if not force_reload and _CACHED_LATAM_SERVICES is not None and _CACHED_LATAM_MATRIX is not None:
        return _CACHED_LATAM_SERVICES, _CACHED_LATAM_MATRIX

    # Tenta carregar do cache JSON em disco se o XLSX não tiver mudado
    if not force_reload and os.path.exists(LATAM_CACHE_JSON):
        try:
            with open(LATAM_CACHE_JSON, "r", encoding="utf-8") as f:
                data = json.load(f)
                _CACHED_LATAM_SERVICES = data.get("services", [])
                _CACHED_LATAM_MATRIX = data.get("matrix", [])
                if _CACHED_LATAM_SERVICES and _CACHED_LATAM_MATRIX:
                    return _CACHED_LATAM_SERVICES, _CACHED_LATAM_MATRIX
        except Exception as e:
            logger.warning(f"Erro ao ler latam_cache.json: {e}")

    if not os.path.exists(LATAM_XLSX_PATH):
        logger.warning(f"Planilha LATAM não encontrada em {LATAM_XLSX_PATH}")
        return [], []

    try:
        wb = openpyxl.load_workbook(LATAM_XLSX_PATH, data_only=True)
        ws = wb["Planilha1"] if "Planilha1" in wb.sheetnames else wb.active

        # Identifica colunas de serviços no cabeçalho (Linha 2)
        col_services = {}
        for c in range(1, ws.max_column + 1):
            val = ws.cell(2, c).value
            if val:
                val_str = str(val).strip()
                if "SVC" in val_str or "Service" in val_str:
                    svc_clean = re.sub(r"\s+\d+(\.\d+)*$", "", val_str).strip()
                    col_services[c] = (svc_clean, val_str)

        services_list = []
        matrix_list = []

        for r in range(4, ws.max_row + 1):
            h_raw = ws.cell(r, 3).value  # Coluna HOST
            cs_val = ws.cell(r, 5).value or 1  # Coluna CS
            row_id = ws.cell(r, 1).value or r

            if not h_raw:
                continue

            pais, praca, hname = classify_latam_host(str(h_raw))
            cs_num = int(cs_val) if str(cs_val).isdigit() else 1

            host_matrix_entry = {
                "id": row_id,
                "pais": pais,
                "praca": praca,
                "host_display": str(h_raw).strip(),
                "hostname": hname,
                "cs": cs_num,
                "servicos": {}
            }

            for c, (svc_clean, original_header) in col_services.items():
                ver_val = ws.cell(r, c).value
                ver_str = str(ver_val).strip() if ver_val is not None else ""

                if ver_str:
                    host_matrix_entry["servicos"][svc_clean] = ver_str

                    # Gera registro granular de serviço para catálogo e auditoria
                    is_running = ver_str not in ["0.0.0.0", "Não Instalado", "N/A"]
                    services_list.append({
                        "id": f"latam_{row_id}_{cs_num}_{svc_clean}",
                        "pais": pais,
                        "praca": praca,
                        "host": hname,
                        "hostname": hname,
                        "host_display": str(h_raw).strip(),
                        "cs": cs_num,
                        "nome_servico": svc_clean,
                        "versao_instalada": ver_str,
                        "versao_desejada": original_header.split()[-1] if " " in original_header else "Homologado",
                        "status_servico": "Em Execução" if is_running else "Parado",
                        "status_atualizacao": "Atualizado" if is_running else "Desatualizado",
                        "acao_solicitada": "Nenhuma",
                        "ultima_atualizacao": "Planilha LATAM Oficial",
                        "origem": "LATAM_OFFICIAL_MATRIX"
                    })
                else:
                    host_matrix_entry["servicos"][svc_clean] = "Não Instalado"

            matrix_list.append(host_matrix_entry)

        _CACHED_LATAM_SERVICES = services_list
        _CACHED_LATAM_MATRIX = matrix_list

        # Salva em cache JSON
        os.makedirs(os.path.dirname(LATAM_CACHE_JSON), exist_ok=True)
        with open(LATAM_CACHE_JSON, "w", encoding="utf-8") as f:
            json.dump({"services": services_list, "matrix": matrix_list}, f, ensure_ascii=False, indent=2)

        logger.info(f"Carregados {len(matrix_list)} hosts e {len(services_list)} serviços LATAM com sucesso.")
        return services_list, matrix_list

    except Exception as e:
        logger.error(f"Erro ao processar Versoes LATAM.xlsx: {e}", exc_info=True)
        return [], []


def get_latam_services() -> List[Dict[str, Any]]:
    """Retorna a lista de serviços LATAM normalizada."""
    services, _ = load_latam_data()
    return services


def get_latam_matrix() -> List[Dict[str, Any]]:
    """Retorna a matriz de hosts x serviços LATAM."""
    _, matrix = load_latam_data()
    return matrix
