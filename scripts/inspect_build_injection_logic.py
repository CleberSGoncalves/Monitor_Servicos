with open('scripts/build_portal_master.py', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = re.findall(r'if\s+["\'][^"\']+["\']\s+not in content:', text)
print('Conditions:', matches)

pos = text.find('bundle_js =')
if pos != -1:
    print('\nSnippet of bundle_js injection:')
    print(text[pos:pos+500])
