import re

path = r'E:\desenvolvimento\Monitor_Esportes\docs\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

m_nav = re.search(r'<nav.+?</nav>', text, re.DOTALL)
if m_nav:
    nav_html = m_nav.group(0)
    print(nav_html[2500:6000])
