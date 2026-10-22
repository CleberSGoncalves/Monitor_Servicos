@echo off
REM Script de Auto-Atualização Local do Agente DNA.MonitorServiceSVC
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
set SERVICE_NAME=DNA.MonitorServiceSVC
set GITHUB_REPO=CleberSGoncalves/DNA.MonitorServiceSVC
set SERVICE_STOPPED=0

echo ========================================================
echo   Auto-Atualizacao do Agente %SERVICE_NAME%
echo ========================================================

:: Verifica se está rodando como Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO CRITICO] Este script PRECISA ser executado como ADMINISTRADOR!
    pause
    exit /b 1
)

set WORK_DIR=%TEMP%\agent_update_%RANDOM%
mkdir "%WORK_DIR%" >nul 2>&1

echo 1. Baixando ultima release do GitHub (com servico em execucao)...
powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $resp = Invoke-RestMethod -Uri 'https://api.github.com/repos/%GITHUB_REPO%/releases/latest' -UserAgent 'WinServiceFleetAgent'; $asset = $resp.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1; if ($asset) { Write-Host 'Baixando:' $asset.name; Invoke-WebRequest -Uri $asset.browser_download_url -UserAgent 'WinServiceFleetAgent' -OutFile '%WORK_DIR%\agent_download.zip' } else { Write-Host 'Nenhum asset zip encontrado.' }"

if not exist "%WORK_DIR%\agent_download.zip" (
    echo [AVISO] Download falhou. Servico nao foi interrompido. Abortando atualizacao.
    rmdir /s /q "%WORK_DIR%" >nul 2>&1
    pause
    exit /b 1
)

echo 2. Extraindo pacote...
powershell -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%WORK_DIR%\agent_download.zip' -DestinationPath '%WORK_DIR%\extracted' -Force"

if not exist "%WORK_DIR%\extracted\WinServiceFleetAgent.exe" (
    echo [AVISO] Extracao falhou. Servico nao foi interrompido. Abortando atualizacao.
    rmdir /s /q "%WORK_DIR%" >nul 2>&1
    pause
    exit /b 1
)

echo 3. Parando o servico %SERVICE_NAME%...
set SERVICE_STOPPED=1
powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Stop-Service -Name '%SERVICE_NAME%' -Force -ErrorAction SilentlyContinue; $limit = 15; while (((Get-Service '%SERVICE_NAME%' -ErrorAction SilentlyContinue).Status -ne 'Stopped') -and ($limit-- -gt 0)) { Start-Sleep -Seconds 1 }; Get-Process -Name 'WinServiceFleetAgent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 1 /nobreak >nul

echo 4. Substituindo binarios...
powershell -ExecutionPolicy Bypass -Command "$src='%WORK_DIR%\extracted'; $dst='%~dp0'; for ($i=1; $i -le 10; $i++) { try { Copy-Item -Path \"$src\*\" -Destination \"$dst\" -Recurse -Force -ErrorAction Stop; Write-Host 'Binarios atualizados!'; break } catch { Write-Host \"Tentativa $i/10...\"; Start-Sleep -Seconds 2 } }"

:RESTART
echo 5. Reiniciando o servico %SERVICE_NAME%...
sc start %SERVICE_NAME% >nul 2>&1
powershell -ExecutionPolicy Bypass -Command "Start-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue"

echo 6. Limpando temporarios...
rmdir /s /q "%WORK_DIR%" >nul 2>&1

echo ========================================================
echo Atualizacao concluida!
echo ========================================================
pause
exit /b 0

