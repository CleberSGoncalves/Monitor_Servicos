import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

pos = content.find('"Acesso Remoto":')
if pos != -1:
    items_pos = content.find('"items": [', pos)
    if items_pos != -1:
        end_bracket = content.find('], "columns"', items_pos)
        if end_bracket == -1:
            end_bracket = content.find(']}', items_pos)
        items_str = content[items_pos + len('"items": ['):end_bracket]
        try:
            items = json.loads('[' + items_str + ']')
            print(f'Total itens em Acesso Remoto: {len(items)}')
            for it in items:
                print(it.get('name') or it.get('FileLeafRef') or it.get('Title'), '|', it.get('webUrl') or it.get('FileRef'))
        except Exception as e:
            print('Erro no parse:', e)
            print(items_str[:300])
else:
    print('Não achou Acesso Remoto')
