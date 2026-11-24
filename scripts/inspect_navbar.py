import re

path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Look for header navigation or navbar
m_nav = re.search(r'<nav.+?</nav>', text, re.DOTALL)
if m_nav:
    print('NAVBAR ENCONTRADA:')
    print(m_nav.group(0)[:3000])
else:
    # Look for topbar or menu
    m_top = re.search(r'<div class=[\'"][^\'"]*navbar[^\'"]*[\'"].+?</div>\s*</div>', text, re.DOTALL)
    if m_top:
        print('NAVBAR DIV:')
        print(m_top.group(0)[:3000])
    else:
        # Search for where 'Qualidade' is in text
        pos = text.find('Qualidade')
        if pos != -1:
            print('CONTEXTO DE QUALIDADE:')
            print(text[max(0, pos-200):min(len(text), pos+800)])
