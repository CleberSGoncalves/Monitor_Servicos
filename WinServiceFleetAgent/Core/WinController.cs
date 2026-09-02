using System;
using System.ServiceProcess;

namespace WinServiceFleetAgent.Core
{
    public static class WinController
    {
        public static string GetServiceStatus(string serviceName)
        {
            string status = QuerySingleStatus(serviceName);
            if (status != "Não Encontrado") return status;

            // Se começou com DNA., tentar sem o prefixo DNA.
            if (serviceName.StartsWith("DNA.", StringComparison.OrdinalIgnoreCase))
            {
                string stripped = serviceName.Substring(4);
                status = QuerySingleStatus(stripped);
                if (status != "Não Encontrado") return status;
            }
            else
            {
                // Se não tinha DNA., tentar com DNA.
                string added = "DNA." + serviceName;
                status = QuerySingleStatus(added);
                if (status != "Não Encontrado") return status;
            }

            return "Não Encontrado";
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
                            return "Em Execução";
                        case ServiceControllerStatus.Stopped:
                        case ServiceControllerStatus.StopPending:
                        case ServiceControllerStatus.Paused:
                        case ServiceControllerStatus.PausePending:
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
            if (current == "Parado")
            {
                FileLogger.Log($"[WinController] Serviço '{actualName}' já está parado.");
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
            return serviceName;
        }
    }
}
