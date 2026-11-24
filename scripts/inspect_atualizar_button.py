path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

import re
m = re.findall(r'<button[^>]*onclick=[\'"][^\'"]*Atualizar[^\'"]*[\'"][^>]*>.*?</button>', text, re.IGNORECASE)
print('Buttons with Atualizar in onclick:', m)

# Search for the button in Painel de Ocorrencias
pos = text.find('Painel de Ocorrências')
if pos != -1:
    print('\nPainel de Ocorrencias HTML snippet:')
    print(text[pos:pos+1500])
