import xlrd, sys

book = xlrd.open_workbook('gvRemoteCommandCS (11).xls')
sheet = book.sheet_by_name('Sheet')

status_counts = {}
error_types = {}
success_count = 0

for r in range(1, sheet.nrows):
    row = sheet.row_values(r)
    host = row[2]
    cs = row[3]
    status = row[9]
    res = str(row[10])
    
    status_counts[status] = status_counts.get(status, 0) + 1
    
    if 'EXIT CODE: 0' in res:
        success_count += 1
    elif 'EXIT CODE: 1' in res:
        if 'ParseException' in res or 'vari' in res:
            err_type = 'PowerShell ParseException ($hostName: Syntax Error)'
        elif 'Throttled' in res or '429' in res:
            err_type = 'Throttled (HTTP 429)'
        elif 'SHA-256' in res:
            err_type = 'SHA-256 Divergente'
        else:
            lines = [l.strip() for l in res.split('\n') if l.strip() and not l.startswith('COMMAND') and not l.startswith('EXIT CODE')]
            err_type = lines[0][:70] if lines else 'Exit code 1 generico'
        error_types[err_type] = error_types.get(err_type, 0) + 1

print(f"Total de registros na planilha: {sheet.nrows - 1}")
print("=== STATUS GERAL ===")
for st, cnt in sorted(status_counts.items(), key=lambda x: -x[1]):
    print(f"  {st}: {cnt}")

print(f"\nSucessos (EXIT CODE: 0): {success_count}")
print("=== TIPOS DE ERRO (EXIT CODE: 1) ===")
for et, cnt in sorted(error_types.items(), key=lambda x: -x[1]):
    print(f"  {et}: {cnt}")
