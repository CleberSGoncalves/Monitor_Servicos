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
                FileLogger.Log($"[FleetOrchestrator] 🚀 Baixando versão '{targetVersion}' em C# com serviço em execução...");

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
                        FileLogger.LogError($"[FleetOrchestrator] ❌ Exe não encontrado no staging após extração. Abortando sem parar serviço.");
                        await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                        _isSelfUpdateTriggered = false;
                        return;
                    }

                    FileLogger.Log($"[FleetOrchestrator] ✅ Download validado. Agendando substituição via Task Scheduler...");

                    // 2. Detecta o diretório real de instalação
                    string installDir = srvConfig.InstallPath;
                    if (!Directory.Exists(installDir))
                        installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');

                    // 3. Gera script PowerShell (mais robusto que BAT) em %TEMP%
                    string psScriptPath = Path.Combine(Path.GetTempPath(), "dna_apply_update.ps1");

                    var ps = new System.Text.StringBuilder();
                    ps.AppendLine("# DNA.MonitorServiceSVC - Apply Self Update");
                    ps.AppendLine($"$svc = '{srvConfig.ServiceName}'");
                    ps.AppendLine($"$staging = '{selfStagingFolder}'");
                    ps.AppendLine($"$install = '{installDir}'");
                    ps.AppendLine("Start-Sleep -Seconds 5");
                    ps.AppendLine("try { Stop-Service $svc -Force -ErrorAction SilentlyContinue } catch {}");
                    // Aguarda STOPPED com timeout de 30s
                    ps.AppendLine("$t = [DateTime]::Now.AddSeconds(30)");
                    ps.AppendLine("while ([DateTime]::Now -lt $t) {");
                    ps.AppendLine("  $st = (Get-Service $svc -ErrorAction SilentlyContinue).Status");
                    ps.AppendLine("  if ($st -eq 'Stopped') { break }");
                    ps.AppendLine("  Start-Sleep -Seconds 1");
                    ps.AppendLine("}");
                    // Mata processo se ainda existir
                    ps.AppendLine("Get-Process -Name 'WinServiceFleetAgent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue");
                    ps.AppendLine("Start-Sleep -Seconds 1");
                    // Copia cada arquivo individualmente
                    ps.AppendLine("Get-ChildItem -Path $staging -File | ForEach-Object {");
                    ps.AppendLine("  $dest = Join-Path $install $_.Name");
                    ps.AppendLine("  try { Copy-Item $_.FullName $dest -Force } catch {}");
                    ps.AppendLine("}");
                    // Inicia serviço com 3 tentativas
                    ps.AppendLine("for ($i=1; $i -le 3; $i++) {");
                    ps.AppendLine("  try { Start-Service $svc -ErrorAction Stop; break } catch { Start-Sleep -Seconds 3 }");
                    ps.AppendLine("}");
                    // Remove agendamento e script
                    ps.AppendLine("schtasks /delete /tn 'DNA_SelfUpdate' /f >$null 2>&1");
                    ps.AppendLine("Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue");

                    await File.WriteAllTextAsync(psScriptPath, ps.ToString(), System.Text.Encoding.UTF8);

                    // 4. Registra como tarefa agendada que roda IMEDIATAMENTE como SYSTEM
                    //    O Task Scheduler roda FORA do Job Object do serviço — 100% isolado
                    string taskName = "DNA_SelfUpdate";
                    string schtasksDelete = $"/delete /tn \"{taskName}\" /f";
                    string schtasksCreate = $"/create /tn \"{taskName}\" /tr \"powershell.exe -ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File \\\"{psScriptPath}\\\"\" /sc once /st 00:00 /ru SYSTEM /it /f /rl HIGHEST";

                    // Remove tarefa anterior se existir
                    Process.Start(new ProcessStartInfo("schtasks.exe", schtasksDelete) { UseShellExecute = false, CreateNoWindow = true })?.WaitForExit(3000);

                    // Cria nova tarefa
                    var createTask = Process.Start(new ProcessStartInfo("schtasks.exe", schtasksCreate) { UseShellExecute = false, CreateNoWindow = true });
                    createTask?.WaitForExit(5000);

                    // Dispara a tarefa imediatamente
                    var runTask = Process.Start(new ProcessStartInfo("schtasks.exe", $"/run /tn \"{taskName}\"") { UseShellExecute = false, CreateNoWindow = true });
                    runTask?.WaitForExit(3000);

                    FileLogger.Log($"[FleetOrchestrator] ✅ Tarefa '{taskName}' agendada e disparada via Task Scheduler (SYSTEM, isolado do serviço). Substituição ocorrerá em ~10s.");
                    return;
                }
                catch (Exception exSelf)
                {
                    _isSelfUpdateTriggered = false;
                    FileLogger.LogError($"[FleetOrchestrator] ❌ Erro no self-update", exSelf);
                    await _spClient.UpdateActionStatusByServiceAsync(_hostname, action.NomeServico, "Erro na Atualização");
                    return;
                }
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
