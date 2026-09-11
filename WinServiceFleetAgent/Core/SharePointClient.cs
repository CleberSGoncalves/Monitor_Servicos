using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public class PendingActionItem
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string NomeServico { get; set; } = string.Empty;
        public string VersaoInstalada { get; set; } = string.Empty;
        public string VersaoDesejada { get; set; } = string.Empty;
        public string AcaoSolicitada { get; set; } = string.Empty;
        public string StatusAtualizacao { get; set; } = string.Empty;
        public string UrlComunicacaoDesejavel { get; set; } = string.Empty;
        public string AcaoSolicitadaUrl { get; set; } = string.Empty;
        public string AutoRestart { get; set; } = "Não";
        public string HoraAgendada { get; set; } = string.Empty;
    }

    public class SharePointClient
    {
        private readonly string _tenantId = "b2767241-fab5-454b-8b62-f6324650e316";
        private readonly string _clientId = "1950a258-227b-4e31-a9cf-717495945fc2";
        private readonly string _siteHost = "adgbl.sharepoint.com";
        private readonly string _sitePath = "/sites/suportecaptacao";
        private readonly string _listName;
        private readonly string _username;
        private readonly string _password;

        private string _accessToken = string.Empty;
        private DateTime _tokenExpiresAt = DateTime.MinValue;
        private string _siteId = string.Empty;
        private string _listId = string.Empty;
        private static DateTime _lastLogAttachmentTime = DateTime.MinValue;

        public SharePointClient(
            string siteUrl,
            string listName,
            string clientId,
            string clientSecret,
            string? username = null,
            string? password = null)
        {
            _listName = string.IsNullOrWhiteSpace(listName) ? "Painel de gestão de serviços dos CS" : listName;
            
            if (string.IsNullOrWhiteSpace(clientId) || clientId.Contains("COLE_AQUI") || clientId.Equals("4ffd280d-ed8f-402c-8b41-dfad6ab68f62", StringComparison.OrdinalIgnoreCase))
            {
                _clientId = "1950a258-227b-4e31-a9cf-717495945fc2";
            }
            else
            {
                _clientId = clientId;
            }

            _username = string.IsNullOrWhiteSpace(username) ? "svc.captacao@adgbl.com" : username;
            _password = string.IsNullOrWhiteSpace(password) ? "Acount@!2026" : password;

            if (!string.IsNullOrWhiteSpace(siteUrl) && Uri.TryCreate(siteUrl, UriKind.Absolute, out var uri))
            {
                _siteHost = uri.Host;
                _sitePath = uri.AbsolutePath;
            }
        }

        public static string FormatShortVersion(string? rawVersion)
        {
            if (string.IsNullOrWhiteSpace(rawVersion)) return "0.0.0.0";
            string clean = rawVersion.Trim().TrimStart('v', 'V');
            if (clean.Equals("Não Instalado", StringComparison.OrdinalIgnoreCase) ||
                clean.Equals("Inexistente", StringComparison.OrdinalIgnoreCase)) return clean;

            return clean;
        }

        public static bool IsInstalledUpToDate(string shortInstalled, string shortTarget)
        {
            if (string.Equals(shortInstalled, shortTarget, StringComparison.OrdinalIgnoreCase)) return true;

            try
            {
                if (Version.TryParse(shortInstalled, out var vInst) && Version.TryParse(shortTarget, out var vTarg))
                {
                    return vInst >= vTarg;
                }
            }
            catch { }

            return false;
        }

        private static string _cachedSiteId = string.Empty;
        private static string _cachedListId = string.Empty;
        private static DateTime _lastAuthFailureTime = DateTime.MinValue;

        private async Task EnsureGraphContextAsync(HttpClient client)
        {
            if (!string.IsNullOrEmpty(_accessToken) && DateTime.UtcNow < _tokenExpiresAt && !string.IsNullOrEmpty(_listId))
            {
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                return;
            }

            if (DateTime.UtcNow < _lastAuthFailureTime.AddSeconds(15))
            {
                return;
            }

            FileLogger.Log("[SharePointClient] Renovando token OAuth 2.0 do Microsoft Graph API (ROPC)...");

            string tokenUrl = $"https://login.microsoftonline.com/{_tenantId}/oauth2/v2.0/token";
            var tokenReq = new Dictionary<string, string>
            {
                { "grant_type", "password" },
                { "client_id", _clientId },
                { "username", _username },
                { "password", _password },
                { "scope", "https://graph.microsoft.com/.default" }
            };

            HttpResponseMessage? tokenResp = null;
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    tokenResp = await client.PostAsync(tokenUrl, new FormUrlEncodedContent(tokenReq));
                    if (tokenResp.IsSuccessStatusCode) break;
                    await Task.Delay(2000);
                }
                catch
                {
                    if (attempt < 3) await Task.Delay(2000);
                }
            }

            if (tokenResp == null || !tokenResp.IsSuccessStatusCode)
            {
                string errStr = tokenResp != null ? await tokenResp.Content.ReadAsStringAsync() : "Sem resposta";
                FileLogger.LogError($"Erro ao autenticar no Graph API (login.microsoftonline.com): {errStr}");
                _accessToken = "";
                _tokenExpiresAt = DateTime.MinValue;
                _lastAuthFailureTime = DateTime.UtcNow;
                return;
            }

            string tokenJson = await tokenResp.Content.ReadAsStringAsync();
            using (var doc = JsonDocument.Parse(tokenJson))
            {
                _accessToken = doc.RootElement.GetProperty("access_token").GetString() ?? "";
                int expiresIn = doc.RootElement.TryGetProperty("expires_in", out var expProp) ? expProp.GetInt32() : 3600;
                _tokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn - 300);
            }

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

            if (string.IsNullOrEmpty(_cachedSiteId) || string.IsNullOrEmpty(_cachedListId))
            {
                string siteGraphUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteHost}:{_sitePath}";
                var siteResp = await client.GetAsync(siteGraphUrl);
                if (siteResp.IsSuccessStatusCode)
                {
                    string siteJson = await siteResp.Content.ReadAsStringAsync();
                    using var siteDoc = JsonDocument.Parse(siteJson);
                    _cachedSiteId = siteDoc.RootElement.GetProperty("id").GetString() ?? "";
                }

                if (!string.IsNullOrEmpty(_cachedSiteId))
                {
                    string listsUrl = $"https://graph.microsoft.com/v1.0/sites/{_cachedSiteId}/lists";
                    var listsResp = await client.GetAsync(listsUrl);
                    if (listsResp.IsSuccessStatusCode)
                    {
                        string listsJson = await listsResp.Content.ReadAsStringAsync();
                        using var listsDoc = JsonDocument.Parse(listsJson);
                        if (listsDoc.RootElement.TryGetProperty("value", out var listsArray))
                        {
                            foreach (var l in listsArray.EnumerateArray())
                            {
                                string displayName = l.GetProperty("displayName").GetString() ?? "";
                                if (displayName.Equals(_listName, StringComparison.OrdinalIgnoreCase))
                                {
                                    _cachedListId = l.GetProperty("id").GetString() ?? "";
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            _siteId = _cachedSiteId;
            _listId = _cachedListId;
        }

        private static List<JsonElement>? _cachedListItems = null;
        private static DateTime _cacheListExpiresAt = DateTime.MinValue;
        private static readonly object _cacheLock = new object();

        public static void InvalidateListCache()
        {
            lock (_cacheLock)
            {
                _cachedListItems = null;
                _cacheListExpiresAt = DateTime.MinValue;
            }
        }

        private async Task<HttpResponseMessage> ExecuteWithThrottlingRetryAsync(Func<Task<HttpResponseMessage>> action)
        {
            HttpResponseMessage response = null!;
            for (int attempt = 1; attempt <= 6; attempt++)
            {
                response = await action();
                if (response.IsSuccessStatusCode) return response;

                int statusCode = (int)response.StatusCode;
                string content = await response.Content.ReadAsStringAsync();
                bool isThrottled = statusCode == 429 ||
                                   content.Contains("activityLimitReached", StringComparison.OrdinalIgnoreCase) ||
                                   content.Contains("throttledRequest", StringComparison.OrdinalIgnoreCase);

                if (isThrottled && attempt < 6)
                {
                    int delayMs = attempt * 3000 + Random.Shared.Next(1000, 2500);
                    FileLogger.Log($"[SharePointClient] ⚠️ SharePoint Throttling ativado (Tentativa {attempt}/6). Aguardando {delayMs}ms para retry...");
                    await Task.Delay(delayMs);
                }
                else
                {
                    break;
                }
            }
            return response;
        }

        private async Task<List<JsonElement>> GetAllListItemsAsync(HttpClient client)
        {
            lock (_cacheLock)
            {
                if (_cachedListItems != null && DateTime.UtcNow < _cacheListExpiresAt)
                {
                    return _cachedListItems;
                }
            }

            var list = new List<JsonElement>();
            string nextUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$top=500";

            while (!string.IsNullOrEmpty(nextUrl))
            {
                HttpResponseMessage? resp = null;
                for (int attempt = 1; attempt <= 3; attempt++)
                {
                    try
                    {
                        resp = await client.GetAsync(nextUrl);
                        if (resp != null && ((int)resp.StatusCode == 429 || resp.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable))
                        {
                            int delay = attempt * 2500 + Random.Shared.Next(500, 1500);
                            FileLogger.Log($"[SharePointClient] ⚠️ SharePoint Throttled ao consultar lista (HTTP {(int)resp.StatusCode}). Aguardando {delay}ms...");
                            await Task.Delay(delay);
                            continue;
                        }
                        break;
                    }
                    catch (Exception ex) when (attempt < 3)
                    {
                        FileLogger.Log($"[SharePointClient] ⚠️ Falha de rede/DNS na tentativa {attempt}/3 em Graph API: {ex.Message}. Aguardando 3s...");
                        await Task.Delay(3000);
                    }
                    catch (Exception ex)
                    {
                        FileLogger.LogError("[SharePointClient] ❌ Erro de conexão/DNS com Graph API (graph.microsoft.com)", ex);
                        return list;
                    }
                }

                if (resp == null || !resp.IsSuccessStatusCode)
                {
                    if (resp != null && resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        FileLogger.Log("[SharePointClient] ⚠️ Token de acesso expirado (401 Unauthorized). Resetando token para renovação automática.");
                        _accessToken = "";
                        _tokenExpiresAt = DateTime.MinValue;
                    }
                    break;
                }

                string json = await resp.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);

                if (doc.RootElement.TryGetProperty("value", out var valueArray))
                {
                    foreach (var item in valueArray.EnumerateArray())
                    {
                        list.Add(item.Clone());
                    }
                }

                nextUrl = doc.RootElement.TryGetProperty("@odata.nextLink", out var nextProp) ? nextProp.GetString() ?? "" : "";
            }

            lock (_cacheLock)
            {
                _cachedListItems = list;
                _cacheListExpiresAt = DateTime.UtcNow.AddSeconds(15);
            }

            return list;
        }

        public async Task SyncServiceInventoryAsync(
            string title,
            string hostname,
            string praca,
            int cs,
            string nomeServico,
            string versaoInstalada,
            string? versaoDesejada,
            string statusServico,
            string urlComunicacao,
            PerformanceMetrics metrics)
        {
            string nowIso = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
            string cleanHost = (hostname ?? "").Trim();
            string cleanSrv = (nomeServico ?? "").Trim();

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId))
                {
                    FileLogger.LogError($"Falha ao estabelecer contexto no SharePoint para [{cleanHost}_{cleanSrv}]");
                    return;
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    var allItems = await GetAllListItemsAsync(client);
                    var matchingItems = new List<JsonElement>();

                    foreach (var item in allItems)
                    {
                        if (item.TryGetProperty("fields", out var fields))
                        {
                            string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString()?.Trim() ?? "" : "";
                            string itemSrv = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString()?.Trim() ?? "" : "";

                            if (itemHost.Equals(cleanHost, StringComparison.OrdinalIgnoreCase) &&
                                itemSrv.Equals(cleanSrv, StringComparison.OrdinalIgnoreCase))
                            {
                                matchingItems.Add(item);
                            }
                        }
                    }

                    string itemId = string.Empty;
                    string existingVersaoDesejada = string.Empty;
                    string existingStatusAtualizacao = string.Empty;
                    string existingAcaoSolicitada = string.Empty;
                    string existingUrlComunicacaoDesejavel = string.Empty;
                    string existingAcaoSolicitadaUrl = string.Empty;
                    string existingAutoRestart = string.Empty;

                    if (matchingItems.Count > 0)
                    {
                        // 1. Seleciona o item primário: prioriza item com Acao_Solicitada pendente (diferente de "Nenhuma")
                        JsonElement selectedItem = default;
                        foreach (var m in matchingItems)
                        {
                            if (m.TryGetProperty("fields", out var f))
                            {
                                string ac = f.TryGetProperty("Acao_Solicitada", out var a) ? a.GetString()?.Trim() ?? "" : "";
                                if (!string.IsNullOrWhiteSpace(ac) && !ac.Equals("Nenhuma", StringComparison.OrdinalIgnoreCase))
                                {
                                    selectedItem = m;
                                    break;
                                }
                            }
                        }

                        // 2. Se nenhuma ação pendente, seleciona o item com maior ID (mais recente)
                        if (selectedItem.ValueKind == JsonValueKind.Undefined)
                        {
                            int highestId = -1;
                            foreach (var m in matchingItems)
                            {
                                if (m.TryGetProperty("id", out var idProp) && int.TryParse(idProp.GetString(), out int parsedId))
                                {
                                    if (parsedId > highestId)
                                    {
                                        highestId = parsedId;
                                        selectedItem = m;
                                    }
                                }
                            }
                        }

                        if (selectedItem.ValueKind == JsonValueKind.Undefined)
                        {
                            selectedItem = matchingItems[0];
                        }

                        itemId = selectedItem.GetProperty("id").GetString() ?? "";
                        if (selectedItem.TryGetProperty("fields", out var selectedFields))
                        {
                            existingVersaoDesejada = selectedFields.TryGetProperty("Versao_Desejada", out var vd) ? vd.GetString() ?? "" : "";
                            existingStatusAtualizacao = selectedFields.TryGetProperty("Status_Atualizacao", out var sa) ? sa.GetString() ?? "" : "";
                            existingAcaoSolicitada = selectedFields.TryGetProperty("Acao_Solicitada", out var ac) ? ac.GetString() ?? "" : "";
                            existingUrlComunicacaoDesejavel = selectedFields.TryGetProperty("Url_Comunicacao_Desejavel", out var ud) ? ud.GetString() ?? "" : "";
                            existingAcaoSolicitadaUrl = selectedFields.TryGetProperty("Acao_Solicitada_Url", out var au) ? au.GetString() ?? "" : "";
                            existingAutoRestart = selectedFields.TryGetProperty("AutoRestart", out var ar) ? ar.GetString() ?? "" : "";
                        }

                        // 3. DEDUPLICAÇÃO AUTOMÁTICA: Exclui todas as outras linhas duplicadas no SharePoint
                        foreach (var dup in matchingItems)
                        {
                            string dupId = dup.GetProperty("id").GetString() ?? "";
                            if (!string.IsNullOrEmpty(dupId) && !dupId.Equals(itemId, StringComparison.OrdinalIgnoreCase))
                            {
                                try
                                {
                                    string deleteUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{dupId}";
                                    var delResp = await client.DeleteAsync(deleteUrl);
                                    if (delResp.IsSuccessStatusCode)
                                    {
                                        FileLogger.Log($"[SharePointClient] 🧹 Item duplicado (ID {dupId}) excluído com sucesso do SharePoint para [{cleanHost}_{cleanSrv}].");
                                    }
                                }
                                catch (Exception exDel)
                                {
                                    FileLogger.LogError($"[SharePointClient] Erro ao excluir item duplicado ID {dupId} para [{cleanHost}_{cleanSrv}]", exDel);
                                }
                            }
                        }
                    }

                    string safePraca = string.IsNullOrWhiteSpace(praca) ? "Não Informado" : praca;
                    int safeCS = cs <= 0 ? 1 : cs;
                    string displayTitle = string.IsNullOrWhiteSpace(title) ? "Brasil" : title;

                    bool isConfigMonitor = cleanSrv.Equals("DNA.ConfigMonitorSVC", StringComparison.OrdinalIgnoreCase);
                    bool isMonitorService = cleanSrv.Equals("DNA.MonitorServiceSVC", StringComparison.OrdinalIgnoreCase);
                    bool isZabbix = cleanSrv.Contains("Zabbix", StringComparison.OrdinalIgnoreCase);

                    string safeUrlComunicacao = "Nenhuma";
                    if (isConfigMonitor)
                    {
                        safeUrlComunicacao = string.IsNullOrWhiteSpace(urlComunicacao) ? "Nenhuma" : urlComunicacao;
                    }
                    else if (isZabbix)
                    {
                        safeUrlComunicacao = ConfigUrlUpdater.GetZabbixServerUrl(@"C:\Zabbix\config\zabbix_agentd.conf");
                    }

                    string shortInstalled = FormatShortVersion(versaoInstalada);

                    string targetVerRaw = !string.IsNullOrWhiteSpace(versaoDesejada)
                        ? versaoDesejada
                        : (!string.IsNullOrWhiteSpace(existingVersaoDesejada) ? existingVersaoDesejada : versaoInstalada);

                    string shortTarget = FormatShortVersion(targetVerRaw);

                    bool isUpToDate = IsInstalledUpToDate(shortInstalled, shortTarget);

                    if (isUpToDate)
                    {
                        shortTarget = shortInstalled;
                    }

                    // Detecta se a atualização está travada em Em Progresso
                    bool isStuckInProgress = existingStatusAtualizacao.Equals("Em Progresso", StringComparison.OrdinalIgnoreCase);

                    string statusAtualizacao;
                    if (isUpToDate)
                    {
                        statusAtualizacao = "Atualizado";
                    }
                    else if (isStuckInProgress)
                    {
                        statusAtualizacao = "Em Progresso";
                    }
                    else
                    {
                        statusAtualizacao = "Desatualizado";
                    }

                    // Se AutoRestart não estiver preenchido no SharePoint, usa "Não" como padrão solicitado
                    string safeAutoRestart = string.IsNullOrWhiteSpace(existingAutoRestart) ? "Não" : existingAutoRestart;

                    // Preserva 100% a Acao_Solicitada que o usuário escolheu no SharePoint.
                    string newAcaoSolicitada = existingAcaoSolicitada;

                    var fieldsPayload = new Dictionary<string, object>
                    {
                        { "Title", displayTitle },
                        { "Hostname", cleanHost },
                        { "Pra_x00e7_a", safePraca },
                        { "CS", safeCS },
                        { "Nome_Servico", cleanSrv },
                        { "Versao_Instalada", shortInstalled },
                        { "Versao_Desejada", shortTarget },
                        { "Status_Servico", statusServico },
                        { "Status_Atualizacao", statusAtualizacao },
                        { "Ultima_atualizacao", nowIso },
                        { "Url_Comunicacao", safeUrlComunicacao },
                        { "AutoRestart", safeAutoRestart },
                        { "Acao_Solicitada", newAcaoSolicitada }
                    };

                    if (isConfigMonitor)
                    {
                        fieldsPayload["Status_WCF"] = metrics.StatusWcf;
                    }

                    if (isMonitorService)
                    {
                        fieldsPayload["Cpu_Uso"] = metrics.CpuUso;
                        fieldsPayload["Ram_Uso"] = metrics.RamUso;
                        fieldsPayload["Disco_D_Livre_GB"] = metrics.DiscoDLivreGB;
                        fieldsPayload["Uptime_Dias"] = metrics.UptimeDias;

                        await UploadLogAttachmentAsync(cleanHost, cleanSrv, FileLogger.GetLastLogLines(1000));
                    }

                    if (isConfigMonitor && !string.IsNullOrWhiteSpace(existingUrlComunicacaoDesejavel) && string.Equals(safeUrlComunicacao, existingUrlComunicacaoDesejavel, StringComparison.OrdinalIgnoreCase))
                    {
                        fieldsPayload["Acao_Solicitada_Url"] = "Nenhuma";
                    }

                    if (string.IsNullOrEmpty(itemId))
                    {
                        fieldsPayload["Url_Comunicacao_Desejavel"] = isConfigMonitor ? (string.IsNullOrWhiteSpace(urlComunicacao) ? "https://mediadna.ibope.com/mediadnawcfcs/RemoteHostsService.svc" : urlComunicacao) : "Nenhuma";
                        fieldsPayload["Acao_Solicitada"] = "Nenhuma";
                        fieldsPayload["Acao_Solicitada_Url"] = "Nenhuma";
                        var itemPayload = new { fields = fieldsPayload };
                        string createUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items";

                        var createResp = await ExecuteWithThrottlingRetryAsync(() => client.PostAsync(createUrl, new StringContent(JsonSerializer.Serialize(itemPayload), Encoding.UTF8, "application/json")));
                        if (createResp.IsSuccessStatusCode)
                        {
                            FileLogger.Log($"[SharePointClient] ✅ Novo item cadastrado no SharePoint: [{displayTitle}] {cleanHost}_{cleanSrv}");
                            InvalidateListCache();
                        }
                        else
                        {
                            string err = await createResp.Content.ReadAsStringAsync();
                            FileLogger.LogError($"[SharePointClient] ❌ Erro ao criar item no SharePoint [{cleanHost}_{cleanSrv}]: {err}");
                        }
                    }
                    else
                    {
                        string patchUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{itemId}/fields";
                        
                        var patchResp = await ExecuteWithThrottlingRetryAsync(() => 
                        {
                            var req = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) 
                            { 
                                Content = new StringContent(JsonSerializer.Serialize(fieldsPayload), Encoding.UTF8, "application/json") 
                            };
                            return client.SendAsync(req);
                        });

                        if (patchResp.IsSuccessStatusCode)
                        {
                            FileLogger.Log($"[SharePointClient] ✅ Registro atualizado no SharePoint (ID {itemId}): [{displayTitle}] {cleanHost}_{cleanSrv} -> AutoRestart: {safeAutoRestart}");
                            InvalidateListCache();
                        }
                        else
                        {
                            string err = await patchResp.Content.ReadAsStringAsync();
                            FileLogger.LogError($"[SharePointClient] ❌ Erro ao atualizar item no SharePoint [{cleanHost}_{cleanSrv}]: {err}");

                            try
                            {
                                var essentialPayload = new Dictionary<string, object>
                                {
                                    { "Title", displayTitle },
                                    { "Hostname", cleanHost },
                                    { "Nome_Servico", cleanSrv },
                                    { "Versao_Instalada", shortInstalled },
                                    { "Versao_Desejada", shortTarget },
                                    { "Status_Servico", statusServico },
                                    { "Status_Atualizacao", statusAtualizacao },
                                    { "Ultima_atualizacao", nowIso }
                                };

                                var fallbackContent = new StringContent(JsonSerializer.Serialize(essentialPayload), Encoding.UTF8, "application/json");
                                var fallbackReq = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) { Content = fallbackContent };
                                var fallbackResp = await client.SendAsync(fallbackReq);

                                if (fallbackResp.IsSuccessStatusCode)
                                {
                                    FileLogger.Log($"[SharePointClient] 🛡️ Self-Healing: Atualização de contingência efetuada com sucesso para [{cleanHost}_{cleanSrv}].");
                                }
                            }
                            catch (Exception fbEx)
                            {
                                FileLogger.LogError($"[SharePointClient] Erro no fallback de contingência para [{cleanHost}_{cleanSrv}]", fbEx);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao sincronizar inventário no SharePoint [{cleanHost}_{cleanSrv}]", ex);
                }
            }
        }

        public async Task<List<PendingActionItem>> GetPendingUrlActionsAsync(string hostname)
        {
            var list = new List<PendingActionItem>();
            string cleanHost = (hostname ?? "").Trim();

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId))
                {
                    return list;
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    var itemsArray = await GetAllListItemsAsync(client);
                    foreach (var item in itemsArray)
                    {
                        if (item.TryGetProperty("fields", out var fields))
                        {
                            string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString()?.Trim() ?? "" : "";
                            string acaoUrl = fields.TryGetProperty("Acao_Solicitada_Url", out var au) ? au.GetString()?.Trim() ?? "" : "";

                            if (itemHost.Equals(cleanHost, StringComparison.OrdinalIgnoreCase) &&
                                acaoUrl.Equals("Atualizar", StringComparison.OrdinalIgnoreCase))
                            {
                                int idInt = 0;
                                if (item.TryGetProperty("id", out var idProp) && int.TryParse(idProp.GetString(), out int parsedId))
                                {
                                    idInt = parsedId;
                                }

                                list.Add(new PendingActionItem
                                {
                                    Id = idInt,
                                    Title = fields.TryGetProperty("Title", out var t) ? t.GetString() ?? "" : "",
                                    NomeServico = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString() ?? "" : "",
                                    UrlComunicacaoDesejavel = fields.TryGetProperty("Url_Comunicacao_Desejavel", out var ud) ? ud.GetString() ?? "" : "",
                                    AcaoSolicitadaUrl = acaoUrl
                                });
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError("Erro ao buscar ações pendentes de URL", ex);
                }
            }
            return list;
        }

        public async Task UpdateUrlActionStatusAsync(
            string hostname,
            string nomeServico,
            string statusAtualizacao,
            string newUrl,
            bool isPending = false)
        {
            string cleanHost = (hostname ?? "").Trim();
            string cleanSrv = (nomeServico ?? "").Trim();

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId))
                {
                    return;
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    var itemsArray = await GetAllListItemsAsync(client);
                    foreach (var item in itemsArray)
                    {
                        if (item.TryGetProperty("fields", out var fields))
                        {
                            string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString()?.Trim() ?? "" : "";
                            string itemSrv = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString()?.Trim() ?? "" : "";

                            if (itemHost.Equals(cleanHost, StringComparison.OrdinalIgnoreCase) && itemSrv.Equals(cleanSrv, StringComparison.OrdinalIgnoreCase))
                            {
                                string itemId = item.GetProperty("id").GetString() ?? "";

                                var patchData = new Dictionary<string, object>
                                {
                                    { "Status_Atualizacao", statusAtualizacao },
                                    { "Ultima_atualizacao", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") }
                                };

                                if (!isPending)
                                {
                                    patchData["Acao_Solicitada_Url"] = "Nenhuma";
                                    patchData["Url_Comunicacao"] = newUrl;
                                    patchData["Url_Comunicacao_Desejavel"] = newUrl;
                                }

                                string patchUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{itemId}/fields";
                                var content = new StringContent(JsonSerializer.Serialize(patchData), Encoding.UTF8, "application/json");
                                var request = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) { Content = content };

                                await client.SendAsync(request);
                                FileLogger.Log($"[SharePointClient] Status de URL atualizado no SharePoint [{cleanHost}_{cleanSrv}]: Status={statusAtualizacao}, Pending={isPending}");
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao atualizar status de URL no SharePoint [{cleanHost}_{cleanSrv}]", ex);
                }
            }
        }

        public async Task<List<PendingActionItem>> GetPendingActionsAsync(string hostname)
        {
            var list = new List<PendingActionItem>();
            string cleanHost = (hostname ?? "").Trim();

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId))
                {
                    return list;
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    var itemsArray = await GetAllListItemsAsync(client);
                    foreach (var item in itemsArray)
                    {
                        if (item.TryGetProperty("fields", out var fields))
                        {
                            string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString()?.Trim() ?? "" : "";
                            string acao = fields.TryGetProperty("Acao_Solicitada", out var ac) ? ac.GetString()?.Trim() ?? "" : "";

                            if (itemHost.Equals(cleanHost, StringComparison.OrdinalIgnoreCase) &&
                                !string.IsNullOrWhiteSpace(acao) &&
                                !acao.Equals("Nenhuma", StringComparison.OrdinalIgnoreCase))
                            {
                                int idInt = 0;
                                if (item.TryGetProperty("id", out var idProp) && int.TryParse(idProp.GetString(), out int parsedId))
                                {
                                    idInt = parsedId;
                                }

                                list.Add(new PendingActionItem
                                {
                                    Id = idInt,
                                    Title = fields.TryGetProperty("Title", out var t) ? t.GetString() ?? "" : "",
                                    NomeServico = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString() ?? "" : "",
                                    VersaoInstalada = fields.TryGetProperty("Versao_Instalada", out var vi) ? vi.GetString() ?? "" : "",
                                    VersaoDesejada = fields.TryGetProperty("Versao_Desejada", out var vd) ? vd.GetString() ?? "" : "",
                                    AcaoSolicitada = acao,
                                    StatusAtualizacao = fields.TryGetProperty("Status_Atualizacao", out var sa) ? sa.GetString() ?? "" : "",
                                    AutoRestart = fields.TryGetProperty("AutoRestart", out var ar) ? ar.GetString() ?? "Não" : "Não",
                                    HoraAgendada = fields.TryGetProperty("Hora_Agendada", out var ha) ? ha.GetString() ?? "" : ""
                                });
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError("Erro ao buscar ações pendentes", ex);
                }
            }
            return list;
        }

        public async Task UpdateActionStatusByServiceAsync(
            string hostname,
            string nomeServico,
            string statusAtualizacao,
            string? acaoSolicitada = null,
            string? versaoInstalada = null,
            string? versaoDesejada = null)
        {
            string cleanHost = (hostname ?? "").Trim();
            string cleanSrv = (nomeServico ?? "").Trim();

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId))
                {
                    return;
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    var itemsArray = await GetAllListItemsAsync(client);
                    foreach (var item in itemsArray)
                    {
                        if (item.TryGetProperty("fields", out var fields))
                        {
                            string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString()?.Trim() ?? "" : "";
                            string itemSrv = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString()?.Trim() ?? "" : "";

                            if (itemHost.Equals(cleanHost, StringComparison.OrdinalIgnoreCase) && itemSrv.Equals(cleanSrv, StringComparison.OrdinalIgnoreCase))
                            {
                                string itemId = item.GetProperty("id").GetString() ?? "";

                                var patchData = new Dictionary<string, object>
                                {
                                    { "Status_Atualizacao", statusAtualizacao },
                                    { "Ultima_atualizacao", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") }
                                };

                                if (acaoSolicitada != null) patchData["Acao_Solicitada"] = acaoSolicitada;
                                if (versaoInstalada != null) patchData["Versao_Instalada"] = FormatShortVersion(versaoInstalada);
                                if (versaoDesejada != null) patchData["Versao_Desejada"] = FormatShortVersion(versaoDesejada);

                                string patchUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{itemId}/fields";
                                var content = new StringContent(JsonSerializer.Serialize(patchData), Encoding.UTF8, "application/json");
                                var request = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) { Content = content };

                                await client.SendAsync(request);
                                FileLogger.Log($"[SharePointClient] Status do serviço [{cleanHost}_{cleanSrv}] atualizado no SharePoint: {statusAtualizacao}");
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao atualizar status do serviço [{cleanHost}_{cleanSrv}] no SharePoint", ex);
                }
            }
        }

        private static readonly Dictionary<string, DateTime> _lastLogAttachmentTimes = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);

        public async Task<string> UploadLogAttachmentAsync(string hostname, string nomeServico, string logContent, bool force = false)
        {
            if (string.IsNullOrWhiteSpace(logContent)) return string.Empty;

            string key = $"{hostname}_{nomeServico}";
            lock (_lastLogAttachmentTimes)
            {
                if (!force && _lastLogAttachmentTimes.TryGetValue(key, out var lastTime))
                {
                    if ((DateTime.UtcNow - lastTime).TotalMinutes < 2) return string.Empty;
                }
            }

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_siteId) || string.IsNullOrEmpty(_listId)) return string.Empty;

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    // 1. Upload do arquivo .txt com as últimas 1000 linhas para o SharePoint Drive (Documentos Compartilhados) via Graph API
                    string fileName = $"{hostname}_{nomeServico}_agent_log.txt";
                    string uploadUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/drive/root:/Logs_Agentes/{fileName}:/content";

                    byte[] fileBytes = Encoding.UTF8.GetBytes(logContent);
                    var content = new ByteArrayContent(fileBytes);
                    content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");

                    var uploadResp = await client.PutAsync(uploadUrl, content);
                    if (!uploadResp.IsSuccessStatusCode)
                    {
                        string errText = await uploadResp.Content.ReadAsStringAsync();
                        FileLogger.LogError($"[SharePointClient] Erro ao enviar log .txt para o SharePoint Drive ({uploadResp.StatusCode}): {errText}");
                        return string.Empty;
                    }

                    string uploadJson = await uploadResp.Content.ReadAsStringAsync();
                    using var uDoc = JsonDocument.Parse(uploadJson);
                    string webUrl = uDoc.RootElement.GetProperty("webUrl").GetString() ?? "";

                    if (!string.IsNullOrEmpty(webUrl))
                    {
                        lock (_lastLogAttachmentTimes) { _lastLogAttachmentTimes[key] = DateTime.UtcNow; }
                        FileLogger.Log($"[SharePointClient] ✅ Arquivo de Log .txt (1000 linhas) gerado no SharePoint Drive: {webUrl}");
                        return webUrl;
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao processar log .txt no SharePoint para [{hostname}_{nomeServico}]", ex);
                }
            }

            return string.Empty;
        }

        public async Task<int> ClearAllListItemsAsync()
        {
            int deletedCount = 0;
            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId)) return 0;

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    var items = await GetAllListItemsAsync(client);
                    FileLogger.Log($"[SharePointClient] 🧹 Iniciando limpeza geral: {items.Count} itens encontrados na lista do SharePoint.");

                    foreach (var item in items)
                    {
                        string itemId = item.GetProperty("id").GetString() ?? "";
                        if (!string.IsNullOrEmpty(itemId))
                        {
                            string delUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{itemId}";
                            var delResp = await client.DeleteAsync(delUrl);
                            if (delResp.IsSuccessStatusCode)
                            {
                                deletedCount++;
                            }
                        }
                    }

                    FileLogger.Log($"[SharePointClient] ✨ Limpeza concluída com sucesso! Total de {deletedCount} itens apagados do SharePoint.");
                }
                catch (Exception ex)
                {
                    FileLogger.LogError("[SharePointClient] Erro ao apagar todos os itens da lista", ex);
                }
            }
            return deletedCount;
        }
    }
}
