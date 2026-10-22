@echo off
pushd "%~dp0"
title 1. Instalar Dependencias Python - Central CS Fleet
echo ==============================================================================
echo   PASSO 1: INSTALADOR DE DEPENDENCIAS PYTHON (Central CS Fleet)
echo ==============================================================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO CRITICO] O Python nao foi encontrado no PATH do Windows!
    echo Instale o Python 3.10 ou superior e marque a opcao "Add Python to PATH".
    popd
    pause
    exit /b 1
)

echo Instalando / Atualizando dependencias necessarias...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org
echo.
echo ==============================================================================
echo [OK] Dependencias instaladas com sucesso!
echo ==============================================================================
popd
pause
