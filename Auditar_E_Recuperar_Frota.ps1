# ==============================================================================
# WATCHDOG & AUDITOR DE FROTAS (DNA Monitor Fleet)
# ==============================================================================
# 1. Auto-atualiza este proprio script a partir do repositorio GitHub (main).
# 2. Descobre dinamicamente a versao mais recente da release do servico no GitHub.
# 3. Audita todas as estacoes do servico no SharePoint.
# 4. Diagnostica porque cada maquina esta desatualizada (Offline, Parado, Erro no Log).
# 5. Tenta auto-recuperacao se a maquina estiver ativa (Acao_Solicitada = Atualizar).
# 6. Se a maquina estiver offline ha mais de 3h ou com erro persistente,
#    classifica como "Necessario Update Manual" e isola das rotinas automaticas.
# ==============================================================================
param(
    [string]$ServiceName = "DNA.MonitorServiceSVC",
    [string]$TargetVersion = "latest",
    [int]$OfflineThresholdHours = 3,
    $AutoRecover = $true,
    $AutoUpdateScript = $true
)

Add-Type -AssemblyName System.Security

$doAutoRecover = ($AutoRecover -eq $true -or $AutoRecover -eq "true" -or $AutoRecover -eq 1 -or $AutoRecover -eq "1")
$doAutoUpdateScript = ($AutoUpdateScript -eq $true -or $AutoUpdateScript -eq "true" -or $AutoUpdateScript -eq 1 -or $AutoUpdateScript -eq "1")

# 0. Sincronizacao / Auto-Update do proprio script do Auditor via GitHub
if ($doAutoUpdateScript -and $MyInvocation.MyCommand.Path) {
    try {
        $rawUrl = "https://raw.githubusercontent.com/CleberSGoncalves/Monitor_Servicos/main/Auditar_E_Recuperar_Frota.ps1"
        $remoteCode = Invoke-RestMethod -Uri $rawUrl -Headers @{ "User-Agent" = "DNA-Auditor" } -TimeoutSec 8
        $currentCode = Get-Content -Path $MyInvocation.MyCommand.Path -Raw
        if ($remoteCode -and $remoteCode.Length -gt 500 -and $remoteCode.Trim() -ne $currentCode.Trim()) {
            Write-Host "[Self-Update] Nova versao do script do Auditor detectada no GitHub. Atualizando..." -ForegroundColor Yellow
            [System.IO.File]::WriteAllText($MyInvocation.MyCommand.Path, $remoteCode, [System.Text.Encoding]::UTF8)
            Write-Host "[Self-Update] Script atualizado com sucesso! Reiniciando execucao com o novo codigo..." -ForegroundColor Green
            & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $MyInvocation.MyCommand.Path -ServiceName $ServiceName -TargetVersion $TargetVersion -OfflineThresholdHours $OfflineThresholdHours -AutoRecover "true" -AutoUpdateScript "false"
            exit 0
        }
    } catch { }
}

# 1. Resolucao Automatica da Versao Alvo via GitHub Releases
if ([string]::IsNullOrWhiteSpace($TargetVersion) -or $TargetVersion -eq "latest") {
    try {
        $ghRepo = if ($ServiceName.Contains("/")) { $ServiceName } else { "CleberSGoncalves/$ServiceName" }
        $ghApiUrl = "https://api.github.com/repos/$ghRepo/releases/latest"
        $ghResp = Invoke-RestMethod -Uri $ghApiUrl -Headers @{ "User-Agent" = "DNA-Auditor" } -TimeoutSec 10
        if ($ghResp.tag_name) {
            $TargetVersion = $ghResp.tag_name.TrimStart('v', 'V')
        }
    } catch {
        $TargetVersion = "1.0.13.1"
    }
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " [DNA Fleet] WATCHDOG E AUDITOR INTELIGENTE DA FROTA" -ForegroundColor Cyan
Write-Host " Servico: $ServiceName | Versao Alvo: $TargetVersion" -ForegroundColor Yellow
Write-Host " Limite Offline: $OfflineThresholdHours horas | Auto-Recuperacao: $doAutoRecover" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan

# 2. Autenticacao SPN no Microsoft Graph
$rawSecret = "ENC:pmGCK1dfa+FaAQAtlvRow3fpazdGco1b5BlFcuBrkhvGnneyKLXk93FsMzUJZWE6Hcy2YtNVIgn+70DsqWJP8g=="
$base64 = $rawSecret.Substring(4)
$rawBytes = [Convert]::FromBase64String($base64)
$key = [System.Text.Encoding]::UTF8.GetBytes("DNA_MONITOR_FLEET_SEC_2026_ADGBL")
$iv = New-Object byte[] 16
[Array]::Copy($rawBytes, 0, $iv, 0, 16)
$cipher = New-Object byte[] ($rawBytes.Length - 16)
[Array]::Copy($rawBytes, 16, $cipher, 0, $cipher.Length)

$aes = [System.Security.Cryptography.Aes]::Create()
$aes.Key = $key
$aes.IV = $iv
$secret = [System.Text.Encoding]::UTF8.GetString($aes.CreateDecryptor().TransformFinalBlock($cipher, 0, $cipher.Length))

$tenantId = "b2767241-fab5-454b-8b62-f6324650e316"
$clientId = "0a8faad1-6f41-4b6f-ac0d-d18399b4e9dc"

function Get-GraphHeaders {
    $tokenResp = Invoke-RestMethod -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" -Method Post -Body @{
        grant_type = "client_credentials"
        client_id = $clientId
        client_secret = $secret
        scope = "https://graph.microsoft.com/.default"
    }
    return @{ 
        "Authorization" = "Bearer $($tokenResp.access_token)"
        "Content-Type" = "application/json"
        "Accept" = "application/json" 
    }
}

$siteId = "adgbl.sharepoint.com,a3e49747-9bb6-4c93-9930-dda26c8d1050,34c8fe55-2cfe-4efc-8ce0-2958fd775ee0"
$listId = "2e2afc16-dfd6-4277-a16c-cd78bdd2e769"

$headers = Get-GraphHeaders

# 3. Carregar Itens da Frota
Write-Host ""
Write-Host "[Passo 1/3] Consultando inventario no SharePoint..." -ForegroundColor Cyan

$allItems = @()
$nextUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items?expand=fields&`$top=500"

while ($nextUrl) {
    try {
        $resp = Invoke-RestMethod -Uri $nextUrl -Headers $headers
        if ($resp.value) { $allItems += $resp.value }
        $nextUrl = $resp.'@odata.nextLink'
    } catch {
        Write-Host "Erro ao consultar lista: $($_.Exception.Message)" -ForegroundColor Red
        break
    }
}

$matchingItems = $allItems | Where-Object {
    $_.fields.Nome_Servico -and (
        $_.fields.Nome_Servico -eq $ServiceName -or
        $_.fields.Nome_Servico -eq "DNA.$ServiceName" -or
        $_.fields.Nome_Servico.Replace(" ", "").ToLower() -eq $ServiceName.Replace(" ", "").ToLower()
    )
}

Write-Host "Total de estacoes encontradas para '$ServiceName': $($matchingItems.Count)" -ForegroundColor Green

if ($matchingItems.Count -eq 0) {
    Write-Host "Nenhuma estacao localizada para '$ServiceName'." -ForegroundColor Yellow
    exit 0
}

# 4. Funcao para buscar erro recente no log do SharePoint Drive
function Get-LatestLogError {
    param([string]$Hostname, [string]$Srv)
    try {
        $cleanSrv = if ($Srv.StartsWith("DNA.")) { $Srv } else { "DNA.$Srv" }
        $fileName = $Hostname + "_" + $cleanSrv + "_agent_log.txt"
        $fileUrl = "https://graph.microsoft.com/v1.0/sites/" + $siteId + "/drive/root:/Logs_Agentes/" + $fileName + ":/content"
        $logContent = Invoke-RestMethod -Uri $fileUrl -Headers $headers
        if ($logContent) {
            $lines = $logContent -split "`n"
            $errLines = $lines | Where-Object { $_ -match "\[ERRO\]|Exception|Fatal" }
            if ($errLines) {
                $lastErr = ($errLines | Select-Object -Last 1).Trim()
                if ($lastErr.Length > 90) { $lastErr = $lastErr.Substring(0, 90) + "..." }
                return $lastErr
            }
        }
    } catch { }
    return ""
}

# 5. Auditoria e Diagnostico
Write-Host ""
Write-Host "[Passo 2/3] Diagnosticando saude e versoes de cada maquina..." -ForegroundColor Cyan

$now = [DateTime]::UtcNow
$auditReport = @()
$manualUpdateList = @()
$recoveredList = @()
$upToDateCount = 0

foreach ($item in $matchingItems) {
    $itemId = $item.id
    $hName = $item.fields.Hostname
    $praca = $item.fields.Pra_x00e7_a
    $instVer = $item.fields.Versao_Instalada
    $desVer = $item.fields.Versao_Desejada
    $srvStatus = $item.fields.Status_Servico
    $updStatus = $item.fields.Status_Atualizacao
    $acao = $item.fields.Acao_Solicitada
    $lastRaw = $item.fields.Ultima_atualizacao

    $lastDate = if ($lastRaw) { [DateTime]::Parse($lastRaw).ToUniversalTime() } else { [DateTime]::MinValue }
    $diffHours = if ($lastDate -gt [DateTime]::MinValue) { ($now - $lastDate).TotalHours } else { 9999 }

    $isOffline = ($diffHours -gt $OfflineThresholdHours)
    $isUpToDate = ($instVer -eq $TargetVersion)
    $isServiceRunning = ($srvStatus -like "*Execu*" -or $srvStatus -like "*Instalad*")
    $isServiceStopped = -not $isServiceRunning
    $isError = ($updStatus -like "*Erro*" -or $srvStatus -like "*Erro*")

    $diagnostico = "OK"
    $recomendacao = "Nenhuma"

    if ($isUpToDate) {
        $upToDateCount++
        $diagnostico = "Atualizado ($instVer)"
    }
    elseif ($isOffline) {
        $hoursStr = [Math]::Round($diffHours, 1)
        $diagnostico = "OFFLINE (Sem telemetria ha $hoursStr horas)"
        $recomendacao = "Necessário Update Manual"
    }
    elseif ($isServiceStopped) {
        $diagnostico = "SERVICO PARADO ($srvStatus)"
        $recomendacao = "Necessário Update Manual"
    }
    elseif ($isError) {
        $logErr = Get-LatestLogError -Hostname $hName -Srv $ServiceName
        $diagnostico = if ($logErr) { "FALHA NO AGENTE ($logErr)" } else { "FALHA RECENTE NA ATUALIZACAO" }
        $recomendacao = "Necessário Update Manual"
    }
    else {
        $diagnostico = "DESATUALIZADO (Online, versao $instVer)"
        if ($updStatus -eq "Em Progresso") {
            $diagnostico = "EM PROGRESSO (Agente executando atualizacao)"
            $recomendacao = "Aguardar Ciclo"
        } else {
            $recomendacao = "Auto-Recuperacao"
        }
    }

    $entry = [PSCustomObject]@{
        Hostname = $hName
        Praca = $praca
        Instalada = $instVer
        Status_Servico = $srvStatus
        Status_Atualizacao = $updStatus
        Diagnostico = $diagnostico
        Acao = $recomendacao
        Id = $itemId
    }
    $auditReport += $entry
}

# 6. Execucao de Remediacao e Classificacao
Write-Host ""
Write-Host "[Passo 3/3] Aplicando acoes de remediacao e isolamento..." -ForegroundColor Cyan

foreach ($item in $auditReport) {
    $itemId = $item.Id
    $hName = $item.Hostname

    if ($item.Acao -eq "Necessário Update Manual") {
        if ($item.Status_Atualizacao -ne "Necessário Update Manual") {
            try {
                $patchBody = @{
                    Status_Atualizacao = "Necessário Update Manual"
                    Acao_Solicitada = "Nenhuma"
                    Ultima_atualizacao = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                } | ConvertTo-Json

                $patchUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items/$itemId/fields"
                Invoke-RestMethod -Uri $patchUrl -Method Patch -Headers $headers -Body $patchBody | Out-Null
                Write-Host "  [MANUAL] $hName -> Marcado como 'Necessario Update Manual' ($($item.Diagnostico))" -ForegroundColor Red
            } catch {
                Write-Host "  [ERRO] Falha ao atualizar $hName`: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        $manualUpdateList += $item
    }
    elseif ($item.Acao -eq "Auto-Recuperacao" -and $doAutoRecover) {
        try {
            $patchBody = @{
                Versao_Desejada = $TargetVersion
                Status_Atualizacao = "Desatualizado"
                Acao_Solicitada = "Atualizar"
                Ultima_atualizacao = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            } | ConvertTo-Json

            $patchUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items/$itemId/fields"
            Invoke-RestMethod -Uri $patchUrl -Method Patch -Headers $headers -Body $patchBody | Out-Null
            Write-Host "  [RECOVER] $hName -> Disparada Auto-Recuperacao para versao $TargetVersion" -ForegroundColor Yellow
            $recoveredList += $item
        } catch {
            Write-Host "  [ERRO] Falha ao disparar recuperacao para $hName`: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# 7. Relatorio Final Formatado
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " RELATORIO CONSOLIDADO DA AUDITORIA DA FROTA" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Total de Maquinas na Frota: $($auditReport.Count)"
Write-Host " [OK] Atualizadas na Versao $TargetVersion`: $upToDateCount" -ForegroundColor Green
Write-Host " [ANDAMENTO] Em Auto-Recuperacao / Progresso: $($recoveredList.Count)" -ForegroundColor Yellow
Write-Host " [MANUAL] Requerem Update Manual (Isoladas com seguranca): $($manualUpdateList.Count)" -ForegroundColor Red
Write-Host "==================================================================" -ForegroundColor Cyan

if ($manualUpdateList.Count -gt 0) {
    Write-Host ""
    Write-Host "Maquinas que precisam de intervencao manual:" -ForegroundColor Yellow
    $manualUpdateList | Select-Object Hostname, Praca, Instalada, Status_Servico, Diagnostico | Format-Table -AutoSize
}
