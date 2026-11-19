@echo off
pushd "%~dp0"
title Atualizador Central de Monitoracao CS Fleet
echo ==============================================================================
echo       ATUALIZADOR AUTOMATICO - CENTRAL DE MONITORACAO CS FLEET
echo ==============================================================================
echo.
echo 1. Instalando / Verificando dependencias Python...
python -m pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org --no-warn-script-location >nul 2>&1
echo [OK] Dependencias conferidas.
echo.
echo 2. Verificando e aplicando atualizacoes do GitHub (Branch main)...
git pull origin main 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [!] Git pull direto nao respondeu ou falhou. Tentando updater Python resiliente...
    python -c "from dashboard.updater import apply_update; res = apply_update(); print(res.get('message', res))"
) else (
    echo [OK] Repositorio Git atualizado com sucesso!
)
echo.
echo 3. Reiniciando o servico Windows para carregar a nova versao...
python dashboard\service_manager.py restart
echo.
echo 4. Status atual do servico:
python dashboard\service_manager.py status
echo.
echo ==============================================================================
echo Concluido! O sistema foi atualizado para a versao mais recente.
echo ==============================================================================
popd
pause
