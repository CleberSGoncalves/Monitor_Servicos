using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WinServiceFleetAgent.Core;

namespace WinServiceFleetAgent
{
    public class Worker : BackgroundService
    {
        private readonly ILogger<Worker> _logger;
        private readonly IConfiguration _configuration;
        private readonly FleetOrchestrator _orchestrator;
        private readonly int _pollingIntervalSeconds;

        public Worker(ILogger<Worker> logger, IConfiguration configuration)
        {
            _logger = logger;
            _configuration = configuration;

            string hostnameOverride = _configuration["HostnameOverride"] ?? string.Empty;
            string configXmlPath = _configuration["ConfigXmlPath"] ?? @"D:\MediaDNA_V2\data\configxml.xml";
            string configMonitorConfigPath = _configuration["ConfigMonitorConfigPath"] ?? @"C:\MediaDNA_V2\applications\ConfigMonitorSVC\DNA.ConfigMonitorSVC.exe.config";
            string backupBaseDir = _configuration["BackupBaseDir"] ?? @"C:\RollbackBackups";
            string tempStagingDir = _configuration["TempStagingDir"] ?? @"C:\TempStaging";

            string siteUrl = _configuration["SharePoint:SiteUrl"] ?? string.Empty;
            string listName = _configuration["SharePoint:ListName"] ?? "Controle_Servicos";
            string clientId = _configuration["SharePoint:ClientId"] ?? string.Empty;
            string clientSecret = _configuration["SharePoint:ClientSecret"] ?? string.Empty;
            string githubToken = _configuration["GitHub:Token"] ?? string.Empty;

            _pollingIntervalSeconds = int.TryParse(_configuration["PollingIntervalSeconds"], out int interval) ? interval : 120;

            var servicesList = new List<ServiceDefinition>();
            var servicesSection = _configuration.GetSection("Services").GetChildren();
            foreach (var srv in servicesSection)
            {
                servicesList.Add(new ServiceDefinition
                {
                    ServiceName = srv["ServiceName"] ?? "",
                    InstallPath = srv["InstallPath"] ?? "",
                    ExeName = srv["ExeName"] ?? "",
                    ConfigFile = srv["ConfigFile"] ?? "",
                    GithubRepo = srv["GithubRepo"] ?? ""
                });
            }

            _orchestrator = new FleetOrchestrator(
                hostnameOverride: hostnameOverride,
                configXmlPath: configXmlPath,
                configMonitorConfigPath: configMonitorConfigPath,
                backupBaseDir: backupBaseDir,
                tempStagingDir: tempStagingDir,
                siteUrl: siteUrl,
                listName: listName,
                clientId: clientId,
                clientSecret: clientSecret,
                githubToken: githubToken,
                services: servicesList
            );
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("WinServiceFleetAgent - Serviço iniciado.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await _orchestrator.RunCycleAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "WinServiceFleetAgent - Erro ao executar ciclo do orquestrador.");
                }

                await Task.Delay(TimeSpan.FromSeconds(_pollingIntervalSeconds), stoppingToken);
            }

            _logger.LogInformation("WinServiceFleetAgent - Serviço finalizado.");
        }
    }
}
