@echo off
REM Script de Atualizacao Corporativa Homologada via SharePoint (SHA-256 Verified)
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
set SERVICE_NAME=DNA.MonitorServiceSVC

echo ========================================================
echo   Atualizacao Homologada SharePoint - %SERVICE_NAME%
echo ========================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO CRITICO] Este script PRECISA ser executado como ADMINISTRADOR!
    pause
    exit /b 1
)

if exist "%~dp0Apply-AgentUpdate.ps1" (
    powershell -NoProfile -File "%~dp0Apply-AgentUpdate.ps1" -ServiceName "%SERVICE_NAME%"
) else (
    echo [INFO] Acionando sincronizacao pelo servico local...
    net stop %SERVICE_NAME% >nul 2>&1
    net start %SERVICE_NAME%
)

echo ========================================================
echo Atualizacao concluida!
echo ========================================================
pause
exit /b 0
