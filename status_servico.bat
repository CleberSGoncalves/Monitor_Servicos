@echo off
pushd "%~dp0dashboard"
python service_manager.py status
popd
pause
