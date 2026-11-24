with open(r'E:\desenvolvimento\Monitor_Esportes\docs\index.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re
m = re.search(r'<div[^>]*id=[\'"]modal-new-oco[\'"][^>]*>', text)
if m:
    print('Found modal-new-oco tag:', m.group(0))
    pos = m.start()
    print('Context:', text[pos-100:pos+200])
