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
                string scriptContent = $@"
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Get-Process -Name 'DigitalTVCapture', 'AtriaCapture', 'Atria' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$downloadFile = Join-Path $env:TEMP 'atria_setup.ps1'
Write-Host '[AtriaInstaller] Baixando script de instalacao do Atria...'
Invoke-WebRequest -Uri '{AtriaPsScriptUrl}' -OutFile $downloadFile -UseBasicParsing
Write-Host '[AtriaInstaller] Executando script de instalacao (/lav /ffdshow)...'
& $downloadFile /lav /ffdshow
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

                using (var psProc = Process.Start(psPsi))
                {
                    if (psProc != null)
                    {
                        using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(3));
                        try
                        {
                            var outTask = psProc.StandardOutput.ReadToEndAsync(cts.Token);
                            var errTask = psProc.StandardError.ReadToEndAsync(cts.Token);
                            var exitTask = psProc.WaitForExitAsync(cts.Token);

                            await Task.WhenAll(outTask, errTask, exitTask);

                            string stdOut = outTask.Result;
                            string stdErr = errTask.Result;

                            string combinedLog = $"=== ATRIA INSTALL LOG ({DateTime.Now}) ===\r\nExitCode: {psProc.ExitCode}\r\n\r\n--- STDOUT ---\r\n{stdOut}\r\n\r\n--- STDERR ---\r\n{stdErr}";
                            
                            try
                            {
                                string logSavePath = Path.Combine(tempDir, "atria_install_last.log");
                                await File.WriteAllTextAsync(logSavePath, combinedLog);
                            }
                            catch {}

                            if (!string.IsNullOrWhiteSpace(stdOut)) FileLogger.Log($"[AtriaInstaller Out] {stdOut.Trim()}");
                            if (!string.IsNullOrWhiteSpace(stdErr)) FileLogger.LogError($"[AtriaInstaller Err] {stdErr.Trim()}");

                            FileLogger.Log($"[AtriaInstaller] Instalação do Atria finalizada com código de saída: {psProc.ExitCode}");
                            return psProc.ExitCode == 0 || psProc.ExitCode == 3010;
                        }
                        catch (OperationCanceledException)
                        {
                            FileLogger.LogError("[AtriaInstaller] ⏱️ Timeout de 3 minutos atingido ao executar script do Atria. Forçando encerramento...");
                            try { psProc.Kill(true); } catch { }
                            return false;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError("[AtriaInstaller] ❌ Erro ao atualizar/instalar Atria Capture", ex);
                return false;
            }

            return false;
        }
    }
}
