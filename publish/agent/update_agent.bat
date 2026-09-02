@echo off
REM Script de Auto-Atualização Local do Agente DNA.MonitorServiceSVC
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
set SERVICE_NAME=DNA.MonitorServiceSVC
set GITHUB_REPO=CleberSGoncalves/DNA.MonitorServiceSVC

echo ========================================================
echo   Auto-Atualizacao do Agente %SERVICE_NAME%
echo ========================================================

echo 1. Consultando ultima release no GitHub...
powershell -Command "$resp = Invoke-RestMethod -Uri 'https://api.github.com/repos/%GITHUB_REPO%/releases/latest'; $asset = $resp.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1; if ($asset) { Write-Host 'Baixando asset:' $asset.name; Invoke-WebRequest -Uri $asset.browser_download_url -OutFile 'agent_latest.zip'; Expand-Archive -Path 'agent_latest.zip' -DestinationPath 'temp_update' -Force } else { Write-Host 'Nenhum asset zip encontrado.' }"

if exist "temp_update" (
    echo 2. Parando o servico %SERVICE_NAME%...
    sc stop %SERVICE_NAME%
    timeout /t 3 /nobreak >nul

    echo 3. Substituindo binarios do Agente...
    copy /y temp_update\*.* "%~dp0" >nul

    echo 4. Reiniciando o servico %SERVICE_NAME%...
    sc start %SERVICE_NAME%

    echo 5. Limpando arquivos temporarios...
    rmdir /s /q temp_update
    if exist agent_latest.zip del /f /q agent_latest.zip

    echo ========================================================
    echo Agente %SERVICE_NAME% atualizado e iniciado com sucesso!
    echo ========================================================
) else (
    echo [ERRO] Nao foi possivel baixar o pacote de atualizacao.
)

pause
