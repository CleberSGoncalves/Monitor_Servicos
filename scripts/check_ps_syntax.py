import subprocess

cmd = [
    "powershell",
    "-NoProfile",
    "-Command",
    r"""
    $errors = $null
    $tokens = $null
    [System.Management.Automation.Language.Parser]::ParseFile("E:\desenvolvimento\Monitor_Servicos\WinServiceFleetAgent\Scripts\bootstrap_update.ps1", [ref]$tokens, [ref]$errors)
    if ($errors) {
        Write-Host "FOUND SYNTAX ERRORS:"
        $errors | ForEach-Object { Write-Host " - $($_.Message) at line $($_.Extent.StartLineNumber):$($_.Extent.StartColumnNumber)" }
        exit 1
    } else {
        Write-Host "CLEAN! NO SYNTAX ERRORS!"
        exit 0
    }
    """
]

res = subprocess.run(cmd, capture_output=True, text=True)
print(res.stdout)
print(res.stderr)
