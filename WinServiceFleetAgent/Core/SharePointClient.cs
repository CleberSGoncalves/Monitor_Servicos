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
        private string _siteId = string.Empty;
        private string _listId = string.Empty;

        public SharePointClient(
            string siteUrl,
            string listName,
            string clientId,
            string clientSecret,
            string username = "svc.captacao@adgbl.com",
            string password = "Acount@!2026")
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

        private async Task EnsureGraphContextAsync(HttpClient client)
        {
            if (!string.IsNullOrEmpty(_accessToken) && !string.IsNullOrEmpty(_listId))
            {
                return;
            }

            string tokenUrl = $"https://login.microsoftonline.com/{_tenantId}/oauth2/v2.0/token";
            var tokenReq = new Dictionary<string, string>
            {
                { "grant_type", "password" },
                { "client_id", _clientId },
                { "username", _username },
                { "password", _password },
                { "scope", "https://graph.microsoft.com/.default" }
            };

            var tokenResp = await client.PostAsync(tokenUrl, new FormUrlEncodedContent(tokenReq));
            if (!tokenResp.IsSuccessStatusCode)
            {
                string errStr = await tokenResp.Content.ReadAsStringAsync();
                FileLogger.LogError($"Erro ao autenticar no Graph API: {errStr}");
                return;
            }

            string tokenJson = await tokenResp.Content.ReadAsStringAsync();
            using (var doc = JsonDocument.Parse(tokenJson))
            {
                _accessToken = doc.RootElement.GetProperty("access_token").GetString() ?? "";
            }

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

            string siteGraphUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteHost}:{_sitePath}";
            var siteResp = await client.GetAsync(siteGraphUrl);
            if (siteResp.IsSuccessStatusCode)
            {
                string siteJson = await siteResp.Content.ReadAsStringAsync();
                using var siteDoc = JsonDocument.Parse(siteJson);
                _siteId = siteDoc.RootElement.GetProperty("id").GetString() ?? "";
            }

            if (!string.IsNullOrEmpty(_siteId))
            {
                string listsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists";
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
                                _listId = l.GetProperty("id").GetString() ?? "";
                                break;
                            }
                        }
                    }
                }
            }
        }

        public async Task SyncServiceInventoryAsync(
            string title,
            string hostname,
            string praca,
            int cs,
            string nomeServico,
            string versaoInstalada,
            string statusServico,
            string urlComunicacao)
        {
            string nowIso = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId))
                {
                    FileLogger.LogError($"Falha ao estabelecer contexto no SharePoint para [{hostname}_{nomeServico}]");
                    return;
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    // Buscar itens da lista para fazer match por Hostname + Nome_Servico
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$top=500";
                    var getResp = await client.GetAsync(getItemsUrl);

                    string itemId = string.Empty;
                    if (getResp.IsSuccessStatusCode)
                    {
                        string getJson = await getResp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(getJson);
                        if (doc.RootElement.TryGetProperty("value", out var valueArray))
                        {
                            foreach (var item in valueArray.EnumerateArray())
                            {
                                if (item.TryGetProperty("fields", out var fields))
                                {
                                    string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString() ?? "" : "";
                                    string itemSrv = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString() ?? "" : "";

                                    if (itemHost.Equals(hostname, StringComparison.OrdinalIgnoreCase) && itemSrv.Equals(nomeServico, StringComparison.OrdinalIgnoreCase))
                                    {
                                        itemId = item.GetProperty("id").GetString() ?? "";
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    string safePraca = string.IsNullOrWhiteSpace(praca) ? "Não Informado" : praca;
                    int safeCS = cs <= 0 ? 1 : cs;
                    string displayTitle = string.IsNullOrWhiteSpace(title) ? "Brasil" : title;

                    var fieldsPayload = new Dictionary<string, object>
                    {
                        { "Title", displayTitle },
                        { "Hostname", hostname },
                        { "Pra_x00e7_a", safePraca },
                        { "CS", safeCS },
                        { "Nome_Servico", nomeServico },
                        { "Versao_Instalada", versaoInstalada },
                        { "Status_Servico", statusServico },
                        { "Ultima_atualizacao", nowIso },
                        { "Url_Comunicacao", urlComunicacao }
                    };

                    if (string.IsNullOrEmpty(itemId))
                    {
                        fieldsPayload["Versao_Desejada"] = versaoInstalada;
                        fieldsPayload["Acao_Solicitada"] = "Nenhuma";
                        fieldsPayload["Status_Atualizacao"] = "Aguardando";
                        fieldsPayload["Url_Comunicacao_Desejavel"] = "https://mediadna.ibope.com/mediadnawcfcs/RemoteHostsService.svc";
                        fieldsPayload["Acao_Solicitada_Url"] = "Nenhuma";

                        var itemPayload = new { fields = fieldsPayload };
                        string createUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items";
                        var content = new StringContent(JsonSerializer.Serialize(itemPayload), Encoding.UTF8, "application/json");

                        var createResp = await client.PostAsync(createUrl, content);
                        if (createResp.IsSuccessStatusCode)
                        {
                            FileLogger.Log($"[SharePointClient] ✅ Novo item cadastrado no SharePoint: [{displayTitle}] {hostname}_{nomeServico}");
                        }
                        else
                        {
                            string err = await createResp.Content.ReadAsStringAsync();
                            FileLogger.LogError($"[SharePointClient] ❌ Erro ao criar item no SharePoint [{hostname}_{nomeServico}]: {err}");
                        }
                    }
                    else
                    {
                        string patchUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{itemId}/fields";
                        var content = new StringContent(JsonSerializer.Serialize(fieldsPayload), Encoding.UTF8, "application/json");
                        var request = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) { Content = content };

                        var patchResp = await client.SendAsync(request);
                        if (patchResp.IsSuccessStatusCode)
                        {
                            FileLogger.Log($"[SharePointClient] ✅ Registro atualizado no SharePoint (ID {itemId}): [{displayTitle}] {hostname}_{nomeServico}");
                        }
                        else
                        {
                            string err = await patchResp.Content.ReadAsStringAsync();
                            FileLogger.LogError($"[SharePointClient] ❌ Erro ao atualizar item no SharePoint [{hostname}_{nomeServico}]: {err}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao sincronizar inventário no SharePoint [{hostname}_{nomeServico}]", ex);
                }
            }
        }

        public async Task<List<PendingActionItem>> GetPendingUrlActionsAsync(string hostname)
        {
            var list = new List<PendingActionItem>();
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
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$top=500";
                    var resp = await client.GetAsync(getItemsUrl);
                    if (resp.IsSuccessStatusCode)
                    {
                        string json = await resp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var itemsArray))
                        {
                            foreach (var item in itemsArray.EnumerateArray())
                            {
                                if (item.TryGetProperty("fields", out var fields))
                                {
                                    string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString() ?? "" : "";
                                    string acaoUrl = fields.TryGetProperty("Acao_Solicitada_Url", out var au) ? au.GetString() ?? "" : "";

                                    if (itemHost.Equals(hostname, StringComparison.OrdinalIgnoreCase) &&
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
            string newUrl)
        {
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
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$top=500";
                    var getResp = await client.GetAsync(getItemsUrl);
                    if (getResp.IsSuccessStatusCode)
                    {
                        string json = await getResp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var valueArray))
                        {
                            foreach (var item in valueArray.EnumerateArray())
                            {
                                if (item.TryGetProperty("fields", out var fields))
                                {
                                    string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString() ?? "" : "";
                                    string itemSrv = fields.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString() ?? "" : "";

                                    if (itemHost.Equals(hostname, StringComparison.OrdinalIgnoreCase) && itemSrv.Equals(nomeServico, StringComparison.OrdinalIgnoreCase))
                                    {
                                        string itemId = item.GetProperty("id").GetString() ?? "";

                                        var patchData = new Dictionary<string, object>
                                        {
                                            { "Acao_Solicitada_Url", "Nenhuma" },
                                            { "Url_Comunicacao", newUrl },
                                            { "Status_Atualizacao", statusAtualizacao },
                                            { "Ultima_atualizacao", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") }
                                        };

                                        string patchUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{itemId}/fields";
                                        var content = new StringContent(JsonSerializer.Serialize(patchData), Encoding.UTF8, "application/json");
                                        var request = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) { Content = content };

                                        await client.SendAsync(request);
                                        FileLogger.Log($"[SharePointClient] Status de URL atualizado no SharePoint [{hostname}_{nomeServico}]: {statusAtualizacao}");
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao atualizar status de URL no SharePoint [{hostname}_{nomeServico}]", ex);
                }
            }
        }

        public async Task<List<PendingActionItem>> GetPendingActionsAsync(string hostname)
        {
            var list = new List<PendingActionItem>();
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
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$top=500";
                    var resp = await client.GetAsync(getItemsUrl);
                    if (resp.IsSuccessStatusCode)
                    {
                        string json = await resp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var itemsArray))
                        {
                            foreach (var item in itemsArray.EnumerateArray())
                            {
                                if (item.TryGetProperty("fields", out var fields))
                                {
                                    string itemHost = fields.TryGetProperty("Hostname", out var h) ? h.GetString() ?? "" : "";
                                    string acao = fields.TryGetProperty("Acao_Solicitada", out var ac) ? ac.GetString() ?? "" : "";

                                    if (itemHost.Equals(hostname, StringComparison.OrdinalIgnoreCase) &&
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
                                            StatusAtualizacao = fields.TryGetProperty("Status_Atualizacao", out var sa) ? sa.GetString() ?? "" : ""
                                        });
                                    }
                                }
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

        public async Task UpdateActionStatusAsync(
            string title,
            string statusAtualizacao,
            string? acaoSolicitada = null,
            string? versaoInstalada = null)
        {
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
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$top=500";
                    var getResp = await client.GetAsync(getItemsUrl);
                    if (getResp.IsSuccessStatusCode)
                    {
                        string json = await getResp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var valueArray))
                        {
                            foreach (var item in valueArray.EnumerateArray())
                            {
                                if (item.TryGetProperty("fields", out var fields))
                                {
                                    string itemTitle = fields.TryGetProperty("Title", out var t) ? t.GetString() ?? "" : "";
                                    if (itemTitle.Equals(title, StringComparison.OrdinalIgnoreCase))
                                    {
                                        string itemId = item.GetProperty("id").GetString() ?? "";

                                        var patchData = new Dictionary<string, object>
                                        {
                                            { "Status_Atualizacao", statusAtualizacao },
                                            { "Ultima_atualizacao", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") }
                                        };

                                        if (acaoSolicitada != null) patchData["Acao_Solicitada"] = acaoSolicitada;
                                        if (versaoInstalada != null) patchData["Versao_Instalada"] = versaoInstalada;

                                        string patchUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items/{itemId}/fields";
                                        var content = new StringContent(JsonSerializer.Serialize(patchData), Encoding.UTF8, "application/json");
                                        var request = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) { Content = content };

                                        await client.SendAsync(request);
                                        FileLogger.Log($"[SharePointClient] Status atualizado no SharePoint [{title}]: {statusAtualizacao}");
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    FileLogger.LogError($"Erro ao atualizar status no SharePoint [{title}]", ex);
                }
            }
        }
    }
}
