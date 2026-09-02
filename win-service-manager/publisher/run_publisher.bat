@echo off
title Windows Service Fleet Manager - Publisher
cd /d "%~dp0"
echo ========================================================
echo   Iniciando Publisher (Streamlit Web UI)
echo ========================================================
python -m streamlit run app.py --browser.gatherUsageStats=false
pause
