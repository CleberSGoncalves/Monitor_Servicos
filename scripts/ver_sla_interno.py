import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

pos = content.find('"SLA INTERNO - 2026"')
if pos != -1:
    print('Encontrou SLA INTERNO - 2026 em:', pos)
    snippet = content[pos-200:pos+1500]
    print(snippet[:600])
else:
    print('Não encontrou SLA INTERNO - 2026!')
