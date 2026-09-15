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

        private static void CleanupOldLogFile()
        {
            try
            {
                if (File.Exists(LogFile))
                {
                    var fileInfo = new FileInfo(LogFile);

                    // 1. Se o arquivo de log tiver 3 dias ou mais de modifição, apaga
                    if ((DateTime.Now - fileInfo.LastWriteTime).TotalDays >= 3)
                    {
                        File.Delete(LogFile);
                        return;
                    }

                    // 2. Se o log ultrapassar 10 MB, trunca e mantém apenas as últimas 2.000 linhas
                    if (fileInfo.Length > 10 * 1024 * 1024)
                    {
                        lock (_lock)
                        {
                            var lines = File.ReadAllLines(LogFile);
                            if (lines.Length > 2000)
                            {
                                var lastLines = System.Linq.Enumerable.Skip(lines, lines.Length - 2000);
                                File.WriteAllLines(LogFile, lastLines);
                            }
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
