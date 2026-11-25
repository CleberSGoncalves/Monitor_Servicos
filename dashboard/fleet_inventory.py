"""
fleet_inventory.py - Módulo de Inventário Executivo e Granular de Versões da Frota
Desenvolvido para atender à governança técnica, auditorias de engenharia e exportação para Excel.
Suporta de forma nativa e dinâmica a expansão para novos países (LATAM & Global), integrando
os servidores do Brasil e os 161 blades de Peru, Colômbia, Argentina, Costa Rica, Guatemala,
Panamá e Uruguai a partir de 'analises/Versoes LATAM.xlsx'.
"""

import io
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from country_utils import get_country_flag, infer_country_from_record, normalize_country_name
from version_governance import get_desired_versions, _parse_ver_tuple, _is_version_up_to_date
from sharepoint_sync import get_cached_data
from latam_fleet import get_latam_services, get_latam_matrix

# Ordem padronizada de colunas de serviços da matriz de governança
OFFICIAL_SERVICE_COLUMNS = [
    "DNA.RemoteCommandSVC",
    "DNA.TimeSyncSVC",
    "DNA.DetectionSVC",
    "DNA.EmuRecorderSVC",
    "DNA.TrackingSVC",
    "DNA.MediaRecorderSVC",
    "DNA.FileTransferSVC",
    "DNA.AudioRecorderSVC",
    "DNA.TunerSVC",
    "DNA.CadastroVideoComercialSVC",
    "DNA.MediaConverterSVC",
    "DNA.BackupManagerSVC",
    "DNA.ConfigMonitorSVC",
    "DNA.InventorySVC",
    "Atria Capture",
    "DNA.MonitorServiceSVC",
    "FastMatchingSvc"
]


def get_all_fleet_services() -> List[Dict[str, Any]]:
    """
    Retorna a lista unificada e deduplicada de todos os serviços da frota
    combinando Brasil (SharePoint / Firestore / Cache) e LATAM (Versoes LATAM.xlsx).
    """
    c_data = get_cached_data()
    br_services = c_data.get("services", [])
    latam_services = get_latam_services()
    return list(br_services) + list(latam_services)


def get_fleet_inventory_data(
    service_name: Optional[str] = "Atria Capture",
    country: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None
) -> Dict[str, Any]:
    """
    Consolida o inventário de versões de todos os serviços da frota.
    Calcula matriz executiva de distribuição percentual (estilo Marcio) e listagem granular.
    """
    all_services = get_all_fleet_services()
    desired_versions = get_desired_versions()

    # 1. Identifica países disponíveis de forma dinâmica e extensível
    countries_map: Dict[str, int] = {}
    distinct_hosts_by_country: Dict[str, set] = {}
    distinct_services_set = set()

    for s in all_services:
        cntry = infer_country_from_record(s)
        h = s.get("hostname") or s.get("host") or ""
        distinct_hosts_by_country.setdefault(cntry, set()).add(h)
        svc = (s.get("nome_servico") or "").strip()
        if svc and svc.lower() not in ["n/a", "none"]:
            distinct_services_set.add(svc)

    for cntry, hosts_set in distinct_hosts_by_country.items():
        countries_map[cntry] = len(hosts_set)

    sorted_countries = sorted(
        [{"name": k, "flag": get_country_flag(k), "hosts_count": v} for k, v in countries_map.items()],
        key=lambda x: (-x["hosts_count"], x["name"])
    )

    # Lista prioritária de serviços para ordenação amigável no select
    priority_services = [
        "Atria Capture", "DNA.MonitorServiceSVC", "DNA.MediaRecorderSVC",
        "FastMatchingSvc", "DNA.DetectionSVC", "DNA.FileTransferSVC",
        "DNA.FiletransferSVC", "DNA.RemoteCommandSVC", "DNA.TimeSyncSVC",
        "DNA.EmuRecorderSVC", "DNA.TrackingSVC", "DNA.TunerSVC",
        "DNA.AudioRecorderSVC", "DNA.ConfigMonitorSVC", "DNA.MediaConverterSVC",
        "DNA.CadastroVideoComercialSVC", "DNA.BackupManagerSVC", "DNA.InventorySVC"
    ]
    sorted_services = sorted(
        list(distinct_services_set),
        key=lambda x: (0 if x in priority_services else 1, priority_services.index(x) if x in priority_services else x.lower())
    )

    # 2. Filtra por País se especificado
    country_filter_clean = normalize_country_name(country, default="") if country and country.lower() not in ["all", "todos", "todos os países (latam)", ""] else ""

    filtered_services = []
    for s in all_services:
        s_cntry = infer_country_from_record(s)
        if country_filter_clean and s_cntry.lower() != country_filter_clean.lower():
            continue
        filtered_services.append((s, s_cntry))

    # 3. Determina o serviço alvo
    target_service_clean = (service_name or "Atria Capture").strip()
    is_all_services = target_service_clean.lower() in ["all", "todos", "todos os serviços"]

    target_homologated = desired_versions.get(target_service_clean, "")

    # 4. Avalia os registros do serviço selecionado
    inventory_items = []
    version_counts: Dict[str, int] = {}
    hosts_evaluated = set()
    total_running = 0
    total_stopped = 0
    total_inexistent = 0

    search_clean = (search or "").strip().lower()

    for s, s_cntry in filtered_services:
        s_name = (s.get("nome_servico") or "").strip()

        # Filtro de serviço
        if not is_all_services and s_name.lower() != target_service_clean.lower():
            continue

        h = s.get("hostname") or s.get("host") or ""
        praca = s.get("praca") or ""
        cs = s.get("cs") or 1
        ip = s.get("ip") or s.get("ip_local") or ""
        v_inst = str(s.get("versao_instalada") or "Não Instalado").strip()
        v_des = desired_versions.get(s_name) or str(s.get("versao_desejada") or "N/A").strip()
        st_srv = str(s.get("status_servico") or "Desconhecido").strip()
        st_upd = str(s.get("status_atualizacao") or "Desatualizado").strip()
        acao = str(s.get("acao_solicitada") or "Nenhuma").strip()
        ult_att = s.get("ultima_atualizacao") or ""

        # Normaliza versão vazia ou n/a como 'Não Instalado'
        if not v_inst or v_inst.lower() in ["n/a", "none", "inexistente", "0.0.0.0", "não instalado"]:
            v_inst = "Não Instalado"

        # Filtro de status se informado
        if status_filter and status_filter.lower() not in ["all", "todos"]:
            sf_lower = status_filter.lower()
            if sf_lower == "execucao" and st_srv != "Em Execução":
                continue
            elif sf_lower == "parado" and st_srv != "Parado":
                continue
            elif sf_lower == "inexistente" and (st_srv not in ["Inexistente", "Não Encontrado"] and v_inst != "Não Instalado"):
                continue
            elif sf_lower == "atualizado" and st_upd != "Atualizado":
                continue
            elif sf_lower == "desatualizado" and st_upd != "Desatualizado":
                continue

        # Filtro de busca textual
        if search_clean:
            match_txt = f"{h} {praca} {v_inst} {ip} {s_name} {s_cntry}".lower()
            if search_clean not in match_txt:
                continue

        hosts_evaluated.add(h)
        version_counts[v_inst] = version_counts.get(v_inst, 0) + 1

        if st_srv == "Em Execução":
            total_running += 1
        elif st_srv == "Parado":
            total_stopped += 1
        else:
            total_inexistent += 1

        is_up_to_date = _is_version_up_to_date(v_inst, v_des, s_name) if v_inst != "Não Instalado" else False

        inventory_items.append({
            "pais": s_cntry,
            "pais_flag": get_country_flag(s_cntry),
            "praca": praca,
            "hostname": h,
            "cs": cs,
            "ip": ip,
            "service_name": s_name,
            "versao_instalada": v_inst,
            "versao_desejada": v_des,
            "status_servico": st_srv,
            "status_atualizacao": st_upd,
            "acao_solicitada": acao,
            "is_up_to_date": is_up_to_date,
            "ultima_atualizacao": ult_att
        })

    # 5. Ordena os itens por País, Praça e Hostname
    inventory_items.sort(key=lambda x: (x["pais"], x["praca"].lower(), x["hostname"].lower()))

    # 6. Constrói a Distribuição Executiva por Versão (Estilo Marcio)
    total_count = sum(version_counts.values()) or 1
    versions_distribution = []

    def ver_sort_key(v: str):
        if v == "Não Instalado":
            return (2, (0, 0, 0, 0))
        if target_homologated and v == target_homologated:
            return (0, (999, 999, 999, 999))
        return (1, tuple(-x for x in _parse_ver_tuple(v)))

    sorted_version_keys = sorted(version_counts.keys(), key=ver_sort_key)

    homologated_count = 0
    legacy_count = 0
    not_installed_count = version_counts.get("Não Instalado", 0)

    for v in sorted_version_keys:
        cnt = version_counts[v]
        pct = round((cnt / total_count) * 100.0, 2)

        is_homolog = bool(target_homologated and v == target_homologated)
        if is_homolog:
            homologated_count += cnt
            status_desc = "Homologada Oficial"
            badge_class = "badge-green"
        elif v == "Não Instalado":
            status_desc = "Inexistente / Não Instalado"
            badge_class = "badge-red"
        else:
            legacy_count += cnt
            if target_homologated and _parse_ver_tuple(v) > _parse_ver_tuple(target_homologated):
                status_desc = "Piloto / Canary"
                badge_class = "badge-blue"
            else:
                status_desc = "Legado / Obsoleto"
                badge_class = "badge-yellow"

        versions_distribution.append({
            "version": v,
            "count": cnt,
            "percent": pct,
            "status": status_desc,
            "is_homologated": is_homolog,
            "badge_class": badge_class
        })

    adoption_pct = round((homologated_count / total_count) * 100.0, 1) if total_count > 0 else 0.0

    return {
        "success": True,
        "service_name": target_service_clean,
        "is_all_services": is_all_services,
        "target_homologated_version": target_homologated,
        "filter_country": country_filter_clean or "Todos os Países (LATAM)",
        "available_countries": sorted_countries,
        "available_services": sorted_services,
        "total_hosts": len(hosts_evaluated),
        "total_installations": len(inventory_items),
        "total_running": total_running,
        "total_stopped": total_stopped,
        "total_inexistent": total_inexistent,
        "homologated_count": homologated_count,
        "legacy_count": legacy_count,
        "not_installed_count": not_installed_count,
        "adoption_percent": adoption_pct,
        "versions_distribution": versions_distribution,
        "items": inventory_items
    }


def get_fleet_matrix_data(
    country: Optional[str] = None,
    search: Optional[str] = None
) -> Dict[str, Any]:
    """
    Gera a Matriz Multi-Serviço completa (Pivot Table) idêntica à planilha 'Versoes LATAM.xlsx'.
    Linhas: Hosts / Blades (com País, Praça, CS)
    Colunas: Todos os serviços oficiais e suas respectivas versões instaladas.
    """
    all_services = get_all_fleet_services()
    desired_versions = get_desired_versions()

    country_filter_clean = normalize_country_name(country, default="") if country and country.lower() not in ["all", "todos", "todos os países (latam)", ""] else ""
    search_clean = (search or "").strip().lower()

    # Identifica colunas de serviços ativas
    discovered_services = set()
    for s in all_services:
        svc = (s.get("nome_servico") or "").strip()
        if svc and svc.lower() not in ["n/a", "none"]:
            discovered_services.add(svc)

    # Ordena colunas conforme ordem oficial
    service_columns = [col for col in OFFICIAL_SERVICE_COLUMNS if col in discovered_services]
    # Adiciona outros serviços que não estejam na lista prioritária
    for col in sorted(discovered_services):
        if col not in service_columns:
            service_columns.append(col)

    # Constrói o agrupamento por host / CS
    hosts_pivot: Dict[Tuple[str, str, str, int], Dict[str, Any]] = {}

    for s in all_services:
        cntry = infer_country_from_record(s)
        if country_filter_clean and cntry.lower() != country_filter_clean.lower():
            continue

        h = s.get("hostname") or s.get("host") or ""
        praca = s.get("praca") or ""
        cs = int(float(s.get("cs", 1) or 1))

        if search_clean:
            match_txt = f"{h} {praca} {cntry}".lower()
            if search_clean not in match_txt:
                continue

        key = (cntry, praca, h, cs)
        if key not in hosts_pivot:
            hosts_pivot[key] = {
                "pais": cntry,
                "pais_flag": get_country_flag(cntry),
                "praca": praca,
                "hostname": h,
                "cs": cs,
                "servicos": {}
            }

        svc_name = (s.get("nome_servico") or "").strip()
        v_inst = str(s.get("versao_instalada") or "Não Instalado").strip()
        if not v_inst or v_inst.lower() in ["n/a", "none", "0.0.0.0"]:
            v_inst = "Não Instalado"

        if svc_name:
            hosts_pivot[key]["servicos"][svc_name] = v_inst

    # Converte para lista ordenada
    matrix_rows = []
    for (cntry, praca, h, cs), data in sorted(hosts_pivot.items(), key=lambda x: (x[0][0], x[0][1].lower(), x[0][2].lower(), x[0][3])):
        row_entry = {
            "pais": data["pais"],
            "pais_flag": data["pais_flag"],
            "praca": data["praca"],
            "hostname": data["hostname"],
            "cs": data["cs"],
            "servicos": {}
        }
        for col in service_columns:
            ver = data["servicos"].get(col, "-")
            des_ver = desired_versions.get(col, "")
            is_homolog = bool(des_ver and ver == des_ver)
            row_entry["servicos"][col] = {
                "version": ver,
                "is_homologated": is_homolog,
                "badge_class": "badge-green" if is_homolog else ("badge-muted" if ver in ["-", "Não Instalado"] else "badge-yellow")
            }
        matrix_rows.append(row_entry)

    # Identifica países disponíveis
    all_countries_set = set(infer_country_from_record(s) for s in all_services)
    sorted_countries = sorted([{"name": k, "flag": get_country_flag(k)} for k in all_countries_set], key=lambda x: x["name"])

    return {
        "success": True,
        "columns": service_columns,
        "rows": matrix_rows,
        "total_hosts": len(matrix_rows),
        "filter_country": country_filter_clean or "Todos os Países (LATAM)",
        "available_countries": sorted_countries
    }


def generate_fleet_inventory_excel(
    service_name: Optional[str] = "Atria Capture",
    country: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None
) -> bytes:
    """
    Gera um arquivo Excel (.xlsx) altamente profissional e formatado, com:
    - Aba 1: Resumo Executivo / Distribuição de Versões (no formato exato solicitado por Marcio)
    - Aba 2: Matriz Multi-Serviço LATAM (Pivot Grid idêntico a 'Versoes LATAM.xlsx')
    - Aba 3: Inventário Granular Completo da Frota (com todos os hosts, IPs, praças e status)
    """
    exec_data = get_fleet_inventory_data(
        service_name=service_name,
        country=country,
        status_filter=status_filter,
        search=search
    )
    matrix_data = get_fleet_matrix_data(
        country=country,
        search=search
    )

    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # Remove sheet padrão

    # Estilos de Formatação
    font_title = Font(name="Segoe UI", size=15, bold=True, color="FFFFFF")
    font_sub = Font(name="Segoe UI", size=10, italic=True, color="94A3B8")
    font_sec_hdr = Font(name="Segoe UI", size=11, bold=True, color="1E293B")
    font_tbl_hdr = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    font_data = Font(name="Segoe UI", size=10, color="0F172A")
    font_data_bold = Font(name="Segoe UI", size=10, bold=True, color="0F172A")
    font_homolog = Font(name="Segoe UI", size=10, bold=True, color="047857")
    font_muted = Font(name="Segoe UI", size=10, color="94A3B8")

    fill_banner = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    fill_tbl_hdr = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    fill_tbl_total = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    fill_homolog = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")

    thin_border_side = Side(style="thin", color="CBD5E1")
    border_cell = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    border_total = Border(top=Side(style="thin", color="0F172A"), bottom=Side(style="double", color="0F172A"))

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    # =========================================================================
    # ABA 1: RESUMO EXECUTIVO (DISTRIBUIÇÃO DE VERSÕES — PADRÃO MARCIO)
    # =========================================================================
    ws1 = wb.create_sheet(title="Resumo - Distribuição")
    ws1.views.sheetView[0].showGridLines = True

    # 1. Header Banner
    ws1.merge_cells("A1:E2")
    top_cell = ws1["A1"]
    top_cell.value = "KANTAR IBOPE MEDIA — GESTÃO DE VERSÕES DA FROTA CS"
    top_cell.font = font_title
    top_cell.fill = fill_banner
    top_cell.alignment = align_center

    ws1["A3"] = f"Serviço: {exec_data['service_name']} | Escopo: {exec_data['filter_country']} | Gerado em: {now_str}"
    ws1["A3"].font = font_sub
    ws1.merge_cells("A3:E3")

    # 2. Cards de Resumo Rápido
    ws1["A5"] = "Total de Servidores"
    ws1["A6"] = exec_data["total_hosts"]
    ws1["B5"] = "Adoção Homologada (%)"
    ws1["B6"] = f"{exec_data['adoption_percent']}%"
    ws1["C5"] = "Na Versão Homologada"
    ws1["C6"] = exec_data["homologated_count"]
    ws1["D5"] = "Em Versão Legada"
    ws1["D6"] = exec_data["legacy_count"]
    ws1["E5"] = "Não Instalados"
    ws1["E6"] = exec_data["not_installed_count"]

    for col in ["A", "B", "C", "D", "E"]:
        c_lbl = ws1[f"{col}5"]
        c_val = ws1[f"{col}6"]
        c_lbl.font = Font(name="Segoe UI", size=9, bold=True, color="64748B")
        c_lbl.alignment = align_center
        c_lbl.fill = fill_tbl_total
        c_val.font = Font(name="Segoe UI", size=14, bold=True, color="0F172A")
        c_val.alignment = align_center
        c_val.fill = fill_tbl_total
        c_lbl.border = border_cell
        c_val.border = border_cell

    # 3. Tabela Executiva
    ws1["A8"] = "DISTRIBUIÇÃO OFICIAL DE VERSÕES"
    ws1["A8"].font = font_sec_hdr
    ws1.merge_cells("A8:E8")

    headers_ws1 = ["Versão", "Quantidade", "Percentual (%)", "Status de Homologação", "Classificação Técnica"]
    for col_idx, h in enumerate(headers_ws1, start=1):
        c = ws1.cell(row=9, column=col_idx, value=h)
        c.font = font_tbl_hdr
        c.fill = fill_tbl_hdr
        c.alignment = align_center
        c.border = border_cell

    cur_row = 10
    total_qty = 0
    total_pct = 0.0

    for d in exec_data["versions_distribution"]:
        c_ver = ws1.cell(row=cur_row, column=1, value=d["version"])
        c_qty = ws1.cell(row=cur_row, column=2, value=d["count"])
        c_pct = ws1.cell(row=cur_row, column=3, value=d["percent"] / 100.0)
        c_pct.number_format = "0.00%"
        c_st = ws1.cell(row=cur_row, column=4, value=d["status"])
        c_is = ws1.cell(row=cur_row, column=5, value="HOMOLOGADO (OFICIAL)" if d["is_homologated"] else ("NÃO INSTALADO" if d["version"] == "Não Instalado" else "LEGADO"))

        c_ver.alignment = align_center
        c_qty.alignment = align_right
        c_pct.alignment = align_right
        c_st.alignment = align_center
        c_is.alignment = align_center

        for cell in (c_ver, c_qty, c_pct, c_st, c_is):
            cell.border = border_cell
            if d["is_homologated"]:
                cell.fill = fill_homolog
                cell.font = font_homolog
            else:
                cell.font = font_data

        total_qty += d["count"]
        total_pct += d["percent"]
        cur_row += 1

    # Linha de Total
    c_tot_lbl = ws1.cell(row=cur_row, column=1, value="TOTAL")
    c_tot_qty = ws1.cell(row=cur_row, column=2, value=total_qty)
    c_tot_pct = ws1.cell(row=cur_row, column=3, value=round(total_pct / 100.0, 2))
    c_tot_pct.number_format = "0.00%"
    c_tot_st = ws1.cell(row=cur_row, column=4, value="100.0% da Frota Auditada")
    c_tot_is = ws1.cell(row=cur_row, column=5, value="")

    for c in (c_tot_lbl, c_tot_qty, c_tot_pct, c_tot_st, c_tot_is):
        c.font = font_data_bold
        c.fill = fill_tbl_total
        c.border = border_total

    c_tot_qty.alignment = align_right
    c_tot_pct.alignment = align_right
    c_tot_lbl.alignment = align_center
    c_tot_st.alignment = align_center

    for col in ws1.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws1.column_dimensions[col_letter].width = max(max_len + 3, 14)

    # =========================================================================
    # ABA 2: MATRIZ MULTI-SERVIÇOS (PIVOT GRID IDÊNTICO A VERSOES LATAM.XLSX)
    # =========================================================================
    ws2 = wb.create_sheet(title="Matriz Multi-Serviço LATAM")
    ws2.views.sheetView[0].showGridLines = True
    ws2.freeze_panes = "E2"

    cols = matrix_data["columns"]
    headers_ws2 = ["País", "Praça", "Host / Blade", "CS"] + cols

    for col_idx, h in enumerate(headers_ws2, start=1):
        c = ws2.cell(row=1, column=col_idx, value=h)
        c.font = font_tbl_hdr
        c.fill = fill_tbl_hdr
        c.alignment = align_center
        c.border = border_cell

    row_idx = 2
    for r in matrix_data["rows"]:
        c_pais = ws2.cell(row=row_idx, column=1, value=f"{r['pais_flag']} {r['pais']}")
        c_praca = ws2.cell(row=row_idx, column=2, value=r["praca"])
        c_host = ws2.cell(row=row_idx, column=3, value=r["hostname"])
        c_cs = ws2.cell(row=row_idx, column=4, value=f"CS{r['cs']}")

        c_pais.alignment = align_left
        c_praca.alignment = align_left
        c_host.alignment = align_left
        c_cs.alignment = align_center

        is_even = (row_idx % 2 == 0)
        for cell in (c_pais, c_praca, c_host, c_cs):
            cell.font = font_data
            cell.border = border_cell
            if is_even:
                cell.fill = fill_zebra

        col_offset = 5
        for col_name in cols:
            svc_info = r["servicos"].get(col_name, {})
            v_val = svc_info.get("version", "-")
            c_val = ws2.cell(row=row_idx, column=col_offset, value=v_val)
            c_val.alignment = align_center
            c_val.border = border_cell

            if svc_info.get("is_homologated"):
                c_val.font = font_homolog
                c_val.fill = fill_homolog
            elif v_val in ["-", "Não Instalado"]:
                c_val.font = font_muted
                if is_even:
                    c_val.fill = fill_zebra
            else:
                c_val.font = font_data
                if is_even:
                    c_val.fill = fill_zebra

            col_offset += 1

        row_idx += 1

    for col in ws2.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws2.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # =========================================================================
    # ABA 3: INVENTÁRIO GRANULAR COMPLETO (TODOS OS HOSTS E SERVIÇOS)
    # =========================================================================
    ws3 = wb.create_sheet(title="Inventário Granular (Hosts)")
    ws3.views.sheetView[0].showGridLines = True
    ws3.freeze_panes = "A2"

    headers_ws3 = [
        "País", "Praça", "Hostname", "CS", "IP Local", "Serviço",
        "Versão Instalada", "Versão Desejada", "Status do Serviço",
        "Status Atualização", "Ação Solicitada", "Última Telemetria"
    ]

    for col_idx, h in enumerate(headers_ws3, start=1):
        c = ws3.cell(row=1, column=col_idx, value=h)
        c.font = font_tbl_hdr
        c.fill = fill_tbl_hdr
        c.alignment = align_center
        c.border = border_cell

    row_idx = 2
    for item in exec_data["items"]:
        c_pais = ws3.cell(row=row_idx, column=1, value=f"{item['pais_flag']} {item['pais']}")
        c_praca = ws3.cell(row=row_idx, column=2, value=item["praca"])
        c_host = ws3.cell(row=row_idx, column=3, value=item["hostname"])
        c_cs = ws3.cell(row=row_idx, column=4, value=f"CS{item['cs']}")
        c_ip = ws3.cell(row=row_idx, column=5, value=item["ip"])
        c_svc = ws3.cell(row=row_idx, column=6, value=item["service_name"])
        c_vinst = ws3.cell(row=row_idx, column=7, value=item["versao_instalada"])
        c_vdes = ws3.cell(row=row_idx, column=8, value=item["versao_desejada"])
        c_ssrv = ws3.cell(row=row_idx, column=9, value=item["status_servico"])
        c_supd = ws3.cell(row=row_idx, column=10, value=item["status_atualizacao"])
        c_acao = ws3.cell(row=row_idx, column=11, value=item["acao_solicitada"])
        c_tele = ws3.cell(row=row_idx, column=12, value=item["ultima_atualizacao"])

        c_pais.alignment = align_left
        c_praca.alignment = align_left
        c_host.alignment = align_left
        c_cs.alignment = align_center
        c_ip.alignment = align_center
        c_svc.alignment = align_left
        c_vinst.alignment = align_center
        c_vdes.alignment = align_center
        c_ssrv.alignment = align_center
        c_supd.alignment = align_center
        c_acao.alignment = align_center
        c_tele.alignment = align_center

        is_even = (row_idx % 2 == 0)
        for cell in (c_pais, c_praca, c_host, c_cs, c_ip, c_svc, c_vinst, c_vdes, c_ssrv, c_supd, c_acao, c_tele):
            cell.font = font_data
            cell.border = border_cell
            if is_even:
                cell.fill = fill_zebra

        if item["is_up_to_date"]:
            c_vinst.font = font_homolog
            c_supd.font = font_homolog

        row_idx += 1

    for col in ws3.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws3.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
