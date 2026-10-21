using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace WinServiceFleetAgent.Core
{
    public class ChannelOrchestrator
    {
        private readonly SharePointClient _spClient;
        private readonly string _multiplexesXmlPath;
        private readonly string _tunersStatusXmlPath;
        private readonly string _telemetriaApiUrl;
        private readonly string _configXmlPath;
        private readonly bool _enabled;

        public ChannelOrchestrator(
            SharePointClient spClient,
            string? multiplexesXmlPath = null,
            string? tunersStatusXmlPath = null,
            string? telemetriaApiUrl = null,
            bool enabled = true,
            string? configXmlPath = null)
        {
            _spClient = spClient;
            _multiplexesXmlPath = string.IsNullOrWhiteSpace(multiplexesXmlPath)
                ? @"D:\MediaDNA_V2\Applications\DTVCapture64\Config\Multiplexes.xml"
                : multiplexesXmlPath;

            _tunersStatusXmlPath = string.IsNullOrWhiteSpace(tunersStatusXmlPath)
                ? @"D:\MediaDNA_V2\Applications\DTVCapture64\DTVTunersStatus.xml"
                : tunersStatusXmlPath;

            _telemetriaApiUrl = string.IsNullOrWhiteSpace(telemetriaApiUrl)
                ? "http://localhost:9000/api/v1/Muxes"
                : telemetriaApiUrl;

            _configXmlPath = string.IsNullOrWhiteSpace(configXmlPath)
                ? @"D:\MediaDNA_V2\data\configxml.xml"
                : configXmlPath;

            _enabled = enabled;
        }

        private static string ResolveExistingPath(string primaryPath, params string[] fallbacks)
        {
            if (File.Exists(primaryPath)) return primaryPath;
            foreach (var fb in fallbacks)
            {
                if (File.Exists(fb)) return fb;
            }
            return primaryPath;
        }

        public async Task RunChannelCycleAsync(GlobalMetadata metadata)
        {
            if (!_enabled)
            {
                return;
            }

            try
            {
                Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
                var win1252 = Encoding.GetEncoding("Windows-1252");

                string muxPath = ResolveExistingPath(
                    _multiplexesXmlPath,
                    @"D:\MediaDNA_V2\Applications\DTVCapture64\Config\Multiplexes.xml",
                    @"D:\MediaDNA_V2\Applications\DTVCapture64\Multiplexes.xml",
                    @"C:\MediaDNA_V2\Applications\DTVCapture64\Config\Multiplexes.xml",
                    @"C:\MediaDNA_V2\Applications\DTVCapture64\Multiplexes.xml",
                    @"D:\MediaDNA_V2\Applications\DTVCapture\Config\Multiplexes.xml"
                );

                string statusPath = ResolveExistingPath(
                    _tunersStatusXmlPath,
                    @"D:\MediaDNA_V2\Applications\DTVCapture64\DTVTunersStatus.xml",
                    @"D:\MediaDNA_V2\Applications\DTVCapture64\Config\DTVTunersStatus.xml",
                    @"C:\MediaDNA_V2\Applications\DTVCapture64\DTVTunersStatus.xml",
                    @"C:\MediaDNA_V2\Applications\DTVCapture64\Config\DTVTunersStatus.xml",
                    @"D:\MediaDNA_V2\Applications\DTVCapture\DTVTunersStatus.xml"
                );

                if (!File.Exists(statusPath))
                {
                    FileLogger.Log($"[ChannelOrchestrator] DTVTunersStatus.xml não encontrado em '{statusPath}'. (Host sem captura DTV ativa).");
                    return;
                }

                FileLogger.Log($"[ChannelOrchestrator] 📡 Iniciando coleta de status dos canais DTV...");

                // 1. Coleta telemetria em tempo real da AtriaAPI (porta 9000)
                var telemetria = new Dictionary<string, (int? Quality, int? Strength)>();
                var candidateEndpoints = new List<string>
                {
                    "http://127.0.0.1:9000/api/v1/Muxes",
                    _telemetriaApiUrl
                };

                bool apiContacted = false;
                string lastError = "";

                using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) })
                {
                    http.DefaultRequestHeaders.Clear();
                    http.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0");
                    http.DefaultRequestHeaders.Add("Accept", "application/xml, text/xml, application/json, */*");

                    foreach (var endpoint in candidateEndpoints.Distinct(StringComparer.OrdinalIgnoreCase))
                    {
                        try
                        {
                            var resp = await http.GetAsync(endpoint);
                            if (resp.IsSuccessStatusCode)
                            {
                                string apiContent = await resp.Content.ReadAsStringAsync();
                                string trimmed = apiContent.Trim();

                                if (trimmed.StartsWith("<"))
                                {
                                    // Formato XML
                                    var apiDoc = XDocument.Parse(trimmed);
                                    foreach (var statusElem in apiDoc.Descendants().Where(e => e.Name.LocalName == "MuxMonitorStatus"))
                                    {
                                        string muxId = statusElem.Elements().FirstOrDefault(e => e.Name.LocalName == "MuxId")?.Value.Trim() ?? "";
                                        var sigElem = statusElem.Elements().FirstOrDefault(e => e.Name.LocalName == "Signal");
                                        if (sigElem != null && sigElem.Attribute(XName.Get("nil", "http://www.w3.org/2001/XMLSchema-instance"))?.Value != "true")
                                        {
                                            int? q = null;
                                            int? s = null;
                                            var qElem = sigElem.Elements().FirstOrDefault(e => e.Name.LocalName == "Quality");
                                            var sElem = sigElem.Elements().FirstOrDefault(e => e.Name.LocalName == "Strength");
                                            if (qElem != null && int.TryParse(qElem.Value, out int pq)) q = pq;
                                            if (sElem != null && int.TryParse(sElem.Value, out int ps)) s = ps;
                                            telemetria[muxId] = (q, s);
                                        }
                                    }
                                    apiContacted = true;
                                    FileLogger.Log($"[ChannelOrchestrator] ✅ Telemetria lida com SUCESSO (XML) de '{endpoint}'. {telemetria.Count} muxes mapeados.");
                                    break;
                                }
                                else if (trimmed.StartsWith("[") || trimmed.StartsWith("{"))
                                {
                                    // Formato JSON
                                    using var jsonDoc = System.Text.Json.JsonDocument.Parse(trimmed);
                                    var root = jsonDoc.RootElement;
                                    var elements = new List<System.Text.Json.JsonElement>();
                                    if (root.ValueKind == System.Text.Json.JsonValueKind.Array)
                                    {
                                        foreach (var el in root.EnumerateArray()) elements.Add(el);
                                    }
                                    else
                                    {
                                        elements.Add(root);
                                    }

                                    foreach (var statusElem in elements)
                                    {
                                        string muxId = "";
                                        if (statusElem.TryGetProperty("MuxId", out var mProp))
                                        {
                                            muxId = mProp.ValueKind == System.Text.Json.JsonValueKind.Number ? mProp.GetInt32().ToString() : (mProp.GetString() ?? "");
                                        }

                                        if (!string.IsNullOrEmpty(muxId) && statusElem.TryGetProperty("Signal", out var sigProp) && sigProp.ValueKind == System.Text.Json.JsonValueKind.Object)
                                        {
                                            int? q = null;
                                            int? s = null;
                                            if (sigProp.TryGetProperty("Quality", out var qProp))
                                            {
                                                if (qProp.TryGetInt32(out int pq)) q = pq;
                                                else if (int.TryParse(qProp.GetString(), out int spq)) q = spq;
                                            }
                                            if (sigProp.TryGetProperty("Strength", out var sProp))
                                            {
                                                if (sProp.TryGetInt32(out int ps)) s = ps;
                                                else if (int.TryParse(sProp.GetString(), out int sps)) s = sps;
                                            }
                                            telemetria[muxId] = (q, s);
                                        }
                                    }
                                    apiContacted = true;
                                    FileLogger.Log($"[ChannelOrchestrator] ✅ Telemetria lida com SUCESSO (JSON) de '{endpoint}'. {telemetria.Count} muxes mapeados.");
                                    break;
                                }
                                else
                                {
                                    lastError = $"Resposta inesperada: '{trimmed.Substring(0, Math.Min(30, trimmed.Length))}'";
                                }
                            }
                            else
                            {
                                lastError = $"HTTP {(int)resp.StatusCode}";
                            }
                        }
                        catch (Exception exHttp)
                        {
                            lastError = exHttp.Message;
                        }
                    }
                }

                if (!apiContacted)
                {
                    FileLogger.Log($"[ChannelOrchestrator] ℹ️ API local porta 9000 indisponível ({lastError}). Métricas de força/qualidade padronizadas em 0.");
                }

                // 2. Mapeia configurações de gravação e multiplexes de Multiplexes.xml
                var mapaMuxCfg = new Dictionary<string, (double BaseFreq, string OrigPath, string NetworkType, string AnalogVideo, string AnalogAudio, string MuxName)>();
                var mapaGravacao = new Dictionary<string, (bool Mp4Rec, string Mp4Path, bool Mp3Rec, string Mp3Path)>();

                if (File.Exists(muxPath))
                {
                    try
                    {
                        string muxXmlContent = File.ReadAllText(muxPath, win1252);
                        var muxDoc = XDocument.Parse(muxXmlContent);

                        foreach (var m in muxDoc.Descendants().Where(e => e.Name.LocalName == "Multiplexes"))
                        {
                            string idM = m.Elements().FirstOrDefault(e => e.Name.LocalName == "IDMUX")?.Value.Trim() ?? "";
                            string orig = m.Elements().FirstOrDefault(e => e.Name.LocalName == "OrigPath")?.Value.Trim() ?? "";
                            string netType = m.Elements().FirstOrDefault(e => e.Name.LocalName == "NetworkType")?.Value.Trim() ?? "";
                            string muxName = m.Elements().FirstOrDefault(e => e.Name.LocalName == "Name")?.Value.Trim() ?? "";
                            string analogVid = m.Elements().FirstOrDefault(e => e.Name.LocalName == "AnalogVideoDevice")?.Value.Trim() ?? "";
                            string analogAud = m.Elements().FirstOrDefault(e => e.Name.LocalName == "AnalogAudioDevice")?.Value.Trim() ?? "";

                            double baseFreq = 0;
                            var freqElem = m.Elements().FirstOrDefault(e => e.Name.LocalName == "BaseFreq");
                            if (freqElem != null && double.TryParse(freqElem.Value.Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double parsedF))
                            {
                                baseFreq = parsedF;
                            }
                            if (!string.IsNullOrEmpty(idM))
                            {
                                mapaMuxCfg[idM] = (baseFreq, orig, netType, analogVid, analogAud, muxName);
                            }
                        }

                        foreach (var p in muxDoc.Descendants().Where(e => e.Name.LocalName == "Programs"))
                        {
                            string idM = p.Elements().FirstOrDefault(e => e.Name.LocalName == "IDMUX")?.Value.Trim() ?? "";
                            string name = p.Elements().FirstOrDefault(e => e.Name.LocalName == "Name")?.Value.Trim().ToLowerInvariant() ?? "";
                            bool mp4Rec = p.Elements().FirstOrDefault(e => e.Name.LocalName == "Mp4_IsRecording")?.Value.Trim().Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;
                            string mp4Path = p.Elements().FirstOrDefault(e => e.Name.LocalName == "Mp4_DestPath")?.Value.Trim() ?? "N/A";
                            bool mp3Rec = p.Elements().FirstOrDefault(e => e.Name.LocalName == "Mp3_IsRecording")?.Value.Trim().Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;
                            string mp3Path = p.Elements().FirstOrDefault(e => e.Name.LocalName == "Mp3_DestPath")?.Value.Trim() ?? "N/A";

                            string chave = $"{idM}_{name}";
                            mapaGravacao[chave] = (mp4Rec, mp4Path, mp3Rec, mp3Path);
                        }
                    }
                    catch (Exception exMux)
                    {
                        FileLogger.LogError($"[ChannelOrchestrator] Erro ao ler Multiplexes.xml: {exMux.Message}");
                    }
                }

                // 2.5 Mapeia canais de ConfigXml.xml (prioridade máxima para o nome do canal)
                var configChannels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    string resolvedConfigXml = MetadataReader.ResolveXmlPath(_configXmlPath);

                    if (File.Exists(resolvedConfigXml))
                    {
                        string cfgText = File.ReadAllText(resolvedConfigXml, win1252);
                        try
                        {
                            var cfgDoc = XDocument.Parse(cfgText);
                            foreach (var chElem in cfgDoc.Descendants().Where(e => e.Name.LocalName.Equals("Channel", StringComparison.OrdinalIgnoreCase)))
                            {
                                string veiculoName = chElem.Attribute("Veiculo")?.Value?.Trim()
                                    ?? chElem.Attribute("Name")?.Value?.Trim()
                                    ?? chElem.Attribute("DisplayName")?.Value?.Trim()
                                    ?? chElem.Attribute("ChannelName")?.Value?.Trim()
                                    ?? chElem.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("Veiculo", StringComparison.OrdinalIgnoreCase))?.Value?.Trim()
                                    ?? chElem.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("Name", StringComparison.OrdinalIgnoreCase))?.Value?.Trim()
                                    ?? "";

                                string pracaVeiculo = chElem.Attribute("PracaVeiculo")?.Value?.Trim()
                                    ?? chElem.Attribute("ChannelCode")?.Value?.Trim()
                                    ?? chElem.Attribute("Code")?.Value?.Trim()
                                    ?? chElem.Attribute("IdVeiculo")?.Value?.Trim()
                                    ?? chElem.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("PracaVeiculo", StringComparison.OrdinalIgnoreCase))?.Value?.Trim()
                                    ?? chElem.Elements().FirstOrDefault(e => e.Name.LocalName.Equals("ChannelCode", StringComparison.OrdinalIgnoreCase))?.Value?.Trim()
                                    ?? "";

                                if (!string.IsNullOrEmpty(veiculoName))
                                {
                                    if (!string.IsNullOrEmpty(pracaVeiculo))
                                    {
                                        configChannels[pracaVeiculo] = veiculoName;
                                    }
                                    configChannels[veiculoName.ToLowerInvariant()] = veiculoName;
                                }
                            }
                        }
                        catch (Exception exDoc)
                        {
                            FileLogger.Log($"[ChannelOrchestrator] Aviso no parse XDocument de '{resolvedConfigXml}': {exDoc.Message}. Tentando Regex...");
                        }

                        if (configChannels.Count == 0 && !string.IsNullOrEmpty(cfgText))
                        {
                            var matches1 = System.Text.RegularExpressions.Regex.Matches(cfgText, @"<Channel\s+[^>]*PracaVeiculo=""([^""]+)""[^>]*Veiculo=""([^""]+)""", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                            foreach (System.Text.RegularExpressions.Match m in matches1)
                            {
                                string pv = m.Groups[1].Value.Trim();
                                string vn = m.Groups[2].Value.Trim();
                                if (!string.IsNullOrEmpty(pv) && !string.IsNullOrEmpty(vn))
                                {
                                    configChannels[pv] = vn;
                                    configChannels[vn.ToLowerInvariant()] = vn;
                                }
                            }
                            var matches2 = System.Text.RegularExpressions.Regex.Matches(cfgText, @"<Channel\s+[^>]*Veiculo=""([^""]+)""[^>]*PracaVeiculo=""([^""]+)""", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                            foreach (System.Text.RegularExpressions.Match m in matches2)
                            {
                                string vn = m.Groups[1].Value.Trim();
                                string pv = m.Groups[2].Value.Trim();
                                if (!string.IsNullOrEmpty(pv) && !string.IsNullOrEmpty(vn))
                                {
                                    configChannels[pv] = vn;
                                    configChannels[vn.ToLowerInvariant()] = vn;
                                }
                            }
                        }

                        FileLogger.Log($"[ChannelOrchestrator] Mapeados {configChannels.Count} canais do configxml.xml.");
                    }
                }
                catch (Exception exCfg)
                {
                    FileLogger.Log($"[ChannelOrchestrator] Erro ao ler canais do configxml.xml: {exCfg.Message}");
                }

                // 3. Processa runtime de DTVTunersStatus.xml
                string statusXmlContent = File.ReadAllText(statusPath, win1252);
                var statusDoc = XDocument.Parse(statusXmlContent);

                var muxesStatus = new Dictionary<string, (string NetworkType, int TunerID, string Status, string AnalogVideo)>();
                foreach (var m in statusDoc.Descendants().Where(e => e.Name.LocalName == "MUXES"))
                {
                    string idM = m.Elements().FirstOrDefault(e => e.Name.LocalName == "IDMUX")?.Value.Trim() ?? "";
                    string netType = m.Elements().FirstOrDefault(e => e.Name.LocalName == "NetworkType")?.Value.Trim() ?? "";
                    string status = m.Elements().FirstOrDefault(e => e.Name.LocalName == "Status")?.Value.Trim() ?? "N/A";
                    string analogVid = m.Elements().FirstOrDefault(e => e.Name.LocalName == "AnalogVideoDevice")?.Value.Trim() ?? "";
                    int tunerId = -1;
                    var tElem = m.Elements().FirstOrDefault(e => e.Name.LocalName == "TunerID");
                    if (tElem != null && int.TryParse(tElem.Value.Trim(), out int pt)) tunerId = pt;

                    if (!string.IsNullOrEmpty(idM))
                    {
                        muxesStatus[idM] = (netType, tunerId, status, analogVid);
                    }
                }

                int parsedHostId = int.TryParse(metadata.IdHost, out int ph) ? ph : 1;
                string nowIso = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
                var channelsList = new List<ChannelStatusItem>();
                var processedMuxes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var prog in statusDoc.Descendants().Where(e => e.Name.LocalName == "Programs"))
                {
                    string idMux = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "IDMUX")?.Value.Trim() ?? "";
                    string progName = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "Name")?.Value.Trim() ?? "";
                    if (string.IsNullOrWhiteSpace(progName)) continue;
                    if (!string.IsNullOrEmpty(idMux)) processedMuxes.Add(idMux);

                    string chCode = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "ChannelCode")?.Value.Trim() ?? "";
                    bool isFrozen = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "IsFrozen")?.Value.Trim().Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;
                    bool isMute = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "IsMute")?.Value.Trim().Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;

                    var mStat = muxesStatus.ContainsKey(idMux) ? muxesStatus[idMux] : (NetworkType: "", TunerID: -1, Status: "N/A", AnalogVideo: "");
                    var mCfg = mapaMuxCfg.ContainsKey(idMux) ? mapaMuxCfg[idMux] : (BaseFreq: 0.0, OrigPath: "", NetworkType: "", AnalogVideo: "", AnalogAudio: "", MuxName: "");
                    string chaveG = $"{idMux}_{progName.ToLowerInvariant()}";
                    var rec = mapaGravacao.ContainsKey(chaveG) ? mapaGravacao[chaveG] : (Mp4Rec: false, Mp4Path: "N/A", Mp3Rec: false, Mp3Path: "N/A");

                    string netType = !string.IsNullOrEmpty(mStat.NetworkType) ? mStat.NetworkType : mCfg.NetworkType;
                    string origPath = mCfg.OrigPath ?? "";
                    string analogDevice = !string.IsNullOrWhiteSpace(mCfg.AnalogVideo) ? mCfg.AnalogVideo : mStat.AnalogVideo;

                    string meio = "Digital Terrestre";
                    string freqStr = "N/A";
                    string urlStream = "N/A";
                    string sourceAnalog = "N/A";

                    bool isAnalog = netType == "1" || netType == "2" || netType == "6" || !string.IsNullOrWhiteSpace(analogDevice);
                    bool isRTSP = netType == "5" || (!string.IsNullOrWhiteSpace(origPath) && origPath.StartsWith("rtsp:", StringComparison.OrdinalIgnoreCase));
                    bool isUDP = netType == "3" || (!string.IsNullOrWhiteSpace(origPath) && origPath.StartsWith("udp:", StringComparison.OrdinalIgnoreCase));

                    if (isAnalog)
                    {
                        meio = "Analógico";
                        sourceAnalog = !string.IsNullOrWhiteSpace(analogDevice) 
                            ? analogDevice 
                            : (!string.IsNullOrWhiteSpace(origPath) ? origPath : "Driver de Captura");
                    }
                    else if (isRTSP)
                    {
                        meio = "Streaming (RTSP)";
                        urlStream = !string.IsNullOrWhiteSpace(origPath) ? origPath : "RTSP Stream";
                    }
                    else if (isUDP)
                    {
                        meio = "Streaming(UDP)";
                        urlStream = !string.IsNullOrWhiteSpace(origPath) ? origPath : "UDP Multicast";
                    }
                    else
                    {
                        meio = "Digital Terrestre";
                        if (mCfg.BaseFreq > 0)
                        {
                            freqStr = $"{(mCfg.BaseFreq / 1000.0):N3} MHz";
                        }
                    }

                    int? qVal = null;
                    int? sVal = null;
                    if (telemetria.TryGetValue(idMux, out var tel))
                    {
                        qVal = tel.Quality;
                        sVal = tel.Strength;
                    }

                    // Prioriza o nome amigável do canal definido em configxml.xml (ex: "Rede Globo" em vez de "RBSTV (RBS)")
                    string canalDisplayName = progName;
                    if (!string.IsNullOrWhiteSpace(chCode) && configChannels.TryGetValue(chCode, out var cfgNameByCode) && !string.IsNullOrWhiteSpace(cfgNameByCode))
                    {
                        canalDisplayName = cfgNameByCode;
                    }
                    else if (configChannels.TryGetValue(progName.ToLowerInvariant(), out var cfgNameByName) && !string.IsNullOrWhiteSpace(cfgNameByName))
                    {
                        canalDisplayName = cfgNameByName;
                    }

                    FileLogger.Log($"[ChannelOrchestrator] Canal detectado: '{progName}' (Code: '{chCode}') -> Nome no SharePoint: '{canalDisplayName}' | Meio: {meio}" + (isAnalog ? $" | Source: {sourceAnalog}" : ""));

                    var item = new ChannelStatusItem
                    {
                        Title = canalDisplayName,
                        RawProgName = progName,
                        Pais = "Brasil",
                        Cidade = metadata.Praca,
                        IDHost = parsedHostId,
                        IDCS = metadata.CS,
                        Veiculo = (!string.IsNullOrWhiteSpace(chCode) && chCode != "0") ? chCode : progName,
                        MeiodeTransmissao = meio,
                        Frequencia = freqStr,
                        TunerID = mStat.TunerID >= 0 ? mStat.TunerID : -1,
                        StatusTuner = mStat.Status,
                        VideoCongelado = isFrozen ? "Sim" : "Não",
                        AudioMudo = isMute ? "Sim" : "Não",
                        GravandoMP4 = rec.Mp4Rec ? "Sim" : "Não",
                        GravandoMP3 = rec.Mp3Rec ? "Sim" : "Não",
                        PastaGravacaoMP4 = !string.IsNullOrWhiteSpace(rec.Mp4Path) ? rec.Mp4Path : "N/A",
                        PastaGravacaoMP3 = !string.IsNullOrWhiteSpace(rec.Mp3Path) ? rec.Mp3Path : "N/A",
                        UrlStreaming = urlStream,
                        SourceAnalogico = sourceAnalog,
                        AnalogAudioDevice = isAnalog && !string.IsNullOrWhiteSpace(mCfg.AnalogAudio) ? mCfg.AnalogAudio : "N/A",
                        QualidadeSinal = qVal,
                        ForcaSinal = sVal,
                        Atualizacao = nowIso
                    };

                    channelsList.Add(item);
                }

                // Processa também multiplexes analógicos ativos que não estejam listados em <Programs>
                foreach (var kvp in mapaMuxCfg)
                {
                    string idM = kvp.Key;
                    var mCfg = kvp.Value;
                    if (processedMuxes.Contains(idM)) continue;

                    bool isAnalogMux = mCfg.NetworkType == "1" || mCfg.NetworkType == "2" || mCfg.NetworkType == "6" || !string.IsNullOrWhiteSpace(mCfg.AnalogVideo);
                    if (!isAnalogMux) continue;

                    string rawName = !string.IsNullOrWhiteSpace(mCfg.MuxName) ? mCfg.MuxName : $"Canal Analógico {idM}";
                    var mStat = muxesStatus.ContainsKey(idM) ? muxesStatus[idM] : (NetworkType: mCfg.NetworkType, TunerID: -1, Status: "N/A", AnalogVideo: mCfg.AnalogVideo);
                    string chaveG = $"{idM}_{rawName.ToLowerInvariant()}";
                    var rec = mapaGravacao.ContainsKey(chaveG) ? mapaGravacao[chaveG] : (Mp4Rec: false, Mp4Path: "N/A", Mp3Rec: false, Mp3Path: "N/A");

                    string canalDisplayName = rawName;
                    if (configChannels.TryGetValue(rawName.ToLowerInvariant(), out var cfgNameByName) && !string.IsNullOrWhiteSpace(cfgNameByName))
                    {
                        canalDisplayName = cfgNameByName;
                    }

                    string sourceAnalog = !string.IsNullOrWhiteSpace(mCfg.AnalogVideo) ? mCfg.AnalogVideo : "Driver de Captura";

                    var item = new ChannelStatusItem
                    {
                        Title = canalDisplayName,
                        RawProgName = rawName,
                        Pais = "Brasil",
                        Cidade = metadata.Praca,
                        IDHost = parsedHostId,
                        IDCS = metadata.CS,
                        Veiculo = rawName,
                        MeiodeTransmissao = "Analógico",
                        Frequencia = "N/A",
                        TunerID = mStat.TunerID >= 0 ? mStat.TunerID : -1,
                        StatusTuner = mStat.Status,
                        VideoCongelado = "Não",
                        AudioMudo = "Não",
                        GravandoMP4 = rec.Mp4Rec ? "Sim" : "Não",
                        GravandoMP3 = rec.Mp3Rec ? "Sim" : "Não",
                        PastaGravacaoMP4 = !string.IsNullOrWhiteSpace(rec.Mp4Path) ? rec.Mp4Path : "N/A",
                        PastaGravacaoMP3 = !string.IsNullOrWhiteSpace(rec.Mp3Path) ? rec.Mp3Path : "N/A",
                        UrlStreaming = "N/A",
                        SourceAnalogico = sourceAnalog,
                        AnalogAudioDevice = !string.IsNullOrWhiteSpace(mCfg.AnalogAudio) ? mCfg.AnalogAudio : "N/A",
                        QualidadeSinal = 0,
                        ForcaSinal = 0,
                        Atualizacao = nowIso
                    };

                    channelsList.Add(item);
                    processedMuxes.Add(idM);
                    FileLogger.Log($"[ChannelOrchestrator] Canal Analógico detectado (via Multiplex): '{rawName}' -> SharePoint: '{canalDisplayName}' | Dispositivo: '{sourceAnalog}'");
                }

                FileLogger.Log($"[ChannelOrchestrator] Encontrados {channelsList.Count} canais em execução. Sincronizando com o SharePoint...");
                await _spClient.SyncChannelsInventoryAsync(channelsList, parsedHostId, metadata.CS);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[ChannelOrchestrator] Falha ao processar monitoramento de canais: {ex.Message}", ex);
            }
        }
    }
}
