# ===========================================================
#  BOOTSTRAP DE ATUALIZACAO - DNA.MonitorServiceSVC
#  Executa como ADMINISTRADOR no servidor destino
#  Atualiza de qualquer versao para a mais recente do GitHub
# ===========================================================
param(
    [string]$GitHubToken = ""
)

$ErrorActionPreference = "Stop"
$SERVICE_NAME = "DNA.MonitorServiceSVC"
$EXE_NAME     = "WinServiceFleetAgent.exe"
$REPO         = "CleberSGoncalves/DNA.MonitorServiceSVC"
$WORK         = "$env:TEMP\dna_bootstrap_$(Get-Random)"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  DNA.MonitorServiceSVC - Bootstrap" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$svc = Get-WmiObject Win32_Service -Filter "Name='$SERVICE_NAME'" -ErrorAction SilentlyContinue
if (-not $svc) { Write-Host "[ERRO] Servico nao encontrado." -ForegroundColor Red; exit 1 }
$exePath    = $svc.PathName.Trim('"')
$installDir = Split-Path $exePath -Parent
$currentVer = (Get-Item $exePath -ErrorAction SilentlyContinue).VersionInfo.FileVersion
Write-Host "[INFO] InstallDir  : $installDir"
Write-Host "[INFO] Versao atual: $currentVer"

$headers = @{ "User-Agent" = "DNA-Bootstrap" }
if ($GitHubToken) { $headers["Authorization"] = "token $GitHubToken" }

Write-Host "[INFO] Consultando GitHub..."
$release   = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/latest" -Headers $headers
$latestVer = $release.tag_name
$asset     = $release.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
if (-not $asset) { Write-Host "[ERRO] Nenhum asset .zip." -ForegroundColor Red; exit 1 }
Write-Host "[INFO] Versao GitHub: $latestVer"

New-Item -ItemType Directory -Path $WORK -Force | Out-Null
$zipPath = "$WORK\agent.zip"
Write-Host "[INFO] Baixando $($asset.name) ($([math]::Round($asset.size/1MB,1)) MB)..."
Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $zipPath -UseBasicParsing
Write-Host "[INFO] Download concluido."

$extractPath = "$WORK\extracted"
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
$newExe = Join-Path $extractPath $EXE_NAME
if (-not (Test-Path $newExe)) { Write-Host "[ERRO] EXE nao encontrado no ZIP." -ForegroundColor Red; exit 1 }

Write-Host "[INFO] Parando servico..."
try { Stop-Service -Name $SERVICE_NAME -Force -ErrorAction Stop } catch {}
$deadline = [DateTime]::Now.AddSeconds(30)
while ([DateTime]::Now -lt $deadline) {
    if ((Get-Service $SERVICE_NAME -ErrorAction SilentlyContinue).Status -eq "Stopped") { break }
    Start-Sleep -Seconds 2
}
Get-Process -Name "WinServiceFleetAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "[INFO] Copiando arquivos para $installDir..."
Get-ChildItem -Path $extractPath -File | ForEach-Object {
    $dest = Join-Path $installDir $_.Name
    try { Copy-Item -Path $_.FullName -Destination $dest -Force; Write-Host "  OK: $($_.Name)" }
    catch { Write-Host "  WARN: $($_.Name) - $_" -ForegroundColor Yellow }
}

Write-Host "[INFO] Iniciando servico..."
for ($i=1; $i -le 3; $i++) {
    try { Start-Service -Name $SERVICE_NAME -ErrorAction Stop; Write-Host "[OK] Servico iniciado!" -ForegroundColor Green; break }
    catch { Write-Host "  tentativa $i/3 falhou"; Start-Sleep -Seconds 3 }
}

$newVer = (Get-Item (Join-Path $installDir $EXE_NAME) -ErrorAction SilentlyContinue).VersionInfo.FileVersion
Write-Host ""
Write-Host "Antes : $currentVer  ->  Depois: $newVer" -ForegroundColor Green
Remove-Item $WORK -Recurse -Force -ErrorAction SilentlyContinue
