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
            }
            catch
            {
                LogDir = @"C:\Temp";
                LogFile = Path.Combine(LogDir, "agent_fallback.log");
            }
        }

        public static void Log(string message)
        {
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
    }
}
