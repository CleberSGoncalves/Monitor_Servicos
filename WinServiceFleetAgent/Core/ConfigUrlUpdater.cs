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
    }
}
