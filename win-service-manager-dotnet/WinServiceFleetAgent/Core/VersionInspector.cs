using System;
using System.Diagnostics;
using System.IO;

namespace WinServiceFleetAgent.Core
{
    public static class VersionInspector
    {
        public static string GetExecutableVersion(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                return "Não Encontrado";
            }

            try
            {
                var versionInfo = FileVersionInfo.GetVersionInfo(filePath);
                if (!string.IsNullOrWhiteSpace(versionInfo.FileVersion))
                {
                    return versionInfo.FileVersion.Trim();
                }

                return $"{versionInfo.FileMajorPart}.{versionInfo.FileMinorPart}.{versionInfo.FileBuildPart}.{versionInfo.FilePrivatePart}";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[VersionInspector] Erro ao extrair versão de {filePath}: {ex.Message}");
                return "Erro ao Ler Versão";
            }
        }
    }
}
