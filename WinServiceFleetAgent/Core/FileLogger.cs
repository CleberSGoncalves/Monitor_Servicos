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
                    var creationTime = File.GetCreationTime(LogFile);
                    var lastWriteTime = File.GetLastWriteTime(LogFile);
                    var oldestTime = creationTime < lastWriteTime ? creationTime : lastWriteTime;

                    // Apaga o arquivo de log se tiver 5 dias ou mais de existência/modificação
                    if ((DateTime.Now - oldestTime).TotalDays >= 5)
                    {
                        File.Delete(LogFile);
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
