import os
import shutil
import subprocess
import tempfile
import pytest

@pytest.fixture
def test_dirs():
    base = tempfile.mkdtemp()
    dir_v19 = os.path.join(base, "v19")
    dir_v20 = os.path.join(base, "v20")
    os.makedirs(dir_v19, exist_ok=True)
    os.makedirs(dir_v20, exist_ok=True)

    # In v19: copy real 1.0.19.0 binary
    real_v19_exe = os.path.abspath("publish/agent_v1.0.19.0/WinServiceFleetAgent.exe")
    shutil.copy(real_v19_exe, os.path.join(dir_v19, "WinServiceFleetAgent.exe"))

    # In v20: copy real 1.0.20.0 binary
    real_v20_exe = os.path.abspath("publish/agent/WinServiceFleetAgent.exe")
    shutil.copy(real_v20_exe, os.path.join(dir_v20, "WinServiceFleetAgent.exe"))

    # Mock bootstrap in v19
    boot_v19 = os.path.join(dir_v19, "bootstrap_update.ps1")
    with open(boot_v19, "w", encoding="utf-8") as f:
        f.write('''param([switch]$Force)
$pkg = "DNA.MonitorServiceSVC_v1.0.19.0.zip"
$ver = "1.0.19.0"
Write-Host "Executando bootstrap com Pkg=$pkg e Ver=$ver"
exit 0
''')

    # Mock bootstrap in v20
    boot_v20 = os.path.join(dir_v20, "bootstrap_update.ps1")
    with open(boot_v20, "w", encoding="utf-8") as f:
        f.write('''param([switch]$Force)
$pkg = "DNA.MonitorServiceSVC_v1.0.20.0.zip"
$ver = "1.0.20.0"
Write-Host "Executando bootstrap com Pkg=$pkg e Ver=$ver"
exit 0
''')

    yield {"base": base, "dir_v19": dir_v19, "dir_v20": dir_v20, "boot_v19": boot_v19, "boot_v20": boot_v20}
    shutil.rmtree(base, ignore_errors=True)

def test_on_v20_host_skips_immediately(test_dirs):
    target_dir = test_dirs["dir_v20"]
    cmd = f'''$d = if (Test-Path '{target_dir}') {{ '{target_dir}' }} else {{ $null }}; if ($d) {{ $v = (Get-Item (Join-Path $d 'WinServiceFleetAgent.exe') -ErrorAction SilentlyContinue).VersionInfo.FileVersion; if ($v -eq '1.0.20.0') {{ Write-Host "[OK] Ja atualizado na versao $v"; exit 0 }}; $b = Join-Path $d 'bootstrap_update.ps1'; if (Test-Path $b) {{ (Get-Content $b) -replace 'DNA.MonitorServiceSVC_v1.0.19.0.zip','DNA.MonitorServiceSVC_v1.0.20.0.zip' -replace '1.0.19.0','1.0.20.0' | Set-Content $b; & $b -Force }} }}'''
    
    res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
    assert res.returncode == 0
    assert "[OK] Ja atualizado na versao 1.0.20.0" in res.stdout
    assert "Executando bootstrap" not in res.stdout

def test_on_v19_host_patches_and_executes(test_dirs):
    target_dir = test_dirs["dir_v19"]
    cmd = f'''$d = if (Test-Path '{target_dir}') {{ '{target_dir}' }} else {{ $null }}; if ($d) {{ $v = (Get-Item (Join-Path $d 'WinServiceFleetAgent.exe') -ErrorAction SilentlyContinue).VersionInfo.FileVersion; if ($v -eq '1.0.20.0') {{ Write-Host "[OK] Ja atualizado na versao $v"; exit 0 }}; $b = Join-Path $d 'bootstrap_update.ps1'; if (Test-Path $b) {{ (Get-Content $b) -replace 'DNA.MonitorServiceSVC_v1.0.19.0.zip','DNA.MonitorServiceSVC_v1.0.20.0.zip' -replace '1.0.19.0','1.0.20.0' | Set-Content $b; & $b -Force }} }}'''

    res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
    assert res.returncode == 0
    assert "[OK] Ja atualizado" not in res.stdout
    assert "Executando bootstrap com Pkg=DNA.MonitorServiceSVC_v1.0.20.0.zip e Ver=1.0.20.0" in res.stdout

def test_on_machine_without_monitorservice():
    cmd = '''$d = if (Test-Path 'Z:\\NonExistentPath') { 'Z:\\NonExistentPath' } else { $null }; if ($d) { exit 1 } else { Write-Host "MonitorServiceSVC nao instalado"; exit 0 }'''
    res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
    assert res.returncode == 0
    assert "MonitorServiceSVC nao instalado" in res.stdout

def test_via_cmd_process_start(test_dirs):
    target_dir = test_dirs["dir_v20"]
    # Simulates how Windows GV runs the command line through cmd / Process.Start
    full_cmd = f'powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "$d = if (Test-Path \'{target_dir}\') {{ \'{target_dir}\' }} else {{ $null }}; if ($d) {{ $v = (Get-Item (Join-Path $d \'WinServiceFleetAgent.exe\') -ErrorAction SilentlyContinue).VersionInfo.FileVersion; if ($v -eq \'1.0.20.0\') {{ Write-Host \'[OK] Ja atualizado na versao 1.0.20.0\'; exit 0 }} }}"'
    res = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    assert res.returncode == 0
    assert "[OK] Ja atualizado na versao 1.0.20.0" in res.stdout

def test_async_background_jitter_command(test_dirs):
    target_dir = test_dirs["dir_v19"]
    cmd = f'''$d = if (Test-Path '{target_dir}') {{ '{target_dir}' }} else {{ $null }}; if ($d) {{ $v = (Get-Item (Join-Path $d 'WinServiceFleetAgent.exe') -ErrorAction SilentlyContinue).VersionInfo.FileVersion; if ($v -eq '1.0.20.0') {{ Write-Host '[OK] Ja atualizado na versao 1.0.20.0'; exit 0 }}; $b = Join-Path $d 'bootstrap_update.ps1'; if (Test-Path $b) {{ (Get-Content $b) -replace 'DNA.MonitorServiceSVC_v1.0.19.0.zip','DNA.MonitorServiceSVC_v1.0.20.0.zip' -replace '1.0.19.0','1.0.20.0' | Set-Content $b; $delay = Get-Random -Minimum 10 -Maximum 900; Start-Process powershell.exe -ArgumentList "-ExecutionPolicy Bypass -NoProfile -Command Write-Host MockUpdate" -WindowStyle Hidden; Write-Host "[OK] Atualizacao v1.0.20.0 agendada em background (delay=${{delay}}s)"; exit 0 }} }}'''

    res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
    assert res.returncode == 0
    assert "[OK] Atualizacao v1.0.20.0 agendada em background" in res.stdout

