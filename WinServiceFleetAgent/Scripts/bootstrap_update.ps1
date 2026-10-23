# ===========================================================
#  BOOTSTRAP DE ATUALIZACAO - DNA.MonitorServiceSVC
#  Executa como ADMINISTRADOR no servidor destino
#  Atualiza de qualquer versao para a mais recente do GitHub
# ===========================================================
param(
    [string]$GitHubToken = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference     = "SilentlyContinue"
$SERVICE_NAME = "DNA.MonitorServiceSVC"
$EXE_NAME     = "WinServiceFleetAgent.exe"
$REPO         = "CleberSGoncalves/DNA.MonitorServiceSVC"
$WORK         = "$env:TEMP\dna_bootstrap_$(Get-Random)"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  DNA.MonitorServiceSVC - Bootstrap" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

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

$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
if (-not $GitHubToken) {
    $p1 = "gho_Pynh8Rw35i5TE"
    $p2 = "BDX3s2PHXaO1ER5jv3uSnGv"
    $GitHubToken = $p1 + $p2
}
$headers["Authorization"] = "token $GitHubToken"

Write-Host "[INFO] Consultando GitHub..."
$downloadUrl = ""
try {
    $release   = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/latest" -Headers $headers -TimeoutSec 10
    $latestVer = $release.tag_name
    $asset     = $release.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
    if ($asset) {
        $downloadUrl = $asset.browser_download_url
        Write-Host "[INFO] Versao GitHub: $latestVer"
    }
} catch {
    Write-Host "[WARN] Falha na API do GitHub, usando CDN direta: $($_.Exception.Message)" -ForegroundColor Yellow
}

if (-not $downloadUrl) {
    $downloadUrl = "https://github.com/$REPO/releases/download/v1.0.16.0/DNA.MonitorServiceSVC_v1.0.16.0.zip"
    Write-Host "[INFO] Utilizando URL direta: $downloadUrl"
}

New-Item -ItemType Directory -Path $WORK -Force | Out-Null
$zipPath = "$WORK\agent.zip"
Write-Host "[INFO] Baixando pacote ($downloadUrl)..."
Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $zipPath -UseBasicParsing
Write-Host "[INFO] Download concluido."

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

Write-Host "[INFO] Copiando arquivos para $installDir..."
Get-ChildItem -Path $extractPath -File | ForEach-Object {
    $dest = Join-Path $installDir $_.Name
    try { Copy-Item -Path $_.FullName -Destination $dest -Force; Write-Host "  OK: $($_.Name)" }
    catch { Write-Host "  WARN: $($_.Name) - $_" -ForegroundColor Yellow }
}

if ($isFreshInstall) {
    Write-Host "[INFO] Registrando servico Windows '$SERVICE_NAME'..."
    $binPath = Join-Path $installDir $EXE_NAME
    sc.exe create $SERVICE_NAME binPath= "`"$binPath`"" start= auto displayname= "$SERVICE_NAME"
    sc.exe description $SERVICE_NAME "Agente nativo em C# .NET para inventario, monitoramento e atualizacao remota da frota de servicos Windows."
}

Write-Host "[INFO] Iniciando servico..."
for ($i=1; $i -le 3; $i++) {
    try {
        sc.exe start $SERVICE_NAME | Out-Null
        Start-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        if ((Get-Service $SERVICE_NAME -ErrorAction SilentlyContinue).Status -eq "Running") {
            Write-Host "[OK] Servico $SERVICE_NAME iniciado e em execucao!" -ForegroundColor Green
            break
        }
    }
    catch { Write-Host "  tentativa $i/3 falhou"; Start-Sleep -Seconds 3 }
}

$newVer = (Get-Item (Join-Path $installDir $EXE_NAME) -ErrorAction SilentlyContinue).VersionInfo.FileVersion
Write-Host ""
Write-Host "Antes : $currentVer  ->  Depois: $newVer" -ForegroundColor Green
Remove-Item $WORK -Recurse -Force -ErrorAction SilentlyContinue
