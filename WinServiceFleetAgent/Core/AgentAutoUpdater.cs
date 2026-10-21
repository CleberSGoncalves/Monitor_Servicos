using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public static class AgentAutoUpdater
    {
        private static bool _isUpdateInProgress = false;
        private static DateTime _lastCheckTime = DateTime.MinValue;

        public static bool IsVersionNewer(string candidateVersion, string currentVersion)
        {
            if (string.IsNullOrWhiteSpace(candidateVersion)) return false;
            if (string.IsNullOrWhiteSpace(currentVersion)) return true;

            string cleanCandidate = candidateVersion.Trim().TrimStart('v', 'V');
            string cleanCurrent = currentVersion.Trim().TrimStart('v', 'V');

            if (cleanCurrent.Equals("Não Instalado", StringComparison.OrdinalIgnoreCase) ||
                cleanCurrent.Equals("Inexistente", StringComparison.OrdinalIgnoreCase) ||
                cleanCurrent == "0.0.0.0")
            {
                return true;
            }

            if (Version.TryParse(cleanCandidate, out var vCandidate) &&
                Version.TryParse(cleanCurrent, out var vCurrent))
            {
                return vCandidate > vCurrent;
            }

            return !string.Equals(cleanCandidate, cleanCurrent, StringComparison.OrdinalIgnoreCase);
        }

        public static async Task<UpdateCheckResult> CheckForUpdateAsync(
            AutoUpdateConfig config,
            string githubToken,
            string currentVersion,
            string currentExePath)
        {
            var result = new UpdateCheckResult
            {
                CurrentVersion = currentVersion,
                Source = config.Source
            };

            if (!config.Enabled)
            {
                result.Reason = "Auto-update está desabilitado na configuração.";
                return result;
            }

            FileLogger.Log($"[AgentAutoUpdater] 🔍 Verificando atualizações para o agente via '{config.Source}' (Versão instalada: {currentVersion})...");

            try
            {
                if (config.Source.Equals("HttpEndpoint", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(config.EndpointUrl))
                {
                    using var client = new HttpClient();
                    client.DefaultRequestHeaders.Add("User-Agent", "WinServiceFleetAgent");
                    var resp = await client.GetAsync(config.EndpointUrl);
                    if (resp.IsSuccessStatusCode)
                    {
                        string json = await resp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        var root = doc.RootElement;
                        result.LatestVersion = root.TryGetProperty("version", out var v) ? v.GetString() ?? "" : "";
                        result.PackageDownloadUrl = root.TryGetProperty("packageUrl", out var p) ? p.GetString() ?? "" : "";
                        result.ExpectedSha256 = root.TryGetProperty("sha256", out var s) ? s.GetString() ?? "" : "";
                    }
                }
                else if (config.Source.Equals("FileShare", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(config.FileSharePath))
                {
                    if (Directory.Exists(config.FileSharePath))
                    {
                        var zipFiles = Directory.GetFiles(config.FileSharePath, "*.zip");
                        if (zipFiles.Length > 0)
                        {
                            Array.Sort(zipFiles);
                            string latestZip = zipFiles[^1];
                            result.PackageDownloadUrl = latestZip;
                            result.LatestVersion = Path.GetFileNameWithoutExtension(latestZip);

                            string shaFile = latestZip + ".sha256";
                            if (File.Exists(shaFile))
                            {
                                result.ExpectedSha256 = (await File.ReadAllTextAsync(shaFile)).Trim();
                            }
                        }
                    }
                }
                else // Padrão: GitHub Releases
                {
                    string repo = !string.IsNullOrWhiteSpace(config.GitHubRepo) ? config.GitHubRepo : "CleberSGoncalves/DNA.MonitorServiceSVC";
                    string? latestRelease = await GitHubDownloader.GetLatestReleaseVersionAsync(repo, githubToken);
                    if (!string.IsNullOrWhiteSpace(latestRelease))
                    {
                        result.LatestVersion = latestRelease;
                    }
                }

                if (!string.IsNullOrWhiteSpace(result.LatestVersion))
                {
                    bool isNewer = IsVersionNewer(result.LatestVersion, currentVersion);
                    bool hashDiffers = false;

                    if (config.CompareMethod.Contains("Hash", StringComparison.OrdinalIgnoreCase) &&
                        !string.IsNullOrWhiteSpace(result.ExpectedSha256) &&
                        File.Exists(currentExePath))
                    {
                        string currentHash = IntegrityValidator.ComputeSha256(currentExePath);
                        hashDiffers = !string.Equals(currentHash, result.ExpectedSha256, StringComparison.OrdinalIgnoreCase);
                    }

                    if (isNewer || (config.CompareMethod.Equals("Hash", StringComparison.OrdinalIgnoreCase) && hashDiffers))
                    {
                        result.IsUpdateAvailable = true;
                        result.Reason = $"Nova versão disponível: {result.LatestVersion} (atual: {currentVersion})";
                        FileLogger.Log($"[AgentAutoUpdater] 🔔 {result.Reason}", writeToEventLog: true, eventId: 1100);
                    }
                    else
                    {
                        result.Reason = $"Agente já está na versão mais recente ({currentVersion}).";
                        FileLogger.Log($"[AgentAutoUpdater] ✅ {result.Reason}");
                    }
                }
                else
                {
                    result.Reason = "Não foi possível obter a versão remota mais recente.";
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError("[AgentAutoUpdater] Erro ao consultar atualizações", ex, writeToEventLog: false);
                result.Reason = $"Erro na checagem: {ex.Message}";
            }

            return result;
        }

        public static async Task<(bool Success, string ValidatedExePath, string ExtractedVersion, string ErrorMessage)> DownloadAndStageUpdateAsync(
            AutoUpdateConfig config,
            UpdateCheckResult checkResult,
            string tempStagingDir,
            string githubToken)
        {
            string stagingFolder = Path.Combine(tempStagingDir, "DNA.MonitorServiceSVC_selfupdate");

            try
            {
                if (Directory.Exists(stagingFolder))
                {
                    Directory.Delete(stagingFolder, true);
                }
                Directory.CreateDirectory(stagingFolder);

                string downloadedZipPath = Path.Combine(stagingFolder, $"WinServiceFleetAgent_{checkResult.LatestVersion}.zip");

                FileLogger.Log($"[AgentAutoUpdater] 📥 Baixando pacote da versão '{checkResult.LatestVersion}' para staging...", writeToEventLog: true, eventId: 1101);

                // 1. Download do Pacote
                if (!string.IsNullOrWhiteSpace(checkResult.PackageDownloadUrl) &&
                    (checkResult.PackageDownloadUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                     checkResult.PackageDownloadUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)))
                {
                    using var client = new HttpClient();
                    client.DefaultRequestHeaders.Add("User-Agent", "WinServiceFleetAgent");
                    var resp = await client.GetAsync(checkResult.PackageDownloadUrl, HttpCompletionOption.ResponseHeadersRead);
                    if (!resp.IsSuccessStatusCode)
                    {
                        return (false, "", "", $"Falha no download HTTP ({resp.StatusCode}).");
                    }
                    using (var fs = File.Create(downloadedZipPath))
                    {
                        await resp.Content.CopyToAsync(fs);
                    }
                }
                else if (File.Exists(checkResult.PackageDownloadUrl))
                {
                    File.Copy(checkResult.PackageDownloadUrl, downloadedZipPath, true);
                }
                else // GitHub Releases
                {
                    string repo = !string.IsNullOrWhiteSpace(config.GitHubRepo) ? config.GitHubRepo : "CleberSGoncalves/DNA.MonitorServiceSVC";
                    await GitHubDownloader.DownloadAndExtractReleaseAsync(repo, checkResult.LatestVersion, githubToken, stagingFolder);
                }

                // 2. Localiza o ZIP se baixado diretamente
                if (File.Exists(downloadedZipPath))
                {
                    // Validação de Integridade do Arquivo ZIP
                    var (zipValid, zipMsg) = IntegrityValidator.ValidateZipArchive(downloadedZipPath, "WinServiceFleetAgent.exe");
                    if (!zipValid)
                    {
                        FileLogger.LogError($"[AgentAutoUpdater] ❌ Falha na integridade do pacote ZIP baixado: {zipMsg}", writeToEventLog: true, eventId: 3101);
                        return (false, "", "", zipMsg);
                    }

                    // Validação de Hash SHA256 se exigido ou informado
                    if (!string.IsNullOrWhiteSpace(checkResult.ExpectedSha256))
                    {
                        bool hashOk = IntegrityValidator.VerifySha256(downloadedZipPath, checkResult.ExpectedSha256);
                        if (!hashOk)
                        {
                            string calc = IntegrityValidator.ComputeSha256(downloadedZipPath);
                            string errMsg = $"Checksum SHA256 divergente! Esperado: {checkResult.ExpectedSha256}, Obtido: {calc}";
                            FileLogger.LogError($"[AgentAutoUpdater] ❌ {errMsg}", writeToEventLog: true, eventId: 3102);
                            return (false, "", "", errMsg);
                        }
                        FileLogger.Log($"[AgentAutoUpdater] ✅ Checksum SHA256 do pacote validado com sucesso ({checkResult.ExpectedSha256}).");
                    }

                    // Extração do ZIP para pasta de staging
                    string extractedDir = Path.Combine(stagingFolder, "extracted");
                    Directory.CreateDirectory(extractedDir);
                    ZipFile.ExtractToDirectory(downloadedZipPath, extractedDir, overwriteFiles: true);
                    File.Delete(downloadedZipPath);
                    stagingFolder = extractedDir;
                }

                // 3. Localiza e valida o executável extraído
                string targetExe = Path.Combine(stagingFolder, "WinServiceFleetAgent.exe");
                if (!File.Exists(targetExe))
                {
                    // Procura em subpastas caso o zip contenha pasta raiz
                    var found = Directory.GetFiles(stagingFolder, "WinServiceFleetAgent.exe", SearchOption.AllDirectories);
                    if (found.Length > 0)
                    {
                        targetExe = found[0];
                        stagingFolder = Path.GetDirectoryName(targetExe)!;
                    }
                }

                if (!File.Exists(targetExe))
                {
                    return (false, "", "", "Executável 'WinServiceFleetAgent.exe' não foi encontrado após extração.");
                }

                // Validação de Integridade do Executável (Tamanho, PE Headers, Versão)
                var (exeValid, detectedVer, exeMsg) = IntegrityValidator.ValidateExecutable(targetExe, checkResult.LatestVersion);
                if (!exeValid)
                {
                    FileLogger.LogError($"[AgentAutoUpdater] ❌ Falha na integridade do executável extraído: {exeMsg}", writeToEventLog: true, eventId: 3103);
                    return (false, "", detectedVer, exeMsg);
                }

                FileLogger.Log($"[AgentAutoUpdater] ✅ Staging validado com sucesso! Executável: '{targetExe}', Versão: {detectedVer}", writeToEventLog: true, eventId: 1102);
                return (true, targetExe, detectedVer, "");
            }
            catch (Exception ex)
            {
                FileLogger.LogError("[AgentAutoUpdater] Falha ao processar download e staging", ex, writeToEventLog: true, eventId: 3100);
                return (false, "", "", ex.Message);
            }
        }

        public static bool ScheduleAtomicUpdate(
            string serviceName,
            string installDir,
            string stagingDir,
            string backupBaseDir,
            string currentVer,
            string targetVer)
        {
            if (_isUpdateInProgress)
            {
                FileLogger.LogWarning("[AgentAutoUpdater] Atualização já está em andamento. Ignorando solicitação duplicada.");
                return false;
            }

            _isUpdateInProgress = true;

            try
            {
                FileLogger.Log($"[AgentAutoUpdater] 🚀 Programando substituição atômica e silenciosa dos binários...", writeToEventLog: true, eventId: 1103);

                // Localiza o script Apply-AgentUpdate.ps1
                string scriptPath = Path.Combine(installDir, "Scripts", "Apply-AgentUpdate.ps1");
                if (!File.Exists(scriptPath))
                {
                    scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Scripts", "Apply-AgentUpdate.ps1");
                }
                if (!File.Exists(scriptPath))
                {
                    scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Apply-AgentUpdate.ps1");
                }

                // Se o script não estiver presente na pasta local, copia o script embutido para %TEMP%
                if (!File.Exists(scriptPath))
                {
                    string tempScript = Path.Combine(Path.GetTempPath(), "Apply-AgentUpdate.ps1");
                    scriptPath = tempScript;
                }

                string logPath = Path.Combine(installDir, "logs", "updater.log");

                // Monta comando do PowerShell
                string taskName = "WinServiceFleetAgent_AutoUpdate";
                string psArgs = $"-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File \"{scriptPath}\" " +
                                $"-ServiceName \"{serviceName}\" -InstallDir \"{installDir}\" -StagingDir \"{stagingDir}\" " +
                                $"-BackupBaseDir \"{backupBaseDir}\" -CurrentVersion \"{currentVer}\" -TargetVersion \"{targetVer}\" -LogPath \"{logPath}\"";

                // Registra e dispara via Task Scheduler como SYSTEM (isolado do processo do serviço)
                string schDelete = $"/delete /tn \"{taskName}\" /f";
                string schCreate = $"/create /tn \"{taskName}\" /tr \"powershell.exe {psArgs}\" /sc once /st 00:00 /ru SYSTEM /f /rl HIGHEST";
                string schRun = $"/run /tn \"{taskName}\"";

                Process.Start(new ProcessStartInfo("schtasks.exe", schDelete) { UseShellExecute = false, CreateNoWindow = true })?.WaitForExit(3000);
                var createProc = Process.Start(new ProcessStartInfo("schtasks.exe", schCreate) { UseShellExecute = false, CreateNoWindow = true });
                createProc?.WaitForExit(5000);

                var runProc = Process.Start(new ProcessStartInfo("schtasks.exe", schRun) { UseShellExecute = false, CreateNoWindow = true });
                runProc?.WaitForExit(3000);

                FileLogger.Log($"[AgentAutoUpdater] ✅ Tarefa '{taskName}' disparada com sucesso via Task Scheduler (SYSTEM). O serviço será reiniciado em instantes com a nova versão.", writeToEventLog: true, eventId: 1104);
                return true;
            }
            catch (Exception ex)
            {
                _isUpdateInProgress = false;
                FileLogger.LogError("[AgentAutoUpdater] Falha crítica ao agendar atualização atômica", ex, writeToEventLog: true, eventId: 3105);
                return false;
            }
        }

        public static async Task ProcessStartupMarkersAsync(
            string installDir,
            SharePointClient spClient,
            string hostname,
            string serviceName)
        {
            try
            {
                string logsDir = Path.Combine(installDir, "logs");
                if (!Directory.Exists(logsDir)) return;

                // 1. Verifica se houve SUCESSO na atualização anterior
                string successMarker = Path.Combine(logsDir, "update_success.json");
                if (File.Exists(successMarker))
                {
                    try
                    {
                        string json = await File.ReadAllTextAsync(successMarker);
                        using var doc = JsonDocument.Parse(json);
                        string prevVer = doc.RootElement.TryGetProperty("PreviousVersion", out var pv) ? pv.GetString() ?? "" : "";
                        string newVer = doc.RootElement.TryGetProperty("NewVersion", out var nv) ? nv.GetString() ?? "" : "";

                        string msg = $"🎉 [AgentAutoUpdater] Atualização automática concluída com sucesso! Versão anterior: '{prevVer}', Nova versão: '{newVer}'.";
                        FileLogger.Log(msg, writeToEventLog: true, eventId: 1005);

                        await spClient.UpdateActionStatusByServiceAsync(
                            hostname: hostname,
                            nomeServico: serviceName,
                            statusAtualizacao: "Atualizado",
                            acaoSolicitada: "Nenhuma",
                            versaoInstalada: newVer,
                            versaoDesejada: newVer
                        );

                        File.Delete(successMarker);
                    }
                    catch (Exception exSucc)
                    {
                        FileLogger.LogError("[AgentAutoUpdater] Erro ao processar marcador de sucesso", exSucc, writeToEventLog: false);
                    }
                }

                // 2. Verifica se houve ROLLBACK na atualização anterior
                string rollbackMarker = Path.Combine(logsDir, "rollback_occurred.json");
                if (File.Exists(rollbackMarker))
                {
                    try
                    {
                        string json = await File.ReadAllTextAsync(rollbackMarker);
                        using var doc = JsonDocument.Parse(json);
                        string targetVer = doc.RootElement.TryGetProperty("TargetVersion", out var tv) ? tv.GetString() ?? "" : "";
                        string restoredVer = doc.RootElement.TryGetProperty("RestoredVersion", out var rv) ? rv.GetString() ?? "" : "";
                        string error = doc.RootElement.TryGetProperty("Error", out var er) ? er.GetString() ?? "" : "";

                        string alertMsg = $"⚠️ [AgentAutoUpdater] ALERTA DE RESILIÊNCIA: O serviço foi revertido (ROLLBACK) para a versão '{restoredVer}' após falha na atualização para '{targetVer}'. Motivo: {error}";
                        FileLogger.LogWarning(alertMsg, writeToEventLog: true, eventId: 2005);

                        await spClient.UpdateActionStatusByServiceAsync(
                            hostname: hostname,
                            nomeServico: serviceName,
                            statusAtualizacao: "Erro na Atualização (Rollback Executado)",
                            acaoSolicitada: "Nenhuma",
                            versaoInstalada: restoredVer,
                            versaoDesejada: targetVer
                        );

                        // Upload do log do updater para o SharePoint
                        string updaterLogPath = Path.Combine(logsDir, "updater.log");
                        if (File.Exists(updaterLogPath))
                        {
                            string logContent = await File.ReadAllTextAsync(updaterLogPath);
                            await spClient.UploadLogAttachmentAsync(hostname, serviceName, logContent, force: true);
                        }

                        // Renomeia o marcador para não reprocessar
                        string reportedMarker = Path.Combine(logsDir, $"rollback_reported_{DateTime.Now:yyyyMMdd_HHmmss}.json");
                        File.Move(rollbackMarker, reportedMarker, true);
                    }
                    catch (Exception exRoll)
                    {
                        FileLogger.LogError("[AgentAutoUpdater] Erro ao processar marcador de rollback", exRoll, writeToEventLog: false);
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError("[AgentAutoUpdater] Erro geral ao processar marcadores de inicialização", ex, writeToEventLog: false);
            }
        }
    }
}
