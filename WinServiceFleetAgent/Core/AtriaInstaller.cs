using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public static class AtriaInstaller
    {
        private const string VcRedistUrl = "https://aka.ms/vc14/vc_redist.x64.exe";
        private const string AtriaPsScriptUrl = "https://stgengineeringreleases.blob.core.windows.net/atriacapture/v2.0.0.0_x64_AVX2/install_v2000_x64.ps1";

        public static async Task<bool> InstallOrUpdateAtriaAsync()
        {
            try
            {
                FileLogger.Log("[AtriaInstaller] 🛑 Encerrando processos do Atria/DigitalTVCapture em execução para liberar arquivos...");
                foreach (var pName in new[] { "DigitalTVCapture", "AtriaCapture", "Atria" })
                {
                    try
                    {
                        foreach (var p in Process.GetProcessesByName(pName))
                        {
                            FileLogger.Log($"[AtriaInstaller] Encerrando processo PID {p.Id} ({p.ProcessName})...");
                            p.Kill(true);
                        }
                    }
                    catch (Exception exP)
                    {
                        FileLogger.Log($"[AtriaInstaller] Aviso ao encerrar {pName}: {exP.Message}");
                    }
                }

                string tempDir = Path.GetTempPath();
                string vcRedistFile = Path.Combine(tempDir, "vc_redist.x64.exe");

                // 1. Garantir que o redistributable C++ Redistributable (x64) esteja baixado e instalado
                FileLogger.Log($"[AtriaInstaller] 1/2. Baixando C++ Redistributable 64-bit ({VcRedistUrl})...");
                using (var http = new HttpClient())
                {
                    byte[] vcBytes = await http.GetByteArrayAsync(VcRedistUrl);
                    await File.WriteAllBytesAsync(vcRedistFile, vcBytes);
                }

                FileLogger.Log("[AtriaInstaller] Executando instalação silenciosa do vc_redist.x64.exe...");
                var vcPsi = new ProcessStartInfo
                {
                    FileName = vcRedistFile,
                    Arguments = "/install /quiet /norestart",
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var proc = Process.Start(vcPsi))
                {
                    if (proc != null)
                    {
                        await proc.WaitForExitAsync();
                        FileLogger.Log($"[AtriaInstaller] vc_redist.x64.exe concluído (Código de saída: {proc.ExitCode}).");
                    }
                }

                // 2. Download e execução do script de instalação do Atria
                FileLogger.Log($"[AtriaInstaller] 2/2. Executando script de instalação do Atria ({AtriaPsScriptUrl})...");
                string runnerScriptPath = Path.Combine(tempDir, "run_atria_installer.ps1");
                string scriptContent = @"
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$targetDir = 'D:\MediaDNA_V2\Applications\DTVCapture64'
$defaultDir = 'C:\DTV\DTVCapture'
if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir }

# 1. LOCALIZACAO E BACKUP DA CONFIGURACAO ORIGINAL (AppConfig.xml e pasta Config)
Write-Host '[AtriaInstaller] Localizando arquivos de configuracao originais da estacao para backup...'
$existingConfigPaths = @(
    ""$targetDir\Config\AppConfig.xml"",
    'D:\MediaDNA_V2\Applications\DtvCapture\Config\AppConfig.xml',
    ""$defaultDir\Config\AppConfig.xml"",
    'C:\DTVCapture\Config\AppConfig.xml'
)

$backupConfigDir = Join-Path $env:TEMP 'AtriaConfigBackup'
if (-not (Test-Path $backupConfigDir)) { New-Item -ItemType Directory -Force -Path $backupConfigDir }

$foundConfig = $null
foreach ($cfg in $existingConfigPaths) {
    if (Test-Path $cfg) {
        $foundConfig = $cfg
        Write-Host ""[AtriaInstaller] Configuracao encontrada em '$foundConfig'. Criando backup em '$backupConfigDir'...""
        $cfgFolder = Split-Path $cfg -Parent
        if (Test-Path $cfgFolder) {
            Copy-Item -Path ""$cfgFolder\*"" -Destination $backupConfigDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        break
    }
}

# 2. FINALIZAR PROCESSOS ANTES DA DESINSTALACAO / ATUALIZACAO
Write-Host '[AtriaInstaller] Encerrando processos do Atria/FastMatching...'
Get-Process -Name 'DigitalTVCapture', 'AtriaCapture', 'Atria', 'DigitalTVReceiver', 'FastMatchingSvc' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 3. REMOVER VERSOES ANTERIORES DO MSI SILENCIOSAMENTE
Write-Host '[AtriaInstaller] Removendo versoes anteriores do Atria Capture silenciosamente (/qn /norestart)...'
$unKeys = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $unKeys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*Atria*' -or $_.DisplayName -like '*DigitalTV*' } | ForEach-Object {
    if ($_.UninstallString -match '\{[A-Fa-f0-9-]+\}') {
        $g = $Matches[0]
        Write-Host ""[AtriaInstaller] Desinstalando MSI GUID $g silenciosamente...""
        Start-Process -FilePath 'msiexec.exe' -ArgumentList ""/x $g /qn /norestart"" -Wait
    }
}

# 4. DOWNLOAD E EXECUCAO DO INSTALADOR OFICIAL
$downloadFile = Join-Path $env:TEMP 'atria_setup.ps1'
Write-Host '[AtriaInstaller] Baixando script de instalacao do Atria...'
Invoke-WebRequest -Uri '" + AtriaPsScriptUrl + @"' -OutFile $downloadFile -UseBasicParsing
Write-Host '[AtriaInstaller] Executando script de instalacao silencioso (/nobackup /lav /ffdshow /nostreamlink /noytdlp)...'
& $downloadFile /nobackup /lav /ffdshow /nostreamlink /noytdlp

# 5. COPIAR ARQUIVOS INSTALADOS PARA O DIRETORIO PADRAO DO MEDIADNA (D:)
if ((Test-Path $defaultDir) -and ($defaultDir -ne $targetDir)) {
    Write-Host ""[AtriaInstaller] Sincronizando novos binarios de $defaultDir para $targetDir...""
    Copy-Item -Path ""$defaultDir\*"" -Destination $targetDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 6. RESTAURAR E SINCRONIZAR CONFIGURACOES EM AMBOS OS LOCAIS (D: E C:)
if (Test-Path ""$backupConfigDir\AppConfig.xml"") {
    Write-Host ""[AtriaInstaller] Restaurando configuracao da estacao (AppConfig.xml) em D: e em C:...""
    $targetCfg = Join-Path $targetDir 'Config'
    if (-not (Test-Path $targetCfg)) { New-Item -ItemType Directory -Force -Path $targetCfg }
    Copy-Item -Path ""$backupConfigDir\*"" -Destination $targetCfg -Recurse -Force -ErrorAction SilentlyContinue

    $defaultCfg = Join-Path $defaultDir 'Config'
    if (-not (Test-Path $defaultCfg)) { New-Item -ItemType Directory -Force -Path $defaultCfg }
    Copy-Item -Path ""$backupConfigDir\*"" -Destination $defaultCfg -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '[AtriaInstaller] AppConfig.xml sincronizado com sucesso nos dois diretorios!'
} else {
    Write-Host '[AtriaInstaller] Verificando se existe configuracao preexistente em D: ou C:...'
    $targetAppConfig = Join-Path $targetDir 'Config\AppConfig.xml'
    $defaultAppConfig = Join-Path $defaultDir 'Config\AppConfig.xml'
    if (Test-Path $targetAppConfig) {
        $defaultCfgDir = Join-Path $defaultDir 'Config'
        if (-not (Test-Path $defaultCfgDir)) { New-Item -ItemType Directory -Force -Path $defaultCfgDir }
        Copy-Item -Path (Join-Path $targetDir 'Config\*') -Destination $defaultCfgDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host '[AtriaInstaller] Copiado AppConfig.xml de D: para C: com sucesso!'
    } elseif (Test-Path $defaultAppConfig) {
        $targetCfgDir = Join-Path $targetDir 'Config'
        if (-not (Test-Path $targetCfgDir)) { New-Item -ItemType Directory -Force -Path $targetCfgDir }
        Copy-Item -Path (Join-Path $defaultDir 'Config\*') -Destination $targetCfgDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host '[AtriaInstaller] Copiado AppConfig.xml de C: para D: com sucesso!'
    }
}

# 7. LOGROTATE E FASTMATCHINGSVC
$logRotateConf = Join-Path $targetDir 'FastMatchingSvc\LogRotate\LogRotate.Conf'
if (Test-Path $logRotateConf) {
    Write-Host '[AtriaInstaller] Atualizando LogRotate.Conf para D:\MediaDNA_V2\Applications\DTVCapture64...'
    $content = Get-Content -Path $logRotateConf -Raw
    $correctLogPath = Join-Path $targetDir 'FastMatchingSvc\fma.log'
    $updatedContent = $content -replace 'C:\\DTV\\DTVCapture\\FastMatchingSvc\\fma\.log', $correctLogPath.Replace('\', '\\')
    Set-Content -Path $logRotateConf -Value $updatedContent -Force
}

$fmaExe = Join-Path $targetDir 'FastMatchingSvc\FastMatchingSvc.exe'
if (Test-Path $fmaExe) {
    Write-Host '[AtriaInstaller] Reinstalando FastMatchingSVC no diretorio D:\MediaDNA_V2\Applications\DTVCapture64...'
    $fmaDir = Split-Path $fmaExe -Parent
    Stop-Service -Name 'FastMatchingSVC', 'FastMatchingSvc' -Force -ErrorAction SilentlyContinue
    sc.exe stop FastMatchingSVC 2>&1 | Out-Null
    Start-Process -FilePath $fmaExe -ArgumentList '/uninstall' -WorkingDirectory $fmaDir -Wait
    Start-Process -FilePath $fmaExe -ArgumentList '/install' -WorkingDirectory $fmaDir -Wait
    sc.exe config FastMatchingSVC binPath= ""`""$fmaExe`"""" 2>&1 | Out-Null
    sc.exe failure FastMatchingSVC reset= 86400 actions= restart/60000 2>&1 | Out-Null
    Start-Service -Name 'FastMatchingSVC' -ErrorAction SilentlyContinue
}

$logRotateExe = Join-Path $targetDir 'FastMatchingSVC\logrotate\logrotate.exe'
if (Test-Path $logRotateExe) {
    Write-Host '[AtriaInstaller] Reconfigurando tarefa agendada FMA-LogRotation...'
    $trArg = '""' + $logRotateExe + '"" ""' + $logRotateConf + '"" --state ""' + $targetDir + '\FastMatchingSVC\logrotate\logrotate.status""'
    schtasks /Create /F /RU ""NT AUTHORITY\SYSTEM"" /NP /TN FMA-LogRotation /sc daily /st 23:59:57 /TR $trArg
}

# 8. ATUALIZAR ATALHOS DO WINDOWS (.lnk)
Write-Host '[AtriaInstaller] Atualizando atalhos do Windows para apontar para D:\MediaDNA_V2\Applications\DTVCapture64...'
$shortcutFolders = @(
    [Environment]::GetFolderPath('CommonDesktopDirectory'),
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonPrograms'),
    [Environment]::GetFolderPath('Programs')
)
$wsh = New-Object -ComObject WScript.Shell
$finalTargetExe = Join-Path $targetDir 'DigitalTVCapture.exe'

foreach ($sFolder in $shortcutFolders) {
    if (Test-Path $sFolder) {
        Get-ChildItem -Path $sFolder -Filter ""*.lnk"" -Recurse -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -like '*Atria*' -or $_.Name -like '*DigitalTV*' -or $_.Name -like '*DTVCapture*'
        } | ForEach-Object {
            try {
                $lnk = $wsh.CreateShortcut($_.FullName)
                $lnk.TargetPath = $finalTargetExe
                $lnk.WorkingDirectory = $targetDir
                $lnk.Save()
                Write-Host ""[AtriaInstaller] Atalho atualizado: $($_.FullName) -> $finalTargetExe""
            } catch { }
        }
    }
}

$finalExe = $finalTargetExe
if (-not (Test-Path $finalExe)) {
    $exePaths = @(
        'D:\MediaDNA_V2\Applications\DTVCapture64\DigitalTVCapture.exe',
        'D:\MediaDNA_V2\Applications\DtvCapture\DigitalTVCapture.exe',
        'C:\DTV\DTVCapture\DigitalTVCapture.exe',
        'C:\DTVCapture\DigitalTVCapture.exe'
    )
    $finalExe = $exePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if ($finalExe -and (Test-Path $finalExe)) {
    # NAO usar Start-Process aqui: este script roda como SYSTEM na Sessao 0 e a aplicacao
    # nasceria invisivel (aparece no Gerenciador de Tarefas mas sem janela).
    # A abertura na sessao do usuario e feita pelo agente C# (InteractiveProcessLauncher).
    Write-Host ""[AtriaInstaller] Executavel pronto em $finalExe. Abertura sera feita na sessao do usuario pelo agente.""
} else {
    Write-Host '[AtriaInstaller] Executavel DigitalTVCapture.exe nao foi encontrado para inicializacao.'
}
";

                await File.WriteAllTextAsync(runnerScriptPath, scriptContent, System.Text.Encoding.UTF8);

                var psPsi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-ExecutionPolicy Bypass -NoProfile -File \"{runnerScriptPath}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                using (var psProc = new Process { StartInfo = psPsi })
                {
                    DateTime lastActivityTime = DateTime.Now;
                    TimeSpan maxInactivity = TimeSpan.FromMinutes(20);
                    var combinedOutput = new System.Text.StringBuilder();

                    psProc.OutputDataReceived += (s, e) =>
                    {
                        if (!string.IsNullOrWhiteSpace(e.Data))
                        {
                            lastActivityTime = DateTime.Now;
                            FileLogger.Log($"[AtriaInstaller Out] {e.Data.Trim()}");
                            lock (combinedOutput) { combinedOutput.AppendLine(e.Data); }
                        }
                    };

                    psProc.ErrorDataReceived += (s, e) =>
                    {
                        if (!string.IsNullOrWhiteSpace(e.Data))
                        {
                            lastActivityTime = DateTime.Now;
                            FileLogger.LogError($"[AtriaInstaller Err] {e.Data.Trim()}");
                            lock (combinedOutput) { combinedOutput.AppendLine($"ERR: {e.Data}"); }
                        }
                    };

                    FileLogger.Log("[AtriaInstaller] 🔄 Acompanhando progresso do instalador em tempo real (sem limite fixo de tempo; cancela apenas se ficar 20min em silêncio)...");
                    psProc.Start();
                    psProc.BeginOutputReadLine();
                    psProc.BeginErrorReadLine();

                    while (!psProc.HasExited)
                    {
                        await Task.Delay(2000);

                        if (DateTime.Now - lastActivityTime > maxInactivity)
                        {
                            FileLogger.LogError($"[AtriaInstaller] ⏱️ O instalador do Atria ficou 20 minutos em silêncio absoluto (sem progresso de log). Forçando encerramento do processo PID {psProc.Id}...");
                            try { psProc.Kill(true); } catch { }
                            return false;
                        }
                    }

                    await psProc.WaitForExitAsync();

                    try
                    {
                        string logSavePath = Path.Combine(tempDir, "atria_install_last.log");
                        string finalLogText = $"=== ATRIA INSTALL LOG ({DateTime.Now}) ===\r\nExitCode: {psProc.ExitCode}\r\n\r\n{combinedOutput}";
                        await File.WriteAllTextAsync(logSavePath, finalLogText);
                    }
                    catch { }

                    FileLogger.Log($"[AtriaInstaller] Instalação do Atria finalizada com código de saída: {psProc.ExitCode}");
                    return psProc.ExitCode == 0 || psProc.ExitCode == 3010;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError("[AtriaInstaller] ❌ Erro ao atualizar/instalar Atria Capture", ex);
                return false;
            }
        }

        public static void StartAtriaApplication(string installPath, string exeName)
        {
            try
            {
                string? targetExe = null;
                var searchPaths = new[]
                {
                    @"D:\MediaDNA_V2\Applications\DTVCapture64\DigitalTVCapture.exe",
                    string.IsNullOrWhiteSpace(installPath) ? null : Path.Combine(installPath, exeName),
                    @"D:\MediaDNA_V2\Applications\DtvCapture\DigitalTVCapture.exe",
                    @"C:\DTV\DTVCapture\DigitalTVCapture.exe",
                    @"C:\DTVCapture\DigitalTVCapture.exe"
                };

                foreach (var p in searchPaths)
                {
                    if (!string.IsNullOrWhiteSpace(p) && File.Exists(p))
                    {
                        targetExe = p;
                        break;
                    }
                }

                if (targetExe != null)
                {
                    if (InteractiveProcessLauncher.IsAtriaRunningInUserSession())
                    {
                        FileLogger.Log("[AtriaInstaller] Atria Capture já está aberto na sessão do usuário. Nenhuma ação necessária.");
                        return;
                    }

                    if (InteractiveProcessLauncher.GetActiveUserSessionId() == null)
                    {
                        FileLogger.Log("[AtriaInstaller] ⚠️ Nenhum usuário logado no Capture Site. A interface do Atria será aberta quando houver sessão ativa (instâncias da Sessão 0 preservadas para não interromper a captura).");
                        return;
                    }

                    // Instaladores (MSI/script oficial) rodando como SYSTEM costumam deixar o Atria aberto na Sessão 0
                    // (processos visíveis no Gerenciador de Tarefas, porém sem janela). Remove os fantasmas antes de abrir.
                    int ghosts = InteractiveProcessLauncher.KillSessionZeroAtriaInstances();
                    if (ghosts > 0)
                    {
                        FileLogger.Log($"[AtriaInstaller] {ghosts} instância(s) invisível(is) do Atria encerrada(s) na Sessão 0.");
                        System.Threading.Thread.Sleep(3000);
                    }

                    FileLogger.Log($"[AtriaInstaller] 🚀 Abrindo aplicação Atria Capture na Sessão Interativa do Usuário em '{targetExe}'...");
                    string? workDir = Path.GetDirectoryName(targetExe);
                    bool started = InteractiveProcessLauncher.LaunchProcessInActiveSession(targetExe, workDir);
                    if (started)
                    {
                        FileLogger.Log("[AtriaInstaller] ✅ Aplicação Atria Capture iniciada na sessão ativa com sucesso!");
                    }
                    else
                    {
                        FileLogger.LogError($"[AtriaInstaller] ❌ Falha ao iniciar a aplicação interativa '{targetExe}'.");
                    }
                }
                else
                {
                    FileLogger.Log($"[AtriaInstaller] ⚠️ Executável '{exeName}' não foi localizado para inicialização.");
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[AtriaInstaller] ❌ Erro ao iniciar a aplicação '{exeName}'", ex);
            }
        }
    }
}
