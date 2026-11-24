import json
import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

pos = content.find('"Configurações de Rede do CS"')
if pos != -1:
    # Achar o início do dict da lista
    # Anda para trás até achar a chave anterior ou chave da lista
    start_brace = content.rfind('{', 0, pos)
    # Achar o campo "items": [
    items_pos = content.find('"items": [', pos)
    if items_pos != -1:
        # Achar o fim do array items
        end_bracket = content.find('], "columns"', items_pos)
        if end_bracket == -1:
            end_bracket = content.find(']}', items_pos)
        items_str = content[items_pos + len('"items": ['):end_bracket]
        try:
            items = json.loads('[' + items_str + ']')
            print(f'Total itens em Configurações de Rede do CS: {len(items)}')
            for it in items[:5]:
                print(it)
        except Exception as e:
            print('Erro no parse dos itens:', e)
            print('Snippet:', items_str[:300])
