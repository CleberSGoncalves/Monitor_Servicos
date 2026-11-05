with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'r', encoding='utf-8') as f:
    text = f.read()

new_hash = "510d94732214e39a99c4a04936f7ecb183e00c0153be481b8dbfa7a9258665f5"
target = '$validHashes = @(\n'
if target not in text:
    target = '$validHashes = @(\r\n'

text = text.replace(target, target + f'    "{new_hash}",\n', 1)

with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

with open(r'publish\agent\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

print("Hash 510d9473... added successfully!")
