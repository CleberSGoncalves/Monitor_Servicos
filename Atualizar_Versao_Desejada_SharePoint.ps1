# ==============================================================================
# Script de Atualizacao Instantanea de Versao Desejada no SharePoint (via SPN)
# Atualiza todas as linhas de um servico em segundos, sem esperar o ciclo das maquinas.
# ==============================================================================
param(
    [string]$ServiceName = "DNA.MonitorServiceSVC",
    [string]$NewVersion = "1.0.13.1"
)

Add-Type -AssemblyName System.Security

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " 🚀 Atualizacao em Massa de Versao Desejada no SharePoint (SPN)" -ForegroundColor Cyan
Write-Host " Servico: $ServiceName | Nova Versao Desejada: $NewVersion" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Descriptografar segredo do SPN
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
$dec = $aes.CreateDecryptor()
$plain = $dec.TransformFinalBlock($cipher, 0, $cipher.Length)
$secret = [System.Text.Encoding]::UTF8.GetString($plain)

$tenantId = "b2767241-fab5-454b-8b62-f6324650e316"
$clientId = "0a8faad1-6f41-4b6f-ac0d-d18399b4e9dc"

# 2. Obter Token no Microsoft Graph via SPN
Write-Host "[1/3] Autenticando via Service Principal (SPN)..." -ForegroundColor Cyan
$tokenResp = Invoke-RestMethod -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" -Method Post -Body @{
    grant_type = "client_credentials"
    client_id = $clientId
    client_secret = $secret
    scope = "https://graph.microsoft.com/.default"
}

$token = $tokenResp.access_token
$headers = @{ 
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "Accept" = "application/json" 
}

# IDs oficiais do SharePoint e da Lista
$siteId = "adgbl.sharepoint.com,a3e49747-9bb6-4c93-9930-dda26c8d1050,34c8fe55-2cfe-4efc-8ce0-2958fd775ee0"
$listId = "2e2afc16-dfd6-4277-a16c-cd78bdd2e769"

Write-Host "[2/3] Buscando registros de '$ServiceName' na lista do SharePoint..." -ForegroundColor Cyan

$allItems = @()
$nextUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items?expand=fields&`$top=500"

while ($nextUrl) {
    try {
        $resp = Invoke-RestMethod -Uri $nextUrl -Headers $headers
        if ($resp.value) {
            $allItems += $resp.value
        }
        $nextUrl = $resp.'@odata.nextLink'
    } catch {
        Write-Host "Erro ao consultar lista: $($_.Exception.Message)" -ForegroundColor Red
        break
    }
}

Write-Host "Total de itens carregados da lista: $($allItems.Count)" -ForegroundColor Gray

# Filtra pelo servico especificado
$matchingItems = $allItems | Where-Object {
    $_.fields.Nome_Servico -and (
        $_.fields.Nome_Servico -eq $ServiceName -or
        $_.fields.Nome_Servico -eq "DNA.$ServiceName" -or
        $_.fields.Nome_Servico.Replace(" ", "").ToLower() -eq $ServiceName.Replace(" ", "").ToLower()
    )
}

Write-Host "Total de estacoes encontradas para '$ServiceName': $($matchingItems.Count)" -ForegroundColor Green

if ($matchingItems.Count -eq 0) {
    Write-Host "Nenhum registro encontrado para '$ServiceName'." -ForegroundColor Yellow
    exit 0
}

# 3. Atualizar Versao_Desejada em cada linha
Write-Host "[3/3] Aplicando Versao_Desejada = '$NewVersion'..." -ForegroundColor Cyan
$count = 0
$updated = 0
$alreadyCurrent = 0

foreach ($item in $matchingItems) {
    $count++
    $itemId = $item.id
    $hostName = $item.fields.Hostname
    $currentInstalled = $item.fields.Versao_Instalada
    $currentDesired = $item.fields.Versao_Desejada

    # Se ja estiver com a versao desejada correta, pula
    if ($currentDesired -eq $NewVersion) {
        $alreadyCurrent++
        Write-Host "  [$count/$($matchingItems.Count)] ⏩ $hostName ja esta com Versao Desejada = $NewVersion" -ForegroundColor DarkGray
        continue
    }

    $isUpToDate = ($currentInstalled -eq $NewVersion)
    $statusAtualizacao = if ($isUpToDate) { "Atualizado" } else { "Desatualizado" }

    $patchBody = @{
        Versao_Desejada = $NewVersion
        Status_Atualizacao = $statusAtualizacao
        Ultima_atualizacao = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    } | ConvertTo-Json

    $patchUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items/$itemId/fields"
    try {
        Invoke-RestMethod -Uri $patchUrl -Method Patch -Headers $headers -Body $patchBody | Out-Null
        $updated++
        Write-Host "  [$count/$($matchingItems.Count)] ✅ $hostName -> Versao Desejada: $NewVersion ($statusAtualizacao)" -ForegroundColor Green
    } catch {
        Write-Host "  [$count/$($matchingItems.Count)] ❌ Erro ao atualizar $hostName`: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host "🎉 Concluido! $updated estacoes atualizadas para '$NewVersion' ($alreadyCurrent ja estavam atualizadas)." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
