@echo off
title Auditoria Inteligente e Watchdog da Frota (DNA Monitor)
cd /d "%~dp0"
echo ==================================================================
echo  Executando Auditoria e Diagnostico da Frota...
echo ==================================================================
powershell -ExecutionPolicy Bypass -NoProfile -File "Auditar_E_Recuperar_Frota.ps1" -ServiceName "DNA.MonitorServiceSVC" -TargetVersion "1.0.13.1"
pause
