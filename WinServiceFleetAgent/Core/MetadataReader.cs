using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
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
                    string xmlText = File.ReadAllText(actualXmlPath, encoding1252);

                    try
                    {
                        var doc = XDocument.Parse(xmlText);

                        // Busca de idHost e CS no bloco <hostInformation>
                        var hostInfo = doc.Root?.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("hostInformation", StringComparison.OrdinalIgnoreCase));
                        if (hostInfo != null)
                        {
                            var idHostElem = hostInfo.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("idHost", StringComparison.OrdinalIgnoreCase));
                            if (idHostElem != null && !string.IsNullOrWhiteSpace(idHostElem.Value))
                            {
                                metadata.IdHost = idHostElem.Value.Trim();
                            }

                            var csElem = hostInfo.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("CS", StringComparison.OrdinalIgnoreCase));
                            if (csElem != null && int.TryParse(csElem.Value.Trim(), out int parsedCs))
                            {
                                metadata.CS = parsedCs;
                            }
                        }

                        // Busca de Praca (insensível a maiúsculas/minúsculas em elementos ou atributos)
                        string extractedPraca = string.Empty;
                        
                        // Busca em atributos (ex: Praca="Caxias do Sul")
                        var pracaAttr = doc.Descendants()
                            .SelectMany(e => e.Attributes())
                            .FirstOrDefault(a => a.Name.LocalName.Equals("Praca", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(a.Value));

                        if (pracaAttr != null)
                        {
                            extractedPraca = pracaAttr.Value.Trim();
                        }

                        // Busca em elementos (ex: <Praca>Caxias do Sul</Praca>)
                        if (string.IsNullOrWhiteSpace(extractedPraca))
                        {
                            var pracaElem = doc.Descendants()
                                .FirstOrDefault(e => e.Name.LocalName.Equals("Praca", StringComparison.OrdinalIgnoreCase) || e.Name.LocalName.Equals("idHost", StringComparison.OrdinalIgnoreCase));

                            if (pracaElem != null && !string.IsNullOrWhiteSpace(pracaElem.Value))
                            {
                                extractedPraca = pracaElem.Value.Trim();
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(extractedPraca))
                        {
                            metadata.Praca = extractedPraca;
                        }
                    }
                    catch (Exception xmlEx)
                    {
                        FileLogger.Log($"[MetadataReader] Aviso no parse XDocument de {actualXmlPath}: {xmlEx.Message}. Tentando Regex...");
                    }

                    // Regex Fallback para Praca se ainda estiver "Não Informado"
                    if (metadata.Praca == "Não Informado")
                    {
                        var matchPraca = Regex.Match(xmlText, @"Praca=""([^""]+)""", RegexOptions.IgnoreCase);
                        if (matchPraca.Success && !string.IsNullOrWhiteSpace(matchPraca.Groups[1].Value))
                        {
                            metadata.Praca = matchPraca.Groups[1].Value.Trim();
                        }
                    }

                    // Regex Fallback para idHost
                    if (string.IsNullOrWhiteSpace(metadata.IdHost))
                    {
                        var matchIdHost = Regex.Match(xmlText, @"<idHost>([^<]+)</idHost>", RegexOptions.IgnoreCase);
                        if (matchIdHost.Success)
                        {
                            metadata.IdHost = matchIdHost.Groups[1].Value.Trim();
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
