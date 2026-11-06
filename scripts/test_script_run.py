import subprocess, sys

print("=== TESTANDO EXECUCAO REAL DO BOOTSTRAP EM TESTE CONTROLADO ===")

# Vamos rodar o script com PowerShell diretamente para ver sua execucao ao vivo
ps_cmd = [
    "powershell",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    r"""
    $scriptPath = "E:\desenvolvimento\Monitor_Servicos\WinServiceFleetAgent\Scripts\bootstrap_update.ps1"
    Write-Host "Executando $scriptPath..."
    & $scriptPath -Force
    """
]

proc = subprocess.run(ps_cmd, capture_output=True, text=True, timeout=120)
print("STDOUT:")
print(proc.stdout)
if proc.stderr:
    print("STDERR:")
    print(proc.stderr)

print(f"Exit Code: {proc.returncode}")
