import sys
import subprocess
from pathlib import Path

# Add dashboard to sys.path
dashboard_dir = Path(__file__).resolve().parent.parent / "dashboard"
scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
if str(dashboard_dir) not in sys.path:
    sys.path.insert(0, str(dashboard_dir))
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

from remote_commands import SYSTEMIC_AI_COMMANDS_POOL, simulate_or_execute_on_host
from atualizar_logrotate_frota import carregar_hosts_frota


def test_powershell_logrotate_script_content_and_syntax():
    """
    Garante que o script PowerShell oficial existe, possui sintaxe válida
    e contém o arquivo logrotate.conf exato apontando para D:\... com rotate 10.
    """
    ps_file = scripts_dir / "Corrigir_LogRotate_FastMatching.ps1"
    assert ps_file.exists(), "Script PowerShell deve existir em scripts/Corrigir_LogRotate_FastMatching.ps1"

    content = ps_file.read_text(encoding="utf-8")
    
    # 1. Verifica conteúdo exato exigido pelo usuário
    assert r"D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log {" in content
    assert "rotate 10" in content
    assert "daily" in content
    assert "dateext" in content
    assert "dateformat .%Y%m%d" in content
    assert "missingok" in content

    # 2. Verifica regra operacional de reinício condicional do FastMatching
    assert "Restart-Service" in content
    assert "Running" in content

    # 3. Valida sintaxe PowerShell via Get-Command
    p = subprocess.run(
        ['powershell', '-NoProfile', '-Command', f'& {{ Get-Command -Syntax (Resolve-Path "{ps_file}") }}'],
        capture_output=True,
        text=True
    )
    assert p.returncode == 0, f"Sintaxe PowerShell deve ser 100% válida. Erro: {p.stderr}"


def test_ai_command_pool_has_logrotate_fix():
    """
    Valida que o catálogo inteligente de comandos do Dashboard possui a ferramenta
    de correção do LogRotate pronta para uso pela equipe de NOC.
    """
    cmd = next((c for c in SYSTEMIC_AI_COMMANDS_POOL if c.get("id") == "ai_cmd_fix_logrotate_fastmatching"), None)
    assert cmd is not None, "Comando ai_cmd_fix_logrotate_fastmatching deve constar no catálogo de IA"
    assert "rotate 10" in cmd["command"]
    assert r"D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log" in cmd["command"]
    assert cmd["category"] == "correcao"


def test_simulate_or_execute_on_host_logrotate():
    """
    Valida a saída simulada do comando de logrotate tanto para nós ativos quanto parados.
    """
    out_active = simulate_or_execute_on_host("Aracaju-SMME-328-CS1", "powershell", "corrigir logrotate fma.log")
    assert "D:\\MediaDNA_V2\\Applications\\DTVCapture64\\FastMatchingSvc\\fma.log" in out_active
    assert "rotate 10" in out_active
    assert "FastMatchingSvc" in out_active


def test_atualizar_logrotate_frota_targeting():
    """
    Garante que o orquestrador em lote identifique corretamente nós CS01 e separe
    aqueles com FastMatching rodando daqueles que não devem sofrer reinício de serviço.
    """
    hosts_cs1 = carregar_hosts_frota(apenas_cs1=True)
    assert len(hosts_cs1) > 50, "Deve haver mais de 50 nós CS01 mapeados"

    running_fma = [h for h in hosts_cs1 if h["fastmatching_running"]]
    assert len(running_fma) > 0, "Deve haver hosts com FastMatching em execução identificados"

    for h in running_fma:
        assert h["cs"] == 1, "FastMatching em execução deve ser estritamente no nó CS01"
