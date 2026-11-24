html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f, 1):
        if 'function openFolder' in line or 'function openDrive' in line or 'function renderDrive' in line:
            print(f"{idx}: {line.strip()[:100]}")
