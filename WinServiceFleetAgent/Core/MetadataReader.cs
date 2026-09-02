using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml.Linq;

namespace WinServiceFleetAgent.Core
{
    public class GlobalMetadata
    {
        public string IdHost { get; set; } = string.Empty;
        public string Praca { get; set; } = "Não Informado";
        public int CS { get; set; } = 1;
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

                string actualXmlPath = configXmlPath;
                if (!File.Exists(actualXmlPath))
                {
                    if (actualXmlPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        actualXmlPath = "C:\\" + actualXmlPath.Substring(3);
                    }
                    else if (actualXmlPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        actualXmlPath = "D:\\" + actualXmlPath.Substring(3);
                    }
                }

                if (File.Exists(actualXmlPath))
                {
                    var encoding1252 = Encoding.GetEncoding("Windows-1252");
                    using (var reader = new StreamReader(actualXmlPath, encoding1252))
                    {
                        var doc = XDocument.Load(reader);

                        // Busca de idHost e CS no bloco <hostInformation>
                        var hostInfo = doc.Root?.Element("hostInformation");
                        if (hostInfo != null)
                        {
                            var idHostElem = hostInfo.Element("idHost");
                            if (idHostElem != null && !string.IsNullOrWhiteSpace(idHostElem.Value))
                            {
                                metadata.IdHost = idHostElem.Value.Trim();
                            }

                            var csElem = hostInfo.Element("CS");
                            if (csElem != null && int.TryParse(csElem.Value.Trim(), out int parsedCs))
                            {
                                metadata.CS = parsedCs;
                            }
                        }

                        // Busca de Praca: elemento <Praca> ou atributo Praca="..." em qualquer nó (ex: <Channel Praca="Caxias do Sul">)
                        string extractedPraca = string.Empty;
                        if (hostInfo != null)
                        {
                            var pracaElem = hostInfo.Element("Praca");
                            if (pracaElem != null && !string.IsNullOrWhiteSpace(pracaElem.Value))
                            {
                                extractedPraca = pracaElem.Value.Trim();
                            }
                        }

                        if (string.IsNullOrWhiteSpace(extractedPraca))
                        {
                            var pracaAttr = doc.Descendants()
                                .Select(e => e.Attribute("Praca") ?? e.Attribute("praca"))
                                .FirstOrDefault(a => a != null && !string.IsNullOrWhiteSpace(a.Value));

                            if (pracaAttr != null)
                            {
                                extractedPraca = pracaAttr.Value.Trim();
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(extractedPraca))
                        {
                            metadata.Praca = extractedPraca;
                        }

                        // Fallback de CS via atributo se não encontrado
                        if (metadata.CS == 0)
                        {
                            var csAttr = doc.Descendants()
                                .Select(e => e.Attribute("CS") ?? e.Attribute("cs"))
                                .FirstOrDefault(a => a != null && int.TryParse(a.Value.Trim(), out _));

                            if (csAttr != null && int.TryParse(csAttr.Value.Trim(), out int parsedCsAttr))
                            {
                                metadata.CS = parsedCsAttr;
                            }
                        }
                    }
                }
                else
                {
                    FileLogger.Log($"[MetadataReader] Arquivo configxml.xml não encontrado em '{configXmlPath}' nem nos caminhos alternativos.");
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao ler {configXmlPath}", ex);
            }

            // 2. Leitura do WCFMainURL no DNA.ConfigMonitorSVC.exe.config
            try
            {
                string actualConfigPath = configMonitorConfigPath;
                if (!File.Exists(actualConfigPath))
                {
                    if (actualConfigPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        actualConfigPath = "C:\\" + actualConfigPath.Substring(3);
                    }
                    else if (actualConfigPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
                    {
                        actualConfigPath = "D:\\" + actualConfigPath.Substring(3);
                    }
                }

                if (File.Exists(actualConfigPath))
                {
                    var doc = XDocument.Load(actualConfigPath);
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
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao ler {configMonitorConfigPath}", ex);
            }

            return metadata;
        }
    }
}
