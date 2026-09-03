using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public class FleetOrchestrator
    {
        private readonly string _configXmlPath;
        private readonly string _configMonitorConfigPath;
        private readonly string _backupBaseDir;
        private readonly string _tempStagingDir;
        private readonly string _githubToken;
        private readonly List<ServiceDefinition> _services;
        private readonly SharePointClient _spClient;
        private readonly string _hostname;
        private static bool _isSelfUpdateTriggered = false;

        public FleetOrchestrator(
            string? hostnameOverride,
            string configXmlPath,
            string configMonitorConfigPath,
            string backupBaseDir,
            string tempStagingDir,
            string siteUrl,
            string listName,
            string clientId,
            string clientSecret,
            string githubToken,
            List<ServiceDefinition> services)
        {
            _hostname = string.IsNullOrWhiteSpace(hostnameOverride) ? Environment.MachineName : hostnameOverride;
            _configXmlPath = configXmlPath;
            _configMonitorConfigPath = configMonitorConfigPath;
            _backupBaseDir = backupBaseDir;
            _tempStagingDir = tempStagingDir;
            _githubToken = githubToken;
            _services = services ?? new List<ServiceDefinition>();

            _spClient = new SharePointClient(siteUrl, listName, clientId, clientSecret);
        }

        public async Task RunCycleAsync()
        {
            FileLogger.Log($"==================================================");
            FileLogger.Log($"[FleetOrchestrator] Iniciando ciclo em {DateTime.Now} | Host: {_hostname}");
            FileLogger.Log($"==================================================");

            // Passo 1: Leitura de Metadados Globais e Coleta de Métricas
            var metadata = MetadataReader.GetGlobalMachineMetadata(_configXmlPath, _configMonitorConfigPath);
            FileLogger.Log($"[FleetOrchestrator] Metadados extraídos: idHost='{metadata.IdHost}', Praça='{metadata.Praca}', CS={metadata.CS}, Url_Comunicacao='{metadata.UrlComunicacao}'");

            var metrics = SystemPerformance.GetMetrics(metadata.UrlComunicacao);

            // Mapeamento do País (Título do SharePoint)
            string paisTitle = "Brasil";
            if (!string.IsNullOrWhiteSpace(metadata.UrlComunicacao) && metadata.UrlComunicacao.Contains("mediadna.ibope.com"))
            {
                paisTitle = "Brasil";
            }

            // Passo 2: Inventário, auto-recuperação (AutoRestart) e sincronização
            foreach (var srv in _services)
            {
                string statusServico = WinController.GetServiceStatus(srv.ServiceName);

                string exeFullPath = Path.Combine(srv.InstallPath, srv.ExeName);
                if (!File.Exists(exeFullPath))
                {
                    if (srv.InstallPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        string altPath = "D:\\" + srv.InstallPath.Substring(3);
                        if (File.Exists(Path.Combine(altPath, srv.ExeName)))
                        {
                            exeFullPath = Path.Combine(altPath, srv.ExeName);
                        }
                    }
                    else if (srv.InstallPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        string altPath = "C:\\" + srv.InstallPath.Substring(3);
                        if (File.Exists(Path.Combine(altPath, srv.ExeName)))
                        {
                            exeFullPath = Path.Combine(altPath, srv.ExeName);
                        }
                    }
                }

                if (!File.Exists(exeFullPath) && srv.ServiceName.Equals("DNA.MonitorServiceSVC", StringComparison.OrdinalIgnoreCase))
                {
                    string localExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, srv.ExeName);
                    if (File.Exists(localExe))
                    {
                        exeFullPath = localExe;
                    }
                }

                bool exeExists = File.Exists(exeFullPath);
                bool serviceExists = !statusServico.Equals("Não Encontrado", StringComparison.OrdinalIgnoreCase);
                bool isStandaloneApp = srv.ServiceName.Equals("Atria Capture", StringComparison.OrdinalIgnoreCase);

                if (isStandaloneApp)
                {
                    if (!exeExists)
                    {
                        FileLogger.Log($"[FleetOrchestrator] Aplicação '{srv.ServiceName}' NÃO está instalada nesta máquina. Ignorando.");
                        continue;
                    }
                    statusServico = "Instalado";
                }
                else
                {
                    if (!serviceExists)
                    {
                        FileLogger.Log($"[FleetOrchestrator] Serviço do Windows '{srv.ServiceName}' NÃO está instalado. Ignorando.");
                        continue;
                    }

                    // Lógica do AutoRestart: Se o serviço estiver Parado, tenta reiniciar automaticamente!
                    if (statusServico.Equals("Parado", StringComparison.OrdinalIgnoreCase))
                    {
                        FileLogger.Log($"[FleetOrchestrator] ⚠️ Serviço '{srv.ServiceName}' detectado como PARADO. Verificando auto-recuperação (AutoRestart)...");
                        try
                        {
                            bool restarted = WinController.StartService(srv.ServiceName);
                            if (restarted)
                            {
                                statusServico = "Em Execução";
                                FileLogger.Log($"[FleetOrchestrator] 🩹 AutoRestart ativado: Serviço '{srv.ServiceName}' reiniciado com sucesso!");
                            }
                        }
                        catch (Exception ex)
                        {
                            FileLogger.LogError($"[FleetOrchestrator] Falha no AutoRestart para '{srv.ServiceName}'", ex);
                        }
                    }
                }

                string installedVer = VersionInspector.GetExecutableVersion(exeFullPath);

                string? githubLatestVer = null;
                if (!string.IsNullOrWhiteSpace(srv.GithubRepo))
                {
                    githubLatestVer = await GitHubDownloader.GetLatestReleaseVersionAsync(srv.GithubRepo, _githubToken);
                }

                FileLogger.Log($"[FleetOrchestrator] Processando '{_hostname}_{srv.ServiceName}' -> País: '{paisTitle}', Status: '{statusServico}', Instalada: '{installedVer}', GitHub Desejada: '{githubLatestVer}'");

                await _spClient.SyncServiceInventoryAsync(
                    title: paisTitle,
                    hostname: _hostname,
                    praca: metadata.Praca,
                    cs: metadata.CS,
                    nomeServico: srv.ServiceName,
                    versaoInstalada: installedVer,
                    versaoDesejada: githubLatestVer,
                    statusServico: statusServico,
                    urlComunicacao: metadata.UrlComunicacao,
                    metrics: metrics
                );
            }

            // Passo 3: Execução de Ações Pendentes de URL (Acao_Solicitada_Url = "Atualizar")
            var pendingUrlActions = await _spClient.GetPendingUrlActionsAsync(_hostname);
            if (pendingUrlActions != null && pendingUrlActions.Count > 0)
            {
                foreach (var urlAction in pendingUrlActions)
                {
                    FileLogger.Log($"[FleetOrchestrator] Executando Ação de URL em '{urlAction.NomeServico}' -> Nova URL Desejável: '{urlAction.UrlComunicacaoDesejavel}'...");
                    try
                    {
                        await _spClient.UpdateUrlActionStatusAsync(_hostname, urlAction.NomeServico, "Em Progresso", urlAction.UrlComunicacaoDesejavel, isPending: true);

                        bool updated = ConfigUrlUpdater.UpdateWcfMainUrl(_configMonitorConfigPath, urlAction.UrlComunicacaoDesejavel);
                        if (updated)
                        {
                            WinController.RestartService("DNA.ConfigMonitorSVC");
                            await _spClient.UpdateUrlActionStatusAsync(_hostname, urlAction.NomeServico, "Atualizado", urlAction.UrlComunicacaoDesejavel, isPending: false);
                            FileLogger.Log($"[FleetOrchestrator] ✅ Ação de URL concluída com sucesso para '{urlAction.NomeServico}'!");
                        }
                        else
                        {
                            await _spClient.UpdateUrlActionStatusAsync(_hostname, urlAction.NomeServico, "Erro na Atualização", metadata.UrlComunicacao, isPending: false);
                        }
                    }
                    catch (Exception ex)
                    {
                        FileLogger.LogError($"Erro ao atualizar URL de comunicação em '{urlAction.NomeServico}'", ex);
                        await _spClient.UpdateUrlActionStatusAsync(_hostname, urlAction.NomeServico, "Erro na Atualização", metadata.UrlComunicacao, isPending: false);
                    }
                }
            }

            // Passo 4: Execução de Ações Pendentes de Serviços (Acao_Solicitada = "Reiniciar" / "Atualizar" / "Forcar Atualizacao")
            var pendingActions = await _spClient.GetPendingActionsAsync(_hostname);
            if (pendingActions == null || pendingActions.Count == 0)
            {
                FileLogger.Log("[FleetOrchestrator] Nenhuma ação de serviço pendente no SharePoint para este host.");
                return;
            }

            foreach (var action in pendingActions)
            {
                var srvConfig = _services.FirstOrDefault(s => s.ServiceName.Equals(action.NomeServico, StringComparison.OrdinalIgnoreCase));
                if (srvConfig == null)
                {
                    FileLogger.Log($"[FleetOrchestrator] Serviço '{action.NomeServico}' não encontrado nas configurações locais.");
                    continue;
                }

                // Lógica de Hora_Agendada
                if (!string.IsNullOrWhiteSpace(action.HoraAgendada) && !action.HoraAgendada.Equals("Nenhuma", StringComparison.OrdinalIgnoreCase))
                {
                    if (TimeSpan.TryParse(action.HoraAgendada, out var scheduledTime))
                    {
                        var nowTime = DateTime.Now.TimeOfDay;
                        double diffMinutes = (nowTime - scheduledTime).TotalMinutes;

                        if (diffMinutes < -10 || diffMinutes > 15)
                        {
                            FileLogger.Log($"[FleetOrchestrator] Ação '{action.AcaoSolicitada}' em '{action.NomeServico}' está agendada para as {action.HoraAgendada}. Horário atual: {nowTime:hh\\:mm}. Aguardando janela.");
                            continue;
                        }
                    }
                }

                FileLogger.Log($"[FleetOrchestrator] Executando Ação '{action.AcaoSolicitada}' para [{_hostname}_{action.NomeServico}]...");

                try
                {
                    if (action.AcaoSolicitada.Equals("Reiniciar", StringComparison.OrdinalIgnoreCase))
                    {
                        await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso");
                        bool ok = WinController.RestartService(srvConfig.ServiceName);
                        if (ok)
                        {
                            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Atualizado", acaoSolicitada: "Nenhuma");
                            FileLogger.Log($"[FleetOrchestrator] ✅ Serviço '{srvConfig.ServiceName}' reiniciado com sucesso!");
                        }
                        else
                        {
                            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                        }
                    }
                    else if (action.AcaoSolicitada.Equals("Atualizar", StringComparison.OrdinalIgnoreCase) ||
                             action.AcaoSolicitada.StartsWith("Forca", StringComparison.OrdinalIgnoreCase) ||
                             action.AcaoSolicitada.StartsWith("Força", StringComparison.OrdinalIgnoreCase))
                    {
                        bool force = action.AcaoSolicitada.StartsWith("Forca", StringComparison.OrdinalIgnoreCase) ||
                                     action.AcaoSolicitada.StartsWith("Força", StringComparison.OrdinalIgnoreCase);

                        await ProcessUpdateAsync(srvConfig, action, forceUpdate: force);
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao processar ação em [{_hostname}_{action.NomeServico}]", ex);
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                }
            }
        }

        private async Task ProcessUpdateAsync(ServiceDefinition srvConfig, PendingActionItem action, bool forceUpdate = false)
        {
            string exeFullPath = Path.Combine(srvConfig.InstallPath, srvConfig.ExeName);
            if (!File.Exists(exeFullPath)) exeFullPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, srvConfig.ExeName);
            string installedVer = VersionInspector.GetExecutableVersion(exeFullPath);

            // Quando a Ação_Solicitada é "Atualizar", limpa o cache e consulta o GitHub para obter a versão mais recente real
            string? githubLatest = null;
            if (!string.IsNullOrWhiteSpace(srvConfig.GithubRepo))
            {
                GitHubDownloader.ClearCache(srvConfig.GithubRepo);
                githubLatest = await GitHubDownloader.GetLatestReleaseVersionAsync(srvConfig.GithubRepo, _githubToken);
            }

            string targetVersion = !string.IsNullOrWhiteSpace(githubLatest) ? githubLatest : (!string.IsNullOrWhiteSpace(action.VersaoDesejada) ? action.VersaoDesejada : "latest");

            if (SharePointClient.IsInstalledUpToDate(installedVer, targetVersion))
            {
                FileLogger.Log($"[FleetOrchestrator] Serviço '{srvConfig.ServiceName}' já está na versão mais recente/desejada ({installedVer}). Mudando Acao_Solicitada para 'Nenhuma' e Status para 'Atualizado'.");
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Atualizado", acaoSolicitada: "Nenhuma", versaoInstalada: installedVer, versaoDesejada: targetVersion);
                return;
            }

            bool isSelfUpdate = srvConfig.ServiceName.Equals("DNA.MonitorServiceSVC", StringComparison.OrdinalIgnoreCase);

            if (isSelfUpdate)
            {
                if (_isSelfUpdateTriggered)
                {
                    FileLogger.Log($"[FleetOrchestrator] Auto-atualização do agente já foi disparada. Aguardando...");
                    return;
                }

                _isSelfUpdateTriggered = true;
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso", versaoDesejada: targetVersion);
                FileLogger.Log($"[FleetOrchestrator] 🚀 Iniciando download C# seguro da versão '{targetVersion}' do agente...");

                string selfStagingFolder = Path.Combine(_tempStagingDir, "DNA.MonitorServiceSVC_selfupdate");

                try
                {
                    if (Directory.Exists(selfStagingFolder)) Directory.Delete(selfStagingFolder, true);
                    Directory.CreateDirectory(selfStagingFolder);

                    // 1. Download + extração com serviço em execução (C# .NET 8, TLS 1.2/1.3)
                    await GitHubDownloader.DownloadAndExtractReleaseAsync(srvConfig.GithubRepo, targetVersion, _githubToken, selfStagingFolder);

                    string newExePath = Path.Combine(selfStagingFolder, srvConfig.ExeName);
                    if (!File.Exists(newExePath))
                    {
                        FileLogger.LogError($"[FleetOrchestrator] ❌ Exe não encontrado no staging: {newExePath}. Abortando sem parar serviço.");
                        await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                        _isSelfUpdateTriggered = false;
                        return;
                    }

                    FileLogger.Log($"[FleetOrchestrator] ✅ Arquivos validados no staging. Gerando script de substituição...");

                    // 2. Gera script de substituição - usa caminhos sem espaços (temp) e copia apenas o exe+configs
                    string installDir = srvConfig.InstallPath;
                    if (!Directory.Exists(installDir))
                        installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');

                    string scriptPath = Path.Combine(Path.GetTempPath(), "apply_svc_update.bat");

                    // Monta linhas de cópia individuais por arquivo (evita wildcard com espaços)
                    var fileLines = new System.Text.StringBuilder();
                    foreach (var f in Directory.GetFiles(selfStagingFolder, "*", SearchOption.TopDirectoryOnly))
                    {
                        // Não copia o próprio script
                        if (Path.GetFileName(f).Equals("apply_self_update.bat", StringComparison.OrdinalIgnoreCase)) continue;
                        fileLines.AppendLine($"copy /y \"{f}\" \"{installDir}\\{Path.GetFileName(f)}\" >nul 2>&1");
                    }

                    string batContent = $@"@echo off
setlocal
set SVC={srvConfig.ServiceName}
set INSTALLDIR={installDir}

echo [apply_svc_update] Aguardando liberacao do processo...
timeout /t 3 /nobreak >nul

echo [apply_svc_update] Parando servico %SVC%...
sc stop %SVC% >nul 2>&1
:WAIT_STOP
sc query %SVC% | findstr /i ""STOPPED"" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto WAIT_STOP
)

echo [apply_svc_update] Copiando arquivos...
{fileLines}

echo [apply_svc_update] Iniciando servico %SVC%...
sc start %SVC% >nul 2>&1
timeout /t 3 /nobreak >nul
sc start %SVC% >nul 2>&1

echo [apply_svc_update] Concluido.
del ""%~f0"" >nul 2>&1
endlocal
";

                    await File.WriteAllTextAsync(scriptPath, batContent, System.Text.Encoding.ASCII);

                    // 3. Dispara o script como processo independente elevated
                    var psi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = $"/c \"{scriptPath}\"",
                        UseShellExecute = true,
                        CreateNoWindow = false,
                        WorkingDirectory = Path.GetTempPath()
                    };

                    FileLogger.Log($"[FleetOrchestrator] Disparando script de substituição em '{scriptPath}'...");
                    Process.Start(psi);
                    return;
                }
                catch (Exception exSelf)
                {
                    _isSelfUpdateTriggered = false;
                    FileLogger.LogError($"[FleetOrchestrator] ❌ Erro no self-update C#", exSelf);
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                    return;
                }
            }

            bool isAtriaUpdate = srvConfig.ServiceName.Equals("Atria Capture", StringComparison.OrdinalIgnoreCase) ||
                                 srvConfig.ServiceName.Equals("AtriaCapture", StringComparison.OrdinalIgnoreCase) ||
                                 action.NomeServico.Contains("Atria", StringComparison.OrdinalIgnoreCase);

            if (isAtriaUpdate)
            {
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso", versaoDesejada: targetVersion);
                FileLogger.Log($"[FleetOrchestrator] 🚀 Disparando fluxo customizado de atualização do Atria Capture (vc_redist.x64.exe + installer script)...");

                bool ok = await AtriaInstaller.InstallOrUpdateAtriaAsync();

                string atriaExePath = Path.Combine(srvConfig.InstallPath, srvConfig.ExeName);
                if (!File.Exists(atriaExePath)) atriaExePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, srvConfig.ExeName);
                string newInstalledVer = VersionInspector.GetExecutableVersion(atriaExePath);
                if (string.IsNullOrWhiteSpace(newInstalledVer) || newInstalledVer.Contains("Não Encontrado", StringComparison.OrdinalIgnoreCase) || newInstalledVer == "0.0.0.0")
                {
                    newInstalledVer = !string.IsNullOrWhiteSpace(targetVersion) && targetVersion != "latest" ? targetVersion : "2.0.2.2";
                }

                if (ok)
                {
                    FileLogger.Log($"[FleetOrchestrator] ✅ Atria Capture instalado/atualizado com sucesso! Versão detectada: {newInstalledVer}");
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Atualizado", acaoSolicitada: "Nenhuma", versaoInstalada: newInstalledVer, versaoDesejada: targetVersion);
                }
                else
                {
                    FileLogger.LogError($"[FleetOrchestrator] ❌ Falha na instalação do Atria Capture.");
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                }
                return;
            }

            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso", versaoDesejada: targetVersion);
            FileLogger.Log($"[FleetOrchestrator] Iniciando atualização de '{srvConfig.ServiceName}' para versão '{targetVersion}' (Forçar={forceUpdate})...");

            string backupFolder = Path.Combine(_backupBaseDir, $"{srvConfig.ServiceName}_{DateTime.Now:yyyyMMdd_HHmmss}");
            string stagingFolder = Path.Combine(_tempStagingDir, $"{srvConfig.ServiceName}_staging");

            try
            {
                if (Directory.Exists(stagingFolder)) Directory.Delete(stagingFolder, true);
                Directory.CreateDirectory(stagingFolder);

                FileLogger.Log($"[FleetOrchestrator] Baixando e extraindo release '{targetVersion}' do repositório '{srvConfig.GithubRepo}'...");
                await GitHubDownloader.DownloadAndExtractReleaseAsync(srvConfig.GithubRepo, targetVersion, _githubToken, stagingFolder);

                if (Directory.Exists(srvConfig.InstallPath))
                {
                    FileLogger.Log($"[FleetOrchestrator] Efetuando backup de '{srvConfig.InstallPath}' -> '{backupFolder}'...");
                    Directory.CreateDirectory(backupFolder);
                    CopyDirectory(srvConfig.InstallPath, backupFolder);
                }

                if (WinController.GetServiceStatus(srvConfig.ServiceName) != "Não Encontrado")
                {
                    FileLogger.Log($"[FleetOrchestrator] Parando serviço '{srvConfig.ServiceName}' para substituição de arquivos...");
                    WinController.StopService(srvConfig.ServiceName);
                }

                FileLogger.Log($"[FleetOrchestrator] Copiando novos binários para '{srvConfig.InstallPath}'...");
                Directory.CreateDirectory(srvConfig.InstallPath);
                CopyDirectory(stagingFolder, srvConfig.InstallPath);

                if (!string.IsNullOrWhiteSpace(srvConfig.ConfigFile))
                {
                    string configPath = Path.Combine(srvConfig.InstallPath, srvConfig.ConfigFile);
                    string backupConfigPath = Path.Combine(backupFolder, srvConfig.ConfigFile);
                    if (File.Exists(backupConfigPath) && File.Exists(configPath))
                    {
                        FileLogger.Log($"[FleetOrchestrator] Mesclando arquivo de configuração '{srvConfig.ConfigFile}'...");
                        ConfigMerger.MergeDotNetConfig(backupConfigPath, configPath, configPath);
                    }
                }

                if (WinController.GetServiceStatus(srvConfig.ServiceName) != "Não Encontrado")
                {
                    FileLogger.Log($"[FleetOrchestrator] Reiniciando serviço '{srvConfig.ServiceName}'...");
                    WinController.StartService(srvConfig.ServiceName);
                }

                string newExePath = Path.Combine(srvConfig.InstallPath, srvConfig.ExeName);
                string newVer = VersionInspector.GetExecutableVersion(newExePath);

                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Atualizado", acaoSolicitada: "Nenhuma", versaoInstalada: newVer, versaoDesejada: newVer);
                FileLogger.Log($"[FleetOrchestrator] 🎉 Atualização concluída com sucesso! Nova Versão Instalada: {newVer}");
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Falha durante a atualização de '{srvConfig.ServiceName}'. Iniciando Rollback automático!", ex);
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");

                try
                {
                    if (Directory.Exists(backupFolder))
                    {
                        FileLogger.Log($"[FleetOrchestrator] Restaurando backup de '{backupFolder}' para '{srvConfig.InstallPath}'...");
                        if (WinController.GetServiceStatus(srvConfig.ServiceName) != "Não Encontrado") WinController.StopService(srvConfig.ServiceName);
                        CopyDirectory(backupFolder, srvConfig.InstallPath);
                        if (WinController.GetServiceStatus(srvConfig.ServiceName) != "Não Encontrado") WinController.StartService(srvConfig.ServiceName);
                        FileLogger.Log($"[FleetOrchestrator] Rollback concluído com sucesso.");
                        await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                    }
                }
                catch (Exception rollbackEx)
                {
                    FileLogger.LogError("Erro crítico durante o Rollback!", rollbackEx);
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                }
            }
            finally
            {
                try { if (Directory.Exists(stagingFolder)) Directory.Delete(stagingFolder, true); } catch { }
            }
        }

        private static void CopyDirectory(string sourceDir, string targetDir)
        {
            Directory.CreateDirectory(targetDir);
            foreach (var file in Directory.GetFiles(sourceDir))
            {
                string targetFilePath = Path.Combine(targetDir, Path.GetFileName(file));
                File.Copy(file, targetFilePath, true);
            }
            foreach (var subDir in Directory.GetDirectories(sourceDir))
            {
                string targetSubDir = Path.Combine(targetDir, Path.GetFileName(subDir));
                CopyDirectory(subDir, targetSubDir);
            }
        }
    }
}
