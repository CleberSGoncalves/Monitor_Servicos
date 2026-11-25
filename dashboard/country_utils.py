"""
country_utils.py - Utilitários Universais para Gestão Multi-País (LATAM & Global)
Garante descoberta dinâmica e suporte completo a novos países em todo o dashboard.
"""

import re
from typing import Dict, Any, Optional, List

COUNTRY_FLAGS: Dict[str, str] = {
    "brasil": "🇧🇷",
    "brazil": "🇧🇷",
    "argentina": "🇦🇷",
    "chile": "🇨🇱",
    "colômbia": "🇨🇴",
    "colombia": "🇨🇴",
    "costa rica": "🇨🇷",
    "panamá": "🇵🇦",
    "panama": "🇵🇦",
    "méxico": "🇲🇽",
    "mexico": "🇲🇽",
    "uruguai": "🇺🇾",
    "uruguay": "🇺🇾",
    "paraguai": "🇵🇾",
    "paraguay": "🇵🇾",
    "peru": "🇵🇪",
    "equador": "🇪🇨",
    "ecuador": "🇪🇨",
    "guatemala": "🇬🇹",
    "bolívia": "🇧🇴",
    "bolivia": "🇧🇴",
    "venezuela": "🇻🇪",
    "américa central": "🌎",
    "america central": "🌎",
    "portugal": "🇵🇹",
    "espanha": "🇪🇸",
    "spain": "🇪🇸",
    "estados unidos": "🇺🇸",
    "usa": "🇺🇸",
}

COUNTRY_PREFIX_MAP: Dict[str, str] = {
    "br": "Brasil",
    "ar": "Argentina",
    "cl": "Chile",
    "co": "Colômbia",
    "cr": "Costa Rica",
    "pa": "Panamá",
    "mx": "México",
    "uy": "Uruguai",
    "py": "Paraguai",
    "pe": "Peru",
    "ec": "Equador",
    "gt": "Guatemala",
    "bo": "Bolívia",
    "ve": "Venezuela",
    "pt": "Portugal",
}


def get_country_flag(country_name: Optional[str]) -> str:
    """Retorna o emoji da bandeira do país de forma defensiva e dinâmica."""
    if not country_name:
        return "🌐"
    clean = str(country_name).strip().lower()
    # Remove colchetes de status se houver (ex: 'Brasil [OK]')
    clean = clean.split("[")[0].strip()
    return COUNTRY_FLAGS.get(clean, "🌐")


def normalize_country_name(country_raw: Optional[str], default: str = "Brasil") -> str:
    """Higieniza e normaliza o nome do país, removendo sufixos de telemetria."""
    if not country_raw:
        return default
    s = str(country_raw).strip()
    # Trata títulos como 'Brasil [🟢 Saudável]'
    if "[" in s:
        s = s.split("[")[0].strip()
    if "(" in s:
        s = s.split("(")[0].strip()
    
    if not s or s.lower() in ["n/a", "none", "null", "indefinido", "servicestatus"]:
        return default

    # Ajustes finos de capitalização e acentuação comum
    sl = s.lower()
    if sl in ["brasil", "brazil"]:
        return "Brasil"
    if sl in ["colombia", "colômbia"]:
        return "Colômbia"
    if sl in ["panama", "panamá"]:
        return "Panamá"
    if sl in ["mexico", "méxico"]:
        return "México"
    if sl in ["costa rica"]:
        return "Costa Rica"
    if sl in ["america central", "américa central"]:
        return "América Central"
    
    # Capitalização padrão
    return s.title()


def infer_country_from_record(record: Dict[str, Any], default: str = "Brasil") -> str:
    """
    Infere o país a partir de qualquer registro de serviço, host ou canal.
    Verifica campos explícitos (Pais, Title), identificadores de praça/host e fallback.
    """
    # 1. Campo explícito de País
    p = record.get("pais") or record.get("Pais") or record.get("pais_nome")
    if p:
        norm = normalize_country_name(p, default="")
        if norm:
            return norm

    # 2. Campo Title (muito comum em listas do SharePoint onde Title = País)
    t = record.get("title") or record.get("Title")
    if t:
        norm = normalize_country_name(t, default="")
        if norm and norm.lower() not in ["n/a", "dna", "service", "central"]:
            return norm

    # 3. String de identificação completa (hostname, host_display, praca)
    h_str = str(record.get("host_display") or record.get("hostname") or record.get("host") or "").strip()
    praca_str = str(record.get("praca") or "").strip()
    combined = (h_str + " " + praca_str).upper()

    if "GUATEMALA" in combined or "CGT" in combined or "GTCG" in combined:
        return "Guatemala"
    if "COSTA RICA" in combined or "CRSJ" in combined:
        return "Costa Rica"
    if "PANAMA" in combined or "PANAMÁ" in combined or "CPAN" in combined:
        return "Panamá"
    if "URUGUA" in combined or "MONTEVIDEO" in combined or "UY" in combined:
        return "Uruguai"
    if any(k in combined for k in ["ARGENTINA", "ARBA", "BUENOS", "DATCO"]):
        return "Argentina"
    if any(k in combined for k in ["COLOMBIA", "COLÔMBIA", "COBO", "BOGOTÁ", "BOGOTA", "MEDELLIN", "CALI", "BARRANQUILLA", "BUCARAMANGA", "PEREIRA", "_COL"]):
        return "Colômbia"
    if any(k in combined for k in ["PERU", "PERÚ", "PELM", "LIMA", "AREQUIPA", "CHICLAYO", "CUSCO", "HUANCAYO", "PIURA", "TRUJILLO"]):
        return "Peru"

    # 4. Prefixo do Hostname (ex: BRRS-..., ARBA-..., CLST-...)
    h = h_str
    if len(h) >= 2 and h[:2].isalpha():
        prefix = h[:2].lower()
        if prefix in COUNTRY_PREFIX_MAP and (len(h) == 2 or h[2] in "-_"):
            return COUNTRY_PREFIX_MAP[prefix]

    # 5. Fallback padrão
    return default
