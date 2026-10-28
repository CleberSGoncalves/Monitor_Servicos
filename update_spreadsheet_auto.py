import requests
import json
import csv
from collections import defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

r_svc = requests.get('http://127.0.0.1:8092/api/fleet/services').json()
r_ch = requests.get('http://127.0.0.1:8092/api/fleet/channels').json()

channels_by_praca_cs = defaultdict(list)
for c in r_ch:
    p = c.get('cidade') or c.get('praca') or "Geral"
    cs_id = int(float(c.get('id_cs') or c.get('cs') or 1))
    channels_by_praca_cs[(p.lower().strip(), cs_id)].append(c)

hosts_map = {}
for s in r_svc:
    h = s.get('hostname') or s.get('host')
    p = s.get('praca') or s.get('cidade') or "Geral"
    cs_id = int(float(s.get('cs', 1) or 1))
    ip = s.get('ip') or s.get('ip_local') or ""
    
    if h and h not in hosts_map:
        ch_list = channels_by_praca_cs.get((p.lower().strip(), cs_id), [])
        meios = set()
        for ch in ch_list:
            m = str(ch.get("meio", "Digital")).lower()
            if "analog" in m or "yuan" in m: meios.add("Yuan TW6802 (Analógico)")
            elif "stream" in m or "rtsp" in m: meios.add("Streaming IP / FM")
            else: meios.add("TBS DTV (ISDB-Tb UHF)")
        tipo_placa = " + ".join(sorted(meios)) if meios else "TBS DTV / MCR"

        hosts_map[h] = {
            "hostname": h,
            "cidade": p,
            "cs": f"CS {cs_id}",
            "cs_num": cs_id,
            "status": "🟢 Ativo / Monitorado",
            "versao_agente": s.get("versao") or "v1.0.18.0",
            "qtd_servicos": 0,
            "qtd_canais": len(ch_list),
            "canais_detalhe": ", ".join([c.get("canal", "") for c in ch_list[:4]]) + (f" (+{len(ch_list)-4})" if len(ch_list) > 4 else ""),
            "tipo_captura": tipo_placa,
            "ip": ip or "10.x.x.x (VPN)",
            "pasta_instalacao": r"D:\MediaDNA_V2\applications\MonitorServiceSVC",
            "obs": "Online no SharePoint M365 (DNA.MonitorServiceSVC ativo)"
        }
    if h in hosts_map:
        hosts_map[h]["qtd_servicos"] += 1

sorted_active_hosts = sorted(hosts_map.values(), key=lambda x: (x["cidade"], x["cs_num"], x["hostname"]))

# Salva XLSX
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Frota_Capture_Sites"
ws.views.sheetView[0].showGridLines = True

headers = [
    "ID", "Hostname / Servidor", "Cidade / Praça", 
    "Capture Site (CS)", "Status Monitoração", "Versão Agente", 
    "Qtd Serviços", "Qtd Canais", "Canais Principais", "Tipo de Captura", 
    "IP Local / VPN", "Pasta Instalação", "Observações / Notas"
]

header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

thin_border = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1')
)
zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

ws.append(headers)
ws.row_dimensions[1].height = 28

for col_idx in range(1, len(headers) + 1):
    cell = ws.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = header_align
    cell.border = thin_border

current_row = 2
for idx, h in enumerate(sorted_active_hosts, start=1):
    row_data = [
        f"#{idx:03d}",
        h["hostname"],
        h["cidade"],
        h["cs"],
        h["status"],
        h["versao_agente"],
        h["qtd_servicos"],
        h["qtd_canais"],
        h["canais_detalhe"],
        h["tipo_captura"],
        h["ip"],
        h["pasta_instalacao"],
        h["obs"]
    ]
    ws.append(row_data)
    ws.row_dimensions[current_row].height = 20
    
    for col_idx in range(1, len(headers) + 1):
        c = ws.cell(row=current_row, column=col_idx)
        c.font = Font(name="Calibri", size=10)
        c.border = thin_border
        if current_row % 2 == 0:
            c.fill = zebra_fill
        if col_idx in [1, 4, 5, 6, 7, 8]:
            c.alignment = Alignment(horizontal="center", vertical="center")
        else:
            c.alignment = Alignment(horizontal="left", vertical="center")
    current_row += 1

# Auto-fit colunas
for col in ws.columns:
    max_len = 0
    col_letter = get_column_letter(col[0].column)
    for cell in col:
        val_str = str(cell.value or "")
        if len(val_str) > max_len: max_len = len(val_str)
    ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

ws.column_dimensions['A'].width = 8
ws.column_dimensions['B'].width = 24
ws.column_dimensions['C'].width = 24
ws.column_dimensions['D'].width = 16
ws.column_dimensions['E'].width = 24
ws.column_dimensions['F'].width = 16
ws.column_dimensions['G'].width = 14
ws.column_dimensions['H'].width = 14
ws.column_dimensions['I'].width = 36
ws.column_dimensions['J'].width = 30
ws.column_dimensions['K'].width = 18
ws.column_dimensions['L'].width = 46
ws.column_dimensions['M'].width = 50

ws.auto_filter.ref = f"A1:M{current_row-1}"

xlsx_path = r"E:\desenvolvimento\Monitor_Servicos\Controle_Frota_Capture_Sites_400.xlsx"
wb.save(xlsx_path)
wb.save(r"E:\desenvolvimento\Monitor_Servicos\dashboard\Controle_Frota_Capture_Sites_400.xlsx")
wb.save(r"E:\desenvolvimento\Monitor_Servicos\pacote_instalacao_dashboard_24x7\Controle_Frota_Capture_Sites_400.xlsx")

# Salva CSV
csv_path = r"E:\desenvolvimento\Monitor_Servicos\Controle_Frota_Capture_Sites_400.csv"
with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.writer(f, delimiter=";")
    writer.writerow(headers)
    for idx, h in enumerate(sorted_active_hosts, start=1):
        writer.writerow([
            f"#{idx:03d}",
            h["hostname"],
            h["cidade"],
            h["cs"],
            h["status"],
            h["versao_agente"],
            h["qtd_servicos"],
            h["qtd_canais"],
            h["canais_detalhe"],
            h["tipo_captura"],
            h["ip"],
            h["pasta_instalacao"],
            h["obs"]
        ])

import shutil
shutil.copyfile(csv_path, r"E:\desenvolvimento\Monitor_Servicos\dashboard\Controle_Frota_Capture_Sites_400.csv")

print(f"Planilhas atualizadas com {len(sorted_active_hosts)} hosts ativos!")
