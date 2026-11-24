html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'

with open(html_path, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f, 1):
        if 'Confirmação de Falha' in line or 'pane-falhas' in line or 'modal-falhas' in line or 'nova-falha' in line:
            print(f"{idx}: {line.strip()[:100]}")
