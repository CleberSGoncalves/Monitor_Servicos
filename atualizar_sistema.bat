@echo off
chcp 65001 > nul
title Atualizador Central de Monitoração CS Fleet
cd /d "%~dp0"
echo ==============================================================================
echo       ATUALIZADOR AUTOMATICO - CENTRAL DE MONITORAÇÃO CS FLEET
echo ==============================================================================
echo.
echo 1. Instalando / Verificando dependencias Python...
python -m pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org >nul 2>&1
echo [OK] Dependências conferidas.
echo.
echo 2. Verificando e aplicando atualizações do GitHub (Branch main)...
python -c "from dashboard.updater import apply_update; res = apply_update(); print(res.get('message', res))"
echo.
echo 3. Reiniciando o servico Windows para carregar a nova versao...
python dashboard\service_manager.py restart
echo.
echo 4. Status atual do servico:
python dashboard\service_manager.py status
echo.
echo ==============================================================================
echo Concluído! O sistema foi atualizado para a versão mais recente do GitHub.
echo ==============================================================================
pause
