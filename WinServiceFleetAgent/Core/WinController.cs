using System;
using System.ServiceProcess;

namespace WinServiceFleetAgent.Core
{
    public static class WinController
    {
        public static string GetServiceStatus(string serviceName)
        {
            string status = QuerySingleStatus(serviceName);
            if (status == "Em Execução") return status;

            // Se começou com DNA., tentar sem o prefixo DNA.
            if (status == "Não Encontrado")
            {
                if (serviceName.StartsWith("DNA.", StringComparison.OrdinalIgnoreCase))
                {
                    string stripped = serviceName.Substring(4);
                    status = QuerySingleStatus(stripped);
                    if (status == "Em Execução") return status;
                }
                else
                {
                    string added = "DNA." + serviceName;
                    status = QuerySingleStatus(added);
                    if (status == "Em Execução") return status;
                }
            }

            // Resiliência para FastMatching: variações de DisplayName e ServiceName no Windows (incluindo FastMaching sem 't')
            if (serviceName.Contains("FastMatching", StringComparison.OrdinalIgnoreCase) ||
                serviceName.Contains("FastMaching", StringComparison.OrdinalIgnoreCase))
            {
                string[] fmVariants = { "Fast Matching Service", "FastMatching", "FastMatchingService", "FastMachingSvc", "FastMachingService", "FastMaching" };
                foreach (var v in fmVariants)
                {
                    string vSt = QuerySingleStatus(v);
                    if (vSt == "Em Execução") return vSt;
                    if (status == "Não Encontrado" && vSt != "Não Encontrado")
                    {
                        status = vSt;
                    }
                }

                try
                {
                    if (System.Diagnostics.Process.GetProcessesByName("FastMatchingSvc").Length > 0 ||
                        System.Diagnostics.Process.GetProcessesByName("FastMachingSvc").Length > 0)
                    {
                        return "Em Execução";
                    }
                }
                catch { }
            }

            return status;
        }

        private static string QuerySingleStatus(string serviceName)
        {
            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    switch (sc.Status)
                    {
                        case ServiceControllerStatus.Running:
                        case ServiceControllerStatus.StartPending:
                            return "Em Execução";
                        case ServiceControllerStatus.Stopped:
                        case ServiceControllerStatus.StopPending:
                        case ServiceControllerStatus.Paused:
                        case ServiceControllerStatus.PausePending:
                            try
                            {
                                if (sc.StartType == ServiceStartMode.Disabled)
                                {
                                    return "Desativado";
                                }
                            }
                            catch { }
                            return "Parado";
                        default:
                            return "Parado";
                    }
                }
            }
            catch
            {
                return "Não Encontrado";
            }
        }

        public static bool StopService(string serviceName, int timeoutSeconds = 60)
        {
            string actualName = ResolveActualServiceName(serviceName);
            var current = GetServiceStatus(actualName);
            if (current == "Parado" || current == "Desativado")
            {
                FileLogger.Log($"[WinController] Serviço '{actualName}' já está parado ({current}).");
                return true;
            }
            if (current == "Não Encontrado")
            {
                FileLogger.Log($"[WinController] Serviço '{actualName}' não foi encontrado.");
                return false;
            }

            FileLogger.Log($"[WinController] Parando serviço '{actualName}'...");
            try
            {
                using (var sc = new ServiceController(actualName))
                {
                    if (sc.Status != ServiceControllerStatus.Stopped && sc.Status != ServiceControllerStatus.StopPending)
                    {
                        sc.Stop();
                    }
                    sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(timeoutSeconds));
                    FileLogger.Log($"[WinController] Serviço '{actualName}' parado com sucesso.");
                    return true;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao parar serviço '{actualName}'", ex);
                throw;
            }
        }

        public static bool StartService(string serviceName, int timeoutSeconds = 60)
        {
            string actualName = ResolveActualServiceName(serviceName);
            var current = GetServiceStatus(actualName);
            if (current == "Em Execução")
            {
                FileLogger.Log($"[WinController] Serviço '{actualName}' já está em execução.");
                return true;
            }
            if (current == "Não Encontrado")
            {
                FileLogger.Log($"[WinController] Serviço '{actualName}' não foi encontrado.");
                return false;
            }

            FileLogger.Log($"[WinController] Iniciando serviço '{actualName}'...");
            try
            {
                using (var sc = new ServiceController(actualName))
                {
                    if (sc.Status != ServiceControllerStatus.Running && sc.Status != ServiceControllerStatus.StartPending)
                    {
                        sc.Start();
                    }
                    sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(timeoutSeconds));
                    FileLogger.Log($"[WinController] Serviço '{actualName}' iniciado com sucesso.");
                    return true;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao iniciar serviço '{actualName}'", ex);
                throw;
            }
        }

        public static bool RestartService(string serviceName, int timeoutSeconds = 60)
        {
            FileLogger.Log($"[WinController] Reiniciando serviço '{serviceName}'...");
            StopService(serviceName, timeoutSeconds);
            return StartService(serviceName, timeoutSeconds);
        }

        private static string ResolveActualServiceName(string serviceName)
        {
            if (QuerySingleStatus(serviceName) != "Não Encontrado") return serviceName;
            if (serviceName.StartsWith("DNA.", StringComparison.OrdinalIgnoreCase))
            {
                string stripped = serviceName.Substring(4);
                if (QuerySingleStatus(stripped) != "Não Encontrado") return stripped;
            }
            else
            {
                string added = "DNA." + serviceName;
                if (QuerySingleStatus(added) != "Não Encontrado") return added;
            }

            if (serviceName.Contains("FastMatching", StringComparison.OrdinalIgnoreCase) ||
                serviceName.Contains("FastMaching", StringComparison.OrdinalIgnoreCase))
            {
                string[] fmVariants = { "Fast Matching Service", "FastMatching", "FastMatchingService", "FastMachingSvc", "FastMachingService", "FastMaching" };
                foreach (var v in fmVariants)
                {
                    if (QuerySingleStatus(v) != "Não Encontrado") return v;
                }
            }

            return serviceName;
        }
    }
}
