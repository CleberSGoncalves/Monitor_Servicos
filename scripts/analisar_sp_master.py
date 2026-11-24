import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

m = re.search(r'let SP_MASTER_DATA = ({.*?});\s*let SP_CONFIG', content, re.DOTALL)
if m:
    data = json.loads(m.group(1))
    print('Chaves em SP_MASTER_DATA:', list(data.keys()))
    if 'lists' in data:
        print('\nListas em SP_MASTER_DATA (Total: %d):' % len(data['lists']))
        for k in data['lists'].keys():
            items = data['lists'][k].get('items', [])
            print(f'  - {k} ({len(items)} itens)')
    if 'drives' in data:
        print('\nDrives em SP_MASTER_DATA (Total: %d):' % len(data['drives']))
        for k in data['drives'].keys():
            items = data['drives'][k].get('items', [])
            print(f'  - {k} ({len(items)} itens)')
else:
    print('Não encontrou SP_MASTER_DATA via regex!')
