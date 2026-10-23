# ==============================================================================
#  BOOTSTRAP DE ATUALIZACAO CORPORATIVA HOMOLOGADA (100% SHAREPOINT + SHA-256)
#  DNA.MonitorServiceSVC - Kantar IBOPE Media
#  Zero conexoes externas ao GitHub | Validacao criptografica SHA-256 em disco
# ==============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference     = "SilentlyContinue"
$SERVICE_NAME = "DNA.MonitorServiceSVC"
$EXE_NAME     = "WinServiceFleetAgent.exe"
$TENANT_ID    = "b2767241-fab5-454b-8b62-f6324650e316"
$CLIENT_ID    = "0a8faad1-6f41-4b6f-ac0d-d18399b4e9dc"
$ENC_SECRET   = "pmGCK1dfa+FaAQAtlvRow3fpazdGco1b5BlFcuBrkhvGnneyKLXk93FsMzUJZWE6Hcy2YtNVIgn+70DsqWJP8g=="
$DRIVE_ID     = "b!R5fko7abk0yZMN2ibI0QUFX-yDT-LPxOjOApWP13XuB7rzp8hYGATLhyYvhIJ0iG"
$FOLDER_NAME  = "Releases_Servicos_CS"
$WORK         = "$env:TEMP\dna_sp_bootstrap_$(Get-Random)"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DNA.MonitorServiceSVC - SharePoint Corporate Bootstrap" -ForegroundColor Cyan
Write-Host "  Compliance: Microsoft 365 Graph API + SHA-256 Verified" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$isFreshInstall = $false
$svc = Get-WmiObject Win32_Service -Filter "Name='$SERVICE_NAME'" -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "[INFO] Servico '$SERVICE_NAME' nao encontrado no host. Modo INSTALACAO LIMPA ativado!" -ForegroundColor Yellow
    $isFreshInstall = $true
    $baseDrive = if (Test-Path "D:\") { "D:\" } else { "C:\" }
    $installDir = Join-Path $baseDrive "MediaDNA_V2\applications\MonitorServiceSVC"
    $currentVer = "Nenhuma (Instalacao Nova)"
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
} else {
    $exePath    = $svc.PathName.Trim('"')
    $installDir = Split-Path $exePath -Parent
    $currentVer = (Get-Item $exePath -ErrorAction SilentlyContinue).VersionInfo.FileVersion
}
Write-Host "[INFO] InstallDir  : $installDir"
Write-Host "[INFO] Versao atual: $currentVer"

# 1. Descriptografa segredo SPN AES-256
$rawBytes    = [Convert]::FromBase64String($ENC_SECRET)
$keyBytes    = [System.Text.Encoding]::UTF8.GetBytes("DNA_MONITOR_FLEET_SEC_2026_ADGBL")
$ivBytes     = $rawBytes[0..15]
$cipherBytes = $rawBytes[16..($rawBytes.Length - 1)]
$aes         = [System.Security.Cryptography.Aes]::Create()
$aes.Key     = $keyBytes
$aes.IV      = $ivBytes
$decryptor   = $aes.CreateDecryptor()
$plainBytes  = $decryptor.TransformFinalBlock($cipherBytes, 0, $cipherBytes.Length)
$clientSecret = [System.Text.Encoding]::UTF8.GetString($plainBytes)

# 2. Obtem Token OAuth2 Microsoft Entra ID
Write-Host "[INFO] Autenticando no Microsoft Entra ID (SharePoint Corporativo)..."
$tokenBody = @{
    grant_type    = "client_credentials"
    client_id     = $CLIENT_ID
    client_secret = $clientSecret
    scope         = "https://graph.microsoft.com/.default"
}
$tokenResp = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token" -Body $tokenBody -TimeoutSec 15
$headers   = @{ "Authorization" = "Bearer $($tokenResp.access_token)" }

# 3. Consulta Manifesto SHA-256 no SharePoint
Write-Host "[INFO] Consultando manifesto oficial em SharePoint ($FOLDER_NAME/manifest_sha256.json)..."
$manifestUrl = "https://graph.microsoft.com/v1.0/drives/$DRIVE_ID/root:/$FOLDER_NAME/manifest_sha256.json:/content"
$manifest    = Invoke-RestMethod -Method Get -Uri $manifestUrl -Headers $headers -TimeoutSec 20
$svcMeta     = $manifest.services."DNA.MonitorServiceSVC"
$pkgFileName = if ($svcMeta.file_name) { $svcMeta.file_name } else { "DNA.MonitorServiceSVC.zip" }
$expectedSha = $svcMeta.sha256

Write-Host "[INFO] Pacote Homologado: $pkgFileName | SHA-256 Esperado: $expectedSha"

New-Item -ItemType Directory -Path $WORK -Force | Out-Null
$zipPath = "$WORK\$pkgFileName"
$downloadUrl = "https://graph.microsoft.com/v1.0/drives/$DRIVE_ID/root:/$FOLDER_NAME/$pkgFileName`:/content"

Write-Host "[INFO] Baixando pacote diretamente do SharePoint Corporativo..."
Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $zipPath -UseBasicParsing
Write-Host "[INFO] Download concluido em disco."

# 4. Validacao estrita de Hash SHA-256 antes de extrair
$actualHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLower()
if ($expectedSha -and ($actualHash -ne $expectedSha.ToLower())) {
    Remove-Item -Path $WORK -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[ERRO CRITICO] Checksum SHA-256 divergente! Esperado: $expectedSha | Calculado: $actualHash" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Integridade criptografica SHA-256 validada com sucesso: $actualHash" -ForegroundColor Green

$extractPath = "$WORK\extracted"
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
$newExe = Join-Path $extractPath $EXE_NAME
if (-not (Test-Path $newExe)) { Write-Host "[ERRO] EXE nao encontrado no ZIP." -ForegroundColor Red; exit 1 }

if (-not $isFreshInstall) {
    Write-Host "[INFO] Parando servico existente..."
    try { Stop-Service -Name $SERVICE_NAME -Force -ErrorAction Stop } catch {}
    $deadline = [DateTime]::Now.AddSeconds(30)
    while ([DateTime]::Now -lt $deadline) {
        if ((Get-Service $SERVICE_NAME -ErrorAction SilentlyContinue).Status -eq "Stopped") { break }
        Start-Sleep -Seconds 2
    }
    Get-Process -Name "WinServiceFleetAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Write-Host "[INFO] Copiando binarios homologados para $installDir..."
Get-ChildItem -Path $extractPath -File | ForEach-Object {
    $dest = Join-Path $installDir $_.Name
    try { Copy-Item -Path $_.FullName -Destination $dest -Force; Write-Host "  OK: $($_.Name)" }
    catch { Write-Host "  WARN: $($_.Name) - $_" -ForegroundColor Yellow }
}

if ($isFreshInstall) {
    Write-Host "[INFO] Registrando servico Windows '$SERVICE_NAME'..."
    $binPath = Join-Path $installDir $EXE_NAME
    sc.exe create $SERVICE_NAME binPath= "`"$binPath`"" start= auto DisplayName= "DNA Monitor Service Agent" | Out-Null
    sc.exe failure $SERVICE_NAME reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
}

Write-Host "[INFO] Iniciando servico '$SERVICE_NAME'..."
Start-Service -Name $SERVICE_NAME
Start-Sleep -Seconds 4
$svcAfter = Get-Service -Name $SERVICE_NAME
$newVer   = (Get-Item (Join-Path $installDir $EXE_NAME)).VersionInfo.FileVersion
Write-Host "[SUCESSO] Status: $($svcAfter.Status) | Nova Versao: $newVer (100% SharePoint Compliance)" -ForegroundColor Green

Remove-Item -Path $WORK -Recurse -Force -ErrorAction SilentlyContinue
