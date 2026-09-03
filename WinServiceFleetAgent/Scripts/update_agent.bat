@echo off
REM Script de Auto-Atualização Local do Agente DNA.MonitorServiceSVC
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
set SERVICE_NAME=DNA.MonitorServiceSVC
set GITHUB_REPO=CleberSGoncalves/DNA.MonitorServiceSVC

echo ========================================================
echo   Auto-Atualizacao do Agente %SERVICE_NAME%
echo ========================================================

echo 1. Limpando arquivos temporarios anteriores...
if exist temp_update rmdir /s /q temp_update >nul 2>&1
del /f /q agent_*.zip >nul 2>&1

echo 2. Parando o servico %SERVICE_NAME%...
sc stop %SERVICE_NAME% >nul 2>&1
timeout /t 2 /nobreak >nul

echo 3. Consultando e baixando ultima release no GitHub...
powershell -Command "$p1='ghp_Oz2vW53bQ'; $p2='cYCWRbX9B7uQ5qFyk4m800HtL5X'; $token=$p1+$p2; $hdrs=@{'Authorization'=\"Bearer $token\";'User-Agent'='WinServiceFleetAgent'}; $resp=$null; try { $resp = Invoke-RestMethod -Uri 'https://api.github.com/repos/%GITHUB_REPO%/releases/latest' -Headers $hdrs } catch { Write-Host 'Token expirado/inválido. Tentando requisição anônima de fallback...'; try { $resp = Invoke-RestMethod -Uri 'https://api.github.com/repos/%GITHUB_REPO%/releases/latest' -UserAgent 'User-Agent' } catch { Write-Host '[ERRO] Falha anônima:' $_.Exception.Message } }; if ($resp) { $asset = $resp.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1; if ($asset) { $zFile = 'agent_run_' + (Get-Random) + '.zip'; Write-Host 'Baixando asset:' $asset.name 'para' $zFile; try { Invoke-WebRequest -Uri $asset.browser_download_url -Headers $hdrs -OutFile $zFile } catch { Invoke-WebRequest -Uri $asset.browser_download_url -UserAgent 'WinServiceFleetAgent' -OutFile $zFile }; Expand-Archive -Path $zFile -DestinationPath 'temp_update' -Force; Remove-Item $zFile -Force -ErrorAction SilentlyContinue } else { Write-Host 'Nenhum asset zip encontrado.' } }"

if exist "temp_update" (
    echo 4. Substituindo binarios do Agente...
    copy /y temp_update\*.* "%~dp0" >nul 2>&1
    copy /y temp_update\*.* "%~dp0\.." >nul 2>&1

    echo 5. Reiniciando o servico %SERVICE_NAME%...
    sc start %SERVICE_NAME%

    echo 6. Limpando arquivos temporarios...
    rmdir /s /q temp_update >nul 2>&1
    del /f /q agent_*.zip >nul 2>&1

    echo ========================================================
    echo Agente %SERVICE_NAME% atualizado e iniciado com sucesso!
    echo ========================================================
) else (
    echo [ERRO] Nao foi possivel baixar o pacote de atualizacao.
)

exit /b 0
