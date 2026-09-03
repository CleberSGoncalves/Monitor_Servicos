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
                FileLogger.Log("[AtriaInstaller] 📦 Iniciando processo de atualização do Atria Capture...");

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
                string psCommand = $"Set-ExecutionPolicy Bypass -Scope Process -Force; $f=\"$env:TEMP\\install.ps1\"; iwr -UseBasicParsing '{AtriaPsScriptUrl}' -OutFile $f; & $f /lav /ffdshow";

                var psPsi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-ExecutionPolicy Bypass -NoProfile -Command \"{psCommand}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                using (var psProc = Process.Start(psPsi))
                {
                    if (psProc != null)
                    {
                        var outTask = psProc.StandardOutput.ReadToEndAsync();
                        var errTask = psProc.StandardError.ReadToEndAsync();

                        await Task.WhenAll(outTask, errTask);
                        await psProc.WaitForExitAsync();

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
