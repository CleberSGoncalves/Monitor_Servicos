@echo off
cd /d "%~dp0dashboard"
python service_manager.py start
pause
