path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('function showPane')
if pos != -1:
    print('showPane implementation:')
    print(text[pos:pos+2000])
