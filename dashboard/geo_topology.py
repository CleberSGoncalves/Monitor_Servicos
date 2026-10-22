import math
from typing import Dict, List, Any, Optional

# BASE DE DADOS GEOGRÁFICA E TOPOLOGIA DE RF DAS PRAÇAS LATAM / BRASIL
MARKET_TOPOLOGY = [
    {
        "id": "BRRS-PLT",
        "cidade": "Pelotas",
        "uf": "RS",
        "pais": "Brasil",
        "regiao": "Sul",
        "lat": -31.7654,
        "lng": -52.3376,
        "cs_count": 2,
        "towers": [
            {
                "nome": "Torre Morro da Glória (Afiliada RBS Pelotas)",
                "lat": -31.6820,
                "lng": -52.4210,
                "emissoras": ["Rede Globo", "Record TV", "SBT"],
                "frequencias_mhz": [545.14, 581.14, 521.14],
                "erp_kw": 12.5,
                "cota_m": 240
            }
        ]
    },
    {
        "id": "BRRS-CSL",
        "cidade": "Caxias do Sul",
        "uf": "RS",
        "pais": "Brasil",
        "regiao": "Sul",
        "lat": -29.1685,
        "lng": -51.1794,
        "cs_count": 2,
        "towers": [
            {
                "nome": "Torre Morro da Cruz (Caxias do Sul)",
                "lat": -29.1420,
                "lng": -51.1980,
                "emissoras": ["RBS TV Caxias", "Band RS", "Record RS"],
                "frequencias_mhz": [563.14, 509.14],
                "erp_kw": 10.0,
                "cota_m": 790
            }
        ]
    },
    {
        "id": "BRRS-POA",
        "cidade": "Porto Alegre",
        "uf": "RS",
        "pais": "Brasil",
        "regiao": "Sul",
        "lat": -30.0346,
        "lng": -51.2177,
        "cs_count": 3,
        "towers": [
            {
                "nome": "Torre Morro da Polícia (Porto Alegre)",
                "lat": -30.0782,
                "lng": -51.1945,
                "emissoras": ["RBS TV Porto Alegre", "SBT RS", "Record Guaíba", "Band RS", "TVE RS"],
                "frequencias_mhz": [593.14, 551.14, 533.14, 521.14],
                "erp_kw": 25.0,
                "cota_m": 286
            }
        ]
    },
    {
        "id": "BRSP-SPO",
        "cidade": "São Paulo",
        "uf": "SP",
        "pais": "Brasil",
        "regiao": "Sudeste",
        "lat": -23.5505,
        "lng": -46.6333,
        "cs_count": 3,
        "towers": [
            {
                "nome": "Torre Sumaré / Av. Paulista (São Paulo)",
                "lat": -23.5540,
                "lng": -46.6810,
                "emissoras": ["Rede Globo", "SBT", "Record TV", "Band", "TV Cultura", "RedeTV!", "Gazeta"],
                "frequencias_mhz": [503.14, 557.14, 497.14, 527.14, 533.14, 563.14],
                "erp_kw": 50.0,
                "cota_m": 850
            }
        ]
    },
    {
        "id": "BRRJ-RIO",
        "cidade": "Rio de Janeiro",
        "uf": "RJ",
        "pais": "Brasil",
        "regiao": "Sudeste",
        "lat": -22.9068,
        "lng": -43.1729,
        "cs_count": 2,
        "towers": [
            {
                "nome": "Torre Morro do Sumaré (Rio de Janeiro)",
                "lat": -22.9520,
                "lng": -43.2380,
                "emissoras": ["TV Globo Rio", "SBT Rio", "Record Rio", "Band Rio"],
                "frequencias_mhz": [563.14, 533.14, 623.14, 599.14],
                "erp_kw": 40.0,
                "cota_m": 670
            }
        ]
    },
    {
        "id": "BRPR-CTB",
        "cidade": "Curitiba",
        "uf": "PR",
        "pais": "Brasil",
        "regiao": "Sul",
        "lat": -25.4284,
        "lng": -49.2733,
        "cs_count": 2,
        "towers": [
            {
                "nome": "Torre Panorâmica das Mercês (Curitiba)",
                "lat": -25.4239,
                "lng": -49.2934,
                "emissoras": ["RPC Curitiba", "Rede Massa SBT", "RIC TV Record", "Band Curitiba"],
                "frequencias_mhz": [581.14, 515.14, 593.14],
                "erp_kw": 20.0,
                "cota_m": 930
            }
        ]
    },
    {
        "id": "BRMG-BHO",
        "cidade": "Belo Horizonte",
        "uf": "MG",
        "pais": "Brasil",
        "regiao": "Sudeste",
        "lat": -19.9167,
        "lng": -43.9345,
        "cs_count": 2,
        "towers": [
            {
                "nome": "Torre Serra do Curral (Belo Horizonte)",
                "lat": -19.9670,
                "lng": -43.9210,
                "emissoras": ["Globo Minas", "TV Alterosa SBT", "Record Minas", "Band Minas"],
                "frequencias_mhz": [509.14, 521.14, 557.14],
                "erp_kw": 30.0,
                "cota_m": 1200
            }
        ]
    },
    {
        "id": "BRDF-BSB",
        "cidade": "Brasília",
        "uf": "DF",
        "pais": "Brasil",
        "regiao": "Centro-Oeste",
        "lat": -15.7975,
        "lng": -47.8919,
        "cs_count": 2,
        "towers": [
            {
                "nome": "Torre Digital de TV (Flor do Cerrado - Sobradinho)",
                "lat": -15.6987,
                "lng": -47.8285,
                "emissoras": ["TV Globo Brasília", "SBT Brasília", "Record Brasília", "Band Brasília"],
                "frequencias_mhz": [515.14, 533.14, 551.14],
                "erp_kw": 35.0,
                "cota_m": 1172
            }
        ]
    },
    {
        "id": "BRBA-SSA",
        "cidade": "Salvador",
        "uf": "BA",
        "pais": "Brasil",
        "regiao": "Nordeste",
        "lat": -12.9777,
        "lng": -38.5016,
        "cs_count": 1,
        "towers": [
            {
                "nome": "Torre Federação (Salvador)",
                "lat": -12.9980,
                "lng": -38.5120,
                "emissoras": ["TV Bahia Globo", "TV Aratu SBT", "Record Bahia", "Band Bahia"],
                "frequencias_mhz": [563.14, 539.14],
                "erp_kw": 20.0,
                "cota_m": 90
            }
        ]
    },
    {
        "id": "BRPE-REC",
        "cidade": "Recife",
        "uf": "PE",
        "pais": "Brasil",
        "regiao": "Nordeste",
        "lat": -8.0476,
        "lng": -34.8770,
        "cs_count": 1,
        "towers": [
            {
                "nome": "Torre Morro do Pelópidas (Olinda/Recife)",
                "lat": -7.9980,
                "lng": -34.8510,
                "emissoras": ["TV Globo Nordeste", "TV Jornal SBT", "TV Clube Record"],
                "frequencias_mhz": [599.14, 521.14],
                "erp_kw": 25.0,
                "cota_m": 110
            }
        ]
    },
    {
        "id": "BRCE-FOR",
        "cidade": "Fortaleza",
        "uf": "CE",
        "pais": "Brasil",
        "regiao": "Nordeste",
        "lat": -3.7319,
        "lng": -38.5267,
        "cs_count": 1,
        "towers": [
            {
                "nome": "Torre Dionísio Torres (Fortaleza)",
                "lat": -3.7540,
                "lng": -38.5080,
                "emissoras": ["TV Verdes Mares Globo", "TV Jangadeiro SBT", "TV Cidade Record"],
                "frequencias_mhz": [587.14, 551.14],
                "erp_kw": 20.0,
                "cota_m": 45
            }
        ]
    },
    {
        "id": "BRSC-FLN",
        "cidade": "Florianópolis",
        "uf": "SC",
        "pais": "Brasil",
        "regiao": "Sul",
        "lat": -27.5954,
        "lng": -48.5480,
        "cs_count": 1,
        "towers": [
            {
                "nome": "Torre Morro da Cruz (Florianópolis)",
                "lat": -27.5840,
                "lng": -48.5360,
                "emissoras": ["NSC TV Globo", "SCC SBT", "NDTV Record"],
                "frequencias_mhz": [587.14, 533.14],
                "erp_kw": 15.0,
                "cota_m": 285
            }
        ]
    },
    {
        "id": "BRGO-GYN",
        "cidade": "Goiânia",
        "uf": "GO",
        "pais": "Brasil",
        "regiao": "Centro-Oeste",
        "lat": -16.6869,
        "lng": -49.2648,
        "cs_count": 1,
        "towers": [
            {
                "nome": "Torre Morro do Mendanha (Goiânia)",
                "lat": -16.6320,
                "lng": -49.3410,
                "emissoras": ["TV Anhanguera Globo", "TV Serra Dourada SBT", "Record Goiás"],
                "frequencias_mhz": [587.14, 509.14],
                "erp_kw": 20.0,
                "cota_m": 840
            }
        ]
    },
    {
        "id": "BRSP-CPN",
        "cidade": "Campinas",
        "uf": "SP",
        "pais": "Brasil",
        "regiao": "Sudeste",
        "lat": -22.9099,
        "lng": -47.0626,
        "cs_count": 1,
        "towers": [
            {
                "nome": "Torre Jardim Proença (Campinas)",
                "lat": -22.9210,
                "lng": -47.0450,
                "emissoras": ["EPTV Campinas Globo", "VTV SBT", "Record Interior SP"],
                "frequencias_mhz": [521.14, 599.14],
                "erp_kw": 18.0,
                "cota_m": 720
            }
        ]
    },
    {
        "id": "BRSP-SJC",
        "cidade": "São José dos Campos",
        "uf": "SP",
        "pais": "Brasil",
        "regiao": "Sudeste",
        "lat": -23.2237,
        "lng": -45.9009,
        "cs_count": 1,
        "towers": [
            {
                "nome": "Torre Morro do Elefante (Campos do Jordão / Vale)",
                "lat": -22.7410,
                "lng": -45.5780,
                "emissoras": ["TV Vanguarda Globo", "SBT Vale"],
                "frequencias_mhz": [569.14, 533.14],
                "erp_kw": 25.0,
                "cota_m": 1780
            }
        ]
    }
]


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula a distância em quilômetros entre duas coordenadas (Fórmula Haversine)."""
    R = 6371.0  # Raio médio da Terra em km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def calculate_azimuth(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula o azimute em graus (0° a 360°) do ponto 1 para o ponto 2."""
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlon_r = math.radians(lon2 - lon1)

    y = math.sin(dlon_r) * math.cos(lat2_r)
    x = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon_r)
    az = math.degrees(math.atan2(y, x))
    return round((az + 360) % 360, 1)


def get_markets_map_data(channels: list = None, services: list = None) -> List[Dict[str, Any]]:
    """
    Consolida as praças com dados geográficos, indicadores de saúde operacional (verde, amarelo, vermelho),
    distância e azimute da torre e resumo de incidentes para renderização no mapa interativo.
    """
    if not channels:
        channels = []
    if not services:
        services = []

    result = []
    for m in MARKET_TOPOLOGY:
        cidade = m["cidade"]
        cidade_lower = cidade.lower()

        # Filtra canais da praça
        m_channels = [c for c in channels if cidade_lower in str(c.get("cidade", "")).lower()]
        total_ch = len(m_channels)
        outage_ch = sum(1 for c in m_channels if c.get("has_outage"))
        degraded_ch = sum(1 for c in m_channels if not c.get("has_outage") and (c.get("qualidade_sinal", 100) < 50 or c.get("forca_sinal", 100) < 45))
        stable_ch = max(0, total_ch - outage_ch - degraded_ch)

        # Filtra serviços da praça
        m_services = [s for s in services if cidade_lower in str(s.get("praca", "")).lower()]
        stopped_svc = sum(1 for s in m_services if s.get("status_servico") in ["Parado", "Inexistente", "Não Encontrado"])
        crash_svc = sum(1 for s in m_services if "crash" in str(s.get("status_servico", "")).lower() or "crash" in str(s.get("status_atualizacao", "")).lower())

        # Determinação do Status Global da Praça
        if outage_ch > 0 or stopped_svc > 0 or crash_svc > 0:
            status_color = "red"
            status_label = "Crítico (Falhas Pendentes)"
        elif degraded_ch > 0:
            status_color = "yellow"
            status_label = "Alerta (Degradação de Limiar)"
        else:
            status_color = "green"
            status_label = "Estável (100% Conforme)"

        # Cálculos de RF com a torre principal
        main_tower = m["towers"][0] if m["towers"] else None
        dist_km = 0.0
        azimuth_deg = 0.0
        if main_tower:
            dist_km = calculate_haversine_distance(m["lat"], m["lng"], main_tower["lat"], main_tower["lng"])
            azimuth_deg = calculate_azimuth(m["lat"], m["lng"], main_tower["lat"], main_tower["lng"])

        result.append({
            "id": m["id"],
            "cidade": cidade,
            "uf": m["uf"],
            "pais": m["pais"],
            "regiao": m["regiao"],
            "lat": m["lat"],
            "lng": m["lng"],
            "cs_count": m["cs_count"],
            "status_color": status_color,
            "status_label": status_label,
            "total_channels": total_ch if total_ch > 0 else 6,
            "stable_channels": stable_ch if total_ch > 0 else 6,
            "outage_channels": outage_ch,
            "degraded_channels": degraded_ch,
            "stopped_services": stopped_svc,
            "main_tower": main_tower["nome"] if main_tower else "Torre Regional",
            "distance_km": dist_km,
            "azimuth_deg": azimuth_deg,
            "towers_detail": m["towers"]
        })

    return result
