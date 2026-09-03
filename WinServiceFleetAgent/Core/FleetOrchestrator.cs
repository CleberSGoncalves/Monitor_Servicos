using System;
using System.Collections.Generic;
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

            // Passo 1: Leitura de Metadados Globais
            var metadata = MetadataReader.GetGlobalMachineMetadata(_configXmlPath, _configMonitorConfigPath);
            FileLogger.Log($"[FleetOrchestrator] Metadados extraídos: idHost='{metadata.IdHost}', Praça='{metadata.Praca}', CS={metadata.CS}, Url_Comunicacao='{metadata.UrlComunicacao}'");

            // Mapeamento do País (Título do SharePoint)
            string paisTitle = "Brasil";
            if (!string.IsNullOrWhiteSpace(metadata.UrlComunicacao) && metadata.UrlComunicacao.Contains("mediadna.ibope.com"))
            {
                paisTitle = "Brasil";
            }

            // Passo 2: Inventário e sincronização dos serviços/aplicativos INSTALADOS
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
                    // Aplicação Desktop (Atria Capture): SÓ exibe se o executável realmente existir no disco
                    if (!exeExists)
                    {
                        FileLogger.Log($"[FleetOrchestrator] Aplicação '{srv.ServiceName}' NÃO está instalada nesta máquina (Executável não encontrado). Ignorando.");
                        continue;
                    }
                    statusServico = "Instalado";
                }
                else
                {
                    // Serviços do Windows (DNA.*): DEVEM estar registrados no gerenciador de serviços do Windows (services.msc)
                    if (!serviceExists)
                    {
                        FileLogger.Log($"[FleetOrchestrator] Serviço do Windows '{srv.ServiceName}' NÃO está instalado no Windows Services (Não Encontrado). Ignorando.");
                        continue;
                    }
                }

                string installedVer = VersionInspector.GetExecutableVersion(exeFullPath);

                FileLogger.Log($"[FleetOrchestrator] Processando '{_hostname}_{srv.ServiceName}' -> País: '{paisTitle}', Status: '{statusServico}', Versão: '{installedVer}'");

                await _spClient.SyncServiceInventoryAsync(
                    title: paisTitle,
                    hostname: _hostname,
                    praca: metadata.Praca,
                    cs: metadata.CS,
                    nomeServico: srv.ServiceName,
                    versaoInstalada: installedVer,
                    statusServico: statusServico,
                    urlComunicacao: metadata.UrlComunicacao
                );
            }

            // Passo 3: Verificação e Execução de Ações Pendentes de URL (Acao_Solicitada_Url = "Atualizar")
            var pendingUrlActions = await _spClient.GetPendingUrlActionsAsync(_hostname);
            if (pendingUrlActions != null && pendingUrlActions.Count > 0)
            {
                foreach (var urlAction in pendingUrlActions)
                {
                    FileLogger.Log($"[FleetOrchestrator] Executando Ação de URL em '{urlAction.NomeServico}' -> Nova URL Desejável: '{urlAction.UrlComunicacaoDesejavel}'...");
                    try
                    {
                        bool updated = ConfigUrlUpdater.UpdateWcfMainUrl(_configMonitorConfigPath, urlAction.UrlComunicacaoDesejavel);
                        if (updated)
                        {
                            // Reiniciar DNA.ConfigMonitorSVC se estiver em execução para aplicar a nova URL
                            WinController.RestartService("DNA.ConfigMonitorSVC");
                            await _spClient.UpdateUrlActionStatusAsync(_hostname, urlAction.NomeServico, "Atualizado", urlAction.UrlComunicacaoDesejavel);
                            FileLogger.Log($"[FleetOrchestrator] ✅ Ação de URL concluída com sucesso para '{urlAction.NomeServico}'!");
                        }
                        else
                        {
                            await _spClient.UpdateUrlActionStatusAsync(_hostname, urlAction.NomeServico, "Erro na Atualização", metadata.UrlComunicacao);
                        }
                    }
                    catch (Exception ex)
                    {
                        FileLogger.LogError($"Erro ao atualizar URL de comunicação em '{urlAction.NomeServico}'", ex);
                        await _spClient.UpdateUrlActionStatusAsync(_hostname, urlAction.NomeServico, "Erro na Atualização", metadata.UrlComunicacao);
                    }
                }
            }

            // Passo 4: Verificação e Execução de Ações Pendentes de Serviços (Acao_Solicitada = "Reiniciar" / "Atualizar")
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

                string actionTitle = action.Title;
                FileLogger.Log($"[FleetOrchestrator] Executando Ação '{action.AcaoSolicitada}' para [{_hostname}_{action.NomeServico}]...");

                try
                {
                    if (action.AcaoSolicitada.Equals("Reiniciar", StringComparison.OrdinalIgnoreCase))
                    {
                        await _spClient.UpdateActionStatusAsync(actionTitle, "Em Progresso");
                        bool ok = WinController.RestartService(srvConfig.ServiceName);
                        if (ok)
                        {
                            await _spClient.UpdateActionStatusAsync(actionTitle, "Atualizado", acaoSolicitada: "Nenhuma");
                            FileLogger.Log($"[FleetOrchestrator] ✅ Serviço '{srvConfig.ServiceName}' reiniciado com sucesso!");
                        }
                        else
                        {
                            await _spClient.UpdateActionStatusAsync(actionTitle, "Erro na Atualização");
                        }
                    }
                    else if (action.AcaoSolicitada.Equals("Atualizar", StringComparison.OrdinalIgnoreCase))
                    {
                        await ProcessUpdateAsync(srvConfig, action, actionTitle);
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao processar ação em [{actionTitle}]", ex);
                    await _spClient.UpdateActionStatusAsync(actionTitle, "Erro na Atualização");
                }
            }
        }

        private async Task ProcessUpdateAsync(ServiceDefinition srvConfig, PendingActionItem action, string title)
        {
            await _spClient.UpdateActionStatusAsync(title, "Em Progresso");
            FileLogger.Log($"[FleetOrchestrator] Iniciando atualização de '{srvConfig.ServiceName}' para versão '{action.VersaoDesejada}'...");

            string backupFolder = Path.Combine(_backupBaseDir, $"{srvConfig.ServiceName}_{DateTime.Now:yyyyMMdd_HHmmss}");
            string stagingFolder = Path.Combine(_tempStagingDir, $"{srvConfig.ServiceName}_staging");

            try
            {
                if (Directory.Exists(stagingFolder)) Directory.Delete(stagingFolder, true);
                Directory.CreateDirectory(stagingFolder);

                FileLogger.Log($"[FleetOrchestrator] Baixando e extraindo release '{action.VersaoDesejada}' do repositório '{srvConfig.GithubRepo}'...");
                await GitHubDownloader.DownloadAndExtractReleaseAsync(srvConfig.GithubRepo, action.VersaoDesejada, _githubToken, stagingFolder);

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

                await _spClient.UpdateActionStatusAsync(title, "Atualizado", acaoSolicitada: "Nenhuma", versaoInstalada: newVer);
                FileLogger.Log($"[FleetOrchestrator] 🎉 Atualização concluída com sucesso! Nova Versão Instalada: {newVer}");
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Falha durante a atualização de '{srvConfig.ServiceName}'. Iniciando Rollback automático!", ex);
                await _spClient.UpdateActionStatusAsync(title, "Erro na Atualização");

                try
                {
                    if (Directory.Exists(backupFolder))
                    {
                        FileLogger.Log($"[FleetOrchestrator] Restaurando backup de '{backupFolder}' para '{srvConfig.InstallPath}'...");
                        if (WinController.GetServiceStatus(srvConfig.ServiceName) != "Não Encontrado") WinController.StopService(srvConfig.ServiceName);
                        CopyDirectory(backupFolder, srvConfig.InstallPath);
                        if (WinController.GetServiceStatus(srvConfig.ServiceName) != "Não Encontrado") WinController.StartService(srvConfig.ServiceName);
                        FileLogger.Log($"[FleetOrchestrator] Rollback concluído com sucesso.");
                        await _spClient.UpdateActionStatusAsync(title, "Erro na Atualização");
                    }
                }
                catch (Exception rollbackEx)
                {
                    FileLogger.LogError("Erro crítico durante o Rollback!", rollbackEx);
                    await _spClient.UpdateActionStatusAsync(title, "Erro na Atualização");
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
