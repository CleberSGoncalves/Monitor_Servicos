import re

path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Look for SP_RESOURCE_MAP usage
m = re.findall(r'const\s+([A-Z0-9_]+)\s*=\s*\{', text)
print('Const objects:', m)

# Search for 'Redmine' in quotes
pos = 0
found = []
while True:
    p = text.find('Redmine', pos)
    if p == -1 or len(found) > 10:
        break
    found.append(p)
    pos = p + 7

print('First occurrences of Redmine:', found)
for p in found[:5]:
    print('--- AT', p)
    print(text[max(0, p-50):min(len(text), p+100)])
