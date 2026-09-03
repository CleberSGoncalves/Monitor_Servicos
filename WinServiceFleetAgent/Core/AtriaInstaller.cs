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
Get-Process -Name 'DigitalTVCapture', 'AtriaCapture', 'Atria' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$targetDir = 'D:\MediaDNA_V2\Applications\DTVCapture64'
if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir }

Write-Host '[AtriaInstaller] Removendo versoes anteriores do Atria Capture silenciosamente (/qn /norestart)...'
$unKeys = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $unKeys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*Atria*' -or $_.DisplayName -like '*DigitalTV*' } | ForEach-Object {
    if ($_.UninstallString -match '\{[A-Fa-f0-9-]+\}') {
        $g = $Matches[0]
        Write-Host ""[AtriaInstaller] Desinstalando MSI GUID $g silenciosamente...""
        Start-Process -FilePath 'msiexec.exe' -ArgumentList ""/x $g /qn /norestart"" -Wait
    }
}

$downloadFile = Join-Path $env:TEMP 'atria_setup.ps1'
Write-Host '[AtriaInstaller] Baixando script de instalacao do Atria...'
Invoke-WebRequest -Uri '" + AtriaPsScriptUrl + @"' -OutFile $downloadFile -UseBasicParsing
Write-Host '[AtriaInstaller] Executando script de instalacao silencioso (/nobackup /lav /ffdshow /nostreamlink /noytdlp)...'
& $downloadFile /nobackup /lav /ffdshow /nostreamlink /noytdlp

$defaultDir = 'C:\DTV\DTVCapture'
if ((Test-Path $defaultDir) -and ($defaultDir -ne $targetDir)) {
    Write-Host ""[AtriaInstaller] Movendo arquivos de $defaultDir para $targetDir...""
    Copy-Item -Path ""$defaultDir\*"" -Destination $targetDir -Recurse -Force -ErrorAction SilentlyContinue
}

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
    Start-Process -FilePath $fmaExe -ArgumentList '/uninstall' -WorkingDirectory $fmaDir -Wait
    Start-Process -FilePath $fmaExe -ArgumentList '/install' -WorkingDirectory $fmaDir -Wait
}

$logRotateExe = Join-Path $targetDir 'FastMatchingSVC\logrotate\logrotate.exe'
if (Test-Path $logRotateExe) {
    Write-Host '[AtriaInstaller] Reconfigurando tarefa agendada FMA-LogRotation...'
    $trArg = '""' + $logRotateExe + '"" ""' + $logRotateConf + '"" --state ""' + $targetDir + '\FastMatchingSVC\logrotate\logrotate.status""'
    schtasks /Create /F /RU ""NT AUTHORITY\SYSTEM"" /NP /TN FMA-LogRotation /sc daily /st 23:59:57 /TR $trArg
}

$finalExe = Join-Path $targetDir 'DigitalTVCapture.exe'
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
    Write-Host ""[AtriaInstaller] Abrindo aplicacao Atria Capture em $finalExe...""
    Start-Process -FilePath $finalExe -WorkingDirectory (Split-Path $finalExe)
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
                string targetExe = null;
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
                    FileLogger.Log($"[AtriaInstaller] 🚀 Abrindo aplicação Atria Capture na Sessão Interativa do Usuário em '{targetExe}'...");
                    bool started = InteractiveProcessLauncher.LaunchProcessInActiveSession(targetExe);
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
