path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = re.finditer(r'function\s+renderGenericList|switchResource|renderRedmine|case\s+[\'"]redmine[\'"]', text)
for m in matches:
    print('Match:', m.group(0), 'at pos', m.start())
    print(text[m.start():m.start()+400])
