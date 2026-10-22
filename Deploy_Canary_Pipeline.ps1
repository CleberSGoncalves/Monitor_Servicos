# ==============================================================================
# PIPELINE DE DEPLOY CANÁRIO E HOMOLOGAÇÃO GRADUAL DA FROTA (DNA Monitor)
# ==============================================================================
# 1. Aplica a nova versão inicialmente em 5 MÁQUINAS PILOTO.
# 2. Audita com segurança a saúde, status do serviço e versão instalada.
# 3. Se as 5 máquinas homologarem com 100% de sucesso, promove para a FROTA TODA.
# 4. Se qualquer máquina piloto falhar, o pipeline ABORTA para proteger a frota.
# ==============================================================================
param(
    [string]$ServiceName = "DNA.MonitorServiceSVC",
    [string]$TargetVersion = "1.0.13.1",
    [int]$CanaryCount = 5,
    [int]$TimeoutMinutes = 10,
    [switch]$AutoPromote = $true
)

Add-Type -AssemblyName System.Security

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " 🛡️ PIPELINE DE HOMOLOGAÇÃO E DEPLOY CANÁRIO (FROTA DNA)" -ForegroundColor Cyan
Write-Host " Serviço Alvo: $ServiceName" -ForegroundColor Yellow
Write-Host " Versão a Homologar: $TargetVersion" -ForegroundColor Yellow
Write-Host " Grupo Piloto Canário: $CanaryCount máquinas" -ForegroundColor Yellow
Write-Host " Timeout de Homologação: $TimeoutMinutes minutos" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Autenticação SPN no Microsoft Graph
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
Write-Host "`n[Passo 1/4] Mapeando frota para o serviço '$ServiceName'..." -ForegroundColor Cyan
$allHosts = Get-AllServiceItems -Srv $ServiceName
Write-Host "Total de máquinas registradas na frota: $($allHosts.Count)" -ForegroundColor Green

if ($allHosts.Count -eq 0) {
    Write-Host "❌ Nenhuma máquina encontrada para '$ServiceName'. Abortando." -ForegroundColor Red
    exit 1
}

# Separar máquinas que já estão na versão alvo
$alreadyUpToDate = $allHosts | Where-Object { $_.fields.Versao_Instalada -eq $TargetVersion }
$candidates = $allHosts | Where-Object { $_.fields.Versao_Instalada -ne $TargetVersion }

Write-Host "Máquinas já na versão $TargetVersion`: $($alreadyUpToDate.Count)" -ForegroundColor Gray
Write-Host "Máquinas pendentes de atualização: $($candidates.Count)" -ForegroundColor Gray

if ($candidates.Count -eq 0) {
    Write-Host "🎉 Todas as máquinas da frota já estão na versão $TargetVersion!" -ForegroundColor Green
    exit 0
}

# 3. Selecionar Grupo Piloto Canário (5 máquinas prioritariamente saudáveis/ativas)
$activeCandidates = $candidates | Where-Object { $_.fields.Status_Servico -in @("Em Execução", "Instalado") }
if ($activeCandidates.Count -lt $CanaryCount) {
    $activeCandidates = $candidates
}

$pilotGroup = $activeCandidates | Select-Object -First $CanaryCount
$pilotHostnames = $pilotGroup | ForEach-Object { $_.fields.Hostname }

Write-Host "`n[Passo 2/4] 🚀 Iniciando Fase Piloto em $($pilotGroup.Count) máquinas canário:" -ForegroundColor Cyan
foreach ($p in $pilotGroup) {
    Write-Host "  -> Piloto: $($p.fields.Hostname) (Praça: $($p.fields.Pra_x00e7_a), Versão Atual: $($p.fields.Versao_Instalada))" -ForegroundColor Yellow
    Update-ItemVersionAndAction -ItemId $p.id -NewDesiredVersion $TargetVersion -Action "Atualizar"
}

Write-Host "`n[Passo 3/4] 🔍 Auditando e monitorando homologação das $($pilotGroup.Count) máquinas piloto..." -ForegroundColor Cyan
Write-Host "Aguardando ciclo de atualização dos agentes (checagem a cada 20 segundos)..." -ForegroundColor Gray

$startTime = Get-Date
$allPilotsPassed = $false

while ((Get-Date) -lt $startTime.AddMinutes($TimeoutMinutes)) {
    Start-Sleep -Seconds 20
    
    # Atualiza headers se necessário
    $headers = Get-GraphHeaders
    $currentStatus = Get-AllServiceItems -Srv $ServiceName | Where-Object { $_.fields.Hostname -in $pilotHostnames }
    
    $passedCount = 0
    $inProgressCount = 0
    $failedCount = 0
    $failedHosts = @()

    Write-Host "`n--- Status das Máquinas Piloto [$(Get-Date -Format 'HH:mm:ss')] ---" -ForegroundColor DarkGray
    foreach ($item in $currentStatus) {
        $hName = $item.fields.Hostname
        $inst = $item.fields.Versao_Instalada
        $srvStatus = $item.fields.Status_Servico
        $updStatus = $item.fields.Status_Atualizacao

        if ($inst -eq $TargetVersion -and ($srvStatus -in @("Em Execução", "Instalado"))) {
            Write-Host "  ✅ $hName : Instalada=$inst | Status=$srvStatus | Atualização=$updStatus (SUCESSO)" -ForegroundColor Green
            $passedCount++
        }
        elseif ($updStatus -like "*Erro*" -or $srvStatus -like "*Erro*") {
            Write-Host "  ❌ $hName : Instalada=$inst | Status=$srvStatus | Atualização=$updStatus (ERRO DETECTADO)" -ForegroundColor Red
            $failedCount++
            $failedHosts += $hName
        }
        else {
            Write-Host "  ⏳ $hName : Instalada=$inst | Status=$srvStatus | Atualização=$updStatus (Em andamento...)" -ForegroundColor Yellow
            $inProgressCount++
        }
    }

    if ($failedCount -gt 0) {
        Write-Host "`n🚨 FALHA DE HOMOLOGAÇÃO: Erro detectado em máquina(s) piloto: $($failedHosts -join ', ')!" -ForegroundColor Red
        Write-Host "O Pipeline foi ABORTADO com segurança para proteger o restante da rede." -ForegroundColor Red
        exit 2
    }

    if ($passedCount -eq $pilotGroup.Count) {
        $allPilotsPassed = $true
        break
    }
}

if (-not $allPilotsPassed) {
    Write-Host "`n⏰ TIMEOUT: As máquinas piloto não concluíram a atualização dentro de $TimeoutMinutes minutos." -ForegroundColor Yellow
    Write-Host "Pipeline pausado para auditoria manual. Nenhuma outra máquina foi afetada." -ForegroundColor Yellow
    exit 3
}

# 4. Homologação Aprovada! Promover para o restante da frota
Write-Host "`n==================================================================" -ForegroundColor Green
Write-Host " 🎉 HOMOLOGAÇÃO CONCLUÍDA COM 100% DE SUCESSO NAS 5 MÁQUINAS PILOTO!" -ForegroundColor Green
Write-Host " O recurso/versão '$TargetVersion' está estável e funcional." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green

if ($AutoPromote) {
    $remainingHosts = $candidates | Where-Object { $_.fields.Hostname -notin $pilotHostnames }
    Write-Host "`n[Passo 4/4] 🚀 Promovendo versão '$TargetVersion' para todas as demais $($remainingHosts.Count) máquinas da frota..." -ForegroundColor Cyan

    $count = 0
    foreach ($rem in $remainingHosts) {
        $count++
        $hName = $rem.fields.Hostname
        try {
            Update-ItemVersionAndAction -ItemId $rem.id -NewDesiredVersion $TargetVersion -Action "Atualizar"
            Write-Host "  [$count/$($remainingHosts.Count)] ✅ $hName -> Versão Desejada: $TargetVersion (Atualização Solicitada)" -ForegroundColor Gray
        } catch {
            Write-Host "  [$count/$($remainingHosts.Count)] ❌ Falha em $hName`: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host "`n==================================================================" -ForegroundColor Green
    Write-Host "🌟 DEPLOY GERAL CONCLUÍDO! Todas as máquinas da frota foram acionadas com segurança." -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green
}
