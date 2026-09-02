@echo off
REM Script de Instalação do Serviço Windows Agent
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
echo Instalando o serviço WinServiceFleetAgent...
python service_host.py install

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao registrar o servico Windows.
    pause
    exit /b %ERRORLEVEL%
)

echo Configurando tipo de inicializacao para AUTOMATICO...
sc config WinServiceFleetAgent start= auto

echo Iniciando o servico...
python service_host.py start

if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo Servico WinServiceFleetAgent instalado e iniciado!
    echo ========================================================
) else (
    echo [AVISO] O servico foi instalado, mas nao foi possivel inicia-lo automaticamente.
)

pause
