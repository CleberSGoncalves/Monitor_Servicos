import sys, json
from pathlib import Path
from datetime import datetime, timezone

DASHBOARD_DIR = Path("dashboard")
sys.path.insert(0, str(DASHBOARD_DIR.resolve()))

from gcp_sync import get_latest_command_for_host
from config import DATA_DIR

CACHE_FILE = DATA_DIR / "fleet_cache.json"
cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
services = cache.get("services", [])

# Lista exata das 30 praças da imagem/texto
TARGETS_30 = [
    ("Brasília", "BRDF-BSA-ATRIA"),
    ("Curitiba", "BRPR-CTA-ATRIA"),
    ("Palmas", "BRTO-PMJ-ATRIA"),
    ("Mossoró", "BRRN-MOS-ATRIA"),
    ("Londrina", "BRPR-LDA-ATRIA"),
    ("Natal", "BRRN-NTL-ATRIA"),
    ("Araguaína", "BRTO-INA-ATRIA"),
    ("Maceio", "BRAL-MCO-ATRIA"),
    ("Macapá", "BRAP-MPA-ATRIA"),
    ("T. da Serra", "BRMT-TGS-ATRIA"),
    ("Joaçaba", "BRSC-JCA-ATRIA"),
    ("Foz do Iguaçu", "BRPR-FOZ-ATRIA"),
    ("Teresina", "BRPI-TSA-ATRIA"),
    ("Resende", "BRRJ-RSD-ATRIA"),
    ("Pelotas", "BRRS-PLT-ATRIA"),
    ("Varginha", "BRMG-VGA-ATRIA"),
    ("Sinop", "BRMT-SNO-ATRIA"),
    ("Paranavaí", "BRPR-PVA-ATRIA"),
    ("Cuiabá", "BRMT-CBA-ATRIA"),
    ("João Pessoa", "BRPB-JPA-ATRIA"),
    ("Santa Maria", "BRRS-SMA- ATRIA"),
    ("Passo Fundo", "BRRS-PAS-ATRIA"),
    ("Floriano", "BRPI-FLO-ATRIA"),
    ("Mogi", "BRSP-MCZ-ATRIA"),
    ("Itabuna", "BRBA-ITB-ATRIA"),
    ("Paragominas", "BRPA-PGN-ATRIA"),
    ("Parauapebas", "BRPA-PUP-TDT"),
    ("Cacoal", "BRRO-COA-ATRIA"),
    ("Rondonópolis", "BRMT-ROI-ATRIA"),
    ("Rio Grande", "BRRS-RGR-ATRIA")
]

# Indexar serviços do fleet_cache por CS1
cs1_by_host = {}
cs1_by_praca = {}
for s in services:
    if s.get("cs") != 1:
        continue
    h = s.get("hostname")
    p = s.get("praca") or ""
    raw = s.get("raw_hostname") or ""
    if not h:
        continue
    if h not in cs1_by_host:
        cs1_by_host[h] = {
            "hostname": h,
            "praca": p,
            "raw": raw,
            "id_host": s.get("id_host"),
            "services": {},
            "heartbeat": s.get("ultima_atualizacao")
        }
    cs1_by_host[h]["services"][s.get("nome_servico")] = s.get("status_servico")
    
    p_key = p.lower().replace(" ", "").replace("_", "").replace(".", "")
    cs1_by_praca[p_key] = h

# Também indexar por raw_hostname
cs1_by_raw = {}
for h, data in cs1_by_host.items():
    raw_norm = data["raw"].upper().replace("-", "").replace(" ", "")
    cs1_by_raw[raw_norm] = h

now = datetime.now(timezone.utc)
results = []

for idx, (nome, code) in enumerate(TARGETS_30, 1):
    nome_norm = nome.lower().replace(" ", "").replace("_", "").replace(".", "")
    code_norm = code.upper().replace("-", "").replace(" ", "")
    
    # Busca host correspondente
    host_match = None
    # 1. Por praca
    for p_k, h in cs1_by_praca.items():
        if nome_norm in p_k or p_k in nome_norm:
            host_match = h
            break
    # 2. Por raw_hostname se nao achou
    if nome == "Maceio":
        host_match = "Maceio-SMME-254-CS1"
    elif "T. da Serra" in nome or "TGS" in code:
        host_match = "Tangara_da_Serra-SMME-272-CS1"
    elif not host_match:
        for r_k, h in cs1_by_raw.items():
            if code_norm in r_k or r_k in code_norm:
                host_match = h
                break
                
    if nome == "Maceio":
        host_match = "Maceio-SMME-254-CS1"
    elif "T. da Serra" in nome or "TGS" in code:
        host_match = "Tangara_da_Serra-SMME-272-CS1"
    elif not host_match:
        results.append({
            "idx": idx,
            "nome": nome,
            "code": code,
            "host": "NÃO ENCONTRADO NO CACHE",
            "status_geral": "NÃO LOCALIZADO",
            "det": "N/A", "trk": "N/A", "atria": "N/A", "fm": "N/A",
            "cmd_firestore": "Nenhum",
            "detalhe": "Hostname não mapeado"
        })
        continue

    info = cs1_by_host[host_match]
    svcs = info["services"]
    det = svcs.get("DNA.DetectionSVC", "Inexistente")
    trk = svcs.get("DNA.TrackingSVC", "Inexistente")
    atria = svcs.get("Atria Capture", "Inexistente")
    fm = svcs.get("FastMatchingSvc", "Inexistente")
    
    # Checar Firestore
    cmd = get_latest_command_for_host(host_match, "Atria Capture")
    cmd_st = cmd.get("status") if cmd else "Nenhum"
    exit_c = cmd.get("exit_code") if cmd else None
    
    # Heartbeat
    hb_str = info["heartbeat"]
    hb_min = 9999
    if hb_str:
        try:
            hb_dt = datetime.fromisoformat(hb_str.replace("Z", "+00:00"))
            hb_min = (now - hb_dt).total_seconds() / 60.0
        except Exception:
            pass

    # Status de conformidade
    is_fm_site = (fm == "Em Execução" and det in ("Desativado", "Inexistente"))
    
    if cmd_st == "completed" and exit_c == 0:
        status_geral = "✅ FEITO (Comprovado exit 0 no Host)"
        detalhe = "Script executado com sucesso no host"
    elif is_fm_site:
        status_geral = "⚡ PRAÇA FASTMATCHING (Não precisa emu_mdna)"
        detalhe = "Usa 1min oficial com FastMatching ativo"
    elif cmd_st == "pending":
        if hb_min > 120:
            status_geral = "🔴 OFFLINE / AGENTE SEM HEARTBEAT"
            detalhe = f"Último contato há {hb_min/60:.1f}h"
        else:
            status_geral = "⏳ PENDENTE NO AGENTE"
            detalhe = "Comando aguardando consumo pelo agente"
    else:
        status_geral = "❌ NÃO EXECUTOU"
        detalhe = "Comando não executou no host"

    results.append({
        "idx": idx,
        "nome": nome,
        "code": code,
        "host": host_match,
        "id_host": info["id_host"],
        "status_geral": status_geral,
        "atria": atria,
        "det": det,
        "trk": trk,
        "fm": fm,
        "cmd_firestore": cmd_st,
        "detalhe": detalhe,
        "hb_min": hb_min
    })

print(f"=== CHECAGEM EXATA DAS 30 PRAÇAS ===")
for r in results:
    print(f"{r['idx']:2d}. {r['nome']:18s} | {r['host']:30s} | {r['status_geral']:35s} | Det:{r['det']} | FM:{r['fm']}")
