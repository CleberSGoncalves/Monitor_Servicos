@echo off
title Publicador Automático de Serviços para GitHub (.NET)
cd /d "%~dp0"

set GITHUB_ORG=CleberSGoncalves
set GITHUB_TOKEN=

if exist "github_token.txt" (
    set /p GITHUB_TOKEN=<github_token.txt
)

if not exist "%~dp0servicos" (
    mkdir "%~dp0servicos"
)

echo ========================================================
echo   Iniciando Publicador Automático de Serviços
echo ========================================================
PublisherApp.exe "%GITHUB_TOKEN%" "%GITHUB_ORG%"
pause
