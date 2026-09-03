@echo off
REM Script de Auto-Atualização Local do Agente DNA.MonitorServiceSVC
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
set SERVICE_NAME=DNA.MonitorServiceSVC
set GITHUB_REPO=CleberSGoncalves/DNA.MonitorServiceSVC

echo ========================================================
echo   Auto-Atualizacao do Agente %SERVICE_NAME%
echo ========================================================

:: Verifica se está rodando como Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO CRITICO] Este script PRECISA ser executado como ADMINISTRADOR!
    echo Por favor, clique com o botao direito no arquivo .bat e selecione 'Executar como Administrador'.
    echo.
    pause
    exit /b 1
)

set WORK_DIR=%TEMP%\agent_update_%RANDOM%
mkdir "%WORK_DIR%" >nul 2>&1

echo 1. Parando o servico %SERVICE_NAME%...
powershell -ExecutionPolicy Bypass -Command "Stop-Service -Name '%SERVICE_NAME%' -Force -ErrorAction SilentlyContinue; $limit = 15; while (((Get-Service '%SERVICE_NAME%' -ErrorAction SilentlyContinue).Status -ne 'Stopped') -and ($limit-- -gt 0)) { Start-Sleep -Seconds 1 }; Get-Process -Name 'WinServiceFleetAgent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 2 /nobreak >nul

echo 2. Consultando e baixando ultima release no GitHub...
powershell -ExecutionPolicy Bypass -Command "$resp = Invoke-RestMethod -Uri 'https://api.github.com/repos/%GITHUB_REPO%/releases/latest' -UserAgent 'WinServiceFleetAgent'; $asset = $resp.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1; if ($asset) { $targetZip = '%WORK_DIR%\agent_download.zip'; Write-Host 'Baixando asset:' $asset.name; Invoke-WebRequest -Uri $asset.browser_download_url -UserAgent 'WinServiceFleetAgent' -OutFile $targetZip } else { Write-Host 'Nenhum asset zip encontrado.' }"

if exist "%WORK_DIR%\agent_download.zip" (
    echo 3. Extraindo pacote de atualizacao...
    powershell -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%WORK_DIR%\agent_download.zip' -DestinationPath '%WORK_DIR%\extracted' -Force"

    echo 4. Substituindo binarios do Agente...
    powershell -ExecutionPolicy Bypass -Command "$src='%WORK_DIR%\extracted'; $dst='%~dp0'; for ($i=1; $i -le 10; $i++) { try { Copy-Item -Path \"$src\*\" -Destination \"$dst\" -Recurse -Force -ErrorAction Stop; Write-Host ' Binarios atualizados com sucesso!'; break } catch { Write-Host \" Aguardando liberacao dos arquivos ($i/10)... \"; Start-Sleep -Seconds 2 } }"

    echo 5. Reiniciando o servico %SERVICE_NAME%...
    powershell -ExecutionPolicy Bypass -Command "Start-Service -Name '%SERVICE_NAME%'"

    echo 6. Limpando temporarios...
    rmdir /s /q "%WORK_DIR%" >nul 2>&1

    echo ========================================================
    echo Agente %SERVICE_NAME% atualizado e iniciado com sucesso!
    echo ========================================================
) else (
    echo [ERRO] Nao foi possivel baixar o pacote de atualizacao.
    rmdir /s /q "%WORK_DIR%" >nul 2>&1
)

pause
exit /b 0
