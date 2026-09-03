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

echo 3. Baixando ultima release do GitHub...
curl -sL "https://github.com/%GITHUB_REPO%/releases/latest/download/DNA.MonitorServiceSVC.zip" -o agent_update.zip

if not exist agent_update.zip (
    echo [AVISO] Fallback via API do GitHub...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/%GITHUB_REPO%/releases/latest/download/DNA.MonitorServiceSVC.zip' -OutFile 'agent_update.zip'"
)

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
