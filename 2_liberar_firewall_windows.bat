@echo off
pushd "%~dp0"
title 2. Liberar Firewall Windows Porta 8092
echo ==============================================================================
echo   PASSO 2: LIBERACAO DE PORTA NO FIREWALL DO WINDOWS (PORTA 8092)
echo ==============================================================================
echo.
echo Configurando regra de entrada para liberar porta TCP 8092 na rede local...
netsh advfirewall firewall delete rule name="MonitorServicos_FleetDashboard_8092" protocol=TCP localport=8092 >nul 2>&1
netsh advfirewall firewall add rule name="MonitorServicos_FleetDashboard_8092" dir=in action=allow protocol=TCP localport=8092 profile=any
echo.
echo [OK] Porta TCP 8092 liberada com sucesso no Firewall do Windows!
echo ==============================================================================
popd
pause
