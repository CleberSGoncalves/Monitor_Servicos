using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public class CloudCommandItem
    {
        public string? id { get; set; }
        public string? command_id { get; set; }
        public string? hostname { get; set; }
        public string? service_name { get; set; }
        public string? action { get; set; }
        public string? target_version { get; set; }
        public string? shell_type { get; set; }
        public string? script { get; set; }
        public string? status { get; set; }
    }

    public class CloudCommandsResponse
    {
        public string? hostname { get; set; }
        public List<CloudCommandItem>? commands { get; set; }
    }

    /// <summary>
    /// Cliente de Telemetria e Comandos Diretos com o Google Cloud Firestore e Dashboard Central.
    /// Opera com latência sub-segundo (< 30ms) diretamente pela nuvem do Google (São Paulo),
    /// eliminando qualquer dependência do SharePoint/Microsoft Graph (HTTP 429) e de VPN interna.
    /// </summary>
    public class CentralCloudClient
    {
        private static readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        private static string _lastSvcStateSig = "";
        private static DateTime _lastSvcSentUtc = DateTime.MinValue;
        private static string _lastChStateSig = "";
        private static DateTime _lastChSentUtc = DateTime.MinValue;
        private readonly string _primaryBaseUrl;
        private readonly string _fallbackBaseUrl;
        private readonly string _hostname;
        private readonly string _rawMachineName;

        public CentralCloudClient(string hostname, string? primaryUrl = null, string? fallbackUrl = null)
        {
            _rawMachineName = Environment.MachineName.Trim().ToUpperInvariant();
            string rawHost = (hostname ?? Environment.MachineName).Trim();
            // Preserva o casing canônico {Praca}-SMME-{idHost}-CS{CS} (ex: Campo_Grande-SMME-232-CS1)
            _hostname = rawHost.Contains("-SMME-", StringComparison.OrdinalIgnoreCase)
                ? rawHost
                : rawHost.ToUpperInvariant();
            _primaryBaseUrl = (primaryUrl ?? "http://10.1.30.1:8092").TrimEnd('/');
            _fallbackBaseUrl = (fallbackUrl ?? "http://localhost:8092").TrimEnd('/');
        }

        private string ResolveCanonicalHostDocId(int cs, string? praca = null, string? idHost = null)
        {
            if (_hostname.Contains("-SMME-", StringComparison.OrdinalIgnoreCase))
            {
                return _hostname;
            }
            if (!string.IsNullOrWhiteSpace(praca) && !praca.Equals("Não Informado", StringComparison.OrdinalIgnoreCase))
            {
                var meta = new GlobalMetadata { Praca = praca, IdHost = idHost ?? "", CS = cs > 0 ? cs : 1 };
                string built = MetadataReader.BuildCanonicalHostName(meta, _hostname);
                if (built.Contains("-SMME-", StringComparison.OrdinalIgnoreCase))
                {
                    return built;
                }
            }
            if (cs >= 2 && _hostname.Length == 15)
            {
                if (_hostname.EndsWith("DT0", StringComparison.OrdinalIgnoreCase))
                {
                    return $"{_hostname}{cs}";
                }
                if (_hostname.EndsWith("-", StringComparison.OrdinalIgnoreCase))
                {
                    return $"{_hostname}0{cs}";
                }
            }
            return _hostname;
        }

        public async Task<bool> SendTelemetryAsync(
            string praca,
            int cs,
            List<ServiceBatchItem> services,
            List<ChannelStatusItem>? channels,
            PerformanceMetrics? metrics,
            string agentVersion,
            string? idHost = null)
        {
            bool gcpSuccess = false;
            string docHost = ResolveCanonicalHostDocId(cs, praca, idHost);

            var srvTelemetryList = services.Select(s =>
            {
                string cleanSrv = s.NomeServico ?? "";
                bool isMonitorService = cleanSrv.Equals("DNA.MonitorServiceSVC", StringComparison.OrdinalIgnoreCase);
                bool isConfigMonitor = cleanSrv.Equals("DNA.ConfigMonitorSVC", StringComparison.OrdinalIgnoreCase);
                bool isZabbix = cleanSrv.Contains("Zabbix", StringComparison.OrdinalIgnoreCase);
                var (procRam, procCpu) = SystemPerformance.GetProcessTelemetry(!string.IsNullOrWhiteSpace(s.ExeName) ? s.ExeName : cleanSrv);

                string ramOut = procRam;
                string cpuOut = procCpu;
                if (isMonitorService && metrics != null)
                {
                    cpuOut = metrics.CpuUso;
                    ramOut = (procRam != "N/A" && procRam != "Inativo") ? $"{metrics.RamUso} ({procRam})" : metrics.RamUso;
                }

                string safeUrl = "Nenhuma";
                if (isConfigMonitor) safeUrl = string.IsNullOrWhiteSpace(s.UrlComunicacao) ? "Nenhuma" : s.UrlComunicacao;
                else if (isZabbix) safeUrl = ConfigUrlUpdater.GetZabbixServerUrl(@"C:\Zabbix\config\zabbix_agentd.conf");

                return new
                {
                    title = s.Title ?? "Brasil",
                    nome_servico = cleanSrv,
                    versao_instalada = s.VersaoInstalada ?? "Não Instalado",
                    versao_desejada = s.VersaoDesejada ?? "",
                    status_servico = s.StatusServico ?? "Parado",
                    cpu_uso = cpuOut,
                    ram_uso = ramOut,
                    disco_d_livre = isMonitorService && metrics != null ? metrics.DiscoDLivreGB : "N/A",
                    uptime = isMonitorService && metrics != null ? metrics.UptimeDias : "N/A",
                    status_wcf = isConfigMonitor && metrics != null ? metrics.StatusWcf : "N/A",
                    url_comunicacao = safeUrl
                };
            }).ToList();

            string servicesJson = JsonSerializer.Serialize(srvTelemetryList);
            string currentSvcSig = string.Join("|", services.Select(s => $"{s.NomeServico}:{s.StatusServico}:{s.VersaoInstalada}"));
            bool svcUnchanged = (currentSvcSig == _lastSvcStateSig) && (DateTime.UtcNow - _lastSvcSentUtc).TotalMinutes < 25.0;

            if (svcUnchanged)
            {
                FileLogger.Log($"[GoogleCloud] 🛡️ Smart Delta Free-Tier: Estado dos {services.Count} serviços inalterado (<25m). Escrita Firestore economizada ($0.00).");
                gcpSuccess = true;
            }
            else
            {
                // 1. Envio Direto para o Google Cloud Firestore via REST API (Porta 443 - Alta Confiabilidade)
                try
                {
                    string? token = await GoogleCloudAuth.GetAccessTokenAsync();
                    if (!string.IsNullOrEmpty(token))
                    {
                        using var gcpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                        gcpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                        string mask = "updateMask.fieldPaths=hostname&updateMask.fieldPaths=raw_hostname&updateMask.fieldPaths=id_host&updateMask.fieldPaths=last_heartbeat&updateMask.fieldPaths=status&updateMask.fieldPaths=agent_version&updateMask.fieldPaths=praca&updateMask.fieldPaths=cs&updateMask.fieldPaths=services_count&updateMask.fieldPaths=services_running&updateMask.fieldPaths=updated_at&updateMask.fieldPaths=services_json&updateMask.fieldPaths=cpu_uso&updateMask.fieldPaths=ram_uso&updateMask.fieldPaths=disco_d_livre&updateMask.fieldPaths=uptime&updateMask.fieldPaths=status_wcf";
                        string url = $"https://firestore.googleapis.com/v1/projects/{GoogleCloudAuth.ProjectId}/databases/(default)/documents/fleet_hosts/{docHost}?{mask}";

                        int runningCount = services.Count(s => s.StatusServico != null && s.StatusServico.Equals("Em Execução", StringComparison.OrdinalIgnoreCase));

                        var fields = new Dictionary<string, object>
                        {
                            ["hostname"] = new { stringValue = docHost },
                            ["raw_hostname"] = new { stringValue = _rawMachineName },
                            ["id_host"] = new { stringValue = idHost ?? "" },
                            ["praca"] = new { stringValue = praca ?? "" },
                            ["cs"] = new { integerValue = cs.ToString() },
                            ["agent_version"] = new { stringValue = agentVersion },
                            ["status"] = new { stringValue = "online" },
                            ["last_heartbeat"] = new { stringValue = DateTime.UtcNow.ToString("o") },
                            ["updated_at"] = new { stringValue = DateTime.UtcNow.ToString("o") },
                            ["services_count"] = new { integerValue = services.Count.ToString() },
                            ["services_running"] = new { integerValue = runningCount.ToString() },
                            ["services_json"] = new { stringValue = servicesJson },
                            ["cpu_uso"] = new { stringValue = metrics?.CpuUso ?? "N/A" },
                            ["ram_uso"] = new { stringValue = metrics?.RamUso ?? "N/A" },
                            ["disco_d_livre"] = new { stringValue = metrics?.DiscoDLivreGB ?? "N/A" },
                            ["uptime"] = new { stringValue = metrics?.UptimeDias ?? "N/A" },
                            ["status_wcf"] = new { stringValue = metrics?.StatusWcf ?? "N/A" }
                        };

                        var firestorePayload = new { fields = fields };
                        var content = new StringContent(JsonSerializer.Serialize(firestorePayload), Encoding.UTF8, "application/json");

                        var resp = await gcpClient.PatchAsync(url, content);
                        if (resp.IsSuccessStatusCode)
                        {
                            _lastSvcStateSig = currentSvcSig;
                            _lastSvcSentUtc = DateTime.UtcNow;
                            FileLogger.Log($"[GoogleCloud] 🚀 Telemetria completa (serviços + métricas) enviada com SUCESSO para o Google Cloud Firestore ({docHost})!");
                            gcpSuccess = true;
                        }
                    }
                }
                catch (Exception exGcp)
                {
                    FileLogger.Log($"[GoogleCloud] Aviso telemetria Firestore: {exGcp.Message}");
                }
            }

            // 2. Envio Secundário para Central NOC (se acessível na mesma rede)
            try
            {
                var payload = new
                {
                    hostname = docHost,
                    praca = praca,
                    cs = cs,
                    agent_version = agentVersion,
                    services = srvTelemetryList,
                    system = metrics != null ? new
                    {
                        cpu_usage = metrics.CpuUso,
                        ram_usage = metrics.RamUso,
                        disk_free_gb = metrics.DiscoDLivreGB,
                        uptime = metrics.UptimeDias
                    } : null
                };

                string jsonStr = JsonSerializer.Serialize(payload);
                var content = new StringContent(jsonStr, Encoding.UTF8, "application/json");

                using var shortClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                try
                {
                    var resp = await shortClient.PostAsync($"{_primaryBaseUrl}/api/agent/telemetry", content);
                    if (resp.IsSuccessStatusCode) gcpSuccess = true;
                }
                catch { }
            }
            catch { }

            return gcpSuccess;
        }

        /// <summary>
        /// Envia telemetria em tempo real dos canais DTV diretamente para o Google Cloud Firestore.
        /// Atualiza canais ativos, qualidade de sinal, força e status de gravação.
        /// </summary>
        public async Task<bool> SendChannelTelemetryAsync(List<ChannelStatusItem> channels, string praca, int cs)
        {
            if (channels == null || channels.Count == 0) return false;
            string docHost = ResolveCanonicalHostDocId(cs);
            string currentChSig = string.Join("|", channels.Select(c => $"{c.Title}:{c.StatusTuner}:{c.GravandoMP4}:{c.GravandoMP3}:{c.VideoCongelado}"));
            if (currentChSig == _lastChStateSig && (DateTime.UtcNow - _lastChSentUtc).TotalMinutes < 25.0)
            {
                FileLogger.Log($"[GoogleCloud] 🛡️ Smart Delta Free-Tier: Estado dos {channels.Count} canais inalterado (<25m). Escrita Firestore economizada ($0.00).");
                return true;
            }

            try
            {
                string? token = await GoogleCloudAuth.GetAccessTokenAsync();
                if (string.IsNullOrEmpty(token)) return false;

                using var gcpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                gcpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var chList = channels.Select(c => new
                {
                    canal = c.Title ?? c.Veiculo ?? "",
                    veiculo = c.Veiculo ?? c.Title ?? "",
                    cidade = praca ?? c.Cidade ?? "",
                    cs = cs,
                    meio = c.MeiodeTransmissao ?? "Digital Terrestre",
                    frequencia = c.Frequencia ?? "N/A",
                    tuner_id = c.TunerID,
                    status_tuner = c.StatusTuner ?? "Working",
                    qualidade_sinal = c.QualidadeSinal ?? 0,
                    forca_sinal = c.ForcaSinal ?? 0,
                    video_congelado = c.VideoCongelado ?? "Não",
                    audio_mudo = c.AudioMudo ?? "Não",
                    gravando_mp4 = c.GravandoMP4 ?? "Não",
                    gravando_mp3 = c.GravandoMP3 ?? "Não",
                    pasta_mp4 = c.PastaGravacaoMP4 ?? "",
                    pasta_mp3 = c.PastaGravacaoMP3 ?? "",
                    url_streaming = c.UrlStreaming ?? "",
                    atualizacao = DateTime.UtcNow.ToString("o")
                }).ToList();

                string channelsJson = JsonSerializer.Serialize(chList);

                string url = $"https://firestore.googleapis.com/v1/projects/{GoogleCloudAuth.ProjectId}/databases/(default)/documents/fleet_hosts/{docHost}?updateMask.fieldPaths=channels_count&updateMask.fieldPaths=channels_ok&updateMask.fieldPaths=channels_updated_at&updateMask.fieldPaths=channels_json";

                int channelsOk = channels.Count(c => c.QualidadeSinal >= 50 || (c.GravandoMP4 != null && c.GravandoMP4.Contains("Sim", StringComparison.OrdinalIgnoreCase)));

                var fields = new Dictionary<string, object>
                {
                    ["channels_count"] = new { integerValue = channels.Count.ToString() },
                    ["channels_ok"] = new { integerValue = channelsOk.ToString() },
                    ["channels_updated_at"] = new { stringValue = DateTime.UtcNow.ToString("o") },
                    ["channels_json"] = new { stringValue = channelsJson }
                };

                var firestorePayload = new { fields = fields };
                var content = new StringContent(JsonSerializer.Serialize(firestorePayload), Encoding.UTF8, "application/json");

                var resp = await gcpClient.PatchAsync(url, content);
                if (resp.IsSuccessStatusCode)
                {
                    _lastChStateSig = currentChSig;
                    _lastChSentUtc = DateTime.UtcNow;
                    FileLogger.Log($"[GoogleCloud] 📡 Telemetria completa de canais ({channels.Count} canais) enviada com SUCESSO para o Google Cloud Firestore ({docHost})!");
                    return true;
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[GoogleCloud] Aviso envio telemetria canais Firestore: {ex.Message}");
            }

            return false;
        }

        public async Task<List<CloudCommandItem>> PollPendingCommandsAsync()
        {
            var commands = new List<CloudCommandItem>();

            // 1. Consulta comandos pendentes no Google Cloud Firestore
            try
            {
                string? token = await GoogleCloudAuth.GetAccessTokenAsync();
                if (!string.IsNullOrEmpty(token))
                {
                    using var gcpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
                    gcpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    string queryUrl = $"https://firestore.googleapis.com/v1/projects/{GoogleCloudAuth.ProjectId}/databases/(default)/documents:runQuery";

                    var candidateHosts = new List<object> { new { stringValue = _hostname } };
                    if (!string.Equals(_hostname, _rawMachineName, StringComparison.OrdinalIgnoreCase))
                    {
                        candidateHosts.Add(new { stringValue = _rawMachineName });
                    }

                    var structuredQuery = new
                    {
                        structuredQuery = new
                        {
                            from = new[] { new { collectionId = "fleet_commands" } },
                            where = new
                            {
                                compositeFilter = new
                                {
                                    op = "AND",
                                    filters = new object[]
                                    {
                                        new
                                        {
                                            fieldFilter = new
                                            {
                                                field = new { fieldPath = "hostname" },
                                                op = "IN",
                                                value = new { arrayValue = new { values = candidateHosts.ToArray() } }
                                            }
                                        },
                                        new
                                        {
                                            fieldFilter = new
                                            {
                                                field = new { fieldPath = "status" },
                                                op = "EQUAL",
                                                value = new { stringValue = "pending" }
                                            }
                                        }
                                    }
                                }
                            },
                            limit = 5
                        }
                    };

                    var content = new StringContent(JsonSerializer.Serialize(structuredQuery), Encoding.UTF8, "application/json");
                    var resp = await gcpClient.PostAsync(queryUrl, content);
                    if (resp.IsSuccessStatusCode)
                    {
                        string body = await resp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(body);
                        if (doc.RootElement.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in doc.RootElement.EnumerateArray())
                            {
                                if (item.TryGetProperty("document", out var docElem) &&
                                    docElem.TryGetProperty("fields", out var fieldsElem))
                                {
                                    string docName = docElem.TryGetProperty("name", out var nProp) ? nProp.GetString() ?? "" : "";
                                    string cmdId = docName.Contains("/") ? docName.Substring(docName.LastIndexOf('/') + 1) : docName;

                                    string srv = fieldsElem.TryGetProperty("service_name", out var sProp) && sProp.TryGetProperty("stringValue", out var sv) ? sv.GetString() ?? "" : "";
                                    string act = fieldsElem.TryGetProperty("action", out var aProp) && aProp.TryGetProperty("stringValue", out var av) ? av.GetString() ?? "" : "";
                                    string ver = fieldsElem.TryGetProperty("target_version", out var vProp) && vProp.TryGetProperty("stringValue", out var vv) ? vv.GetString() ?? "" : "";
                                    string sc = fieldsElem.TryGetProperty("script", out var scProp) && scProp.TryGetProperty("stringValue", out var scv) ? scv.GetString() ?? "" : "";

                                    commands.Add(new CloudCommandItem
                                    {
                                        id = cmdId,
                                        command_id = cmdId,
                                        hostname = _hostname,
                                        service_name = srv,
                                        action = act,
                                        target_version = ver,
                                        script = sc,
                                        status = "pending"
                                    });
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[GoogleCloud] Aviso ao buscar comandos Firestore: {ex.Message}");
            }

            // 2. Fallback Central NOC (se acessível)
            if (commands.Count == 0)
            {
                try
                {
                    using var shortClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                    var resp = await shortClient.GetAsync($"{_primaryBaseUrl}/api/agent/commands/{_hostname}");
                    if (resp.IsSuccessStatusCode)
                    {
                        string body = await resp.Content.ReadAsStringAsync();
                        var data = JsonSerializer.Deserialize<CloudCommandsResponse>(body);
                        if (data?.commands != null && data.commands.Count > 0)
                        {
                            return data.commands;
                        }
                    }
                }
                catch { }
            }

            return commands;
        }

        public async Task<bool> ReportCommandResultAsync(string commandId, string status, string output, int exitCode = 0)
        {
            bool reported = false;

            // 1. Reporta direto no Firestore
            try
            {
                string? token = await GoogleCloudAuth.GetAccessTokenAsync();
                if (!string.IsNullOrEmpty(token) && !string.IsNullOrEmpty(commandId))
                {
                    using var gcpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                    gcpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    string url = $"https://firestore.googleapis.com/v1/projects/{GoogleCloudAuth.ProjectId}/databases/(default)/documents/fleet_commands/{commandId}?updateMask.fieldPaths=status&updateMask.fieldPaths=output&updateMask.fieldPaths=completed_at&updateMask.fieldPaths=exit_code";

                    var fields = new Dictionary<string, object>
                    {
                        ["status"] = new { stringValue = status },
                        ["output"] = new { stringValue = (output ?? "").Length > 1000 ? output.Substring(0, 1000) : (output ?? "") },
                        ["exit_code"] = new { integerValue = exitCode.ToString() },
                        ["completed_at"] = new { stringValue = DateTime.UtcNow.ToString("o") }
                    };

                    var firestorePayload = new { fields = fields };
                    var content = new StringContent(JsonSerializer.Serialize(firestorePayload), Encoding.UTF8, "application/json");

                    var resp = await gcpClient.PatchAsync(url, content);
                    if (resp.IsSuccessStatusCode)
                    {
                        FileLogger.Log($"[GoogleCloud] ✅ Resultado do comando '{commandId}' persistido com SUCESSO no Firestore!");
                        reported = true;
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Log($"[GoogleCloud] Aviso ao reportar resultado Firestore: {ex.Message}");
            }

            // 2. Reporta na Central NOC se acessível
            try
            {
                var payload = new { status = status, output = output, exit_code = exitCode };
                var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                using var shortClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                await shortClient.PostAsync($"{_primaryBaseUrl}/api/agent/commands/{commandId}/result", content);
            }
            catch { }

            return reported;
        }
    }
}
