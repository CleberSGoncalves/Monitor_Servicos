using System;
using System.Globalization;
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
        /// <summary>
        /// Constrói o identificador canônico determinístico da máquina a partir do config.xml / configxml.xml:
        /// Formato oficial: {Praca_Com_Underscore}-SMME-{idHost}-CS{CS}
        /// Exemplo: Campo_Grande-SMME-232-CS1
        /// </summary>
        public static string BuildCanonicalHostName(GlobalMetadata? metadata, string? fallbackMachineName = null)
        {
            string fallback = string.IsNullOrWhiteSpace(fallbackMachineName) ? Environment.MachineName : fallbackMachineName.Trim();
            if (metadata == null)
            {
                return fallback;
            }

            string rawPraca = (metadata.Praca ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(rawPraca) ||
                rawPraca.Equals("Não Informado", StringComparison.OrdinalIgnoreCase) ||
                rawPraca.Equals("Nao Informado", StringComparison.OrdinalIgnoreCase))
            {
                return fallback;
            }

            // Remove acentos mantendo maiúsculas/minúsculas originais de cada palavra (ex: "Campo Grande" -> "Campo_Grande")
            string normalized = rawPraca.Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (char c in normalized)
            {
                var cat = CharUnicodeInfo.GetUnicodeCategory(c);
                if (cat != UnicodeCategory.NonSpacingMark)
                {
                    sb.Append(c);
                }
            }

            string cleanPraca = sb.ToString().Normalize(NormalizationForm.FormC);
            cleanPraca = Regex.Replace(cleanPraca, @"[^A-Za-z0-9]+", "_").Trim('_');
            if (string.IsNullOrWhiteSpace(cleanPraca))
            {
                return fallback;
            }

            string cleanIdHost = Regex.Replace((metadata.IdHost ?? string.Empty).Trim(), @"[^A-Za-z0-9]", "");
            if (string.IsNullOrWhiteSpace(cleanIdHost))
            {
                cleanIdHost = "0";
            }

            int csNum = metadata.CS > 0 ? metadata.CS : 1;
            return $"{cleanPraca}-SMME-{cleanIdHost}-CS{csNum}";
        }

        public static GlobalMetadata GetGlobalMachineMetadata(string configXmlPath, string configMonitorConfigPath)
        {
            var metadata = new GlobalMetadata();

            // 1. Leitura de configxml.xml com busca recursiva dinâmica
            try
            {
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

                string actualXmlPath = ResolveXmlPath(configXmlPath);

                if (!string.IsNullOrWhiteSpace(actualXmlPath) && File.Exists(actualXmlPath))
                {
                    FileLogger.Log($"[MetadataReader] Lendo configxml.xml em: '{actualXmlPath}'");
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

                        // Busca de Praca em atributos (ex: Praca="Caxias do Sul") ou elementos
                        string extractedPraca = string.Empty;
                        
                        var pracaAttr = doc.Descendants()
                            .SelectMany(e => e.Attributes())
                            .FirstOrDefault(a => a.Name.LocalName.Equals("Praca", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(a.Value));

                        if (pracaAttr != null)
                        {
                            extractedPraca = pracaAttr.Value.Trim();
                        }

                        if (string.IsNullOrWhiteSpace(extractedPraca))
                        {
                            var pracaElem = doc.Descendants()
                                .FirstOrDefault(e => e.Name.LocalName.Equals("Praca", StringComparison.OrdinalIgnoreCase));

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

                    // Regex Fallback para Praca
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
                        var matchIdHost = Regex.Match(xmlText, @"<idHost>\s*([^<\s]+)\s*</idHost>", RegexOptions.IgnoreCase);
                        if (matchIdHost.Success)
                        {
                            metadata.IdHost = matchIdHost.Groups[1].Value.Trim();
                        }
                    }

                    // Regex Fallback para CS
                    var matchCs = Regex.Match(xmlText, @"<CS>\s*(\d+)\s*</CS>", RegexOptions.IgnoreCase);
                    if (matchCs.Success && int.TryParse(matchCs.Groups[1].Value.Trim(), out int regexCs))
                    {
                        metadata.CS = regexCs;
                    }
                }
                else
                {
                    FileLogger.Log($"[MetadataReader] Arquivo config.xml / configxml.xml não encontrado nos diretórios locais.");
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Erro ao ler config.xml / configxml.xml", ex);
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

        public static string ResolveXmlPath(string configXmlPath)
        {
            if (File.Exists(configXmlPath)) return configXmlPath;

            string altPath = configXmlPath.StartsWith("D:\\", StringComparison.OrdinalIgnoreCase)
                ? "C:\\" + configXmlPath.Substring(3)
                : (configXmlPath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase) ? "D:\\" + configXmlPath.Substring(3) : configXmlPath);

            if (File.Exists(altPath)) return altPath;

            // Busca nas pastas padrão comuns (suporta tanto config.xml quanto configxml.xml)
            string[] candidatePaths = new[]
            {
                @"D:\MediaDNA_V2\data\config\config.xml",
                @"C:\MediaDNA_V2\data\config\config.xml",
                @"D:\MediaDNA_V2\data\config\configxml.xml",
                @"C:\MediaDNA_V2\data\config\configxml.xml",
                @"D:\MediaDNA_V2\data\config.xml",
                @"C:\MediaDNA_V2\data\config.xml",
                @"D:\MediaDNA_V2\data\configxml.xml",
                @"C:\MediaDNA_V2\data\configxml.xml",
                @"D:\MediaDNA_V2\config.xml",
                @"C:\MediaDNA_V2\config.xml",
                @"D:\MediaDNA_V2\configxml.xml",
                @"C:\MediaDNA_V2\configxml.xml",
                @"D:\MediaDNA_V2\applications\ConfigMonitorSVC\configxml.xml",
                @"C:\MediaDNA_V2\applications\ConfigMonitorSVC\configxml.xml"
            };

            foreach (var cand in candidatePaths)
            {
                if (File.Exists(cand)) return cand;
            }

            // Busca recursiva profunda nos drives D:\ e C:\MediaDNA_V2 se existirem
            try
            {
                foreach (var rootDir in new[] { @"D:\MediaDNA_V2", @"C:\MediaDNA_V2" })
                {
                    if (Directory.Exists(rootDir))
                    {
                        var foundXml = Directory.GetFiles(rootDir, "configxml.xml", SearchOption.AllDirectories).FirstOrDefault();
                        if (!string.IsNullOrEmpty(foundXml)) return foundXml;
                        var foundCfg = Directory.GetFiles(rootDir, "config.xml", SearchOption.AllDirectories).FirstOrDefault();
                        if (!string.IsNullOrEmpty(foundCfg)) return foundCfg;
                    }
                }
            }
            catch { }

            return configXmlPath;
        }
    }
}
