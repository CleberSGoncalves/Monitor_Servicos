path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = re.finditer(r'remoto', text, re.IGNORECASE)
for m in matches:
    print('Match at:', m.start())
    print(text[max(0, m.start()-100):min(len(text), m.start()+200)])
