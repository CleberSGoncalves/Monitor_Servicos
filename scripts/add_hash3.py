with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'r', encoding='utf-8') as f:
    text = f.read()

new_hash = "e016e0cf3db0b078c65544277ea3b0f2cda11c246bfa90db0c224b482c13a59f"
target = '$validHashes = @(\n'
if target not in text:
    target = '$validHashes = @(\r\n'

text = text.replace(target, target + f'    "{new_hash}",\n', 1)

with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

with open(r'publish\agent\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

print("Hash e016e0cf... added!")
