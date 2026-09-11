using System;
using System.IO;
using System.Xml.Linq;

namespace WinServiceFleetAgent.Core
{
    public static class ConfigUrlUpdater
    {
        public static bool UpdateWcfMainUrl(string configPath, string newUrl)
        {
            if (string.IsNullOrWhiteSpace(newUrl)) return false;

            string actualPath = configPath;
            if (!File.Exists(actualPath))
            {
                if (actualPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase))
                {
                    actualPath = "C:\\" + actualPath.Substring(3);
                }
                else if (actualPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
                {
                    actualPath = "D:\\" + actualPath.Substring(3);
                }
            }

            if (!File.Exists(actualPath))
            {
                FileLogger.LogError($"[ConfigUrlUpdater] Arquivo de configuração não encontrado em '{configPath}' nem em caminhos alternativos.");
                return false;
            }

            try
            {
                var doc = XDocument.Load(actualPath);
                bool updated = false;

                foreach (var setting in doc.Descendants("setting"))
                {
                    if (setting.Attribute("name")?.Value == "WCFMainURL")
                    {
                        var valElem = setting.Element("value");
                        if (valElem != null)
                        {
                            valElem.Value = newUrl.Trim();
                            updated = true;
                        }
                        break;
                    }
                }

                if (updated)
                {
                    doc.Save(actualPath);
                    FileLogger.Log($"[ConfigUrlUpdater] ✅ WCFMainURL atualizado para '{newUrl}' com sucesso no arquivo '{actualPath}'!");
                    return true;
                }
                else
                {
                    FileLogger.Log($"[ConfigUrlUpdater] Configuração WCFMainURL não foi encontrada no arquivo '{actualPath}'.");
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao atualizar WCFMainURL em '{actualPath}'", ex);
            }

            return false;
        }

        public static string GetZabbixServerUrl(string configPath = @"C:\Zabbix\config\zabbix_agentd.conf")
        {
            string actualPath = configPath;
            if (!File.Exists(actualPath))
            {
                if (actualPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
                    actualPath = "D:\\" + actualPath.Substring(3);
                else if (actualPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase))
                    actualPath = "C:\\" + actualPath.Substring(3);
            }

            if (!File.Exists(actualPath)) return "Nenhuma";

            try
            {
                var lines = File.ReadAllLines(actualPath);
                foreach (var line in lines)
                {
                    string trimmed = line.Trim();
                    if (trimmed.StartsWith("Server=", StringComparison.OrdinalIgnoreCase))
                    {
                        string val = trimmed.Substring(7).Trim();
                        int commaIdx = val.IndexOf(',');
                        if (commaIdx >= 0)
                        {
                            return val.Substring(0, commaIdx).Trim();
                        }
                        return val;
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao ler Server= em '{actualPath}'", ex);
            }

            return "Nenhuma";
        }

        public static bool UpdateZabbixServerUrl(string configPath, string newUrl)
        {
            if (string.IsNullOrWhiteSpace(newUrl)) return false;

            string actualPath = configPath;
            if (!File.Exists(actualPath))
            {
                if (actualPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
                    actualPath = "D:\\" + actualPath.Substring(3);
                else if (actualPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase))
                    actualPath = "C:\\" + actualPath.Substring(3);
            }

            if (!File.Exists(actualPath))
            {
                FileLogger.LogError($"[ConfigUrlUpdater] Arquivo do Zabbix não encontrado em '{configPath}'.");
                return false;
            }

            try
            {
                var lines = File.ReadAllLines(actualPath);
                bool updated = false;

                for (int i = 0; i < lines.Length; i++)
                {
                    string trimmed = lines[i].Trim();
                    if (trimmed.StartsWith("Server=", StringComparison.OrdinalIgnoreCase))
                    {
                        string fullVal = trimmed.Substring(7).Trim();
                        int commaIdx = fullVal.IndexOf(',');
                        string rest = commaIdx >= 0 ? fullVal.Substring(commaIdx) : "";
                        lines[i] = "Server=" + newUrl.Trim() + rest;
                        updated = true;
                        break;
                    }
                }

                if (updated)
                {
                    File.WriteAllLines(actualPath, lines);
                    FileLogger.Log($"[ConfigUrlUpdater] ✅ Zabbix Server URL alterado para '{newUrl}' mantendo parâmetros adicionais.");
                    return true;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao atualizar Server= em '{actualPath}'", ex);
            }

            return false;
        }
    }
}
