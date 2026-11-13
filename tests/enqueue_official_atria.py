import sys
sys.path.insert(0, 'dashboard')
from remote_queue import enqueue_command_on_sharepoint
import uuid

host = 'BRGO-ANA-DT02'
cmd = "powershell -ExecutionPolicy Bypass -Command \"& { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; $f = '$env:TEMP\\install_atria_v2002.ps1'; Write-Host '[Dashboard] Baixando instalador oficial Atria Capture v2.0.0.2...'; Invoke-WebRequest -Uri 'https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1' -OutFile $f -UseBasicParsing; Write-Host '[Dashboard] Executando instalador silencioso...'; & $f /nobackup /lav /ffdshow /nostreamlink /noytdlp; Write-Host '[Dashboard OK] Instalador concluido.' }\""
exec_id = f'atria_{uuid.uuid4().hex[:8]}'

res = enqueue_command_on_sharepoint(
    exec_id=exec_id,
    host=host,
    title='Atualização Autônoma Atria Capture v2.0.0.2',
    shell_type='powershell',
    script=cmd,
    requested_by='Dashboard Central (NOC)',
    timeout_s=600
)
print('Enqueue result:', res)
