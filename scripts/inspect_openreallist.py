path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('function openRealList')
if pos != -1:
    print('openRealList implementation:')
    print(text[pos:pos+3000])
