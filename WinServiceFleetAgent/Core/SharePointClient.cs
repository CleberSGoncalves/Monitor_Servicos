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
            
            // Garantir que usa o Client ID que comprovadamente funciona no tenant adgbl
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

            // 1. Autenticar no Microsoft Graph API v2.0
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
                Console.WriteLine($"[SharePointClient] Erro ao autenticar no Graph API: {errStr}");
                return;
            }

            string tokenJson = await tokenResp.Content.ReadAsStringAsync();
            using (var doc = JsonDocument.Parse(tokenJson))
            {
                _accessToken = doc.RootElement.GetProperty("access_token").GetString() ?? "";
            }

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

            // 2. Obter Site ID
            string siteGraphUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteHost}:{_sitePath}";
            var siteResp = await client.GetAsync(siteGraphUrl);
            if (siteResp.IsSuccessStatusCode)
            {
                string siteJson = await siteResp.Content.ReadAsStringAsync();
                using var siteDoc = JsonDocument.Parse(siteJson);
                _siteId = siteDoc.RootElement.GetProperty("id").GetString() ?? "";
            }

            // 3. Obter List ID
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
            string hostname,
            string praca,
            int cs,
            string nomeServico,
            string versaoInstalada,
            string statusServico,
            string urlComunicacao)
        {
            string title = $"{hostname}_{nomeServico}";
            string nowIso = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");

            using (var client = new HttpClient())
            {
                await EnsureGraphContextAsync(client);
                if (string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_listId))
                {
                    Console.WriteLine($"[SharePointClient] Falha ao estabelecer contexto no SharePoint para [{title}]");
                    return;
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

                try
                {
                    // Buscar se o item já existe por Title
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$filter=fields/Title eq '{title}'";
                    var getResp = await client.GetAsync(getItemsUrl);

                    string itemId = string.Empty;
                    if (getResp.IsSuccessStatusCode)
                    {
                        string getJson = await getResp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(getJson);
                        if (doc.RootElement.TryGetProperty("value", out var valueArray) && valueArray.GetArrayLength() > 0)
                        {
                            itemId = valueArray[0].GetProperty("id").GetString() ?? "";
                        }
                    }

                    var fieldsPayload = new Dictionary<string, object>
                    {
                        { "Title", title },
                        { "Hostname", hostname },
                        { "Praca", praca },
                        { "CS", cs },
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

                        var itemPayload = new { fields = fieldsPayload };
                        string createUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items";
                        var content = new StringContent(JsonSerializer.Serialize(itemPayload), Encoding.UTF8, "application/json");

                        var createResp = await client.PostAsync(createUrl, content);
                        if (createResp.IsSuccessStatusCode)
                        {
                            Console.WriteLine($"[SharePointClient] ✅ Novo item cadastrado no SharePoint: {title}");
                        }
                        else
                        {
                            string err = await createResp.Content.ReadAsStringAsync();
                            Console.WriteLine($"[SharePointClient] ❌ Erro ao criar item no SharePoint [{title}]: {err}");
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
                            Console.WriteLine($"[SharePointClient] ✅ Registro atualizado no SharePoint: {title}");
                        }
                        else
                        {
                            string err = await patchResp.Content.ReadAsStringAsync();
                            Console.WriteLine($"[SharePointClient] ❌ Erro ao atualizar item no SharePoint [{title}]: {err}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SharePointClient] Erro ao sincronizar inventário no SharePoint [{title}]: {ex.Message}");
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
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$filter=fields/Hostname eq '{hostname}' and fields/Acao_Solicitada ne 'Nenhuma'";
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
                                        AcaoSolicitada = fields.TryGetProperty("Acao_Solicitada", out var ac) ? ac.GetString() ?? "" : "",
                                        StatusAtualizacao = fields.TryGetProperty("Status_Atualizacao", out var sa) ? sa.GetString() ?? "" : ""
                                    });
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SharePointClient] Erro ao buscar ações pendentes: {ex.Message}");
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
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{_siteId}/lists/{_listId}/items?expand=fields&$filter=fields/Title eq '{title}'";
                    var getResp = await client.GetAsync(getItemsUrl);
                    if (getResp.IsSuccessStatusCode)
                    {
                        string json = await getResp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var valueArray) && valueArray.GetArrayLength() > 0)
                        {
                            string itemId = valueArray[0].GetProperty("id").GetString() ?? "";

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
                            Console.WriteLine($"[SharePointClient] Status atualizado no SharePoint [{title}]: {statusAtualizacao}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SharePointClient] Erro ao atualizar status no SharePoint [{title}]: {ex.Message}");
                }
            }
        }
    }
}
