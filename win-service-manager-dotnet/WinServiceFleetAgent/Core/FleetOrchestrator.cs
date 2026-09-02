using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public class ServiceDefinition
    {
        public string ServiceName { get; set; } = string.Empty;
        public string InstallPath { get; set; } = string.Empty;
        public string ExeName { get; set; } = string.Empty;
        public string ConfigFile { get; set; } = string.Empty;
        public string GithubRepo { get; set; } = string.Empty;
    }

    public class FleetOrchestrator
    {
        private readonly string _hostname;
        private readonly string _configXmlPath;
        private readonly string _configMonitorConfigPath;
        private readonly string _backupBaseDir;
        private readonly string _tempStagingDir;
        private readonly string _githubToken;
        private readonly SharePointClient _spClient;
        private readonly List<ServiceDefinition> _services;

        public FleetOrchestrator(
            string hostname,
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
            _hostname = string.IsNullOrWhiteSpace(hostname) ? Environment.MachineName : hostname;
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
            Console.WriteLine($"\n==================================================");
            Console.WriteLine($"[FleetOrchestrator] Iniciando ciclo em {DateTime.Now} | Host: {_hostname}");
            Console.WriteLine($"==================================================");

            // Passo 1: Leitura de Metadados Globais
            var metadata = MetadataReader.GetGlobalMachineMetadata(_configXmlPath, _configMonitorConfigPath);
            Console.WriteLine($"[FleetOrchestrator] Metadados extraídos: Praça='{metadata.Praca}', CS={metadata.CS}, Url_Comunicacao='{metadata.UrlComunicacao}'");

            // Passo 2: Inventário e sincronização dos serviços locais no SharePoint
            foreach (var srv in _services)
            {
                string exeFullPath = Path.Combine(srv.InstallPath, srv.ExeName);
                string installedVer = VersionInspector.GetExecutableVersion(exeFullPath);
                string statusServico = WinController.GetServiceStatus(srv.ServiceName);

                string title = $"{_hostname}_{srv.ServiceName}";
                Console.WriteLine($"[FleetOrchestrator] Serviço '{title}' -> Status: '{statusServico}', Versão: '{installedVer}'");

                await _spClient.SyncServiceInventoryAsync(
                    hostname: _hostname,
                    praca: metadata.Praca,
                    cs: metadata.CS,
                    nomeServico: srv.ServiceName,
                    versaoInstalada: installedVer,
                    statusServico: statusServico,
                    urlComunicacao: metadata.UrlComunicacao
                );
            }

            // Passo 3: Verificação e Execução de Ações Pendentes
            var pendingActions = await _spClient.GetPendingActionsAsync(_hostname);
            if (pendingActions == null || pendingActions.Count == 0)
            {
                Console.WriteLine("[FleetOrchestrator] Nenhuma ação pendente no SharePoint para este host.");
                return;
            }

            foreach (var action in pendingActions)
            {
                var srvConfig = _services.FirstOrDefault(s => s.ServiceName.Equals(action.NomeServico, StringComparison.OrdinalIgnoreCase));
                if (srvConfig == null)
                {
                    Console.WriteLine($"[FleetOrchestrator] Serviço '{action.NomeServico}' não encontrado nas configurações locais.");
                    continue;
                }

                if (action.AcaoSolicitada.Equals("Reiniciar", StringComparison.OrdinalIgnoreCase))
                {
                    await HandleRestartActionAsync(action.Title, srvConfig.ServiceName);
                }
                else if (action.AcaoSolicitada.Equals("Atualizar", StringComparison.OrdinalIgnoreCase))
                {
                    await HandleUpdateActionAsync(action.Title, srvConfig, action.VersaoDesejada);
                }
            }
        }

        private async Task HandleRestartActionAsync(string title, string serviceName)
        {
            Console.WriteLine($"[FleetOrchestrator] Executando Ação 'Reiniciar' para '{serviceName}'...");
            await _spClient.UpdateActionStatusAsync(title, "Reiniciando Serviço");
            try
            {
                WinController.RestartService(serviceName);
                await _spClient.UpdateActionStatusAsync(title, "Concluído", acaoSolicitada: "Nenhuma");
                Console.WriteLine($"[FleetOrchestrator] Serviço '{serviceName}' reiniciado com sucesso.");
            }
            catch (Exception ex)
            {
                string errMsg = $"Falha ao reiniciar: {ex.Message}";
                Console.WriteLine($"[FleetOrchestrator] {errMsg}");
                await _spClient.UpdateActionStatusAsync(title, $"Falha: {errMsg}");
            }
        }

        private async Task HandleUpdateActionAsync(string title, ServiceDefinition srv, string targetVersion)
        {
            Console.WriteLine($"[FleetOrchestrator] Iniciando pipeline de atualização para '{srv.ServiceName}' -> Versão Desejada: '{targetVersion}'");

            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string backupDir = Path.Combine(_backupBaseDir, $"{srv.ServiceName}_{timestamp}");
            string stagingDir = Path.Combine(_tempStagingDir, $"{srv.ServiceName}_{timestamp}");

            try
            {
                // 1. Baixando Release
                await _spClient.UpdateActionStatusAsync(title, "Baixando Release");
                string extractedStaging = await GitHubDownloader.DownloadAndExtractReleaseAsync(
                    githubRepo: srv.GithubRepo,
                    tagName: targetVersion,
                    token: _githubToken,
                    targetDir: stagingDir
                );

                // 2. Parando Serviço
                await _spClient.UpdateActionStatusAsync(title, "Parando Serviço");
                WinController.StopService(srv.ServiceName);

                // 3. Realizando Backup Preventivo
                await _spClient.UpdateActionStatusAsync(title, "Realizando Backup");
                Console.WriteLine($"[FleetOrchestrator] Criando backup de '{srv.InstallPath}' em '{backupDir}'...");
                if (Directory.Exists(srv.InstallPath))
                {
                    CopyDirectoryRecursively(srv.InstallPath, backupDir);
                }

                // 4. Smart XML Config Merge
                await _spClient.UpdateActionStatusAsync(title, "Aplicando Smart Merge");
                string oldConfig = Path.Combine(backupDir, srv.ConfigFile);
                string newConfigInRelease = Path.Combine(extractedStaging, srv.ConfigFile);
                string mergedConfig = Path.Combine(stagingDir, $"{srv.ConfigFile}.merged");

                if (File.Exists(oldConfig) && File.Exists(newConfigInRelease))
                {
                    ConfigMerger.MergeDotNetConfig(oldConfig, newConfigInRelease, mergedConfig);
                    File.Copy(mergedConfig, newConfigInRelease, overwrite: true);
                }

                // 5. Implantação de Novos Binários
                await _spClient.UpdateActionStatusAsync(title, "Instalando Binários");
                Console.WriteLine($"[FleetOrchestrator] Copiando novos binários para '{srv.InstallPath}'...");
                CopyDirectoryRecursively(extractedStaging, srv.InstallPath);

                // 6. Iniciando Serviço
                await _spClient.UpdateActionStatusAsync(title, "Iniciando Serviço");
                WinController.StartService(srv.ServiceName);

                // 7. Validação da Nova Versão
                string exeFullPath = Path.Combine(srv.InstallPath, srv.ExeName);
                string newInstalledVer = VersionInspector.GetExecutableVersion(exeFullPath);

                await _spClient.UpdateActionStatusAsync(
                    title: title,
                    statusAtualizacao: "Concluído",
                    acaoSolicitada: "Nenhuma",
                    versaoInstalada: newInstalledVer
                );

                Console.WriteLine($"[FleetOrchestrator] Atualização de '{srv.ServiceName}' concluída com sucesso para versão '{newInstalledVer}'!");

                try
                {
                    if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, recursive: true);
                }
                catch { }
            }
            catch (Exception ex)
            {
                string errMsg = $"Falha na atualização: {ex.Message}";
                Console.WriteLine($"[FleetOrchestrator] ❌ {errMsg}");

                await ExecuteRollbackAsync(title, srv.ServiceName, srv.InstallPath, backupDir, errMsg);

                try
                {
                    if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, recursive: true);
                }
                catch { }
            }
        }

        private async Task ExecuteRollbackAsync(
            string title,
            string serviceName,
            string installPath,
            string backupDir,
            string errorReason)
        {
            Console.WriteLine($"[FleetOrchestrator] 🔄 Iniciando ROLLBACK Automático para '{serviceName}'...");
            await _spClient.UpdateActionStatusAsync(title, "Executando Rollback");

            try
            {
                try { WinController.StopService(serviceName); } catch { }

                if (Directory.Exists(backupDir))
                {
                    Console.WriteLine($"[FleetOrchestrator] Restaurando arquivos de backup de '{backupDir}' para '{installPath}'...");
                    if (Directory.Exists(installPath)) Directory.Delete(installPath, recursive: true);
                    CopyDirectoryRecursively(backupDir, installPath);
                }

                WinController.StartService(serviceName);
                Console.WriteLine($"[FleetOrchestrator] Serviço '{serviceName}' restaurado e iniciado no estado anterior.");

                await _spClient.UpdateActionStatusAsync(title, $"Falha: {errorReason} (Rollback executado)");
            }
            catch (Exception rbEx)
            {
                string criticalMsg = $"Falha Crítica no Rollback: {rbEx.Message}";
                Console.WriteLine($"[FleetOrchestrator] 🚨 {criticalMsg}");
                await _spClient.UpdateActionStatusAsync(title, criticalMsg);
            }
        }

        private static void CopyDirectoryRecursively(string sourceDir, string targetDir)
        {
            Directory.CreateDirectory(targetDir);

            foreach (var file in Directory.GetFiles(sourceDir))
            {
                string targetFilePath = Path.Combine(targetDir, Path.GetFileName(file));
                File.Copy(file, targetFilePath, overwrite: true);
            }

            foreach (var subDir in Directory.GetDirectories(sourceDir))
            {
                string targetSubDir = Path.Combine(targetDir, Path.GetFileName(subDir));
                CopyDirectoryRecursively(subDir, targetSubDir);
            }
        }
    }
}
