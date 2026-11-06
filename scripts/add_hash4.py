with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'r', encoding='utf-8') as f:
    text = f.read()

new_hash = "9791181fd4c489b85d5098b5193bec7c536813abd9ba8bfda909cac656920227"
target = '$validHashes = @(\n'
if target not in text:
    target = '$validHashes = @(\r\n'

text = text.replace(target, target + f'    "{new_hash}",\n', 1)

with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

with open(r'publish\agent\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
    f.write(text)

print("Hash 9791181f... added!")
