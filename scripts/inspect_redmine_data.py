import re

path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Search for Redmine in SP_MASTER_DATA
pos = text.find("'Redmine'")
if pos == -1:
    pos = text.find('"Redmine"')

print('Redmine position:', pos)
if pos != -1:
    print(text[pos:pos+1500])
