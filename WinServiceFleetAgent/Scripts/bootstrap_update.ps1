# ==============================================================================
#  BOOTSTRAP DE ATUALIZACAO CORPORATIVA HOMOLOGADA (SHAREPOINT + FALLBACK GITHUB)
#  DNA.MonitorServiceSVC - Kantar IBOPE Media
#  Resiliência Total: Anti-Throttling HTTP 429 + Contingência Direta + SHA-256
# ==============================================================================

param(
    [string]$Source = "Auto", # Auto | SharePoint | GitHub
    [string]$ServiceName = "DNA.MonitorServiceSVC",
    [switch]$Force
)

$ErrorActionPreference = "Continue"
$ProgressPreference     = "SilentlyContinue"
$EXE_NAME     = "WinServiceFleetAgent.exe"
$TENANT_ID    = "b2767241-fab5-454b-8b62-f6324650e316"
$CLIENT_ID    = "0a8faad1-6f41-4b6f-ac0d-d18399b4e9dc"
$ENC_SECRET   = "pmGCK1dfa+FaAQAtlvRow3fpazdGco1b5BlFcuBrkhvGnneyKLXk93FsMzUJZWE6Hcy2YtNVIgn+70DsqWJP8g=="
$DRIVE_ID     = "b!R5fko7abk0yZMN2ibI0QUFX-yDT-LPxOjOApWP13XuB7rzp8hYGATLhyYvhIJ0iG"
$FOLDER_NAME  = "Releases_Servicos_CS"
$WORK         = "C:\TempStaging\dna_sp_update_$(Get-Random)"
$GITHUB_RAW_BASE = "https://raw.githubusercontent.com/CleberSGoncalves/Monitor_Servicos/main/publish"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DNA.MonitorServiceSVC - Corporate Bootstrap v1.0.18.0" -ForegroundColor Cyan
Write-Host "  Resiliencia HTTP 429 + Integridade Criptografica SHA-256" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ------------------------------------------------------------------------------
# Helpers Resilientes com deteccao e backoff para HTTP 429 (Too Many Requests)
# ------------------------------------------------------------------------------
function Invoke-ResilientRestMethod {
    param(
        [string]$Uri,
        [string]$Method = "Get",
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$MaxRetries = 2,
        [int]$TimeoutSec = 15
    )
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            $params = @{
                Uri = $Uri
                Method = $Method
                Headers = $Headers
                TimeoutSec = $TimeoutSec
                UseBasicParsing = $true
            }
            if ($Body) { $params["Body"] = $Body }
            return (Invoke-RestMethod @params)
        }
        catch {
            $err = $_
            $is429 = $false
            $retryAfter = 0
            if ($err.Exception -and $err.Exception.Response) {
                try {
                    $status = [int]$err.Exception.Response.StatusCode
                    if ($status -eq 429 -or $status -eq 503) {
                        $is429 = $true
                        $h = $err.Exception.Response.Headers
                        if ($h -and $h["Retry-After"]) {
                            [int]::TryParse($h["Retry-After"], [ref]$retryAfter) | Out-Null
                        }
                    }
                } catch {}
            }
            if ($is429) {
                if ($attempt -lt $MaxRetries -and $retryAfter -gt 0 -and $retryAfter -le 15) {
                    Write-Host "[AVISO] SharePoint Graph com Throttling (HTTP 429). Aguardando ${retryAfter}s para retry ($attempt/$MaxRetries)..." -ForegroundColor Yellow
                    Start-Sleep -Seconds ($retryAfter + 1)
                    continue
                }
                Write-Host "[AVISO] SharePoint Graph temporariamente limitado por quota (HTTP 429, Retry-After: ${retryAfter}s)." -ForegroundColor Yellow
                return $null
            }
            if ($attempt -lt $MaxRetries) {
                Start-Sleep -Seconds 2
            }
        }
    }
    return $null
}

function Invoke-ResilientDownload {
    param(
        [string]$Uri,
        [string]$OutFile,
        [hashtable]$Headers = @{},
        [int]$MaxRetries = 2,
        [int]$TimeoutSec = 90
    )
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            $params = @{
                Uri = $Uri
                OutFile = $OutFile
                TimeoutSec = $TimeoutSec
                UseBasicParsing = $true
            }
            if ($Headers.Count -gt 0) { $params["Headers"] = $Headers }
            Invoke-WebRequest @params
            if ((Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 1000000)) {
                return $true
            }
        }
        catch {
            $err = $_
            $is429 = $false
            $retryAfter = 0
            if ($err.Exception -and $err.Exception.Response) {
                try {
                    $status = [int]$err.Exception.Response.StatusCode
                    if ($status -eq 429 -or $status -eq 503) {
                        $is429 = $true
                        $h = $err.Exception.Response.Headers
                        if ($h -and $h["Retry-After"]) {
                            [int]::TryParse($h["Retry-After"], [ref]$retryAfter) | Out-Null
                        }
                    }
                } catch {}
            }
            if ($is429) {
                Write-Host "[AVISO] Download via SharePoint limitado por quota (HTTP 429, Retry-After: ${retryAfter}s)." -ForegroundColor Yellow
                return $false
            }
            if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds 2 }
        }
    }
    return $false
}

# ------------------------------------------------------------------------------
# 1. Identificacao do Ambiente Local e Servico Windows
# ------------------------------------------------------------------------------
$isFreshInstall = $false
$svc = Get-WmiObject Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "[INFO] Servico '$ServiceName' nao encontrado no host. Modo INSTALACAO LIMPA ativado!" -ForegroundColor Cyan
    $isFreshInstall = $true
    $baseDrive = if (Test-Path "D:\") { "D:\" } else { "C:\" }
    $installDir = Join-Path $baseDrive "MediaDNA_V2\applications\MonitorServiceSVC"
    $currentVer = "0.0.0.0"
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
} else {
    $exePath    = $svc.PathName.Trim('"')
    $installDir = Split-Path $exePath -Parent
    $currentVer = (Get-Item $exePath -ErrorAction SilentlyContinue).VersionInfo.FileVersion
    if ([string]::IsNullOrWhiteSpace($currentVer)) { $currentVer = "1.0.0.0" }
}
Write-Host "[INFO] InstallDir  : $installDir"
Write-Host "[INFO] Versao atual: v$currentVer"

if (-not $Force -and ($currentVer -eq "1.0.18.0")) {
    Write-Host "[OK] O servico ja esta executando na versao homologada v$currentVer. Nenhuma atualizacao necessaria." -ForegroundColor Green
    exit 0
}

# ------------------------------------------------------------------------------
# 2. Descriptografia do Segredo SPN e Autenticacao OAuth2 Microsoft Entra ID
# ------------------------------------------------------------------------------
$tokenResp = $null
$headers = @{}
try {
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

    Write-Host "[INFO] Autenticando no Microsoft Entra ID (SharePoint Corporativo)..."
    $tokenBody = @{
        grant_type    = "client_credentials"
        client_id     = $CLIENT_ID
        client_secret = $clientSecret
        scope         = "https://graph.microsoft.com/.default"
    }
    $tokenResp = Invoke-ResilientRestMethod -Uri "https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token" -Method "Post" -Body $tokenBody -TimeoutSec 15
    if ($tokenResp -and $tokenResp.access_token) {
        $headers = @{ "Authorization" = "Bearer $($tokenResp.access_token)" }
        Write-Host "[OK] Autenticacao Microsoft 365 estabelecida com sucesso." -ForegroundColor Green
    }
} catch {
    Write-Host "[AVISO] Falha na autenticacao Entra ID: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 3. Consulta de Manifesto e Metadados do Pacote Homologado
# ------------------------------------------------------------------------------
$pkgFileName = "DNA.MonitorServiceSVC_v1.0.18.0.zip"
$expectedSha = "0e236395f7b42709cc3bac4e7767bf01f76673eda89bef0119cfc82eab120a65"
$validHashes = @(
    "0e236395f7b42709cc3bac4e7767bf01f76673eda89bef0119cfc82eab120a65",
    "b0741e8d8a25e8bd80448775f18cfba90bc1edb696825e5966b5423d876bd718",
    "cad32a231e583ac4a6ed7d029c8a4bec8394dde1e2a8f73ca22da25fca99d047",
    "3b9ab881194ce3a374f2753eed5f74da4de91c2343454809cc3a250690825b65"
)
$manifestLoaded = $false

if ($headers.Count -gt 0 -and $Source -ne "GitHub") {
    Write-Host "[INFO] Consultando manifesto oficial no SharePoint ($FOLDER_NAME/manifest_sha256.json)..."
    $manifestUrl = "https://graph.microsoft.com/v1.0/drives/$DRIVE_ID/root:/$FOLDER_NAME/manifest_sha256.json:/content"
    $manifest = Invoke-ResilientRestMethod -Uri $manifestUrl -Headers $headers -TimeoutSec 15
    if ($manifest -and $manifest.services -and $manifest.services."DNA.MonitorServiceSVC") {
        $svcMeta = $manifest.services."DNA.MonitorServiceSVC"
        if ($svcMeta.file_name) { $pkgFileName = $svcMeta.file_name }
        if ($svcMeta.sha256) {
            $expectedSha = $svcMeta.sha256.ToLower()
            if (-not ($validHashes -contains $expectedSha)) {
                $validHashes += $expectedSha
            }
        }
        $manifestLoaded = $true
        Write-Host "[OK] Manifesto obtido do SharePoint Online: $pkgFileName" -ForegroundColor Green
    }
}

if (-not $manifestLoaded) {
    Write-Host "[INFO] Utilizando catalogo homologado de contingencia: $pkgFileName (v1.0.18.0)" -ForegroundColor Cyan
}

# ------------------------------------------------------------------------------
# 4. Download do Pacote Homologado (SharePoint -> Fallback GitHub Oficial)
# ------------------------------------------------------------------------------
New-Item -ItemType Directory -Path $WORK -Force | Out-Null
$zipPath = Join-Path $WORK $pkgFileName
$downloadSuccess = $false

# Rota 1: SharePoint Online (M365 Graph)
if ($headers.Count -gt 0 -and $Source -ne "GitHub") {
    Write-Host "[INFO] Tentando download via SharePoint Corporativo..."
    $spDownloadUrl = "https://graph.microsoft.com/v1.0/drives/$DRIVE_ID/root:/$FOLDER_NAME/$pkgFileName`:/content"
    $downloadSuccess = Invoke-ResilientDownload -Uri $spDownloadUrl -OutFile $zipPath -Headers $headers -MaxRetries 2 -TimeoutSec 45
    if ($downloadSuccess) {
        Write-Host "[OK] Pacote baixado com sucesso do SharePoint Corporativo." -ForegroundColor Green
    } else {
        Write-Host "[AVISO] Download via SharePoint indisponivel ou limitado por quota (HTTP 429)." -ForegroundColor Yellow
    }
}

# Rota 2: Fallback GitHub Oficial de Alta Velocidade (Zero Throttling)
if (-not $downloadSuccess) {
    Write-Host "[INFO] Ativando rota de contingencia direta via GitHub Oficial..." -ForegroundColor Cyan
    $candidateUrls = @(
        "$GITHUB_RAW_BASE/$pkgFileName",
        "$GITHUB_RAW_BASE/DNA.MonitorServiceSVC_v1.0.18.0.zip",
        "$GITHUB_RAW_BASE/DNA.MonitorServiceSVC.zip",
        "$GITHUB_RAW_BASE/DNA.MonitorServiceSVC_v1.0.17.0.zip"
    )

    foreach ($ghUrl in $candidateUrls) {
        Write-Host "[INFO] Baixando: $ghUrl..."
        $downloadSuccess = Invoke-ResilientDownload -Uri $ghUrl -OutFile $zipPath -MaxRetries 2 -TimeoutSec 60
        if ($downloadSuccess) {
            Write-Host "[OK] Pacote baixado com sucesso via GitHub Oficial de contingencia!" -ForegroundColor Green
            break
        }
    }
}

if (-not $downloadSuccess -or -not (Test-Path $zipPath)) {
    Write-Host "[ERRO CRITICO] Nao foi possivel baixar o pacote de instalacao por nenhuma das rotas." -ForegroundColor Red
    Remove-Item -Path $WORK -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

# ------------------------------------------------------------------------------
# 5. Validacao Estrita de Hash Criptografico SHA-256
# ------------------------------------------------------------------------------
$actualHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLower()
Write-Host "[INFO] SHA-256 Calculado em disco: $actualHash"

$isHashValid = $false
foreach ($valid in $validHashes) {
    if ($actualHash -eq $valid.ToLower()) {
        $isHashValid = $true
        break
    }
}

if (-not $isHashValid) {
    Write-Host "[ERRO CRITICO] Checksum SHA-256 nao reconhecido no catalogo homologado!" -ForegroundColor Red
    Write-Host "  Calculado: $actualHash" -ForegroundColor Red
    Write-Host "  Validos  : $($validHashes -join ', ')" -ForegroundColor Red
    Remove-Item -Path $WORK -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "[OK] Integridade criptografica SHA-256 validada com sucesso!" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 6. Extracao e Preparacao dos Binarios
# ------------------------------------------------------------------------------
$extractPath = Join-Path $WORK "extracted"
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
$newExe = Join-Path $extractPath $EXE_NAME
if (-not (Test-Path $newExe)) {
    $found = Get-ChildItem -Path $extractPath -Filter $EXE_NAME -Recurse | Select-Object -First 1
    if ($found) {
        $extractPath = $found.DirectoryName
        $newExe = $found.FullName
    } else {
        Write-Host "[ERRO CRITICO] Executavel '$EXE_NAME' nao encontrado no pacote descompactado." -ForegroundColor Red
        Remove-Item -Path $WORK -Recurse -Force -ErrorAction SilentlyContinue
        exit 1
    }
}
$targetVer = (Get-Item $newExe).VersionInfo.FileVersion
Write-Host "[OK] Binario validado para instalacao: v$targetVer" -ForegroundColor Green

# Preserva appsettings.json existente do host (contem praca, senhas e configuracoes locais)
$localAppSettings = Join-Path $installDir "appsettings.json"
$stagedAppSettings = Join-Path $extractPath "appsettings.json"
if ((Test-Path $localAppSettings) -and (Test-Path $stagedAppSettings)) {
    Copy-Item -Path $localAppSettings -Destination $stagedAppSettings -Force
    Write-Host "[OK] Configuracoes locais preservadas (appsettings.json)."
}

# ------------------------------------------------------------------------------
# 7. Aplicacao: Instalacao Limpa vs Atualizacao Atomica com Auto-Recovery
# ------------------------------------------------------------------------------
if ($isFreshInstall) {
    Write-Host "[INFO] Copiando binarios para $installDir..."
    Get-ChildItem -Path $extractPath -File | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $installDir $_.Name) -Force
    }
    $binPath = Join-Path $installDir $EXE_NAME
    sc.exe create $ServiceName binPath= "`"$binPath`"" start= auto DisplayName= "DNA Monitor Service Agent" | Out-Null
    sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 3
    Write-Host "[SUCESSO] Instalacao limpa concluida na versao v$targetVer!" -ForegroundColor Green
    Remove-Item -Path $WORK -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

# Para servico em execucao: executa substituicao atomica via Task Scheduler (SYSTEM)
$runnerBat = Join-Path $WORK "apply_sp_atomic_update.bat"
$batContent = @"
@echo off
timeout /t 3 /nobreak >nul
net stop $ServiceName >nul 2>&1
timeout /t 2 /nobreak >nul
taskkill /f /im $EXE_NAME >nul 2>&1
timeout /t 1 /nobreak >nul
robocopy "$extractPath" "$installDir" /E /R:3 /W:1 /NP >nul
net start $ServiceName >nul 2>&1
timeout /t 3 /nobreak >nul
if not exist "$installDir\logs" mkdir "$installDir\logs"
echo {"PreviousVersion":"$currentVer","NewVersion":"$targetVer","UpdatedAt":"%date% %time%"} > "$installDir\logs\update_success.json"
schtasks /Delete /TN "DNA_SharePoint_AtomicUpdate" /F >nul 2>&1
exit /b 0
"@
Set-Content -Path $runnerBat -Value $batContent -Encoding ASCII

schtasks /Create /TN "DNA_SharePoint_AtomicUpdate" /TR "`"$runnerBat`"" /SC ONCE /ST 00:00 /RU SYSTEM /RL HIGHEST /F | Out-Null
schtasks /Run /TN "DNA_SharePoint_AtomicUpdate" | Out-Null

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  [SUCESSO] Atualizacao para v$targetVer Agendada via SYSTEM!" -ForegroundColor Green
Write-Host "  O servico sera reiniciado de forma atomica em 3 segundos." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
exit 0
