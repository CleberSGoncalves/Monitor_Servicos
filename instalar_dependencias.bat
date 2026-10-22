@echo off
chcp 65001 > nul
title Instalador de Dependências Python - Central de Monitoração
cd /d "%~dp0"
echo ==============================================================================
echo       INSTALADOR DE DEPENDÊNCIAS PYTHON - CENTRAL CS FLEET
echo ==============================================================================
echo.
echo Instalando pacotes necessários (FastAPI, Uvicorn, Requests, Cryptography, Pydantic)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org
echo.
echo ==============================================================================
echo Instalação de dependências concluída!
echo ==============================================================================
pause
