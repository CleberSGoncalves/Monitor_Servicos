using System;
using System.IO;
using System.Text;
using System.Xml.Linq;

namespace WinServiceFleetAgent.Core
{
    public class GlobalMetadata
    {
        public string Praca { get; set; } = string.Empty;
        public int CS { get; set; } = 0;
        public string UrlComunicacao { get; set; } = string.Empty;
    }

    public static class MetadataReader
    {
        public static GlobalMetadata GetGlobalMachineMetadata(string configXmlPath, string configMonitorConfigPath)
        {
            var metadata = new GlobalMetadata();

            // 1. Leitura do configxml.xml (codificação Windows-1252)
            try
            {
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
                if (File.Exists(configXmlPath))
                {
                    var encoding1252 = Encoding.GetEncoding("Windows-1252");
                    using (var reader = new StreamReader(configXmlPath, encoding1252))
                    {
                        var doc = XDocument.Load(reader);
                        var hostInfo = doc.Root?.Element("hostInformation");
                        if (hostInfo != null)
                        {
                            var idHostElem = hostInfo.Element("idHost");
                            var csElem = hostInfo.Element("CS");

                            if (idHostElem != null && !string.IsNullOrWhiteSpace(idHostElem.Value))
                            {
                                metadata.Praca = idHostElem.Value.Trim();
                            }

                            if (csElem != null && int.TryParse(csElem.Value.Trim(), out int csVal))
                            {
                                metadata.CS = csVal;
                            }
                        }
                    }
                }
                else
                {
                    Console.WriteLine($"[MetadataReader] Arquivo não encontrado: {configXmlPath}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MetadataReader] Erro ao ler {configXmlPath}: {ex.Message}");
            }

            // 2. Leitura do WCFMainURL no DNA.ConfigMonitorSVC.exe.config
            try
            {
                if (File.Exists(configMonitorConfigPath))
                {
                    var doc = XDocument.Load(configMonitorConfigPath);
                    foreach (var setting in doc.Descendants("setting"))
                    {
                        if (setting.Attribute("name")?.Value == "WCFMainURL")
                        {
                            var valElem = setting.Element("value");
                            if (valElem != null && !string.IsNullOrWhiteSpace(valElem.Value))
                            {
                                metadata.UrlComunicacao = valElem.Value.Trim();
                            }
                            break;
                        }
                    }
                }
                else
                {
                    Console.WriteLine($"[MetadataReader] Arquivo não encontrado: {configMonitorConfigPath}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MetadataReader] Erro ao ler {configMonitorConfigPath}: {ex.Message}");
            }

            return metadata;
        }
    }
}
