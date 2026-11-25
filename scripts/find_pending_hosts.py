import json
from pathlib import Path

CACHE = Path("dashboard/data/fleet_cache.json")
cache = json.loads(CACHE.read_text(encoding="utf-8"))
services = cache.get("services", [])

# Praças pendentes informadas pelo usuário
pending_cities = [
    "Londrina", "Campo_Grande", "Natal", "Araguaina", "Cuiaba", "Campina_Grande",
    "Maceio", "JOAO_PESSOA", "Macapa", "Tangara_da_Serra", "Santa_Maria", "Joacaba",
    "Foz_do_Iguacu", "Teresina", "Resende", "Pelotas", "Varginha", "Montes_Claros",
    "Ribeirao_Preto", "Juiz_de_Fora", "Sinop", "Paranavaí", "Blumenau", "Porto_Velho",
    "Passo_Fundo", "Mogi_das_Cruzes", "Itabuna", "Paragominas", "Juazeiro_do_Norte",
    "Cacoal", "Rondonopolis", "Rio_Grande", "Linhares", "Redencao", "Colatina",
    "Vitoria_da_Conquista", "Cruzeiro_do_Sul", "Santarem"
]

# Build set of unique hostnames from fleet
host_map = {}
for s in services:
    h = s.get("hostname", "")
    p = s.get("praca", "")
    if h and p:
        # normalize
        p_key = p.replace(" ", "_").replace(".", "").replace("/", "_")
        host_map[h] = p_key

# Find matching hosts
found = {}
for host, praca_key in host_map.items():
    for city in pending_cities:
        city_norm = city.lower().replace("_", "").replace(" ", "")
        praca_norm = praca_key.lower().replace("_", "").replace(" ", "")
        if city_norm in praca_norm or praca_norm in city_norm:
            if host not in found:
                found[host] = praca_key

print(f"Total hosts encontrados: {len(found)}")
for h, p in sorted(found.items(), key=lambda x: x[1]):
    print(f"  {p:35s} -> {h}")
