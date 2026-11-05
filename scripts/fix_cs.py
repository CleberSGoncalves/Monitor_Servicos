with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'r', encoding='utf-8') as f:
    text = f.read()

sub = '                    string cacheKey = $"{cleanHost}_{cleanSrv}";\n'
if sub not in text:
    sub = '                    string cacheKey = $"{cleanHost}_{cleanSrv}";\r\n'

text = text.replace(sub, '', 1)

with open(r'WinServiceFleetAgent\Core\SharePointClient.cs', 'w', encoding='utf-8') as f:
    f.write(text)

print("SUCCESS: Duplicate cacheKey removed!")
