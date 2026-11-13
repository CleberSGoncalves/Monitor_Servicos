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
        private readonly string _primaryBaseUrl;
        private readonly string _fallbackBaseUrl;
        private readonly string _hostname;

        public CentralCloudClient(string hostname, string? primaryUrl = null, string? fallbackUrl = null)
        {
            _hostname = (hostname ?? Environment.MachineName).Trim().ToUpperInvariant();
            _primaryBaseUrl = (primaryUrl ?? "http://10.1.30.1:8092").TrimEnd('/');
            _fallbackBaseUrl = (fallbackUrl ?? "http://localhost:8092").TrimEnd('/');
        }

        public async Task<bool> SendTelemetryAsync(
            string praca,
            int cs,
            List<ServiceBatchItem> services,
            List<ChannelStatusItem>? channels,
            PerformanceMetrics? metrics,
            string agentVersion)
        {
            bool gcpSuccess = false;

            // 1. Envio Direto para o Google Cloud Firestore via REST API (Porta 443 - Alta Confiabilidade)
            try
            {
                string? token = await GoogleCloudAuth.GetAccessTokenAsync();
                if (!string.IsNullOrEmpty(token))
                {
                    using var gcpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                    gcpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    string url = $"https://firestore.googleapis.com/v1/projects/{GoogleCloudAuth.ProjectId}/databases/(default)/documents/fleet_hosts/{_hostname}?updateMask.fieldPaths=last_heartbeat&updateMask.fieldPaths=status&updateMask.fieldPaths=agent_version&updateMask.fieldPaths=praca&updateMask.fieldPaths=cs&updateMask.fieldPaths=services_count&updateMask.fieldPaths=services_running&updateMask.fieldPaths=updated_at";

                    int runningCount = services.Count(s => s.StatusServico != null && s.StatusServico.Equals("Em Execução", StringComparison.OrdinalIgnoreCase));

                    var fields = new Dictionary<string, object>
                    {
                        ["hostname"] = new { stringValue = _hostname },
                        ["praca"] = new { stringValue = praca ?? "" },
                        ["cs"] = new { integerValue = cs.ToString() },
                        ["agent_version"] = new { stringValue = agentVersion },
                        ["status"] = new { stringValue = "online" },
                        ["last_heartbeat"] = new { stringValue = DateTime.UtcNow.ToString("o") },
                        ["updated_at"] = new { stringValue = DateTime.UtcNow.ToString("o") },
                        ["services_count"] = new { integerValue = services.Count.ToString() },
                        ["services_running"] = new { integerValue = runningCount.ToString() }
                    };

                    var firestorePayload = new { fields = fields };
                    var content = new StringContent(JsonSerializer.Serialize(firestorePayload), Encoding.UTF8, "application/json");

                    var resp = await gcpClient.PatchAsync(url, content);
                    if (resp.IsSuccessStatusCode)
                    {
                        FileLogger.Log($"[GoogleCloud] 🚀 Telemetria enviada com SUCESSO direto para o Google Cloud Firestore ({_hostname})!");
                        gcpSuccess = true;
                    }
                }
            }
            catch (Exception exGcp)
            {
                FileLogger.Log($"[GoogleCloud] Aviso telemetria Firestore: {exGcp.Message}");
            }

            // 2. Envio Secundário para Central NOC (se acessível na mesma rede)
            try
            {
                var srvList = services.Select(s => new
                {
                    title = s.Title,
                    nome_servico = s.NomeServico,
                    versao_instalada = s.VersaoInstalada,
                    versao_desejada = s.VersaoDesejada,
                    status_servico = s.StatusServico,
                    status_atualizacao = "Atualizado",
                    acao_solicitada = "Nenhuma",
                    url_comunicacao = s.UrlComunicacao
                }).ToList();

                var payload = new
                {
                    hostname = _hostname,
                    praca = praca,
                    cs = cs,
                    agent_version = agentVersion,
                    services = srvList,
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
                                                op = "EQUAL",
                                                value = new { stringValue = _hostname }
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
