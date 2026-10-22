@echo off
title Pipeline de Homologacao e Deploy Canario (Frota DNA)
cd /d "%~dp0"
echo ==================================================================
echo  Executando Pipeline de Homologacao em 5 Maquinas Piloto...
echo ==================================================================
powershell -ExecutionPolicy Bypass -NoProfile -File "Deploy_Canary_Pipeline.ps1" -ServiceName "DNA.MonitorServiceSVC" -TargetVersion "1.0.14.0" -CanaryCount 5 -TimeoutMinutes 10
pause
