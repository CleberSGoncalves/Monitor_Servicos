# ==============================================================================
# Script de Atualização Atômica, Silenciosa e Resiliente (Rollback Automático)
# Executado como SYSTEM via Windows Task Scheduler isolado do serviço
# ==============================================================================
param(
    [string]$ServiceName = "DNA.MonitorServiceSVC",
    [string]$InstallDir = "",
    [string]$StagingDir = "",
    [string]$BackupBaseDir = "",
    [string]$CurrentVersion = "",
    [string]$TargetVersion = "",
    [string]$LogPath = ""
)

$ErrorActionPreference = "Continue"

# Define caminhos padrão caso não informados
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Split-Path -Parent $PSScriptRoot
    if (-not (Test-Path (Join-Path $InstallDir "WinServiceFleetAgent.exe"))) {
        $InstallDir = "D:\MediaDNA_V2\applications\MonitorServiceSVC"
    }
}

if ([string]::IsNullOrWhiteSpace($LogPath)) {
    $logDir = Join-Path $InstallDir "logs"
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    $LogPath = Join-Path $logDir "updater.log"
} else {
    $parent = Split-Path -Parent $LogPath
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
}

if ([string]::IsNullOrWhiteSpace($BackupBaseDir)) {
    $BackupBaseDir = "D:\MediaDNA_V2\applications\RollbackBackups"
}

$EventSource = "WinServiceFleetAgent"

function Write-UpdateLog {
    param(
        [string]$Message,
        [string]$Level = "INFO",
        [int]$EventId = 1000
    )
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$timestamp] [$Level] $Message"
    try {
        Add-Content -Path $LogPath -Value $logLine -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch {}

    try {
        if (-not [System.Diagnostics.EventLog]::SourceExists($EventSource)) {
            [System.Diagnostics.EventLog]::CreateEventSource($EventSource, "Application")
        }
        $entryType = [System.Diagnostics.EventLogEntryType]::Information
        if ($Level -eq "WARN") { $entryType = [System.Diagnostics.EventLogEntryType]::Warning }
        if ($Level -eq "ERROR") { $entryType = [System.Diagnostics.EventLogEntryType]::Error }
        [System.Diagnostics.EventLog]::WriteEntry($EventSource, $Message, $entryType, $EventId)
    } catch {}
}

Write-UpdateLog "==========================================================================" "INFO" 1000
Write-UpdateLog "Iniciando processo de auto-atualizacao atomica para $ServiceName" "INFO" 1000
Write-UpdateLog "Parametros: InstallDir='$InstallDir', StagingDir='$StagingDir', VersaoAtual='$CurrentVersion', VersaoAlvo='$TargetVersion'" "INFO" 1000

# 1. Aguarda 4 segundos para o agente chamador encerrar sua solicitacao
Start-Sleep -Seconds 4

# 2. Parar servico com timeout
Write-UpdateLog "Passo 1: Solicitando parada do servico '$ServiceName'..." "INFO" 1001
try { Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue } catch {}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -eq $svc -or $svc.Status -eq "Stopped") {
        break
    }
    Start-Sleep -Seconds 1
}

# Garante encerramento de qualquer processo remanescente
Get-Process -Name "WinServiceFleetAgent" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-UpdateLog "Encerrando processo remanescente PID $($_.Id)..." "WARN" 1001
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

# Testa se o arquivo executavel principal esta destravado
$exePath = Join-Path $InstallDir "WinServiceFleetAgent.exe"
$unlocked = $false
for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
        if (Test-Path $exePath) {
            $stream = [System.IO.File]::Open($exePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            $stream.Close()
            $stream.Dispose()
        }
        $unlocked = $true
        break
    } catch {
        Write-UpdateLog "Arquivo '$exePath' em uso. Tentativa $attempt/10 de liberacao..." "WARN" 1001
        Start-Sleep -Seconds 2
    }
}

if (-not $unlocked -and (Test-Path $exePath)) {
    Write-UpdateLog "ERRO CRITICO: Nao foi possivel destravar '$exePath'. Abortando atualizacao para seguranca da maquina." "ERROR" 3001
    try { Start-Service -Name $ServiceName -ErrorAction SilentlyContinue } catch {}
    exit 1
}

# 3. Criar Backup completo da pasta de instalacao
$backupTimestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
$backupDir = Join-Path $BackupBaseDir "Agent_Backup_v${CurrentVersion}_${backupTimestamp}"
Write-UpdateLog "Passo 2: Criando backup de seguranca em '$backupDir'..." "INFO" 1002

try {
    if (-not (Test-Path $BackupBaseDir)) { New-Item -ItemType Directory -Path $BackupBaseDir -Force | Out-Null }
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }

    Get-ChildItem -Path $InstallDir -Exclude "logs", "TempStaging" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $backupDir -Recurse -Force -ErrorAction Stop
    }
    Write-UpdateLog "Backup concluido com sucesso em '$backupDir'." "INFO" 1002
} catch {
    Write-UpdateLog "ERRO CRITICO: Falha ao criar backup de seguranca: $($_.Exception.Message). Abortando atualizacao." "ERROR" 3002
    try { Start-Service -Name $ServiceName -ErrorAction SilentlyContinue } catch {}
    exit 1
}

# 4. Preservar appsettings.json local existente (contem credenciais criptografadas e configs da praca)
$appsettingsBackup = Join-Path $backupDir "appsettings.json"
$appsettingsLocal = Join-Path $InstallDir "appsettings.json"

# 5. Copiar novos binarios do Staging para a pasta de instalacao
Write-UpdateLog "Passo 3: Substituindo binarios a partir de '$StagingDir'..." "INFO" 1003
$copyOk = $false
try {
    if (-not (Test-Path $StagingDir)) {
        throw "Diretorio de staging '$StagingDir' nao encontrado."
    }

    # Se dentro do staging houver subpasta unica contendo os arquivos, ajusta raiz
    $stagedItems = Get-ChildItem -Path $StagingDir
    $effectiveStaging = $StagingDir
    if ($stagedItems.Count -eq 1 -and $stagedItems[0].PSIsContainer) {
        $candidateExe = Join-Path $stagedItems[0].FullName "WinServiceFleetAgent.exe"
        if (Test-Path $candidateExe) {
            $effectiveStaging = $stagedItems[0].FullName
        }
    }

    Get-ChildItem -Path $effectiveStaging | ForEach-Object {
        # Evita sobrescrever appsettings.json existente com o padrao generico do zip
        if ($_.Name -ieq "appsettings.json" -and (Test-Path $appsettingsLocal)) {
            Write-UpdateLog "Preservando appsettings.json local existente (nao sobrescrito)." "INFO" 1003
        } else {
            Copy-Item -Path $_.FullName -Destination $InstallDir -Recurse -Force -ErrorAction Stop
        }
    }
    $copyOk = $true
    Write-UpdateLog "Substituicao de binarios finalizada com sucesso." "INFO" 1003
} catch {
    Write-UpdateLog "ERRO durante a copia dos binarios: $($_.Exception.Message)" "ERROR" 3003
    $copyOk = $false
}

# Se a copia falhou, dispara rollback imediatamente
if (-not $copyOk) {
    Write-UpdateLog "Disparando Rollback automatico por falha na copia dos arquivos..." "ERROR" 3004
    Get-ChildItem -Path $backupDir | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    try { Start-Service -Name $ServiceName -ErrorAction SilentlyContinue } catch {}
    exit 1
}

# 6. Iniciar servico e validar estabilidade (Health Check)
Write-UpdateLog "Passo 4: Iniciando servico '$ServiceName' na nova versao..." "INFO" 1004
$started = $false
for ($i = 1; $i -le 3; $i++) {
    try {
        Start-Service -Name $ServiceName -ErrorAction Stop
        $started = $true
        break
    } catch {
        Write-UpdateLog "Tentativa $i/3 de iniciar servico falhou: $($_.Exception.Message)" "WARN" 1004
        Start-Sleep -Seconds 3
    }
}

# Validacao de Estabilidade (Health Check pós-start)
$serviceHealthy = $false
if ($started) {
    Write-UpdateLog "Aguardando 7 segundos para verificacao de estabilidade do processo..." "INFO" 1004
    Start-Sleep -Seconds 7
    $svcCheck = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    $procCheck = Get-Process -Name "WinServiceFleetAgent" -ErrorAction SilentlyContinue
    if ($svcCheck.Status -eq "Running" -and $null -ne $procCheck) {
        $serviceHealthy = $true
    }
}

$logsDir = Join-Path $InstallDir "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

if ($serviceHealthy) {
    # ==================== SUCESSO ====================
    Write-UpdateLog "SUCESSO: Servico '$ServiceName' iniciado e saudavel na nova versao '$TargetVersion'!" "INFO" 1005

    # Registra marcador de sucesso para o agente reportar ao SharePoint no ciclo
    $successMarker = Join-Path $logsDir "update_success.json"
    $successData = @{
        ServiceName = $ServiceName
        PreviousVersion = $CurrentVersion
        NewVersion = $TargetVersion
        Timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        Status = "Success"
    } | ConvertTo-Json
    Set-Content -Path $successMarker -Value $successData -Encoding UTF8 -Force

    # Limpa staging
    try { Remove-Item -Path $StagingDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
} else {
    # ==================== FALHA / ROLLBACK AUTOMATICO ====================
    Write-UpdateLog "ALERTA CRITICO: Nova versao falhou na inicializacao/estabilidade. Disparando ROLLBACK AUTOMATICO para versao anterior '$CurrentVersion'..." "ERROR" 3005

    # Para qualquer processo anomalo
    Get-Process -Name "WinServiceFleetAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Restaura backup
    try {
        Get-ChildItem -Path $backupDir | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        Write-UpdateLog "Arquivos da versao anterior '$CurrentVersion' restaurados." "WARN" 2005

        Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        $restoredSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        Write-UpdateLog "Status do servico apos Rollback: $($restoredSvc.Status)" "INFO" 1005
    } catch {
        Write-UpdateLog "Erro grave durante restauracao do Rollback: $($_.Exception.Message)" "ERROR" 3006
    }

    # Registra marcador de rollback para o agente reportar ao SharePoint e Event Log
    $rollbackMarker = Join-Path $logsDir "rollback_occurred.json"
    $rollbackData = @{
        ServiceName = $ServiceName
        TargetVersion = $TargetVersion
        RestoredVersion = $CurrentVersion
        Timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        Error = "Nova versao falhou ao iniciar ou travou durante o health-check pos-atualizacao. Rollback executado com sucesso."
        Status = "RollbackExecuted"
    } | ConvertTo-Json
    Set-Content -Path $rollbackMarker -Value $rollbackData -Encoding UTF8 -Force
}

# 7. Remove tarefa agendada
try {
    schtasks.exe /delete /tn "WinServiceFleetAgent_AutoUpdate" /f 2>&1 | Out-Null
} catch {}

Write-UpdateLog "Processo de atualizacao finalizado." "INFO" 1000
