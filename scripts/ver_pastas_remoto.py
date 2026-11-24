import re

html_path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Procura todas as ocorrências de nomes nas pastas do Acesso Remoto
matches = re.findall(r'"name":\s*"([^"]+)",\s*"type":\s*"folder"', content[content.find('"Acesso Remoto":'):content.find('"Acesso Remoto":')+15000])
print('Pastas de Acesso Remoto:', matches)
