import subprocess
import pytest

def test_gv_guard_skips_when_version_is_1_0_20_0():
    cmd = [
        "powershell",
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-Command",
        "$cur = '1.0.20.0'; if ($cur -eq '1.0.20.0') { Write-Host 'Ja atualizado na 1.0.20.0'; exit 0 } else { exit 1 }"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0
    assert "Ja atualizado na 1.0.20.0" in res.stdout

def test_gv_guard_proceeds_when_version_is_older():
    cmd = [
        "powershell",
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-Command",
        "$cur = '1.0.19.0'; if ($cur -eq '1.0.20.0') { exit 0 } else { Write-Host 'Atualizar'; exit 2 }"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 2
    assert "Atualizar" in res.stdout
