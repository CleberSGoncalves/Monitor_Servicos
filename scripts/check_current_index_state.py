import os
p = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
print('Size of docs/index.html:', os.path.getsize(p))
with open(p, 'r', encoding='utf-8') as f:
    text = f.read()

print('pane-remoto in text:', 'id="pane-remoto"' in text)
print('modal-quick-close-oco in text:', 'id="modal-quick-close-oco"' in text)
print('buildSmartFieldHtml in text:', 'buildSmartFieldHtml' in text)
