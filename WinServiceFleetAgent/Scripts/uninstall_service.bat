@echo off
REM Script de Desinstalação do Serviço Windows Agent em C# .NET
REM IMPORTANTE: Executar este script como Administrador!

set SERVICE_NAME=Dna.Monitor_Service

echo Parando o serviço %SERVICE_NAME%...
sc stop %SERVICE_NAME%

echo Removendo o registro do serviço...
sc delete %SERVICE_NAME%

echo ========================================================
echo Servico %SERVICE_NAME% desinstalado com sucesso.
echo ========================================================
pause
