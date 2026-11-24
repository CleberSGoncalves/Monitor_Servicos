import os
import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Lendo index.html: {len(content)} caracteres.")

# 1. Extrair os dados de Configurações de Rede do CS para construir o banco do RDP Hub
pos = content.find('"Configurações de Rede do CS"')
rede_items = []
if pos != -1:
    items_pos = content.find('"items": [', pos)
    if items_pos != -1:
        end_bracket = content.find('], "columns"', items_pos)
        if end_bracket == -1:
            end_bracket = content.find(']}', items_pos)
        items_str = content[items_pos + len('"items": ['):end_bracket]
        try:
            rede_items = json.loads('[' + items_str + ']')
            print(f"Extraídos {len(rede_items)} itens de rede do Brasil com sucesso.")
        except Exception as e:
            print("Erro ao decodificar rede_items:", e)

# 2. Criar a estrutura JSON de todas as praças para o RDP Hub (Brasil + América Central)
rdp_dataset = []

# Praças do Brasil
for it in rede_items:
    praca = (it.get('Title') or '').strip()
    if not praca:
        continue
    router = (it.get('field_1') or '').strip()
    cs1 = (it.get('field_4') or '').strip()
    cs2 = (it.get('field_5') or '').strip()
    cs3 = (it.get('field_6') or '').strip()
    reset_mcosta = (it.get('field_7') or '').strip()
    obs = (it.get('field_8') or '').strip()
    pdu_volt = (it.get('field_10') or '').strip()
    
    rdp_dataset.append({
        "id": f"br_{praca.lower().replace(' ', '_')}",
        "regiao": "Brasil",
        "pais": "Brasil",
        "praca": praca,
        "router": router or "N/A",
        "cs1_ip": cs1 or "N/A",
        "cs2_ip": cs2 or "N/A",
        "cs3_ip": cs3 or "N/A",
        "pdu_ip": pdu_volt or reset_mcosta or "N/A",
        "pdu_tipo": "Volt" if ("volt" in obs.lower() or pdu_volt) else ("MCosta" if reset_mcosta else "N/A"),
        "obs": obs or "ATIVO",
        "status": "warning" if ("não funciona" in obs.lower() or "inoperante" in obs.lower()) else "nominal"
    })

# Praças da América Central / LATAM
latam_hosts = [
    {"praca": "Costa Rica - San José (BL1)", "cs1": "10.45.10.11", "cs2": "10.45.10.12", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL2)", "cs1": "10.45.10.21", "cs2": "10.45.10.22", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL3)", "cs1": "10.45.10.31", "cs2": "10.45.10.32", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL4)", "cs1": "10.45.10.41", "cs2": "10.45.10.42", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL5)", "cs1": "10.45.10.51", "cs2": "10.45.10.52", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL6)", "cs1": "10.45.10.61", "cs2": "10.45.10.62", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL7)", "cs1": "10.45.10.71", "cs2": "10.45.10.72", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL8)", "cs1": "10.45.10.81", "cs2": "10.45.10.82", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL9)", "cs1": "10.45.10.91", "cs2": "10.45.10.92", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - San José (BL10)", "cs1": "10.45.10.101", "cs2": "10.45.10.102", "router": "10.45.10.1", "pdu": "10.45.10.254", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Costa Rica - Conversion Server", "cs1": "10.45.10.200", "cs2": "N/A", "router": "10.45.10.1", "pdu": "N/A", "pais": "Costa Rica", "regiao": "América Central"},
    {"praca": "Paraguai - Assunção CS1/CS2", "cs1": "10.50.20.11", "cs2": "10.50.20.12", "router": "10.50.20.1", "pdu": "10.50.20.254", "pais": "Paraguai", "regiao": "América Central / LATAM"},
    {"praca": "Guatemala - Cidade da Guatemala", "cs1": "10.48.30.11", "cs2": "10.48.30.12", "router": "10.48.30.1", "pdu": "10.48.30.254", "pais": "Guatemala", "regiao": "América Central"},
    {"praca": "Panamá - Cidade do Panamá", "cs1": "10.49.40.11", "cs2": "10.49.40.12", "router": "10.49.40.1", "pdu": "10.49.40.254", "pais": "Panamá", "regiao": "América Central"},
]

for lh in latam_hosts:
    rdp_dataset.append({
        "id": f"latam_{lh['praca'].lower().replace(' ', '_').replace('/', '_')}",
        "regiao": lh["regiao"],
        "pais": lh["pais"],
        "praca": lh["praca"],
        "router": lh["router"],
        "cs1_ip": lh["cs1"],
        "cs2_ip": lh["cs2"],
        "cs3_ip": "N/A",
        "pdu_ip": lh["pdu"],
        "pdu_tipo": "PDU Remoto",
        "obs": "Captação Internacional Ativa",
        "status": "nominal"
    })

print(f"Total dataset consolidado para RDP Hub: {len(rdp_dataset)} praças e servidores.")

# Salvar dataset como JSON auxiliar para persistência
out_json = r'E:\desenvolvimento\Monitor_Esportes\docs\rdp_hosts_data.json'
with open(out_json, 'w', encoding='utf-8') as f:
    json.dump(rdp_dataset, f, indent=2, ensure_ascii=False)
print("Salvo rdp_hosts_data.json com sucesso.")
