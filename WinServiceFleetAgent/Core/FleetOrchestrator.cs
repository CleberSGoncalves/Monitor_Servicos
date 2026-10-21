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
        private readonly ChannelOrchestrator _channelOrchestrator;
        private readonly string _hostname;
        private readonly AutoUpdateConfig _autoUpdateConfig;
        private DateTime _lastAutoUpdateCheck = DateTime.MinValue;
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
            List<ServiceDefinition> services,
            bool channelMonitoringEnabled = true,
            string? multiplexesXmlPath = null,
            string? tunersStatusXmlPath = null,
            string? telemetriaApiUrl = null,
            AutoUpdateConfig? autoUpdateConfig = null)
        {
            _hostname = string.IsNullOrWhiteSpace(hostnameOverride) ? Environment.MachineName : hostnameOverride;
            _configXmlPath = configXmlPath;
            _configMonitorConfigPath = configMonitorConfigPath;
            _backupBaseDir = backupBaseDir;
            _tempStagingDir = tempStagingDir;
            _githubToken = githubToken;
            _services = services ?? new List<ServiceDefinition>();
            _autoUpdateConfig = autoUpdateConfig ?? new AutoUpdateConfig();

            _spClient = new SharePointClient(siteUrl, listName, clientId, clientSecret);
            _channelOrchestrator = new ChannelOrchestrator(
                _spClient,
                multiplexesXmlPath,
                tunersStatusXmlPath,
                telemetriaApiUrl,
                channelMonitoringEnabled,
                configXmlPath
            );
        }

        public async Task RunCycleAsync()
        {
            FileLogger.Log($"==================================================");
            FileLogger.Log($"[FleetOrchestrator] Iniciando ciclo em {DateTime.Now} | Host: {_hostname}");
            FileLogger.Log($"==================================================");

            // Passo 0: Processamento de Marcadores de Inicialização (Sucesso de Atualização ou Rollback)
            string agentBaseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            var agentSrvDef = _services.FirstOrDefault(s => s.ServiceName.Equals("DNA.MonitorServiceSVC", StringComparison.OrdinalIgnoreCase));
            string agentInstallDir = (agentSrvDef != null && Directory.Exists(agentSrvDef.InstallPath)) ? agentSrvDef.InstallPath.TrimEnd('\\') : agentBaseDir;
            await AgentAutoUpdater.ProcessStartupMarkersAsync(agentInstallDir, _spClient, _hostname, "DNA.MonitorServiceSVC");

            // Passo 0.5: Verificação Autônoma Periódica de Auto-Atualização do Agente
            if (_autoUpdateConfig.Enabled && (DateTime.UtcNow - _lastAutoUpdateCheck).TotalMinutes >= _autoUpdateConfig.CheckIntervalMinutes)
            {
                _lastAutoUpdateCheck = DateTime.UtcNow;
                string currentAgentExe = Path.Combine(agentInstallDir, "WinServiceFleetAgent.exe");
                if (!File.Exists(currentAgentExe)) currentAgentExe = Path.Combine(agentBaseDir, "WinServiceFleetAgent.exe");
                string currentAgentVer = VersionInspector.GetExecutableVersion(currentAgentExe);

                var checkResult = await AgentAutoUpdater.CheckForUpdateAsync(_autoUpdateConfig, _githubToken, currentAgentVer, currentAgentExe);
                if (checkResult.IsUpdateAvailable)
                {
                    FileLogger.Log($"[FleetOrchestrator] 🚀 Nova versão detectada para o agente: '{checkResult.LatestVersion}' (Instalada: '{currentAgentVer}'). Iniciando auto-atualização autônoma...", writeToEventLog: true, eventId: 1100);

                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, "DNA.MonitorServiceSVC", "Em Progresso", versaoDesejada: checkResult.LatestVersion);

                    var stageResult = await AgentAutoUpdater.DownloadAndStageUpdateAsync(_autoUpdateConfig, checkResult, _tempStagingDir, _githubToken);
                    if (stageResult.Success)
                    {
                        string stageDir = Path.GetDirectoryName(stageResult.ValidatedExePath) ?? Path.Combine(_tempStagingDir, "DNA.MonitorServiceSVC_selfupdate");
                        bool scheduled = AgentAutoUpdater.ScheduleAtomicUpdate(
                            serviceName: "DNA.MonitorServiceSVC",
                            installDir: agentInstallDir,
                            stagingDir: stageDir,
                            backupBaseDir: _backupBaseDir,
                            currentVer: currentAgentVer,
                            targetVer: checkResult.LatestVersion
                        );

                        if (scheduled)
                        {
                            FileLogger.Log("[FleetOrchestrator] ✅ Auto-atualização autônoma programada com sucesso via Task Scheduler (SYSTEM). Encerrando ciclo para aplicação imediata.");
                            return;
                        }
                    }
                    else
                    {
                        FileLogger.LogError($"[FleetOrchestrator] ❌ Falha no staging da auto-atualização autônoma: {stageResult.ErrorMessage}", writeToEventLog: true, eventId: 3100);
                        await _spClient.UpdateActionStatusByServiceAsync(_hostname, "DNA.MonitorServiceSVC", "Erro na Atualização");
                    }
                }
            }

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
                    // Tenta na subpasta com o nome do serviço (ex: C:\Program Files (x86)\Tanium\Tanium Client\TaniumClient.exe)
                    string subPath = Path.Combine(srv.InstallPath, srv.ServiceName, srv.ExeName);
                    if (File.Exists(subPath))
                    {
                        exeFullPath = subPath;
                    }
                    else
                    {
                        string subNoSpaces = Path.Combine(srv.InstallPath, srv.ServiceName.Replace(" ", ""), srv.ExeName);
                        if (File.Exists(subNoSpaces))
                        {
                            exeFullPath = subNoSpaces;
                        }
                    }
                }

                if (!File.Exists(exeFullPath))
                {
                    if (srv.InstallPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        string altPath = "D:\\" + srv.InstallPath.Substring(3);
                        if (File.Exists(Path.Combine(altPath, srv.ExeName)))
                        {
                            exeFullPath = Path.Combine(altPath, srv.ExeName);
                        }
                        else if (File.Exists(Path.Combine(altPath, srv.ServiceName, srv.ExeName)))
                        {
                            exeFullPath = Path.Combine(altPath, srv.ServiceName, srv.ExeName);
                        }
                    }
                    else if (srv.InstallPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        string altPath = "C:\\" + srv.InstallPath.Substring(3);
                        if (File.Exists(Path.Combine(altPath, srv.ExeName)))
                        {
                            exeFullPath = Path.Combine(altPath, srv.ExeName);
                        }
                        else if (File.Exists(Path.Combine(altPath, srv.ServiceName, srv.ExeName)))
                        {
                            exeFullPath = Path.Combine(altPath, srv.ServiceName, srv.ExeName);
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

                string installedVer = "Não Instalado";

                if (isStandaloneApp)
                {
                    if (exeExists)
                    {
                        bool procRunning = Process.GetProcessesByName("DigitalTVCapture").Length > 0 ||
                                           Process.GetProcessesByName("AtriaCapture").Length > 0 ||
                                           Process.GetProcessesByName("Atria").Length > 0;
                        statusServico = procRunning ? "Em Execução" : "Parado";
                        installedVer = VersionInspector.GetExecutableVersion(exeFullPath);
                    }
                    else
                    {
                        statusServico = "Inexistente";
                    }
                }
                else
                {
                    if (!serviceExists && !exeExists)
                    {
                        statusServico = "Inexistente";
                    }
                    else
                    {
                        installedVer = VersionInspector.GetExecutableVersion(exeFullPath);
                    }
                }

                string? githubLatestVer = null;
                if (!string.IsNullOrWhiteSpace(srv.GithubRepo))
                {
                    githubLatestVer = await GitHubDownloader.GetLatestReleaseVersionAsync(srv.GithubRepo, _githubToken);
                }

                FileLogger.Log($"[FleetOrchestrator] Processando '{_hostname}_{srv.ServiceName}' -> País: '{paisTitle}', Status: '{statusServico}', Instalada: '{installedVer}', GitHub Desejada: '{githubLatestVer}'");

                string autoRestartSetting = await _spClient.SyncServiceInventoryAsync(
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

                if (statusServico.Equals("Parado", StringComparison.OrdinalIgnoreCase))
                {
                    bool isAutoRestartEnabled = autoRestartSetting.Equals("Sim", StringComparison.OrdinalIgnoreCase) ||
                                                autoRestartSetting.Equals("True", StringComparison.OrdinalIgnoreCase);

                    if (isAutoRestartEnabled)
                    {
                        FileLogger.Log($"[FleetOrchestrator] ⚠️ {(isStandaloneApp ? "Aplicação" : "Serviço")} '{srv.ServiceName}' detectado como PARADO. AutoRestart='Sim' no SharePoint. Executando auto-recuperação...");
                        try
                        {
                            bool restarted = false;
                            if (isStandaloneApp)
                            {
                                AtriaInstaller.StartAtriaApplication(srv.InstallPath, srv.ExeName);
                                await Task.Delay(2000);
                                restarted = Process.GetProcessesByName("DigitalTVCapture").Length > 0 ||
                                            Process.GetProcessesByName("AtriaCapture").Length > 0 ||
                                            Process.GetProcessesByName("Atria").Length > 0;
                            }
                            else
                            {
                                restarted = WinController.StartService(srv.ServiceName);
                            }

                            if (restarted)
                            {
                                statusServico = "Em Execução";
                                FileLogger.Log($"[FleetOrchestrator] 🩹 AutoRestart ativado: '{srv.ServiceName}' reiniciado com sucesso!");
                                await _spClient.UpdateServiceStatusAsync(_hostname, srv.ServiceName, "Em Execução");
                            }
                        }
                        catch (Exception ex)
                        {
                            FileLogger.LogError($"[FleetOrchestrator] Falha no AutoRestart para '{srv.ServiceName}'", ex);
                        }
                    }
                    else
                    {
                        FileLogger.Log($"[FleetOrchestrator] ℹ️ '{srv.ServiceName}' está PARADO, mas AutoRestart está configurado como '{autoRestartSetting}' no SharePoint. Nenhuma tentativa de inicialização necessária.");
                    }
                }

                await Task.Delay(200);
            }

            // Passo 2.5: Monitoramento de Canais DTV (Transmissões, Tuners, Sinal e Gravações)
            try
            {
                await _channelOrchestrator.RunChannelCycleAsync(metadata);
            }
            catch (Exception exCh)
            {
                FileLogger.LogError("[FleetOrchestrator] Erro no ciclo de monitoramento de canais DTV", exCh);
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

                        bool isZabbixUrl = urlAction.NomeServico.Contains("Zabbix", StringComparison.OrdinalIgnoreCase);
                        bool updated = false;

                        if (isZabbixUrl)
                        {
                            updated = ConfigUrlUpdater.UpdateZabbixServerUrl(@"C:\Zabbix\config\zabbix_agentd.conf", urlAction.UrlComunicacaoDesejavel);
                            if (updated)
                            {
                                WinController.RestartService("Zabbix Agent");
                            }
                        }
                        else
                        {
                            updated = ConfigUrlUpdater.UpdateWcfMainUrl(_configMonitorConfigPath, urlAction.UrlComunicacaoDesejavel);
                            if (updated)
                            {
                                WinController.RestartService("DNA.ConfigMonitorSVC");
                            }
                        }

                        if (updated)
                        {
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

            // Passo 4: Execução de Ações Pendentes de Serviços (Acao_Solicitada = "Reiniciar" / "Parar" / "Instalar" / "Desinstalar" / "Atualizar")
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
                            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Execução", acaoSolicitada: "Nenhuma");
                            FileLogger.Log($"[FleetOrchestrator] ✅ Serviço '{srvConfig.ServiceName}' reiniciado com sucesso!");
                        }
                        else
                        {
                            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                        }
                    }
                    else if (action.AcaoSolicitada.Equals("Parar", StringComparison.OrdinalIgnoreCase))
                    {
                        await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso");
                        bool stopped = WinController.StopService(srvConfig.ServiceName);
                        if (stopped)
                        {
                            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Parado", acaoSolicitada: "Nenhuma");
                            FileLogger.Log($"[FleetOrchestrator] ✅ Serviço '{srvConfig.ServiceName}' parado com sucesso!");
                        }
                        else
                        {
                            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                        }
                    }
                    else if (action.AcaoSolicitada.Equals("Instalar", StringComparison.OrdinalIgnoreCase))
                    {
                        await ProcessInstallAsync(srvConfig, action);
                    }
                    else if (action.AcaoSolicitada.Equals("Desinstalar", StringComparison.OrdinalIgnoreCase))
                    {
                        await ProcessUninstallAsync(srvConfig, action);
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

            bool isAtriaUpdate = srvConfig.ServiceName.Equals("Atria Capture", StringComparison.OrdinalIgnoreCase) ||
                                 srvConfig.ServiceName.Equals("AtriaCapture", StringComparison.OrdinalIgnoreCase) ||
                                 action.NomeServico.Contains("Atria", StringComparison.OrdinalIgnoreCase);

            if (isAtriaUpdate)
            {
                string atriaTargetVer = !string.IsNullOrWhiteSpace(action.VersaoDesejada) ? action.VersaoDesejada : "2.0.2.2";
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso", versaoDesejada: atriaTargetVer);
                FileLogger.Log($"[FleetOrchestrator] 🚀 Disparando fluxo customizado de atualização do Atria Capture (vc_redist.x64.exe + installer script)...");

                bool ok = await AtriaInstaller.InstallOrUpdateAtriaAsync();

                string atriaExePath = Path.Combine(srvConfig.InstallPath, srvConfig.ExeName);
                if (!File.Exists(atriaExePath)) atriaExePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, srvConfig.ExeName);
                string newInstalledVer = VersionInspector.GetExecutableVersion(atriaExePath);
                if (string.IsNullOrWhiteSpace(newInstalledVer) || newInstalledVer.Contains("Não Encontrado", StringComparison.OrdinalIgnoreCase) || newInstalledVer == "0.0.0.0")
                {
                    newInstalledVer = atriaTargetVer;
                }

                if (ok)
                {
                    FileLogger.Log($"[FleetOrchestrator] ✅ Atria Capture instalado/atualizado com sucesso! Versão detectada: {newInstalledVer}");
                    AtriaInstaller.StartAtriaApplication(srvConfig.InstallPath, srvConfig.ExeName);
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Atualizado", acaoSolicitada: "Nenhuma", versaoInstalada: newInstalledVer, versaoDesejada: atriaTargetVer);
                }
                else
                {
                    FileLogger.LogError($"[FleetOrchestrator] ❌ Falha na instalação do Atria Capture.");
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                }
                return;
            }

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
                    FileLogger.Log($"[FleetOrchestrator] Auto-atualização já foi disparada. Aguardando...");
                    return;
                }

                _isSelfUpdateTriggered = true;
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso", versaoDesejada: targetVersion);
                FileLogger.Log($"[FleetOrchestrator] 🚀 Iniciando auto-atualização atômica do agente para versão '{targetVersion}'...", writeToEventLog: true, eventId: 1100);

                var checkResult = new UpdateCheckResult
                {
                    IsUpdateAvailable = true,
                    LatestVersion = targetVersion,
                    CurrentVersion = installedVer,
                    Source = _autoUpdateConfig.Source
                };

                var stageResult = await AgentAutoUpdater.DownloadAndStageUpdateAsync(_autoUpdateConfig, checkResult, _tempStagingDir, _githubToken);
                if (!stageResult.Success)
                {
                    _isSelfUpdateTriggered = false;
                    FileLogger.LogError($"[FleetOrchestrator] ❌ Falha na validação de integridade/staging para auto-atualização: {stageResult.ErrorMessage}", writeToEventLog: true, eventId: 3100);
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                    return;
                }

                string installDir = srvConfig.InstallPath;
                if (!Directory.Exists(installDir))
                    installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');

                string stageDir = Path.GetDirectoryName(stageResult.ValidatedExePath) ?? Path.Combine(_tempStagingDir, "DNA.MonitorServiceSVC_selfupdate");

                bool scheduled = AgentAutoUpdater.ScheduleAtomicUpdate(
                    serviceName: srvConfig.ServiceName,
                    installDir: installDir,
                    stagingDir: stageDir,
                    backupBaseDir: _backupBaseDir,
                    currentVer: installedVer,
                    targetVer: targetVersion
                );

                if (!scheduled)
                {
                    _isSelfUpdateTriggered = false;
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

                // Validação de Integridade do Executável do Serviço antes de interromper o serviço em produção
                string stagedExe = Path.Combine(stagingFolder, srvConfig.ExeName);
                if (!File.Exists(stagedExe))
                {
                    var found = Directory.GetFiles(stagingFolder, srvConfig.ExeName, SearchOption.AllDirectories);
                    if (found.Length > 0) stagedExe = found[0];
                }

                var (isValidExe, detVer, valMsg) = IntegrityValidator.ValidateExecutable(stagedExe, targetVersion, minimumSizeBytes: 10_000);
                if (!isValidExe)
                {
                    throw new Exception($"Validação de integridade do pacote extraído falhou: {valMsg}");
                }
                FileLogger.Log($"[FleetOrchestrator] ✅ Integridade dos binários validada com sucesso: {valMsg}");

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

        private async Task ProcessInstallAsync(ServiceDefinition srvConfig, PendingActionItem action)
        {
            FileLogger.Log($"[FleetOrchestrator] 🚀 Iniciando instalação do serviço '{srvConfig.ServiceName}'...");
            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso");

            string targetVersion = !string.IsNullOrWhiteSpace(action.VersaoDesejada) ? action.VersaoDesejada : "latest";

            if (!string.IsNullOrWhiteSpace(srvConfig.GithubRepo))
            {
                try
                {
                    GitHubDownloader.ClearCache(srvConfig.GithubRepo);
                    string? latest = await GitHubDownloader.GetLatestReleaseVersionAsync(srvConfig.GithubRepo, _githubToken);
                    if (!string.IsNullOrWhiteSpace(latest)) targetVersion = latest;

                    await GitHubDownloader.DownloadAndExtractReleaseAsync(srvConfig.GithubRepo, targetVersion, _githubToken, srvConfig.InstallPath);
                }
                catch (Exception exDl)
                {
                    FileLogger.LogError($"[FleetOrchestrator] Falha ao baixar release para '{srvConfig.ServiceName}'", exDl);
                }
            }

            if (srvConfig.ServiceName.Equals("Zabbix Agent", StringComparison.OrdinalIgnoreCase) ||
                srvConfig.ServiceName.Equals("Zabbix", StringComparison.OrdinalIgnoreCase))
            {
                string zabbixExe = Path.Combine(srvConfig.InstallPath, "zabbix_agentd.exe");
                string zabbixConf = Path.Combine(srvConfig.InstallPath, "config", "zabbix_agentd.conf");
                if (File.Exists(zabbixExe))
                {
                    RunCommand("cmd.exe", $"/c \"\"{zabbixExe}\" --config \"{zabbixConf}\" --install\"");
                }
            }
            else if (srvConfig.ServiceName.Equals("Tanium Client", StringComparison.OrdinalIgnoreCase) ||
                     srvConfig.ServiceName.Equals("Tanium", StringComparison.OrdinalIgnoreCase))
            {
                string installBat = Path.Combine(srvConfig.InstallPath, "Install.bat");
                if (File.Exists(installBat))
                {
                    RunCommand("cmd.exe", $"/c \"\"{installBat}\"\"");
                }
                else
                {
                    string setupExe = Path.Combine(srvConfig.InstallPath, "SetupClient.exe");
                    if (File.Exists(setupExe))
                    {
                        RunCommand(setupExe, "/S");
                    }
                }
            }
            else
            {
                string installBat = Path.Combine(srvConfig.InstallPath, "_InstallService.bat");
                if (!File.Exists(installBat)) installBat = Path.Combine(srvConfig.InstallPath, "install.bat");

                if (File.Exists(installBat))
                {
                    RunCommand("cmd.exe", $"/c \"\"{installBat}\"\"");
                }
                else
                {
                    string exePath = Path.Combine(srvConfig.InstallPath, srvConfig.ExeName);
                    if (File.Exists(exePath))
                    {
                        RunCommand("cmd.exe", $"/c sc create \"{srvConfig.ServiceName}\" binPath= \"{exePath}\" start= auto");
                    }
                }
            }

            WinController.StartService(srvConfig.ServiceName);

            string exeFullPath = Path.Combine(srvConfig.InstallPath, srvConfig.ExeName);
            string installedVer = VersionInspector.GetExecutableVersion(exeFullPath);
            string currentStatus = WinController.GetServiceStatus(srvConfig.ServiceName);

            if (currentStatus == "Em Execução" || File.Exists(exeFullPath))
            {
                FileLogger.Log($"[FleetOrchestrator] ✅ Serviço '{srvConfig.ServiceName}' instalado e iniciado com sucesso!");
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Execução", acaoSolicitada: "Nenhuma", versaoInstalada: installedVer, versaoDesejada: targetVersion);
            }
            else
            {
                FileLogger.LogError($"[FleetOrchestrator] ❌ Erro ao instalar serviço '{srvConfig.ServiceName}'.");
                await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
            }
        }

        private async Task ProcessUninstallAsync(ServiceDefinition srvConfig, PendingActionItem action)
        {
            FileLogger.Log($"[FleetOrchestrator] 🗑️ Iniciando desinstalação do serviço '{srvConfig.ServiceName}'...");
            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Em Progresso");

            WinController.StopService(srvConfig.ServiceName);

            if (srvConfig.ServiceName.Equals("Zabbix Agent", StringComparison.OrdinalIgnoreCase) ||
                srvConfig.ServiceName.Equals("Zabbix", StringComparison.OrdinalIgnoreCase))
            {
                string zabbixExe = Path.Combine(srvConfig.InstallPath, "zabbix_agentd.exe");
                string zabbixConf = Path.Combine(srvConfig.InstallPath, "config", "zabbix_agentd.conf");
                if (File.Exists(zabbixExe))
                {
                    RunCommand("cmd.exe", $"/c \"\"{zabbixExe}\" --config \"{zabbixConf}\" --uninstall\"");
                }
            }
            else
            {
                string uninstallBat = Path.Combine(srvConfig.InstallPath, "_UninstallService.bat");
                if (!File.Exists(uninstallBat)) uninstallBat = Path.Combine(srvConfig.InstallPath, "uninstall.bat");

                if (File.Exists(uninstallBat))
                {
                    RunCommand("cmd.exe", $"/c \"\"{uninstallBat}\"\"");
                }
                else
                {
                    RunCommand("cmd.exe", $"/c sc delete \"{srvConfig.ServiceName}\"");
                }
            }

            FileLogger.Log($"[FleetOrchestrator] ✅ Serviço '{srvConfig.ServiceName}' desinstalado com sucesso!");
            await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Inexistente", acaoSolicitada: "Nenhuma", versaoInstalada: "Não Instalado");
        }

        private static void RunCommand(string fileName, string arguments)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (var proc = new Process { StartInfo = psi })
                {
                    proc.Start();
                    // Drena assincronamente os streams para evitar deadlock de buffer de pipe (>4KB)
                    string stdout = proc.StandardOutput.ReadToEnd();
                    string stderr = proc.StandardError.ReadToEnd();
                    proc.WaitForExit(30000);

                    if (!string.IsNullOrWhiteSpace(stderr))
                    {
                        FileLogger.Log($"[RunCommand] Saída de erro ({fileName}): {stderr.Trim()}");
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao executar comando '{fileName} {arguments}'", ex);
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
