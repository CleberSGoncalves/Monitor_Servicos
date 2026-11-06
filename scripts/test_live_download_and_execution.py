import subprocess, sys

print("=== TESTE REAL DE DOWNLOAD E EXECUCAO DO SCRIPT DO GITHUB ===")

# 1. Baixa o script diretamente da URL publica que as pracas acessam
url = "https://raw.githubusercontent.com/CleberSGoncalves/Monitor_Servicos/main/WinServiceFleetAgent/Scripts/bootstrap_update.ps1"
print(f"1. Baixando de: {url}")

ps_code = f"""
$ErrorActionPreference = 'Stop'
try {{
    $content = irm '{url}'
    Write-Host "Bytes baixados: $($content.Length)"
    
    $errors = $null
    $tokens = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors)
    
    if ($errors -and $errors.Count -gt 0) {{
        Write-Host "FALHA: Erros de sintaxe encontrados:" -ForegroundColor Red
        foreach ($e in $errors) {{
            Write-Host " -> $($e.Message) na linha $($e.Extent.StartLineNumber):$($e.Extent.StartColumnNumber)" -ForegroundColor Red
        }}
        exit 1
    }} else {{
        Write-Host "SUCESSO: Script do GitHub 100% valido e livre de erros de sintaxe (AST Parse OK)!" -ForegroundColor Green
    }}
}} catch {{
    Write-Host "FALHA AO BAIXAR: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}}
"""

proc = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_code], capture_output=True, text=True)
print("STDOUT:")
print(proc.stdout)
if proc.stderr:
    print("STDERR:")
    print(proc.stderr)

if proc.returncode != 0:
    print(f"ERRO: Exit code {proc.returncode}")
    sys.exit(1)

print("Teste de Parse e Download Concluido com 100% de Sucesso!")
