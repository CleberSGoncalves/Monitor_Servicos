using System;
using System.IO;

namespace WinServiceFleetAgent.Core
{
    public static class FileLogger
    {
        private static readonly object _lock = new object();
        private static readonly string LogDir;
        private static readonly string LogFile;

        static FileLogger()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                LogDir = Path.Combine(baseDir, "logs");
                if (!Directory.Exists(LogDir))
                {
                    Directory.CreateDirectory(LogDir);
                }
                LogFile = Path.Combine(LogDir, "agent.log");
                CleanupOldLogFile();
            }
            catch
            {
                LogDir = @"C:\Temp";
                LogFile = Path.Combine(LogDir, "agent_fallback.log");
            }
        }

        private static DateTime _lastCleanupTime = DateTime.MinValue;

        private static void CleanupOldLogFile()
        {
            // Throttle: não executar checagem de I/O em disco a cada linha de log escrita (no máximo uma vez a cada 30 min)
            if ((DateTime.Now - _lastCleanupTime).TotalMinutes < 30)
            {
                return;
            }
            _lastCleanupTime = DateTime.Now;

            try
            {
                if (File.Exists(LogFile))
                {
                    var fileInfo = new FileInfo(LogFile);

                    // 1. Se o arquivo de log tiver 3 dias ou mais de modificação, apaga
                    if ((DateTime.Now - fileInfo.LastWriteTime).TotalDays >= 3)
                    {
                        File.Delete(LogFile);
                        return;
                    }

                    // 2. Se o log ultrapassar 10 MB, rotaciona renomeando para agent_old.log em vez de ler 10MB na RAM
                    if (fileInfo.Length > 10 * 1024 * 1024)
                    {
                        lock (_lock)
                        {
                            string oldLog = Path.Combine(LogDir, "agent_old.log");
                            if (File.Exists(oldLog))
                            {
                                File.Delete(oldLog);
                            }
                            File.Move(LogFile, oldLog);
                        }
                    }
                }

                // 3. Limpa arquivos de log antigos secundários na pasta logs/
                if (Directory.Exists(LogDir))
                {
                    foreach (var file in Directory.GetFiles(LogDir, "*.log"))
                    {
                        try
                        {
                            var fi = new FileInfo(file);
                            if ((DateTime.Now - fi.LastWriteTime).TotalDays >= 3)
                            {
                                File.Delete(file);
                            }
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        public static void Log(string message)
        {
            CleanupOldLogFile();
            string formattedMessage = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
            Console.WriteLine(formattedMessage);

            try
            {
                lock (_lock)
                {
                    File.AppendAllText(LogFile, formattedMessage + Environment.NewLine);
                }
            }
            catch { }
        }

        public static void LogError(string message, Exception? ex = null)
        {
            CleanupOldLogFile();
            string formattedMessage = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERRO] {message}" + (ex != null ? $" | Detalhes: {ex.Message}" : "");
            Console.WriteLine(formattedMessage);

            try
            {
                lock (_lock)
                {
                    File.AppendAllText(LogFile, formattedMessage + Environment.NewLine);
                }
            }
            catch { }
        }

        public static string GetLastLogLines(int lineCount = 1000)
        {
            try
            {
                lock (_lock)
                {
                    if (!File.Exists(LogFile)) return string.Empty;
                    var lines = File.ReadAllLines(LogFile);
                    if (lines.Length <= lineCount)
                    {
                        return string.Join(Environment.NewLine, lines);
                    }
                    return string.Join(Environment.NewLine, System.Linq.Enumerable.Skip(lines, lines.Length - lineCount));
                }
            }
            catch
            {
                return string.Empty;
            }
        }
    }
}
