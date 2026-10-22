@echo off
title Instalar Auditor Inteligente no Task Scheduler
cd /d "%~dp0"
echo ==================================================================
echo  Registrando Tarefa Agendada: DNA_Fleet_Watchdog_Auditor (a cada 30 min)
echo ==================================================================

set TASK_NAME=DNA_Fleet_Watchdog_Auditor
set PS_SCRIPT=%~dp0Auditar_E_Recuperar_Frota.ps1

schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

schtasks /create /tn "%TASK_NAME%" /tr "powershell.exe -ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File \"%PS_SCRIPT%\" -ServiceName \"DNA.MonitorServiceSVC\" -TargetVersion \"latest\"" /sc minute /mo 30 /ru SYSTEM /f /rl HIGHEST

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCESSO] Tarefa agendada '%TASK_NAME%' criada com sucesso!
    echo O auditor rodara silenciosamente em segundo plano a cada 30 minutos.
    echo Ele busca automaticamente a versao mais recente no GitHub a cada ciclo!
) else (
    echo.
    echo [ERRO] Falha ao criar a tarefa agendada. Certifique-se de executar como Administrador.
)

pause
