html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f, 1):
        if 'class="pane-container' in line or "class='pane-container" in line:
            print(f'{idx}: {line.strip()[:100]}')
