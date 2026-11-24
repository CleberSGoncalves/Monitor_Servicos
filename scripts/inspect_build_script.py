with open(r'scripts\build_portal_master.py', 'r', encoding='utf-8') as f:
    text = f.read()

print('Length of build_portal_master.py:', len(text))
print(text[:1500])
