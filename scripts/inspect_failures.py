import xlrd, sys
sys.stdout.reconfigure(encoding='utf-8')

book = xlrd.open_workbook('gvRemoteCommandCS (8).xls')
sheet = book.sheet_by_name(book.sheet_names()[0])

print("=== DETALHAMENTO DAS 41 FALHAS RESTANTES ===")

no_net = []
dns_err = []
sha_err = []
sp_err = []

for r in range(1, sheet.nrows):
    row = sheet.row_values(r)
    host = str(row[2]).strip()
    cs = str(row[3]).strip()
    status = str(row[9]).strip()
    res = str(row[10]).strip()
    
    if 'EXIT CODE: 1' in res:
        if 'Impossível' in res or 'Impossvel' in res or 'Unable to connect' in res:
            no_net.append(f"{host} (CS {cs})")
        elif 'nome remoto não pôde ser resolvido' in res or 'raw.githubusercontent.c' in res:
            dns_err.append(f"{host} (CS {cs})")
        elif 'SHA-256 divergente' in res:
            # extrair hash calculado
            lines = res.split('\n')
            calc_line = [l.strip() for l in lines if 'Calculado:' in l]
            sha_err.append((f"{host} (CS {cs})", calc_line[0] if calc_line else ''))
        elif 'Nao foi possivel baixar o pacote' in res:
            sp_err.append(f"{host} (CS {cs})")

print(f"\n1. Sem Internet / Bloqueio a raw.githubusercontent.com ({len(no_net)} hosts):")
for h in no_net:
    print(f"   - {h}")

print(f"\n2. Falha de DNS em raw.githubusercontent.com ({len(dns_err)} hosts):")
for h in dns_err:
    print(f"   - {h}")

print(f"\n3. Checksum SHA-256 Divergente ({len(sha_err)} hosts):")
for h, c in sha_err:
    print(f"   - {h} -> {c}")

print(f"\n4. Falha pontual no download do SharePoint ({len(sp_err)} hosts):")
for h in sp_err:
    print(f"   - {h}")
