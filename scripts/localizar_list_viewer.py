html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f, 1):
        if 'function openRealList' in line or 'function openNewItemModal' in line or 'function editListItem' in line or 'function openEditItemModal' in line:
            print(f"{idx}: {line.strip()[:100]}")
