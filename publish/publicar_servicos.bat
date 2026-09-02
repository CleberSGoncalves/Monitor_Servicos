@echo off
title Publicador Automático de Serviços para GitHub (.NET)
cd /d "%~dp0"

set GITHUB_ORG=CleberSGoncalves
set GITHUB_TOKEN=

if exist "github_token.txt" (
    set /p GITHUB_TOKEN=<github_token.txt
)

if not exist "servicos" (
    mkdir servicos
    echo ========================================================
    echo   Pasta 'servicos' criada com sucesso!
    echo ========================================================
    echo Coloque as pastas dos serviços (ex: servicos\ConfigMonitorSVC)
    echo ou arquivos .zip dentro da pasta 'servicos' e execute este .bat novamente.
    echo ========================================================
    pause
    exit /b
)

echo ========================================================
echo   Iniciando Publicador Automático de Serviços
echo ========================================================
PublisherApp.exe "%GITHUB_TOKEN%" "%GITHUB_ORG%"
pause
