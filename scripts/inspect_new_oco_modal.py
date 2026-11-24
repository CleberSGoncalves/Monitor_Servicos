path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('id="modal-new-oco"')
if pos == -1:
    pos = text.find("modal-new-oco")

print('modal-new-oco pos:', pos)
if pos != -1:
    print(text[pos:pos+2500])
