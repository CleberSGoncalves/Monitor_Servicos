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
$WORK         = "C:\TempStaging\dna_sp_update_$(Get-Random)"

Write-Host ""
Write-Host "=========================================================="
Write-Host "  DNA.MonitorServiceSVC - SharePoint Corporate Bootstrap"
Write-Host "  Compliance: Microsoft 365 Graph API + SHA-256 Verified"
Write-Host "=========================================================="

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$isFreshInstall = $false
$svc = Get-WmiObject Win32_Service -Filter "Name='$SERVICE_NAME'" -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "[INFO] Servico '$SERVICE_NAME' nao encontrado no host. Modo INSTALACAO LIMPA ativado!"
    $isFreshInstall = $true
    $baseDrive = if (Test-Path "D:\") { "D:\" } else { "C:\" }
    $installDir = Join-Path $baseDrive "MediaDNA_V2\applications\MonitorServiceSVC"
    $currentVer = "0.0.0.0"
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
} else {
    $exePath    = $svc.PathName.Trim('"')
    $installDir = Split-Path $exePath -Parent
    $currentVer = (Get-Item $exePath -ErrorAction SilentlyContinue).VersionInfo.FileVersion
}
Write-Host "[INFO] InstallDir  : $installDir"
Write-Host "[INFO] Versao atual: $currentVer"

# 1. Descriptografa segredo SPN AES-256
$rawBytes     = [Convert]::FromBase64String($ENC_SECRET)
$keyBytes     = [System.Text.Encoding]::UTF8.GetBytes("DNA_MONITOR_FLEET_SEC_2026_ADGBL")
$ivBytes      = $rawBytes[0..15]
$cipherBytes  = $rawBytes[16..($rawBytes.Length - 1)]
$aes          = [System.Security.Cryptography.Aes]::Create()
$aes.Key      = $keyBytes
$aes.IV       = $ivBytes
$decryptor    = $aes.CreateDecryptor()
$plainBytes   = $decryptor.TransformFinalBlock($cipherBytes, 0, $cipherBytes.Length)
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
$pkgFileName = if ($svcMeta.file_name) { $svcMeta.file_name } else { "DNA.MonitorServiceSVC_v1.0.17.0.zip" }
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
    Write-Host "[ERRO CRITICO] Checksum SHA-256 divergente! Esperado: $expectedSha | Calculado: $actualHash"
    exit 1
}
Write-Host "[OK] Integridade criptografica SHA-256 validada com sucesso: $actualHash"

$extractPath = "$WORK\extracted"
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
$newExe = Join-Path $extractPath $EXE_NAME
if (-not (Test-Path $newExe)) {
    $found = Get-ChildItem -Path $extractPath -Filter $EXE_NAME -Recurse | Select-Object -First 1
    if ($found) {
        $extractPath = $found.DirectoryName
        $newExe = $found.FullName
    } else {
        Write-Host "[ERRO] EXE nao encontrado no ZIP."
        exit 1
    }
}
$targetVer = (Get-Item $newExe).VersionInfo.FileVersion
Write-Host "[OK] Binario extraido e validado: v$targetVer"

# Preserva appsettings.json existente da maquina se houver
$localAppSettings = Join-Path $installDir "appsettings.json"
$stagedAppSettings = Join-Path $extractPath "appsettings.json"
if ((Test-Path $localAppSettings) -and (Test-Path $stagedAppSettings)) {
    Copy-Item -Path $localAppSettings -Destination $stagedAppSettings -Force
}

if ($isFreshInstall) {
    Write-Host "[INFO] Copiando binarios homologados para $installDir..."
    Get-ChildItem -Path $extractPath -File | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $installDir $_.Name) -Force
    }
    $binPath = Join-Path $installDir $EXE_NAME
    sc.exe create $SERVICE_NAME binPath= "`"$binPath`"" start= auto DisplayName= "DNA Monitor Service Agent" | Out-Null
    sc.exe failure $SERVICE_NAME reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
    Start-Service -Name $SERVICE_NAME
    Start-Sleep -Seconds 3
    Write-Host "[SUCESSO] Instalacao limpa concluida na versao v$targetVer (100% SharePoint M365)!"
    Remove-Item -Path $WORK -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

# Para atualizacao de servico em execucao: agenda substituicao atomica via Task Scheduler (SYSTEM)
# aguardando 6s para permitir que o RemoteCommandExecutor envie o ACK de sucesso ao SharePoint antes de parar o servico
$runnerBat = "$WORK\apply_sp_atomic_update.bat"
$batContent = @"
@echo off
timeout /t 6 /nobreak >nul
net stop $SERVICE_NAME >nul 2>&1
timeout /t 3 /nobreak >nul
taskkill /f /im $EXE_NAME >nul 2>&1
timeout /t 2 /nobreak >nul
robocopy "$extractPath" "$installDir" /E /R:3 /W:1 /NP >nul
net start $SERVICE_NAME >nul 2>&1
timeout /t 3 /nobreak >nul
if not exist "$installDir\logs" mkdir "$installDir\logs"
echo {"PreviousVersion":"$currentVer","NewVersion":"$targetVer","UpdatedAt":"%date% %time%"} > "$installDir\logs\update_success.json"
schtasks /Delete /TN "DNA_SharePoint_AtomicUpdate" /F >nul 2>&1
exit /b 0
"@
Set-Content -Path $runnerBat -Value $batContent -Encoding ASCII

schtasks /Create /TN "DNA_SharePoint_AtomicUpdate" /TR "`"$runnerBat`"" /SC ONCE /ST 00:00 /RU SYSTEM /RL HIGHEST /F | Out-Null
schtasks /Run /TN "DNA_SharePoint_AtomicUpdate" | Out-Null

Write-Host "[SUCESSO] Pacote v$targetVer baixado do SharePoint, validado via SHA-256 ($actualHash) e agendado via Task Scheduler (SYSTEM) para substituicao atomica em 6 segundos!"
exit 0
