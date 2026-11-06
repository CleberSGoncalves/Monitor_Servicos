import xlrd, sys

book = xlrd.open_workbook('gvRemoteCommandCS (8).xls')
sheet = book.sheet_by_name(book.sheet_names()[0])

print(f"Planilha: {book.sheet_names()[0]} | Total de Linhas: {sheet.nrows} | Colunas: {sheet.ncols}")

headers = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]
print(f"Colunas: {headers}")

status_counts = {}
result_categories = {}
exit_code_counts = {}
success_hosts = []
failed_hosts = []

# Identificar indices das colunas
col_host = headers.index('Host') if 'Host' in headers else 2
col_cs = headers.index('CS') if 'CS' in headers else 3
col_status = headers.index('Status') if 'Status' in headers else 9
col_result = headers.index('Resultado') if 'Resultado' in headers else 10

for r in range(1, sheet.nrows):
    row = sheet.row_values(r)
    host = str(row[col_host]).strip()
    cs = str(row[col_cs]).strip()
    status = str(row[col_status]).strip()
    res = str(row[col_result]).strip()
    
    status_counts[status] = status_counts.get(status, 0) + 1
    
    if 'EXIT CODE: 0' in res or '[SUCESSO]' in res or 'Atualizacao para v1.0.19.0' in res:
        exit_code_counts['EXIT CODE: 0 (Sucesso)'] = exit_code_counts.get('EXIT CODE: 0 (Sucesso)', 0) + 1
        success_hosts.append(f"{host} (CS {cs})")
    elif 'EXIT CODE: 1' in res or 'EXIT CODE:' in res:
        exit_code_counts['EXIT CODE: 1 (Falha)'] = exit_code_counts.get('EXIT CODE: 1 (Falha)', 0) + 1
        failed_hosts.append((f"{host} (CS {cs})", res))
    elif status == 'PENDING':
        exit_code_counts['PENDING (Aguardando)'] = exit_code_counts.get('PENDING (Aguardando)', 0) + 1
    elif status == 'REGISTERED':
        exit_code_counts['REGISTERED (Fila)'] = exit_code_counts.get('REGISTERED (Fila)', 0) + 1
    else:
        exit_code_counts[f'Outro Status ({status})'] = exit_code_counts.get(f'Outro Status ({status})', 0) + 1

    # Categoriza mensagens de erro ou resultado
    if 'EXIT CODE: 1' in res:
        if 'ParseException' in res or 'Referência de variável' in res or 'Referˆncia' in res:
            cat = 'Erro de Sintaxe PowerShell (ParseException)'
        elif 'irm : Impossível' in res or 'Impossvel conectar' in res or 'Unable to connect' in res:
            cat = 'Sem Acesso Externo ao GitHub (raw.githubusercontent.com)'
        elif 'SHA-256 divergente' in res:
            cat = 'Checksum SHA-256 divergente'
        elif 'Throttled' in res or '429' in res:
            cat = 'Throttling Graph (HTTP 429)'
        elif 'Nao foi possivel baixar o pacote' in res:
            cat = 'Falha ao baixar pacote do SharePoint'
        else:
            first_line = [l.strip() for l in res.split('\n') if l.strip() and not l.startswith('COMMAND') and not l.startswith('EXIT CODE')]
            cat = first_line[0][:80] if first_line else 'Outro erro'
        result_categories[cat] = result_categories.get(cat, 0) + 1

print("\n=== RESUMO EXECUTIVO ===")
print(f"Total de Disparos Avaliados: {sheet.nrows - 1}")
print("Distribuição por Execução:")
for k, v in sorted(exit_code_counts.items(), key=lambda x: -x[1]):
    pct = (v / (sheet.nrows - 1)) * 100
    print(f"  {k}: {v} ({pct:.1f}%)")

print("\n=== CATEGORIAS DE ERRO (Nas Falhas) ===")
for cat, cnt in sorted(result_categories.items(), key=lambda x: -x[1]):
    print(f"  {cat}: {cnt}")

print(f"\nExemplos de Sucesso ({len(success_hosts)} total):")
for h in success_hosts[:10]:
    print(f"  ✅ {h}")

if failed_hosts:
    print(f"\nExemplos de Falha ({len(failed_hosts)} total):")
    for h, r in failed_hosts[:5]:
        first_lines = "\n    ".join([l.strip() for l in r.split('\n')[:4] if l.strip()])
        print(f"  ❌ {h}:\n    {first_lines}")
