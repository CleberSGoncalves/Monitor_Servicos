import os

target_file = r'WinServiceFleetAgent\Scripts\bootstrap_update.ps1'
publish_file = r'publish\agent\bootstrap_update.ps1'

with open(target_file, 'r', encoding='utf-8') as f:
    text = f.read()

# Locate from '$hostName = $env:COMPUTERNAME' down to '# 7. Aplicacao'
start_marker = '$hostName = $env:COMPUTERNAME'
end_marker = '# 7. Aplicacao: Instalacao Limpa vs Atualizacao Atomica com Auto-Recovery'

p1 = text.find(start_marker)
p2 = text.find(end_marker)

assert p1 != -1 and p2 != -1, f"Markers not found: p1={p1}, p2={p2}"

new_block = '''$hostName = $env:COMPUTERNAME
$spIdsFile = Join-Path $installDir "sharepoint_service_ids.json"
$agentItemId = $null

# 6.1 Tenta Central (se falhar ou der timeout, silencia e vai para o fallback local)
$idsResp = $null
try {
    $idsResp = Invoke-RestMethod -Uri "http://10.1.30.1:8092/api/fleet/host-service-ids/$hostName" -TimeoutSec 2 -ErrorAction Stop
    if ($idsResp) {
        $dict = @{}
        foreach ($prop in $idsResp.PSObject.Properties) {
            $dict["$($hostName)_$($prop.Name)"] = "$($prop.Value)"
            $dict[$prop.Name] = "$($prop.Value)"
        }
        $idsJson = $dict | ConvertTo-Json -Depth 5
        Set-Content -Path $spIdsFile -Value $idsJson -Encoding UTF8
        Write-Host "[OK] Mapeamento de IDs persistente salvo em $spIdsFile ($($dict.Count) servicos)." -ForegroundColor Green

        $fullKey = "$($hostName)_DNA.MonitorServiceSVC"
        if ($dict[$fullKey]) {
            $agentItemId = "$($dict[$fullKey])".Split("_")[0]
        } elseif ($dict["DNA.MonitorServiceSVC"]) {
            $agentItemId = "$($dict["DNA.MonitorServiceSVC"])".Split("_")[0]
        }
        if ($agentItemId) {
            Write-Host "[OK] ID do agente obtido da Central ($($hostName)): $agentItemId" -ForegroundColor Green
        }
    }
} catch {
    # Central inacessivel da praca remota sem VPN: usaremos o pacote de IDs local
}

# 6.2 Fallback: Carrega do pacote local descompactado (SEMPRE copia para o installDir)
if (-not $idsResp) {
    try {
        $bundledIdsPath = Join-Path $extractPath "sharepoint_service_ids.json"
        if (-not (Test-Path $bundledIdsPath)) {
            $bundledIdsPath = Join-Path $installDir "sharepoint_service_ids.json"
        }
        if (Test-Path $bundledIdsPath) {
            Copy-Item -Path $bundledIdsPath -Destination $spIdsFile -Force -ErrorAction SilentlyContinue
            $bundledContent = Get-Content $bundledIdsPath -Raw | ConvertFrom-Json
            $fullKey = "$($hostName)_DNA.MonitorServiceSVC"
            if ($bundledContent.$fullKey) {
                $agentItemId = "$($bundledContent.$fullKey)".Split("_")[0]
            } elseif ($bundledContent."DNA.MonitorServiceSVC") {
                $agentItemId = "$($bundledContent."DNA.MonitorServiceSVC")".Split("_")[0]
            }
            if ($agentItemId) {
                Write-Host "[OK] Mapeamento de IDs carregado do pacote local ($spIdsFile). ID do agente para $($hostName): $agentItemId" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "[AVISO] Falha ao carregar IDs locais: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# 6.3 Copia tambem sharepoint_channel_ids.json para o diretorio de instalacao
$bundledChPath = Join-Path $extractPath "sharepoint_channel_ids.json"
$spChFile = Join-Path $installDir "sharepoint_channel_ids.json"
if (Test-Path $bundledChPath) {
    Copy-Item -Path $bundledChPath -Destination $spChFile -Force -ErrorAction SilentlyContinue
}

# 6.4 Atualiza o registro do agente DIRETAMENTE no SharePoint
if ($agentItemId -and $headers.Count -gt 0) {
    try {
        Write-Host "[INFO] Atualizando registro do agente no SharePoint (ID $agentItemId)..."
        $nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $patchBody = @{
            "Versao_Instalada"   = $targetVer
            "Versao_Desejada"    = $targetVer
            "Status_Atualizacao" = "Atualizado"
            "Acao_Solicitada"    = "Nenhuma"
            "Ultima_atualizacao" = $nowIso
        } | ConvertTo-Json -Depth 3

        $patchUri = "https://graph.microsoft.com/v1.0/sites/adgbl.sharepoint.com,d0713747-9b9a-4cb4-9930-dda26c8d1050,05c8fe55-14be-4ed0-8ce0-2958fd775ee0/lists/2e2afc16-dfd6-4277-a16c-cd78bdd2e769/items/$agentItemId/fields"
        $patchRes = Invoke-ResilientRestMethod -Uri $patchUri -Method "Patch" -Headers $headers -Body $patchBody -TimeoutSec 10 -MaxRetries 3
        if ($patchRes) {
            Write-Host "[SUCESSO] Registro no SharePoint atualizado para v$targetVer (Status: Atualizado)!" -ForegroundColor Green
        }
    } catch {
        Write-Host "[AVISO] Nao foi possivel atualizar registro no SharePoint: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
'''

new_text = text[:p1] + new_block + text[p2:]

with open(target_file, 'w', encoding='utf-8') as f:
    f.write(new_text)

with open(publish_file, 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Patch applied cleanly to both files!")
