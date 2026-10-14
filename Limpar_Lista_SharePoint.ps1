# ==============================================================================
# Script de Limpeza Total da Lista do SharePoint (Painel de gestão de serviços dos CS)
# ==============================================================================

$tenantId = "b2767241-fab5-454b-8b62-f6324650e316"
$clientId = "1950a258-227b-4e31-a9cf-717495945fc2"

Write-Host "Iniciando solicitacao de autenticacao no Entra ID..." -ForegroundColor Cyan

try {
    $deviceReq = Invoke-RestMethod -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/devicecode" -Method Post -Body @{
        client_id = $clientId
        scope = "https://graph.microsoft.com/.default"
    }
} catch {
    Write-Host "Erro ao solicitar Device Code: $($_.Exception.Message)" -ForegroundColor Red
    pause
    exit 1
}

$userCode = $deviceReq.user_code
$url = $deviceReq.verification_uri

# Copiar codigo para area de transferencia
try { Set-Clipboard -Value $userCode } catch {}

# Abrir navegador automaticamente
try { Start-Process $url } catch {}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Yellow
Write-Host " NAVEGADOR ABERTO EM: $url" -ForegroundColor Yellow
Write-Host " CODIGO DE AUTENTICACAO: $userCode" -ForegroundColor Green
Write-Host " (O codigo tambem foi copiado para a sua area de transferencia!)" -ForegroundColor Gray
Write-Host "==========================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Aguardando voce concluir a autenticacao no navegador..." -ForegroundColor Cyan

$tokenUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"
$tokenBody = @{
    grant_type = "urn:ietf:params:oauth:grant-type:device_code"
    client_id = $clientId
    device_code = $deviceReq.device_code
}

$token = $null
$interval = [int]$deviceReq.interval
if ($interval -le 0) { $interval = 5 }
$expiresAt = (Get-Date).AddSeconds([int]$deviceReq.expires_in)

while ((Get-Date) -lt $expiresAt) {
    Start-Sleep -Seconds $interval
    try {
        $tokenResp = Invoke-RestMethod -Uri $tokenUrl -Method Post -Body $tokenBody -ErrorAction Stop
        $token = $tokenResp.access_token
        Write-Host "`n[SUCESSO] Autenticado com sucesso!" -ForegroundColor Green
        break
    } catch {
        try {
            $err = $_.ErrorDetails.Message | ConvertFrom-Json
            if ($err.error -eq "authorization_pending") {
                Write-Host "." -NoNewline -ForegroundColor Gray
            } else {
                Write-Host "`nErro na autenticacao: $($err.error_description)" -ForegroundColor Red
                break
            }
        } catch {
            Write-Host "." -NoNewline -ForegroundColor Gray
        }
    }
}

if (-not $token) {
    Write-Host "`nNao foi possivel obter o token de acesso (expirado ou cancelado)." -ForegroundColor Red
    pause
    exit 1
}

$headers = @{ Authorization = "Bearer $token" }

Write-Host "`nConectando ao SharePoint via Microsoft Graph API..." -ForegroundColor Cyan

# Obter ID do Site e Lista
try {
    $siteUrl = "https://graph.microsoft.com/v1.0/sites/adgbl.sharepoint.com:/sites/suportecaptacao"
    $site = Invoke-RestMethod -Uri $siteUrl -Headers $headers
    $siteId = $site.id

    $listsUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists"
    $lists = Invoke-RestMethod -Uri $listsUrl -Headers $headers
    $list = $lists.value | Where-Object { $_.displayName -eq "Painel de gestão de serviços dos CS" }
    $listId = $list.id

    Write-Host "Site ID: $siteId" -ForegroundColor Gray
    Write-Host "Lista ID: $listId" -ForegroundColor Gray
} catch {
    Write-Host "Erro ao consultar metadados da lista: $($_.Exception.Message)" -ForegroundColor Red
    pause
    exit 1
}

# Buscar todos os itens (paginados)
Write-Host "`nBuscando todos os itens da lista..." -ForegroundColor Cyan
$allItems = @()
$nextUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items?expand=fields`&$top=500"

while ($nextUrl) {
    $resp = Invoke-RestMethod -Uri $nextUrl -Headers $headers
    $allItems += $resp.value
    $nextUrl = $resp.'@odata.nextLink'
}

Write-Host "Total de itens encontrados na lista: $($allItems.Count)" -ForegroundColor Yellow

if ($allItems.Count -eq 0) {
    Write-Host "`n[OK] A lista ja esta 100% vazia!" -ForegroundColor Green
    pause
    exit 0
}

Write-Host "`nIniciando exclusao item por item..." -ForegroundColor Cyan
$count = 0
foreach ($item in $allItems) {
    $itemId = $item.id
    $delUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items/$itemId"
    try {
        Invoke-RestMethod -Uri $delUrl -Method Delete -Headers $headers
        $count++
        Write-Host "[$count/$($allItems.Count)] Excluido item ID: $itemId" -ForegroundColor Green
    } catch {
        Write-Host "Erro ao excluir item ID $itemId : $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n==========================================================================" -ForegroundColor Green
Write-Host " CONCLUIDO! $count de $($allItems.Count) itens foram excluidos da lista." -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
pause
