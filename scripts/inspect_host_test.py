with open('tests/test_host_config_modal_and_emu_profile.py', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [l for l in text.splitlines() if 'index.html' in l or 'git checkout' in l or 'restore' in l or 'docs' in l]
print('Matches in test_host_config_modal_and_emu_profile.py:', matches)
