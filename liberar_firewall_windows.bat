@echo off
chcp 65001 > nul
title Liberar Porta 8092 no Firewall do Windows
cd /d "%~dp0"
echo ==============================================================================
echo       LIBERAÇÃO DE PORTA 8092 NO FIREWALL DO WINDOWS (24x7 LAN)
echo       Central de Monitoração de Capture Sites LATAM - IBOPE
echo ==============================================================================
echo.
echo Tentando adicionar regra de entrada para a porta 8092 TCP...
echo (Requer execução como Administrador)
echo.

netsh advfirewall firewall delete rule name="Monitor CS LATAM Dashboard (Porta 8090)" >nul 2>&1
netsh advfirewall firewall delete rule name="Monitor CS LATAM Dashboard (Porta 8092)" >nul 2>&1
netsh advfirewall firewall add rule name="Monitor CS LATAM Dashboard (Porta 8092)" dir=in action=allow protocol=TCP localport=8092 profile=any

netsh advfirewall firewall delete rule name="Monitor CS Python" >nul 2>&1
for /f "delims=" %%i in ('where python 2^>nul') do (
    netsh advfirewall firewall add rule name="Monitor CS Python" dir=in action=allow program="%%i" enable=yes profile=any >nul 2>&1
)
for /f "delims=" %%i in ('where pythonw 2^>nul') do (
    netsh advfirewall firewall add rule name="Monitor CS Pythonw" dir=in action=allow program="%%i" enable=yes profile=any >nul 2>&1
)

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCESSO] Porta 8092 liberada com sucesso no Firewall do Windows!
    echo O Python/Pythonw também foi liberado para conexões de rede interna.
    echo Agora outros computadores da rede ou VPN podem acessar via:
    echo   http://192.168.15.17:8092
) else (
    echo.
    echo [AVISO] Não foi possível aplicar a regra diretamente.
    echo Clique com o botão direito neste arquivo e escolha "Executar como Administrador".
)

echo.
echo ==============================================================================
pause
