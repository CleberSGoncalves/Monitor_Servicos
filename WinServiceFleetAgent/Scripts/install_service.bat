@echo off
REM Script de Instalação do Serviço Windows Agent em C# .NET
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
set SERVICE_NAME=Dna.Monitor_Service
set EXE_PATH=%~dp0WinServiceFleetAgent.exe

echo Instalando o servico %SERVICE_NAME%...
sc create %SERVICE_NAME% binPath= "%EXE_PATH%" start= auto displayname= "Dna.Monitor_Service"

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao registrar o servico Windows via sc.exe.
    pause
    exit /b %ERRORLEVEL%
)

echo Configurando descricao do servico...
sc description %SERVICE_NAME% "Agente nativo em C# .NET para inventario, monitoramento e atualizacao remota da frota de servicos Windows."

echo Iniciando o servico...
sc start %SERVICE_NAME%

if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo Servico %SERVICE_NAME% instalado e iniciado com sucesso!
    echo ========================================================
) else (
    echo [AVISO] O servico foi instalado, mas nao foi possivel inicia-lo automaticamente.
)

pause
