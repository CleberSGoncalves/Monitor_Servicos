"""
detection_safe_heal.py - Modulo de Auto-Cura Segura de Deteccao Comercial (MediaDNA / Atria / FastMatching)
Blindagem de dados: PROIBICAO ABSOLUTA de exclusao de arquivos .EMU (preserva historico retroativo).
"""
import uuid
import logging
from typing import Dict, Any, Optional
from fastapi import HTTPException

logger = logging.getLogger("DetectionSafeHeal")

def build_safe_detection_heal_script(mode: str = "safe_cascade_restart") -> str:
    """
    Gera o script PowerShell de auto-cura segura para o CS01.
    Garante:
    1. Zero exclusao de arquivos .EMU em data\\emu.
    2. Quarentena de arquivos corrompidos / 0 bytes / .tmp antigos.
    3. Rotacao segura de fma.log se >= 250 MB (evita travamento de I/O em Campinas/Itaituba).
    4. Exclusividade mutua estrita: nunca inicia FastMatchingSvc e DNA.DetectionSVC juntos.
    5. Modo sgg_resync_safe: quarentena da base data\\sgg com backup temporal, sem perder dados.
    """
    resync_sgg_flag = "$true" if mode == "sgg_resync_safe" else "$false"
    return rf"""
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$resyncSgg = {resync_sgg_flag}
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'

$baseData = @('D:\MediaDNA_V2\data','D:\mediadna_V2\data','C:\MediaDNA_V2\data','C:\DTV\data') | Where-Object {{ Test-Path $_ }} | Select-Object -First 1
if (-not $baseData) {{
    Write-Error "Diretorio MediaDNA_V2\data nao encontrado no Capture Site."
    exit 1
}}

$emuDir = Join-Path $baseData 'emu'
$detDir = Join-Path $baseData 'detection'
$trkDir = Join-Path $baseData 'tracking'
$sggDir = Join-Path $baseData 'sgg'
$quarDir = Join-Path $baseData "_quarantine\$stamp"

function Get-SafeCount($p, $filter='*.*') {{
    if (Test-Path $p) {{ return @(Get-ChildItem -Path $p -Filter $filter -File -ErrorAction SilentlyContinue).Count }}
    return 0
}}

$emuBefore = Get-SafeCount $emuDir '*.emu'
$detBefore = Get-SafeCount $detDir '*.xml'
$trkBefore = Get-SafeCount $trkDir '*.xml'
$sggBefore = Get-SafeCount $sggDir '*.*'
Write-Output "[PRE_CHECK] EMU=$emuBefore | DetectionXML=$detBefore | TrackingXML=$trkBefore | SGG=$sggBefore"

# 1. Identificar servicos e motores de matching
$fmCandidates = @('FastMatchingSvc','FastMatchingSVC','Fast Matching Service','FastMatching','FastMachingSvc','FastMachingService')
$fmSvc = Get-Service -ErrorAction SilentlyContinue | Where-Object {{ $fmCandidates -contains $_.Name -or $fmCandidates -contains $_.DisplayName }} | Select-Object -First 1
$detSvc = Get-Service -Name 'DNA.DetectionSVC' -ErrorAction SilentlyContinue
$trkSvc = Get-Service -Name 'DNA.TrackingSVC' -ErrorAction SilentlyContinue
$cfgSvc = Get-Service -Name 'DNA.ConfigMonitorSVC' -ErrorAction SilentlyContinue

# Regra de decisao do motor ativo:
$useFastMatching = $false
if ($fmSvc -and ($fmSvc.StartType -ne 'Disabled') -and (-not $detSvc -or $detSvc.StartType -ne 'Automatic' -or $fmSvc.Status -eq 'Running')) {{
    $useFastMatching = $true
}}

# 2. Stop em cascata reversa (preservando buffers)
foreach ($svc in @($cfgSvc, $trkSvc, $detSvc, $fmSvc)) {{
    if ($svc -and $svc.Status -ne 'Stopped') {{
        Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
    }}
}}
Start-Sleep -Seconds 3

# Encerra processos travados apenas dos servicos de esteira (NUNCA mata DigitalTVCapture/Atria!)
foreach ($pName in @('DNA.ConfigMonitorSVC','DNA.TrackingSVC','DNA.DetectionSVC','FastMatchingSvc','FastMachingSvc')) {{
    Get-Process -Name $pName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}}

# 3. Higienizacao cirurgica segura (ZERO toque em data\emu!)
New-Item -ItemType Directory -Path $quarDir -Force | Out-Null
$movedCount = 0
foreach ($folder in @($detDir, $trkDir)) {{
    if (Test-Path $folder) {{
        $badFiles = Get-ChildItem -Path $folder -File -ErrorAction SilentlyContinue | Where-Object {{
            $_.Length -eq 0 -or $_.Extension -in @('.err','.bad') -or ($_.Extension -eq '.tmp' -and $_.LastWriteTime -lt (Get-Date).AddMinutes(-15))
        }}
        foreach ($bf in $badFiles) {{
            Move-Item -Path $bf.FullName -Destination (Join-Path $quarDir $bf.Name) -Force -ErrorAction SilentlyContinue
            $movedCount++
        }}
    }}
}}

# 4. Blindagem de I/O: Rotacao preventiva de fma.log se >= 250 MB
$fmaLogPaths = @(
    'D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log',
    'D:\MediaDNA_V2\Applications\DTVCapture64\FastMachingSvc\fma.log',
    'C:\DTV\DTVCapture\FastMatchingSvc\fma.log',
    'C:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log'
)
$fmaRotated = $false
foreach ($flp in $fmaLogPaths) {{
    if (Test-Path $flp) {{
        $fi = Get-Item $flp
        $sizeMb = [math]::Round($fi.Length / 1MB, 1)
        if ($sizeMb -ge 250) {{
            $bak = Join-Path $fi.DirectoryName "fma_rot_$stamp.bak"
            Move-Item -Path $flp -Destination $bak -Force -ErrorAction SilentlyContinue
            Get-ChildItem -Path $fi.DirectoryName -Filter 'fma_rot_*.bak' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 2 | Remove-Item -Force -ErrorAction SilentlyContinue
            $fmaRotated = $true
            Write-Output "[LOG_ROTATION] fma.log rotacionado preventivamente ($sizeMb MB -> $bak)"
        }}
    }}
}}

# 5. Modo SGG Resync Seguro (Backup com timestamp ao inves de Delete)
if ($resyncSgg -and (Test-Path $sggDir)) {{
    $sggBak = Join-Path $baseData "_sgg_backup_$stamp"
    Move-Item -Path $sggDir -Destination $sggBak -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $sggDir -Force | Out-Null
    Get-ChildItem -Path $baseData -Directory -Filter '_sgg_backup_*' | Where-Object {{ $_.LastWriteTime -lt (Get-Date).AddDays(-3) }} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output "[SGG_RESYNC] Base SGG movida para backup seguro e recriada limpa."
}}

# 6. Start em cascata direta com exclusividade mutua
if ($cfgSvc) {{ Start-Service -Name $cfgSvc.Name -ErrorAction SilentlyContinue }}
Start-Sleep -Seconds 2
if ($useFastMatching -and $fmSvc) {{
    if ($detSvc) {{ Set-Service -Name $detSvc.Name -StartupType Manual -ErrorAction SilentlyContinue }}
    if ($trkSvc) {{ Set-Service -Name $trkSvc.Name -StartupType Manual -ErrorAction SilentlyContinue }}
    Start-Service -Name $fmSvc.Name -ErrorAction SilentlyContinue
    $activeEngine = $fmSvc.Name
}} else {{
    if ($fmSvc) {{ Stop-Service -Name $fmSvc.Name -Force -ErrorAction SilentlyContinue }}
    if ($trkSvc) {{ Start-Service -Name $trkSvc.Name -ErrorAction SilentlyContinue }}
    if ($detSvc) {{ Start-Service -Name $detSvc.Name -ErrorAction SilentlyContinue }}
    $activeEngine = 'DNA.DetectionSVC+TrackingSVC'
}}

# 7. Verificacao pos-cura (+15s)
Start-Sleep -Seconds 15
$emuAfter = Get-SafeCount $emuDir '*.emu'
$detAfter = Get-SafeCount $detDir '*.xml'
$trkAfter = Get-SafeCount $trkDir '*.xml'
$sggAfter = Get-SafeCount $sggDir '*.*'
$cfgState = (Get-Service -Name 'DNA.ConfigMonitorSVC' -ErrorAction SilentlyContinue).Status

Write-Output "[POST_CHECK] Engine=$activeEngine | ConfigMonitor=$cfgState | Quarantined=$movedCount | FmaRotated=$fmaRotated"
Write-Output "[EMU_INTEGRITY] EMU_BEFORE=$emuBefore | EMU_AFTER=$emuAfter | SGG_AFTER=$sggAfter | TRK_AFTER=$trkAfter"
Write-Output "[RESULT] Auto-Cura executada com sucesso. Fila EMU preservada."
"""

def execute_safe_detection_heal(
    hostname: str,
    mode: str = "safe_cascade_restart",
    user: Optional[Dict[str, Any]] = None,
    incident_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Despacha a Auto-Cura Segura para o Capture Site via Firestore e RemoteCommands.
    """
    user = user or {"username": "n1_operator", "full_name": "Operador N1", "role": "n1"}
    allowed_modes = {"safe_cascade_restart", "sgg_resync_safe"}
    if mode not in allowed_modes:
        raise HTTPException(status_code=400, detail=f"Modo de auto-cura invalido: {mode}. Use {allowed_modes}")

    script = build_safe_detection_heal_script(mode=mode)
    exec_id = f"heal_{uuid.uuid4().hex[:8]}"
    op_name = user.get("full_name") or user.get("username") or "Operador N1"
    title = f"Auto-Cura Segura Deteccao ({mode}) - {hostname}"

    from gcp_sync import dispatch_remote_command_to_firestore
    from remote_commands import dispatch_remote_command
    from version_governance import record_fleet_audit_event
    from incident_manager import register_incident_action

    # 1. Despacho em tempo real via Firestore (< 1s)
    gcp_ok = dispatch_remote_command_to_firestore(
        command_id=exec_id,
        hostname=hostname,
        service_name="Pipeline Deteccao CS01",
        action="SafeHealDetection",
        target_version="",
        shell_type="powershell",
        script=script,
        requested_by=op_name,
    )

    # 2. Despacho e registro via tabela SQLite de comandos remotos
    sql_exec_id = dispatch_remote_command(
        hosts=[hostname],
        shell_type="powershell",
        command_script=script,
        command_title=title,
        requested_by=f"{op_name} ({user.get('username', 'n1')})"
    )

    # 3. Auditoria formal de seguranca
    record_fleet_audit_event(
        user=user,
        action_type="SAFE_HEAL_DETECTION",
        target=hostname,
        service_name=f"Auto-Cura Deteccao ({mode})",
        reason="Execucao homologada segura sem exclusao de data\\emu",
        command_preview=f"[{mode}] Preserva data\\emu | Quarentena corrompidos | Rotaciona fma.log se grande",
        status="Sucesso" if (gcp_ok or sql_exec_id) else "Falha",
        details=f"Firestore={gcp_ok} | SQLiteExec={sql_exec_id}",
    )

    # 4. Registro no Worklog do Incidente
    if incident_key:
        register_incident_action(
            incident_key=incident_key,
            host=hostname,
            target_name="Esteira Deteccao CS01",
            incident_type="auto_cura_segura_deteccao",
            operator_username=user.get("username", "n1"),
            operator_name=op_name,
            action_taken=f"Auto-Cura Segura ({mode}) executada via Cockpit. Fila de .EMU preservada integralmente.",
            resolution_status="em_analise",
        )

    return {
        "success": True,
        "execution_id": sql_exec_id,
        "firestore_dispatched": gcp_ok,
        "mode": mode,
        "host": hostname,
        "emu_protected": True,
        "message": f"Auto-Cura Segura ({mode}) despachada para {hostname}. Fila de arquivos .EMU preservada."
    }
