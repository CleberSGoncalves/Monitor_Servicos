path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

import re
funcs = re.findall(r'function\s+([a-zA-Z0-9_]+)\s*\(', text)
print('Functions count:', len(funcs))
print('Functions list:', funcs[:50])

# Search for handleMenuClick definition
pos = text.find('function handleMenuClick')
if pos != -1:
    print('\nhandleMenuClick implementation:')
    print(text[pos:pos+1500])
