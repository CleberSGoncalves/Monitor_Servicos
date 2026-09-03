@echo off
REM Script de Auto-Atualização Local do Agente DNA.MonitorServiceSVC
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
set SERVICE_NAME=DNA.MonitorServiceSVC
set GITHUB_REPO=CleberSGoncalves/DNA.MonitorServiceSVC

echo ========================================================
echo   Auto-Atualizacao do Agente %SERVICE_NAME%
echo ========================================================

echo 1. Limpando temporarios antigos...
if exist temp_update rmdir /s /q temp_update >nul 2>&1
if exist agent_update.zip del /f /q agent_update.zip >nul 2>&1

echo 2. Parando o servico %SERVICE_NAME%...
sc stop %SERVICE_NAME% >nul 2>&1
timeout /t 2 /nobreak >nul

echo 3. Consultando e baixando ultima release no GitHub...
powershell -Command "$resp = Invoke-RestMethod -Uri 'https://api.github.com/repos/%GITHUB_REPO%/releases/latest' -UserAgent 'WinServiceFleetAgent'; $asset = $resp.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1; if ($asset) { Write-Host 'Baixando asset:' $asset.name; Invoke-WebRequest -Uri $asset.browser_download_url -UserAgent 'WinServiceFleetAgent' -OutFile 'agent_update.zip' } else { Write-Host 'Nenhum asset zip encontrado.' }"

if exist agent_update.zip (
    echo 4. Extraindo pacote de atualizacao...
    powershell -Command "Expand-Archive -Path 'agent_update.zip' -DestinationPath 'temp_update' -Force"

    echo 5. Substituindo binarios do Agente...
    copy /y temp_update\*.* "%~dp0" >nul 2>&1
    copy /y temp_update\*.* "%~dp0\.." >nul 2>&1

    echo 6. Reiniciando o servico %SERVICE_NAME%...
    sc start %SERVICE_NAME%

    echo 7. Limpando temporarios...
    rmdir /s /q temp_update >nul 2>&1
    if exist agent_update.zip del /f /q agent_update.zip >nul 2>&1

    echo ========================================================
    echo Agente %SERVICE_NAME% atualizado e iniciado com sucesso!
    echo ========================================================
) else (
    echo [ERRO] Nao foi possivel baixar o pacote de atualizacao.
)

exit /b 0
