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
        private readonly bool _enabled;

        public ChannelOrchestrator(
            SharePointClient spClient,
            string? multiplexesXmlPath = null,
            string? tunersStatusXmlPath = null,
            string? telemetriaApiUrl = null,
            bool enabled = true)
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
                var mapaMuxCfg = new Dictionary<string, (double BaseFreq, string OrigPath, string NetworkType)>();
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
                            double baseFreq = 0;
                            var freqElem = m.Elements().FirstOrDefault(e => e.Name.LocalName == "BaseFreq");
                            if (freqElem != null && double.TryParse(freqElem.Value.Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double parsedF))
                            {
                                baseFreq = parsedF;
                            }
                            if (!string.IsNullOrEmpty(idM))
                            {
                                mapaMuxCfg[idM] = (baseFreq, orig, netType);
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

                // 3. Processa runtime de DTVTunersStatus.xml
                string statusXmlContent = File.ReadAllText(statusPath, win1252);
                var statusDoc = XDocument.Parse(statusXmlContent);

                var muxesStatus = new Dictionary<string, (string NetworkType, int TunerID, string Status)>();
                foreach (var m in statusDoc.Descendants().Where(e => e.Name.LocalName == "MUXES"))
                {
                    string idM = m.Elements().FirstOrDefault(e => e.Name.LocalName == "IDMUX")?.Value.Trim() ?? "";
                    string netType = m.Elements().FirstOrDefault(e => e.Name.LocalName == "NetworkType")?.Value.Trim() ?? "";
                    string status = m.Elements().FirstOrDefault(e => e.Name.LocalName == "Status")?.Value.Trim() ?? "N/A";
                    int tunerId = -1;
                    var tElem = m.Elements().FirstOrDefault(e => e.Name.LocalName == "TunerID");
                    if (tElem != null && int.TryParse(tElem.Value.Trim(), out int pt)) tunerId = pt;

                    if (!string.IsNullOrEmpty(idM))
                    {
                        muxesStatus[idM] = (netType, tunerId, status);
                    }
                }

                int parsedHostId = int.TryParse(metadata.IdHost, out int ph) ? ph : 1;
                string nowIso = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
                var channelsList = new List<ChannelStatusItem>();

                foreach (var prog in statusDoc.Descendants().Where(e => e.Name.LocalName == "Programs"))
                {
                    string idMux = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "IDMUX")?.Value.Trim() ?? "";
                    string progName = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "Name")?.Value.Trim() ?? "";
                    if (string.IsNullOrWhiteSpace(progName)) continue;

                    string chCode = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "ChannelCode")?.Value.Trim() ?? "";
                    bool isFrozen = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "IsFrozen")?.Value.Trim().Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;
                    bool isMute = prog.Elements().FirstOrDefault(e => e.Name.LocalName == "IsMute")?.Value.Trim().Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;

                    var mStat = muxesStatus.ContainsKey(idMux) ? muxesStatus[idMux] : (NetworkType: "", TunerID: -1, Status: "N/A");
                    var mCfg = mapaMuxCfg.ContainsKey(idMux) ? mapaMuxCfg[idMux] : (BaseFreq: 0.0, OrigPath: "", NetworkType: "");
                    string chaveG = $"{idMux}_{progName.ToLowerInvariant()}";
                    var rec = mapaGravacao.ContainsKey(chaveG) ? mapaGravacao[chaveG] : (Mp4Rec: false, Mp4Path: "N/A", Mp3Rec: false, Mp3Path: "N/A");

                    string netType = !string.IsNullOrEmpty(mStat.NetworkType) ? mStat.NetworkType : mCfg.NetworkType;
                    string origPath = mCfg.OrigPath ?? "";

                    string meio = "Digital Terrestre";
                    string freqStr = "N/A";
                    string urlStream = "N/A";
                    string sourceAnalog = "N/A";

                    switch (netType)
                    {
                        case "0":
                            meio = "Digital Terrestre";
                            if (mCfg.BaseFreq > 0)
                            {
                                freqStr = $"{(mCfg.BaseFreq / 1000.0):N3} MHz";
                            }
                            break;
                        case "5":
                            meio = "Streaming (RTSP)";
                            urlStream = !string.IsNullOrWhiteSpace(origPath) ? origPath : "RTSP Stream";
                            break;
                        case "3":
                            meio = "Streaming(UDP)";
                            urlStream = !string.IsNullOrWhiteSpace(origPath) ? origPath : "UDP Multicast";
                            break;
                        case "1":
                        case "2":
                            meio = "Analógico";
                            sourceAnalog = !string.IsNullOrWhiteSpace(origPath) ? origPath : "Driver de Captura";
                            break;
                        default:
                            meio = "Digital Terrestre";
                            break;
                    }

                    int? qVal = null;
                    int? sVal = null;
                    if (telemetria.TryGetValue(idMux, out var tel))
                    {
                        qVal = tel.Quality;
                        sVal = tel.Strength;
                    }

                    var item = new ChannelStatusItem
                    {
                        Title = progName,
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
                        QualidadeSinal = qVal,
                        ForcaSinal = sVal,
                        Atualizacao = nowIso
                    };

                    channelsList.Add(item);
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
