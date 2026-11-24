import re

path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'const\s+SP_RESOURCE_MAP\s*=\s*(\{.+?\n\s*\});', text, re.DOTALL)
if m:
    print('--- ITENS NO SP_RESOURCE_MAP ---')
    for line in m.group(1).splitlines():
        if any(w in line.lower() for w in ['redmine', 'qualidade', 'falha', 'remoto', 'sla']):
            print('  MAP:', line.strip())

print('\n--- ITENS DE NAVEGACAO / MENUS DROPDOWN ---')
dropdowns = re.findall(r'<div class=[\'"]dropdown-menu[\'"]>(.+?)</div>', text, re.DOTALL)
for idx, d in enumerate(dropdowns):
    lines = [l.strip() for l in d.splitlines() if 'switchResource' in l]
    if lines:
        print(f'Dropdown {idx}:')
        for l in lines:
            print('  ', l)
