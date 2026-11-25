import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import pandas as pd

SOURCE_XLSX = r"E:\desenvolvimento\Monitor_Servicos\analises\Versoes LATAM.xlsx"
OUTPUT_XLSX = r"E:\desenvolvimento\Monitor_Servicos\analises\Relatorio_Executivo_MediaRecorder_LATAM.xlsx"

wb_src = openpyxl.load_workbook(SOURCE_XLSX)
sheet_src = wb_src["Planilha1"]

headers = {}
for col in range(1, sheet_src.max_column + 1):
    val = sheet_src.cell(2, col).value
    if val:
        headers[col] = str(val).strip()

rows = []
for r in range(4, sheet_src.max_row):
    row_data = {headers[col]: sheet_src.cell(r, col).value for col in headers}
    if row_data.get("HOST"):
        rows.append(row_data)

df = pd.DataFrame(rows)

def map_country(host):
    h = str(host).upper()
    if any(k in h for k in ["BUENOS AIRES", "DATCO", "ARBA", "ARG"]):
        return "Argentina"
    elif any(k in h for k in ["BOGOTÁ", "BOGOTA", "BARRANQUILLA", "BUCARAMANGA", "CALI", "MEDELLIN", "PEREIRA", "_COL"]):
        return "Colômbia"
    elif any(k in h for k in ["COSTA RICA", "CRSJ"]):
        return "Costa Rica"
    elif any(k in h for k in ["GUATEMALA", "CGT", "CS-GT"]):
        return "Guatemala"
    elif any(k in h for k in ["PANAMA", "CPA"]):
        return "Panamá"
    elif any(k in h for k in ["LIMA", "AREQUIPA", "CHICLAYO", "CUSCO", "HUANCAYO", "PIURA", "TRUJILLO", "CS-PE"]):
        return "Peru"
    elif any(k in h for k in ["URUGUAI", "URU-"]):
        return "Uruguai"
    return "Outros"

df["Pais"] = df["HOST"].apply(map_country)
mr_col = "DNA.MediaRecorderSVC 6.1"
df["MediaRecorder_Ver"] = df[mr_col].fillna("N/A")

def classify_family(v):
    if v == "N/A" or not v:
        return "Sem MediaRecorder"
    v_str = str(v).strip()
    if v_str.startswith("6.1"):
        return "Linha 6.1 (Target)"
    elif v_str.startswith("6.0") or v_str.startswith("5."):
        return "Linha 6.0/5.x (Transição)"
    elif v_str.startswith("4."):
        return "Linha 4.x (Legado)"
    elif v_str.startswith("3."):
        return "Linha 3.x (Obsoleto)"
    return "Outro"

df["Familia"] = df["MediaRecorder_Ver"].apply(classify_family)

def classify_compliance(fam):
    if fam == "Linha 6.1 (Target)":
        return "CONFORME (Target 6.1)"
    elif fam == "Linha 6.0/5.x (Transição)":
        return "ATENÇÃO (Transição)"
    elif fam == "Linha 4.x (Legado)":
        return "LEGADO (Prioridade Média)"
    elif fam == "Linha 3.x (Obsoleto)":
        return "CRÍTICO (Obsoleto 2016-2018)"
    return "N/A (Rádio/Streaming/BKP)"

df["Conformidade"] = df["Familia"].apply(classify_compliance)

def recommend_action(fam):
    if fam == "Linha 6.1 (Target)":
        return "Instalar WinServiceFleetAgent (Piloto Canary v1.0.21.6)"
    elif fam == "Linha 6.0/5.x (Transição)":
        return "Upgrade para 6.1.4.9 + Instalar WinServiceFleetAgent"
    elif fam == "Linha 4.x (Legado)":
        return "Plano de Migração v6.1 + Instalar WinServiceFleetAgent"
    elif fam == "Linha 3.x (Obsoleto)":
        return "Troca de Stack Urgente (v6.1) + Instalar WinServiceFleetAgent"
    return "Instalar WinServiceFleetAgent para Monitoramento de Rádio/Link"

df["Recomendacao"] = df["Familia"].apply(recommend_action)

# Criação do Workbook Formatado
wb_out = openpyxl.Workbook()
# remove default sheet
wb_out.remove(wb_out.active)

# Paleta Corporativa (Navy & Slate Blue)
HEADER_FILL = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid") # Dark Slate
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
SUBHEADER_FILL = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid") # Sky Blue
SUBHEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
CARD_BG = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
WHITE_BOLD = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
WHITE_REG = Font(name="Calibri", size=10, color="CBD5E1")

BORDER_THIN = Border(
    left=Side(style='thin', color="CBD5E1"),
    right=Side(style='thin', color="CBD5E1"),
    top=Side(style='thin', color="CBD5E1"),
    bottom=Side(style='thin', color="CBD5E1")
)

# Cores de Status
FILL_OK = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid") # Verde
FONT_OK = Font(name="Calibri", size=10, bold=True, color="166534")

FILL_WARN = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid") # Amarelo
FONT_WARN = Font(name="Calibri", size=10, bold=True, color="854D0E")

FILL_CRIT = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid") # Vermelho
FONT_CRIT = Font(name="Calibri", size=10, bold=True, color="991B1B")

FILL_INFO = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid") # Azul
FONT_INFO = Font(name="Calibri", size=10, color="0369A1")

# ==============================================================================
# ABA 1: RESUMO EXECUTIVO & KPIS
# ==============================================================================
ws1 = wb_out.create_sheet(title="Resumo Executivo")
ws1.views.sheetView[0].showGridLines = True

# Título Principal
ws1.merge_cells("A1:K1")
t_cell = ws1["A1"]
t_cell.value = "RELATÓRIO FORENSE DE ENGENHARIA — AUDITORIA DE VERSÕES DO MEDIARECORDER LATAM"
t_cell.font = Font(name="Calibri", size=15, bold=True, color="FFFFFF")
t_cell.fill = HEADER_FILL
t_cell.alignment = Alignment(horizontal="center", vertical="center")
ws1.row_dimensions[1].height = 40

# Subtítulo
ws1.merge_cells("A2:K2")
sub_cell = ws1["A2"]
sub_cell.value = "Kantar IBOPE Media | Mapeamento Estratégico de Frota para Implantação do WinServiceFleetAgent (Diretoria de Operações & NOC)"
sub_cell.font = Font(name="Calibri", size=10, italic=True, color="64748B")
sub_cell.alignment = Alignment(horizontal="center", vertical="center")
ws1.row_dimensions[2].height = 20

# KPI CARDS
kpi_data = [
    ("TOTAL BLADES LATAM", "161", "7 Países Mapeados", "A4:B5"),
    ("GRAVADORES ATIVOS", "126", "78.3% dos Servidores", "C4:D5"),
    ("VERSÃO TARGET (6.1.x)", "8", "Apenas 6.3% da Frota (GT)", "E4:F5"),
    ("PARQUE OBSOLETO (3.x/4.x)", "112", "88.9% em Risco Técnico", "G4:H5"),
    ("BLADES RÁDIO/BKP", "35", "21.7% Sem Gravação TV", "I4:J5")
]

for title, val, note, cell_range in kpi_data:
    ws1.merge_cells(cell_range)
    top_c = ws1[cell_range.split(":")[0]]
    top_c.value = f"{title}\n{val}\n({note})"
    top_c.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    top_c.fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid") if "TARGET" in title else (PatternFill(start_color="B91C1C", end_color="B91C1C", fill_type="solid") if "OBSOLETO" in title else CARD_BG)
    top_c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

ws1.row_dimensions[4].height = 28
ws1.row_dimensions[5].height = 28

# Tabela 1: Resumo Consolidado por País
ws1.cell(7, 1, "1. CONSOLIDAÇÃO GEOGRÁFICA E MATURIDADE DE VERSÃO").font = Font(name="Calibri", size=12, bold=True, color="1E293B")

table1_headers = [
    "País", "Total Blades", "CS01", "CS02", "CS03", "CS04", 
    "MediaRecorder Ativos", "Versão Predominante", "Qtd na Versão Alvo (6.1)", "% Conformidade", "Nível de Risco"
]

for c_idx, h in enumerate(table1_headers, start=1):
    c = ws1.cell(8, c_idx, h)
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.border = BORDER_THIN

ws1.row_dimensions[8].height = 25

pais_summary = []
paises_ord = ["Peru", "Colômbia", "Argentina", "Costa Rica", "Guatemala", "Panamá", "Uruguai"]

for p in paises_ord:
    p_df = df[df["Pais"] == p]
    tot = len(p_df)
    cs1 = (p_df["CS"] == 1).sum()
    cs2 = (p_df["CS"] == 2).sum()
    cs3 = (p_df["CS"] == 3).sum()
    cs4 = (p_df["CS"] == 4).sum()
    mr_act = (p_df["MediaRecorder_Ver"] != "N/A").sum()
    
    # versao predominante
    mr_modes = p_df[p_df["MediaRecorder_Ver"] != "N/A"]["MediaRecorder_Ver"].mode()
    predom = mr_modes[0] if len(mr_modes) > 0 else "Nenhum"
    
    # target 6.1
    v61_cnt = p_df["MediaRecorder_Ver"].apply(lambda v: str(v).startswith("6.1")).sum()
    pct_conf = (v61_cnt / mr_act * 100) if mr_act > 0 else 0.0
    
    if pct_conf >= 50:
        risco = "MÉDIO (Piloto 6.1)"
    elif any(str(v).startswith("4.") for v in p_df["MediaRecorder_Ver"]):
        risco = "ALTO (Legado 4.x)"
    elif mr_act == 0:
        risco = "BAIXO (Apenas Rádios)"
    else:
        risco = "CRÍTICO (Obsoleto 3.x)"
        
    pais_summary.append((p, tot, cs1, cs2, cs3, cs4, mr_act, predom, v61_cnt, f"{pct_conf:.1f}%", risco))

# Totais
tot_tot = len(df)
tot_cs1 = (df["CS"] == 1).sum()
tot_cs2 = (df["CS"] == 2).sum()
tot_cs3 = (df["CS"] == 3).sum()
tot_cs4 = (df["CS"] == 4).sum()
tot_mr = (df["MediaRecorder_Ver"] != "N/A").sum()
tot_v61 = df["MediaRecorder_Ver"].apply(lambda v: str(v).startswith("6.1")).sum()
tot_pct = (tot_v61 / tot_mr * 100) if tot_mr > 0 else 0.0

row_idx = 9
for row_data in pais_summary:
    ws1.row_dimensions[row_idx].height = 20
    for c_idx, val in enumerate(row_data, start=1):
        c = ws1.cell(row_idx, c_idx, val)
        c.border = BORDER_THIN
        c.alignment = Alignment(horizontal="center" if c_idx > 1 else "left", vertical="center")
        
        # Cores de risco
        if c_idx == 11:
            if "CRÍTICO" in val:
                c.fill = FILL_CRIT
                c.font = FONT_CRIT
            elif "ALTO" in val:
                c.fill = FILL_WARN
                c.font = FONT_WARN
            elif "MÉDIO" in val:
                c.fill = FILL_INFO
                c.font = FONT_INFO
            else:
                c.fill = FILL_OK
                c.font = FONT_OK
    row_idx += 1

# Linha Total
ws1.row_dimensions[row_idx].height = 22
total_row = ("TOTAL LATAM", tot_tot, tot_cs1, tot_cs2, tot_cs3, tot_cs4, tot_mr, "Multi-Versão", tot_v61, f"{tot_pct:.1f}%", "CRÍTICO (Global)")
for c_idx, val in enumerate(total_row, start=1):
    c = ws1.cell(row_idx, c_idx, val)
    c.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    c.font = Font(name="Calibri", size=11, bold=True, color="0F172A")
    c.border = BORDER_THIN
    c.alignment = Alignment(horizontal="center" if c_idx > 1 else "left", vertical="center")

row_idx += 3

# Tabela 2: Distribuição por Família de Versão
ws1.cell(row_idx, 1, "2. DISTRIBUIÇÃO DAS FAMÍLIAS DE VERSÃO DO MEDIARECORDER").font = Font(name="Calibri", size=12, bold=True, color="1E293B")
row_idx += 1

fam_headers = ["Família Arquitetural", "Total Blades", "% do Parque Ativo", "Países Presentes", "Diagnóstico Técnico e Risco", "Ação Recomendada"]
for c_idx, h in enumerate(fam_headers, start=1):
    c = ws1.cell(row_idx, c_idx, h)
    c.fill = SUBHEADER_FILL
    c.font = SUBHEADER_FONT
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.border = BORDER_THIN

ws1.row_dimensions[row_idx].height = 25
row_idx += 1

fam_data = [
    ("Linha 6.1 (Target Oficial)", 8, "6.3%", "Guatemala", "Versão atual homologada pela engenharia; excelente estabilidade de gravação TS e compatibilidade.", "Manter como padrão ouro LATAM e usar como piloto do Agente"),
    ("Linha 6.0 / 5.x (Transição)", 6, "4.8%", "Guatemala", "Compilações intermediárias anteriores à correção final de GOP e sincronia de metadados.", "Upgrade rápido para 6.1.4.9 no mesmo ciclo da Guatemala"),
    ("Linha 4.x (Legado)", 37, "29.4%", "Colômbia", "Estagnação em versão de 2019/2020. Falta suporte a novos encoders e logs modernos.", "Migração em ondas (Canary) Colômbia CS01 -> CS02 com Agente"),
    ("Linha 3.x (Obsoleto Crítico)", 75, "59.5%", "Peru, Argentina, Panamá, Costa Rica, Uruguai", "Compilações legadas (2016-2018). Alto risco de travamento de DMA TBS e GOP stall sem auto-recuperação.", "Plano Emergencial de Padronização para 6.1.4.9 gerenciado pelo Dashboard"),
    ("Sem MediaRecorder (Rádio/BKP)", 35, "--", "Argentina, Costa Rica, Guatemala, Peru", "Blades dedicados a streaming de áudio/vídeo, placas Sonifex ou redundâncias.", "Instalar Agente apenas para monitoramento de Link WAN, CPU e SO")
]

for f_row in fam_data:
    ws1.row_dimensions[row_idx].height = 24
    for c_idx, val in enumerate(f_row, start=1):
        c = ws1.cell(row_idx, c_idx, val)
        c.border = BORDER_THIN
        c.alignment = Alignment(horizontal="center" if c_idx in [2, 3] else "left", vertical="center")
        if c_idx == 1:
            if "Target" in val:
                c.fill = FILL_OK; c.font = FONT_OK
            elif "Obsoleto" in val:
                c.fill = FILL_CRIT; c.font = FONT_CRIT
            elif "Legado" in val:
                c.fill = FILL_WARN; c.font = FONT_WARN
    row_idx += 1

# ==============================================================================
# ABA 2: MATRIZ DE VERSÕES POR PAÍS (CROSSTAB)
# ==============================================================================
ws2 = wb_out.create_sheet(title="Matriz Versões x País")
ws2.views.sheetView[0].showGridLines = True

ws2.cell(1, 1, "MATRIZ DETALHADA DE VERSÕES DO MEDIARECORDER POR PAÍS").font = Font(name="Calibri", size=13, bold=True, color="1E293B")
ws2.row_dimensions[1].height = 30

ct = pd.crosstab(df["Pais"], df["MediaRecorder_Ver"], margins=True)

# Headers da Matriz
ws2.cell(3, 1, "País / Praça").fill = HEADER_FILL
ws2.cell(3, 1).font = HEADER_FONT
ws2.cell(3, 1).border = BORDER_THIN
ws2.cell(3, 1).alignment = Alignment(horizontal="center", vertical="center")

for c_idx, col_name in enumerate(ct.columns, start=2):
    c = ws2.cell(3, c_idx, col_name)
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.border = BORDER_THIN
    c.alignment = Alignment(horizontal="center", vertical="center")

ws2.row_dimensions[3].height = 25

for r_idx, (pais_idx, row_series) in enumerate(ct.iterrows(), start=4):
    ws2.row_dimensions[r_idx].height = 20
    c_p = ws2.cell(r_idx, 1, str(pais_idx))
    c_p.font = Font(name="Calibri", size=10, bold=(pais_idx == "All"))
    c_p.border = BORDER_THIN
    if pais_idx == "All":
        c_p.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    
    for c_idx, val in enumerate(row_series, start=2):
        c = ws2.cell(r_idx, c_idx, int(val) if val > 0 else "-")
        c.border = BORDER_THIN
        c.alignment = Alignment(horizontal="center", vertical="center")
        if val > 0 and pais_idx != "All":
            col_v = ct.columns[c_idx - 2]
            if str(col_v).startswith("6.1"):
                c.fill = FILL_OK; c.font = FONT_OK
            elif str(col_v).startswith("3."):
                c.fill = FILL_CRIT; c.font = FONT_CRIT
            elif str(col_v).startswith("4."):
                c.fill = FILL_WARN; c.font = FONT_WARN
        if pais_idx == "All":
            c.font = Font(name="Calibri", size=10, bold=True)
            c.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

# ==============================================================================
# ABA 3: INVENTÁRIO COMPLETO LATAM (161 HOSTS)
# ==============================================================================
ws3 = wb_out.create_sheet(title="Inventário Geral LATAM")
ws3.views.sheetView[0].showGridLines = True

inv_headers = [
    "ID", "País", "Host / Blade", "CS", "Versão MediaRecorder", "Família",
    "Status de Conformidade", "Recomendação Operacional",
    "DetectionSVC", "RemoteCommandSVC", "TimeSyncSVC", "ConfigMonitorSVC"
]

ws3.row_dimensions[1].height = 26
for c_idx, h in enumerate(inv_headers, start=1):
    c = ws3.cell(1, c_idx, h)
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.border = BORDER_THIN
    c.alignment = Alignment(horizontal="center", vertical="center")

df_sorted = df.sort_values(by=["Pais", "HOST", "CS"])

for r_idx, (_, r_data) in enumerate(df_sorted.iterrows(), start=2):
    ws3.row_dimensions[r_idx].height = 19
    row_vals = [
        r_data.get("ID", ""),
        r_data["Pais"],
        r_data.get("HOST", ""),
        r_data.get("CS", ""),
        r_data["MediaRecorder_Ver"],
        r_data["Familia"],
        r_data["Conformidade"],
        r_data["Recomendacao"],
        r_data.get("DNA.DetectionSVC 3.4", "N/A") or "N/A",
        r_data.get("DNA.RemoteCommandSVC 3.0", "N/A") or "N/A",
        r_data.get("DNA.TimeSyncSVC 3.1", "N/A") or "N/A",
        r_data.get("DNA.ConfigMonitorSVC 4.8", "N/A") or "N/A"
    ]
    for c_idx, val in enumerate(row_vals, start=1):
        c = ws3.cell(r_idx, c_idx, val)
        c.border = BORDER_THIN
        c.alignment = Alignment(horizontal="center" if c_idx in [1, 2, 4, 5, 6] else "left", vertical="center")
        
        # Color coding de conformidade
        if c_idx == 7:
            if "CONFORME" in str(val):
                c.fill = FILL_OK; c.font = FONT_OK
            elif "CRÍTICO" in str(val):
                c.fill = FILL_CRIT; c.font = FONT_CRIT
            elif "LEGADO" in str(val):
                c.fill = FILL_WARN; c.font = FONT_WARN
            elif "ATENÇÃO" in str(val):
                c.fill = FILL_INFO; c.font = FONT_INFO

# ==============================================================================
# ABA 4: BENCHMARKING BRASIL X LATAM
# ==============================================================================
ws4 = wb_out.create_sheet(title="Comparativo Brasil x LATAM")
ws4.views.sheetView[0].showGridLines = True

ws4.cell(1, 1, "COMPARATIVO ESTRATÉGICO: SUCESSO DA OPERAÇÃO BRASIL VS DESAFIO LATAM").font = Font(name="Calibri", size=13, bold=True, color="1E293B")
ws4.row_dimensions[1].height = 30

bench_headers = ["Dimensão Operacional & Governança", "Brasil (Operação com Agente)", "LATAM (Cenário Atual Planilha)", "Oportunidade & Ganho com Agente LATAM"]
ws4.row_dimensions[3].height = 25
for c_idx, h in enumerate(bench_headers, start=1):
    c = ws4.cell(3, c_idx, h)
    c.fill = SUBHEADER_FILL
    c.font = SUBHEADER_FONT
    c.border = BORDER_THIN
    c.alignment = Alignment(horizontal="center", vertical="center")

bench_data = [
    ("Software de Gravação Central", "Atria Capture (DigitalTVCapture/Receiver)", "DNA.MediaRecorderSVC (Serviço Windows)", "Agente é compatível com ambos; unifica o monitoramento no mesmo Dashboard"),
    ("Total de Estações Monitoradas", "248 Servidores (116 Praças)", "161 Blades (7 Países)", "Atingir 409 hosts globais sob a mesma esteira NOC"),
    ("Taxa de Padronização de Versão", "100% Homogêneo no Target (Canary)", "Apenas 6.3% na versão Target 6.1 (88.9% obsoletos)", "Eliminar fragmentação de 16 versões diferentes para 1 padrão único"),
    ("Visibilidade Operacional", "Telemetria Live a cada 3 min no Dashboard", "Planilhas Excel Manuais Desatualizadas", "Visibilidade imediata de quedas, canais travados e discos cheios"),
    ("Detecção e Auto-Healing", "FastMatching + Auto-Recuperação Controlada", "Detecção Legada (3.0 a 3.4) e Sem Auto-Healing", "Redução drástica de chamados para equipe de campo / manutenção"),
    ("Governança de Atualizações", "Canary Rollout em 1 clique pelo SharePoint/Cloud", "Acesso RDP Manual Máquina a Máquina", "Economia estimada de 180+ horas técnicas na migração para v6.1")
]

for r_idx, b_row in enumerate(bench_data, start=4):
    ws4.row_dimensions[r_idx].height = 26
    for c_idx, val in enumerate(b_row, start=1):
        c = ws4.cell(r_idx, c_idx, val)
        c.border = BORDER_THIN
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        if c_idx == 2:
            c.fill = FILL_OK; c.font = Font(name="Calibri", size=10, bold=True, color="166534")
        elif c_idx == 3:
            c.fill = FILL_CRIT; c.font = Font(name="Calibri", size=10, bold=True, color="991B1B")

# Ajuste automático de largura de colunas em todas as abas
for ws in [ws1, ws2, ws3, ws4]:
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 48)

# Ajustes manuais de colunas específicas
ws1.column_dimensions["A"].width = 24
ws1.column_dimensions["G"].width = 24
ws1.column_dimensions["H"].width = 24
ws1.column_dimensions["K"].width = 26

ws3.column_dimensions["C"].width = 30
ws3.column_dimensions["H"].width = 45

ws4.column_dimensions["A"].width = 32
ws4.column_dimensions["B"].width = 36
ws4.column_dimensions["C"].width = 36
ws4.column_dimensions["D"].width = 42

wb_out.save(OUTPUT_XLSX)
print(f"Relatório executivo gerado com sucesso: {OUTPUT_XLSX}")
