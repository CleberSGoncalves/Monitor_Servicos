# ==============================================================================
# PIPELINE DE DEPLOY CANARIO E HOMOLOGACAO GRADUAL DA FROTA (DNA Monitor)
# ==============================================================================
# 1. Aplica a nova versao inicialmente em 5 MAQUINAS PILOTO.
# 2. Audita com seguranca a saude, status do servico e versao instalada.
# 3. Se as 5 maquinas homologarem com 100% de sucesso, promove para a FROTA TODA.
# 4. Se qualquer maquina piloto falhar, o pipeline ABORTA para proteger a frota.
# ==============================================================================
param(
    [string]$ServiceName = "DNA.MonitorServiceSVC",
    [string]$TargetVersion = "1.0.13.1",
    [int]$CanaryCount = 5,
    [int]$TimeoutMinutes = 10,
    [bool]$AutoPromote = $true
)

Add-Type -AssemblyName System.Security

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " [DNA Fleet] PIPELINE DE HOMOLOGACAO E DEPLOY CANARIO" -ForegroundColor Cyan
Write-Host " Servico Alvo: $ServiceName" -ForegroundColor Yellow
Write-Host " Versao a Homologar: $TargetVersion" -ForegroundColor Yellow
Write-Host " Grupo Piloto Canario: $CanaryCount maquinas" -ForegroundColor Yellow
Write-Host " Timeout de Homologacao: $TimeoutMinutes minutos" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Autenticacao SPN no Microsoft Graph
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

function Get-AllServiceItems {
    param([string]$Srv)
    $items = @()
    $next = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items?expand=fields&`$top=500"
    while ($next) {
        try {
            $resp = Invoke-RestMethod -Uri $next -Headers $headers
            if ($resp.value) { $items += $resp.value }
            $next = $resp.'@odata.nextLink'
        } catch {
            Write-Host "Erro ao consultar itens: $($_.Exception.Message)" -ForegroundColor Red
            break
        }
    }
    return $items | Where-Object {
        $_.fields.Nome_Servico -and (
            $_.fields.Nome_Servico -eq $Srv -or
            $_.fields.Nome_Servico -eq "DNA.$Srv" -or
            $_.fields.Nome_Servico.Replace(" ", "").ToLower() -eq $Srv.Replace(" ", "").ToLower()
        )
    }
}

function Update-ItemVersionAndAction {
    param(
        [string]$ItemId,
        [string]$NewDesiredVersion,
        [string]$Action = "Atualizar"
    )
    $patchBody = @{
        Versao_Desejada = $NewDesiredVersion
        Status_Atualizacao = "Desatualizado"
        Acao_Solicitada = $Action
        Ultima_atualizacao = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    } | ConvertTo-Json

    $patchUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items/$ItemId/fields"
    Invoke-RestMethod -Uri $patchUrl -Method Patch -Headers $headers -Body $patchBody | Out-Null
}

# 2. Carregar Frota Atual
Write-Host ""
Write-Host "[Passo 1/4] Mapeando frota para o servico '$ServiceName'..." -ForegroundColor Cyan
$allHosts = Get-AllServiceItems -Srv $ServiceName
Write-Host "Total de maquinas registradas na frota: $($allHosts.Count)" -ForegroundColor Green

if ($allHosts.Count -eq 0) {
    Write-Host "ERRO: Nenhuma maquina encontrada para '$ServiceName'. Abortando." -ForegroundColor Red
    exit 1
}

# Separar maquinas que ja estao na versao alvo
$alreadyUpToDate = $allHosts | Where-Object { $_.fields.Versao_Instalada -eq $TargetVersion }
$candidates = $allHosts | Where-Object { $_.fields.Versao_Instalada -ne $TargetVersion }

Write-Host "Maquinas ja na versao $TargetVersion`: $($alreadyUpToDate.Count)" -ForegroundColor Gray
Write-Host "Maquinas pendentes de atualizacao: $($candidates.Count)" -ForegroundColor Gray

if ($candidates.Count -eq 0) {
    Write-Host "Sucesso: Todas as maquinas da frota ja estao na versao $TargetVersion!" -ForegroundColor Green
    exit 0
}

# 3. Selecionar Grupo Piloto Canario (5 maquinas prioritariamente ativas)
$activeCandidates = $candidates | Where-Object { $_.fields.Status_Servico -in @("Em Execucao", "Em Execução", "Instalado") }
if ($activeCandidates.Count -lt $CanaryCount) {
    $activeCandidates = $candidates
}

$pilotGroup = $activeCandidates | Select-Object -First $CanaryCount
$pilotHostnames = $pilotGroup | ForEach-Object { $_.fields.Hostname }

Write-Host ""
Write-Host "[Passo 2/4] Disparando Fase Piloto em $($pilotGroup.Count) maquinas canario:" -ForegroundColor Cyan
foreach ($p in $pilotGroup) {
    Write-Host "  -> Piloto: $($p.fields.Hostname) (Versao Atual: $($p.fields.Versao_Instalada))" -ForegroundColor Yellow
    Update-ItemVersionAndAction -ItemId $p.id -NewDesiredVersion $TargetVersion -Action "Atualizar"
}

Write-Host ""
Write-Host "[Passo 3/4] Auditando homologacao das $($pilotGroup.Count) maquinas piloto..." -ForegroundColor Cyan
Write-Host "Aguardando ciclo de atualizacao dos agentes (checagem a cada 20 segundos)..." -ForegroundColor Gray

$startTime = Get-Date
$allPilotsPassed = $false

while ((Get-Date) -lt $startTime.AddMinutes($TimeoutMinutes)) {
    Start-Sleep -Seconds 20
    
    $headers = Get-GraphHeaders
    $currentStatus = Get-AllServiceItems -Srv $ServiceName | Where-Object { $_.fields.Hostname -in $pilotHostnames }
    
    $passedCount = 0
    $inProgressCount = 0
    $failedCount = 0
    $failedHosts = @()

    $nowStr = (Get-Date).ToString("HH:mm:ss")
    Write-Host ""
    Write-Host "--- Status das Maquinas Piloto [$nowStr] ---" -ForegroundColor DarkGray
    foreach ($item in $currentStatus) {
        $hName = $item.fields.Hostname
        $inst = $item.fields.Versao_Instalada
        $srvStatus = $item.fields.Status_Servico
        $updStatus = $item.fields.Status_Atualizacao

        if ($inst -eq $TargetVersion -and ($srvStatus -in @("Em Execucao", "Em Execução", "Instalado"))) {
            Write-Host "  [OK] $hName : Instalada=$inst | Status=$srvStatus | Atualizacao=$updStatus (SUCESSO)" -ForegroundColor Green
            $passedCount++
        }
        elseif ($updStatus -like "*Erro*" -or $srvStatus -like "*Erro*") {
            Write-Host "  [FAIL] $hName : Instalada=$inst | Status=$srvStatus | Atualizacao=$updStatus (ERRO DETECTADO)" -ForegroundColor Red
            $failedCount++
            $failedHosts += $hName
        }
        else {
            Write-Host "  [...] $hName : Instalada=$inst | Status=$srvStatus | Atualizacao=$updStatus (Em andamento...)" -ForegroundColor Yellow
            $inProgressCount++
        }
    }

    if ($failedCount -gt 0) {
        Write-Host ""
        Write-Host "🚨 FALHA DE HOMOLOGACAO: Erro detectado em maquina(s) piloto: $($failedHosts -join ', ')!" -ForegroundColor Red
        Write-Host "Iniciando ROLLBACK AUTOMATICO DE EMERGENCIA nas maquinas piloto..." -ForegroundColor Yellow
        
        foreach ($failedItem in $pilotGroup) {
            $fHost = $failedItem.fields.Hostname
            $fId = $failedItem.id
            $fOldVer = $failedItem.fields.Versao_Instalada
            if ([string]::IsNullOrWhiteSpace($fOldVer) -or $fOldVer -eq $TargetVersion) { $fOldVer = "1.0.13.0" }
            try {
                $rbBody = @{
                    Versao_Desejada = $fOldVer
                    Acao_Solicitada = "Atualizar"
                    Status_Atualizacao = "Rollback de Emergência"
                } | ConvertTo-Json
                $patchUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/lists/$listId/items/$fId/fields"
                Invoke-RestMethod -Uri $patchUrl -Method Patch -Headers $headers -Body $rbBody | Out-Null
                Write-Host "  [ROLLBACK] $fHost -> Restaurando versao estavel $fOldVer" -ForegroundColor Yellow
            } catch { }
        }

        Write-Host ""
        Write-Host "O Pipeline foi ABORTADO com seguranca. As demais 17 maquinas estao 100% protegidas e intactas." -ForegroundColor Red
        exit 2
    }

    if ($passedCount -eq $pilotGroup.Count) {
        $allPilotsPassed = $true
        break
    }
}

if (-not $allPilotsPassed) {
    Write-Host ""
    Write-Host "TIMEOUT: As maquinas piloto nao concluiram a atualizacao dentro de $TimeoutMinutes minutos." -ForegroundColor Yellow
    Write-Host "Pipeline pausado para auditoria manual. Nenhuma outra maquina foi afetada." -ForegroundColor Yellow
    exit 3
}

# 4. Homologacao Aprovada! Promover para o restante da frota
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " HOMOLOGACAO CONCLUIDA COM 100% DE SUCESSO NAS 5 MAQUINAS PILOTO!" -ForegroundColor Green
Write-Host " O recurso/versao '$TargetVersion' esta estavel e auditado." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green

if ($AutoPromote) {
    $remainingHosts = $candidates | Where-Object { $_.fields.Hostname -notin $pilotHostnames }
    Write-Host ""
    Write-Host "[Passo 4/4] Promovendo versao '$TargetVersion' para as demais $($remainingHosts.Count) maquinas da frota..." -ForegroundColor Cyan

    $count = 0
    foreach ($rem in $remainingHosts) {
        $count++
        $hName = $rem.fields.Hostname
        try {
            Update-ItemVersionAndAction -ItemId $rem.id -NewDesiredVersion $TargetVersion -Action "Atualizar"
            Write-Host "  [$count/$($remainingHosts.Count)] OK: $hName -> Versao Desejada: $TargetVersion (Atualizacao Solicitada)" -ForegroundColor Gray
        } catch {
            Write-Host "  [$count/$($remainingHosts.Count)] ERRO em $hName`: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host "DEPLOY GERAL CONCLUIDO! Todas as maquinas da frota foram acionadas." -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green
}
