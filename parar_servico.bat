@echo off
pushd "%~dp0dashboard"
python service_manager.py stop
popd
pause
