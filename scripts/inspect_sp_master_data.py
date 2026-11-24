import re

path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'const\s+SP_MASTER_DATA\s*=\s*\{', text)
if m:
    start = m.start()
    print('SP_MASTER_DATA starts at:', start)
    print(text[start:start+1000])

# Find all keys under SP_MASTER_DATA.lists
m_lists = re.search(r'lists\s*:\s*\{', text)
if m_lists:
    start_l = m_lists.start()
    print('\nlists starts at:', start_l)
    print(text[start_l:start_l+500])
