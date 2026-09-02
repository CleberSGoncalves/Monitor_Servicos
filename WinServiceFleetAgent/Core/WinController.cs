using System;
using System.ServiceProcess;
using System.Threading;

namespace WinServiceFleetAgent.Core
{
    public static class WinController
    {
        public static string GetServiceStatus(string serviceName)
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
            catch (Exception ex)
            {
                Console.WriteLine($"[WinController] Serviço '{serviceName}' não encontrado ou sem permissão: {ex.Message}");
                return "Não Encontrado";
            }
        }

        public static bool StopService(string serviceName, int timeoutSeconds = 60)
        {
            var current = GetServiceStatus(serviceName);
            if (current == "Parado")
            {
                Console.WriteLine($"[WinController] Serviço '{serviceName}' já está parado.");
                return true;
            }
            if (current == "Não Encontrado")
            {
                Console.WriteLine($"[WinController] Serviço '{serviceName}' não foi encontrado.");
                return false;
            }

            Console.WriteLine($"[WinController] Parando serviço '{serviceName}'...");
            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    if (sc.Status != ServiceControllerStatus.Stopped && sc.Status != ServiceControllerStatus.StopPending)
                    {
                        sc.Stop();
                    }
                    sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(timeoutSeconds));
                    Console.WriteLine($"[WinController] Serviço '{serviceName}' parado com sucesso.");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WinController] Erro ao parar serviço '{serviceName}': {ex.Message}");
                throw;
            }
        }

        public static bool StartService(string serviceName, int timeoutSeconds = 60)
        {
            var current = GetServiceStatus(serviceName);
            if (current == "Em Execução")
            {
                Console.WriteLine($"[WinController] Serviço '{serviceName}' já está em execução.");
                return true;
            }
            if (current == "Não Encontrado")
            {
                Console.WriteLine($"[WinController] Serviço '{serviceName}' não foi encontrado.");
                return false;
            }

            Console.WriteLine($"[WinController] Iniciando serviço '{serviceName}'...");
            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    if (sc.Status != ServiceControllerStatus.Running && sc.Status != ServiceControllerStatus.StartPending)
                    {
                        sc.Start();
                    }
                    sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(timeoutSeconds));
                    Console.WriteLine($"[WinController] Serviço '{serviceName}' iniciado com sucesso.");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WinController] Erro ao iniciar serviço '{serviceName}': {ex.Message}");
                throw;
            }
        }

        public static bool RestartService(string serviceName, int timeoutSeconds = 60)
        {
            Console.WriteLine($"[WinController] Reiniciando serviço '{serviceName}'...");
            StopService(serviceName, timeoutSeconds);
            return StartService(serviceName, timeoutSeconds);
        }
    }
}
