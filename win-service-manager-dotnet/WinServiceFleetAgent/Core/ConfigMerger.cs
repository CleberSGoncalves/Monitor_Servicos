using System;
using System.Collections.Generic;
using System.IO;
using System.Xml.Linq;

namespace WinServiceFleetAgent.Core
{
    public static class ConfigMerger
    {
        public static void MergeDotNetConfig(string existingConfigPath, string releaseConfigPath, string targetOutputPath)
        {
            var oldSettings = new Dictionary<string, string>();
            var oldAppSettings = new Dictionary<string, string>();

            // 1. Mapear configurações do arquivo existente
            if (File.Exists(existingConfigPath))
            {
                try
                {
                    var oldDoc = XDocument.Load(existingConfigPath);
                    foreach (var s in oldDoc.Descendants("setting"))
                    {
                        var name = s.Attribute("name")?.Value;
                        var val = s.Element("value")?.Value;
                        if (!string.IsNullOrEmpty(name) && val != null)
                        {
                            oldSettings[name] = val;
                        }
                    }

                    foreach (var appSetting in oldDoc.Descendants("appSettings").Descendants("add"))
                    {
                        var key = appSetting.Attribute("key")?.Value;
                        var val = appSetting.Attribute("value")?.Value;
                        if (!string.IsNullOrEmpty(key) && val != null)
                        {
                            oldAppSettings[key] = val;
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ConfigMerger] Erro ao ler config existente '{existingConfigPath}': {ex.Message}");
                }
            }

            // 2. Carregar o arquivo novo trazido pela release
            if (!File.Exists(releaseConfigPath))
            {
                throw new FileNotFoundException($"Arquivo de release config não encontrado em: {releaseConfigPath}");
            }

            var newDoc = XDocument.Load(releaseConfigPath);

            // 3. Injetar valores salvos de applicationSettings / userSettings
            foreach (var s in newDoc.Descendants("setting"))
            {
                var name = s.Attribute("name")?.Value;
                if (!string.IsNullOrEmpty(name) && oldSettings.TryGetValue(name, out var oldVal))
                {
                    var valElem = s.Element("value");
                    if (valElem != null)
                    {
                        valElem.Value = oldVal;
                    }
                }
            }

            // 4. Injetar valores salvos de appSettings
            foreach (var appSetting in newDoc.Descendants("appSettings").Descendants("add"))
            {
                var key = appSetting.Attribute("key")?.Value;
                if (!string.IsNullOrEmpty(key) && oldAppSettings.TryGetValue(key, out var oldVal))
                {
                    appSetting.SetAttributeValue("value", oldVal);
                }
            }

            // 5. Salvar XML mesclado
            var targetDir = Path.GetDirectoryName(targetOutputPath);
            if (!string.IsNullOrEmpty(targetDir) && !Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            newDoc.Save(targetOutputPath);
            Console.WriteLine($"[ConfigMerger] Smart Merge concluído com sucesso: {targetOutputPath}");
        }
    }
}
