@echo off
cd /d "%~dp0"
python service_manager.py restart
pause
