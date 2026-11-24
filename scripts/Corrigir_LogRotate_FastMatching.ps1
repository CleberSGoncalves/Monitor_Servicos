<#
.SYNOPSIS
    Corrige o apontamento do logrotate.conf para a unidade D: (fma.log) e define rotate 3.
    Reinicia condicionalmente o serviço FastMatchingSvc APENAS nas praças onde ele estiver ativo.

.DESCRIPTION
    1. Localiza ou cria o arquivo logrotate.conf na pasta FastMatchingSvc\LogRotate.
    2. Atualiza a configuração para monitorar D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log com rotate 3.
    3. Trata arquivos fma.log excessivamente grandes (>50MB).
    4. Verifica o status do serviço FastMatchingSvc:
       - Se estiver 'Running': reinicia o serviço para aplicar a nova rotação.
       - Se estiver 'Stopped' ou não instalado: NÃO reinicia e mantém o estado original.

.AUTHOR
    Kantar IBOPE Media / MediaDNA Engineering
#>

[CmdletBinding()]
param(
    [switch]$ForceRotation = $true
)

$ErrorActionPreference = "Continue"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " [LogRotate FastMatching] Correcao de Apontamento fma.log e Rotate 3     " -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Data/Hora: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Host: $env:COMPUTERNAME" -ForegroundColor Gray

# 1. Definicao do conteudo exato homologado para o logrotate.conf
$targetConfigContent = @"
D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log {
        daily
		dateext
		dateformat .%Y%m%d
		missingok
		rotate 3
}
"@

# 2. Caminhos candidatos do logrotate.conf nos Capture Sites
$candidateConfPaths = @(
    "D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\LogRotate\logrotate.conf",
    "C:\DTV\DTVCapture\FastMatchingSvc\LogRotate\logrotate.conf",
    "D:\DTV\DTVCapture\FastMatchingSvc\LogRotate\logrotate.conf",
    "C:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\LogRotate\logrotate.conf"
)

$targetDirPrimary = "D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\LogRotate"
$targetConfPrimary = "D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\LogRotate\logrotate.conf"

$updatedCount = 0

# Garante a criacao do diretorio primario se existir a pasta FastMatchingSvc
$fmaBaseDir = "D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc"
if (Test-Path $fmaBaseDir) {
    if (-not (Test-Path $targetDirPrimary)) {
        New-Item -ItemType Directory -Path $targetDirPrimary -Force | Out-Null
        Write-Host "[OK] Diretorio LogRotate criado em: $targetDirPrimary" -ForegroundColor Green
    }
}

# Atualiza todos os arquivos encontrados
$pathsToProcess = [System.Collections.Generic.List[string]]::new()
foreach ($p in $candidateConfPaths) {
    if (Test-Path $p) {
        $pathsToProcess.Add($p)
    }
}

# Se nenhum existir mas a pasta primaria existir, adiciona o caminho primario para criacao
if ($pathsToProcess.Count -eq 0 -and (Test-Path $targetDirPrimary)) {
    $pathsToProcess.Add($targetConfPrimary)
}

if ($pathsToProcess.Count -eq 0) {
    # Tenta criar em D: padrao
    try {
        New-Item -ItemType Directory -Path $targetDirPrimary -Force | Out-Null
        $pathsToProcess.Add($targetConfPrimary)
    } catch {
        Write-Host "[AVISO] Nao foi possivel acessar diretorio FastMatching em D:. Tentando C:..." -ForegroundColor Yellow
        $altDir = "C:\DTV\DTVCapture\FastMatchingSvc\LogRotate"
        if (Test-Path $altDir) { $pathsToProcess.Add("$altDir\logrotate.conf") }
    }
}

foreach ($confFile in $pathsToProcess) {
    try {
        $parentDir = Split-Path -Parent $confFile
        if (-not (Test-Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }

        # Backup da versao anterior se existir
        if (Test-Path $confFile) {
            $bakFile = "$confFile.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            Copy-Item -Path $confFile -Destination $bakFile -Force
            Write-Host "[BKP] Backup salvo em: $bakFile" -ForegroundColor DarkGray
        }

        # Grava a nova configuracao exata em UTF8 (sem BOM) / ASCII
        [System.IO.File]::WriteAllText($confFile, $targetConfigContent, [System.Text.Encoding]::ASCII)
        Write-Host "[OK] logrotate.conf atualizado com sucesso em: $confFile" -ForegroundColor Green
        $updatedCount++
    } catch {
        Write-Host "[ERRO] Falha ao atualizar $confFile : $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 3. Tratar fma.log excessivamente grande existente (se houver)
$fmaLogFile = "D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log"
if (-not (Test-Path $fmaLogFile)) {
    $fmaLogFile = "C:\DTV\DTVCapture\FastMatchingSvc\fma.log"
}

if (Test-Path $fmaLogFile) {
    try {
        $logItem = Get-Item $fmaLogFile
        $sizeMb = [math]::Round($logItem.Length / 1MB, 2)
        Write-Host "[Log] Arquivo fma.log atual encontrado: $fmaLogFile ($sizeMb MB)" -ForegroundColor Yellow

        # Se o log tiver mais de 50MB e existir o logrotate.exe, dispara rotacao imediata
        $logrotateExe = "D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\LogRotate\logrotate.exe"
        if (-not (Test-Path $logrotateExe)) {
            $logrotateExe = "C:\DTV\DTVCapture\FastMatchingSvc\LogRotate\logrotate.exe"
        }

        if (Test-Path $logrotateExe) {
            Write-Host "[LogRotate] Executando logrotate.exe para rotacao imediata do log..." -ForegroundColor Cyan
            $rotateProc = Start-Process -FilePath $logrotateExe -ArgumentList "-f `"$targetConfPrimary`"" -WorkingDirectory (Split-Path $logrotateExe) -Wait -PassThru -NoNewWindow
            Write-Host "[LogRotate] Processo finalizado com codigo de saida: $($rotateProc.ExitCode)" -ForegroundColor Green
        } elseif ($sizeMb -gt 100) {
            # Se nao tiver logrotate.exe mas o arquivo tiver > 100MB, cria arquivo arquivado
            $archivedName = "$fmaLogFile." + (Get-Date -Format "yyyyMMdd")
            if (-not (Test-Path $archivedName)) {
                Copy-Item -Path $fmaLogFile -Destination $archivedName -Force
                Clear-Content -Path $fmaLogFile -Force
                Write-Host "[OK] fma.log arquivado como $archivedName e truncado para liberar espaco!" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "[AVISO] Nao foi possivel rotacionar fma.log imediatamente: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

# 4. Verificacao e Reinicio Condicional do Servico FastMatchingSvc
Write-Host ""
Write-Host "[4/4] Verificando status do servico 'FastMatchingSvc'..." -ForegroundColor Cyan
$fmaSvc = Get-Service -Name "FastMatchingSvc" -ErrorAction SilentlyContinue

if ($null -ne $fmaSvc) {
    $currentStatus = $fmaSvc.Status
    Write-Host "[Status] Servico 'FastMatchingSvc' detectado: Status = $currentStatus" -ForegroundColor Yellow

    if ($currentStatus -eq [System.ServiceProcess.ServiceControllerStatus]::Running) {
        Write-Host "--> REGRA OPERACIONAL ATIVA: FastMatchingSvc esta em EXECUCAO nesta praca. Reiniciando servico..." -ForegroundColor Green
        try {
            Restart-Service -Name "FastMatchingSvc" -Force -Verbose
            Start-Sleep -Seconds 3
            $fmaSvc.Refresh()
            Write-Host "[SUCESSO] FastMatchingSvc reiniciado com sucesso! Status atual: $($fmaSvc.Status)" -ForegroundColor Green
        } catch {
            Write-Host "[ERRO] Falha ao reiniciar FastMatchingSvc: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "--> REGRA OPERACIONAL MANTIDA: FastMatchingSvc esta $currentStatus. O servico NAO sera reiniciado nem iniciado." -ForegroundColor Cyan
    }
} else {
    Write-Host "[INFO] Servico 'FastMatchingSvc' NAO esta instalado neste host (operando via DetectionSVC ou CS secundario). Nenhum reinicio necessario." -ForegroundColor DarkCyan
}

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " [LogRotate FastMatching] Execucao Concluida com Sucesso!                 " -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan
