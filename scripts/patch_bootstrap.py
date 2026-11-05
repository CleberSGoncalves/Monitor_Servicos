with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'r', encoding='utf-8') as f:
    text = f.read()

sub = 'Mapeamento de IDs persistente salvo em'
pos = text.find(sub)
if pos != -1:
    line_end = text.find('\n', pos)
    addition = '''

        $fullKey = "$($hostName)_DNA.MonitorServiceSVC"
        if ($dict[$fullKey]) {
            $agentItemId = "$($dict[$fullKey])".Split("_")[0]
        } elseif ($dict["DNA.MonitorServiceSVC"]) {
            $agentItemId = "$($dict["DNA.MonitorServiceSVC"])".Split("_")[0]
        }
        if ($agentItemId) {
            Write-Host "[OK] ID do agente obtido da Central ($hostName): $agentItemId" -ForegroundColor Green
        }'''
    text = text[:line_end] + addition + text[line_end:]
    with open(r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1', 'w', encoding='utf-8') as f:
        f.write(text)
    print("SUCCESS: agentItemId logic inserted into bootstrap_update.ps1!")
else:
    print("ERROR: sub not found!")
