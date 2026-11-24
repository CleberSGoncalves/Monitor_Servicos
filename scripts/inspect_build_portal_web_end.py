with open(r'E:\desenvolvimento\Monitor_Esportes\scripts\build_portal_web.py', 'r', encoding='utf-8') as f:
    text = f.read()

print('Last 3000 chars:')
print(text[-3000:])
