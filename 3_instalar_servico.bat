@echo off
pushd "%~dp0dashboard"
title 3. Instalar Servico Windows 24x7 - Central CS Fleet
echo ==============================================================================
echo   PASSO 3: INSTALACAO DO SERVICO WINDOWS 24X7 E WATCHDOG
echo ==============================================================================
echo.
python service_manager.py install
echo.
echo Iniciando o servico...
python service_manager.py start
echo.
echo Status atual do servico:
python service_manager.py status
echo.
echo ==============================================================================
echo Pronto! A Central agora roda como Servico 24x7 no Windows (Porta 8092).
echo Acesse no navegador: http://localhost:8092
echo ==============================================================================
popd
pause
