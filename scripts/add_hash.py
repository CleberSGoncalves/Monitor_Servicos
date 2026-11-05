with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'r', encoding='utf-8') as f:
    text = f.read()

new_hash = "570858f16be8f38e31aa7e0e80c0a7285c72bd2277b2cfe9ee3d5a97b2b878bf"
target = '$validHashes = @(\n'
if target not in text:
    target = '$validHashes = @(\r\n'

text = text.replace(target, target + f'    "{new_hash}",\n', 1)

with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

with open(r'publish\agent\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

print("Added new hash to validHashes!")
