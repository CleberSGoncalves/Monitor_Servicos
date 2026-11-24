p = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(p, 'r', encoding='utf-8') as f:
    text = f.read()

print('Length:', len(text))
print('RDP_MASTER_DATASET in text:', 'RDP_MASTER_DATASET' in text)
print('pane-remoto in text:', 'pane-remoto' in text)
print('buildSmartFieldHtml in text:', 'buildSmartFieldHtml' in text)
print('OFICIAL_PRACAS in text:', 'OFICIAL_PRACAS' in text)
