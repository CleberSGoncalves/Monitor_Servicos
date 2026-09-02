@echo off
REM Script de Desinstalação do Serviço Windows Agent
REM IMPORTANTE: Executar este script como Administrador!

cd /d "%~dp0"
echo Parando o serviço WinServiceFleetAgent...
python service_host.py stop

echo Removendo o registro do serviço...
python service_host.py remove

echo ========================================================
echo Servico WinServiceFleetAgent desinstalado com sucesso.
echo ========================================================
pause
