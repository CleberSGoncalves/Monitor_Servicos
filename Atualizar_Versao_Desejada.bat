@echo off
title Atualizar Versão Desejada no SharePoint
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "Atualizar_Versao_Desejada_SharePoint.ps1" -ServiceName "DNA.MonitorServiceSVC" -NewVersion "1.0.13.1"
powershell -ExecutionPolicy Bypass -NoProfile -File "Atualizar_Versao_Desejada_SharePoint.ps1" -ServiceName "Atria Capture" -NewVersion "2.0.0.2"
pause
