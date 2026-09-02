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
        private readonly string _siteUrl;
        private readonly string _listName;
        private readonly string _clientId;
        private readonly string _clientSecret;
        private string _accessToken = string.Empty;

        public SharePointClient(string siteUrl, string listName, string clientId, string clientSecret)
        {
            _siteUrl = siteUrl?.TrimEnd('/') ?? string.Empty;
            _listName = listName ?? "Controle_Servicos";
            _clientId = clientId ?? string.Empty;
            _clientSecret = clientSecret ?? string.Empty;
        }

        private async Task EnsureAccessTokenAsync(HttpClient client)
        {
            if (!string.IsNullOrEmpty(_accessToken) || string.IsNullOrEmpty(_clientId))
            {
                return;
            }

            try
            {
                // Obter Access Token do Azure AD OAuth 2.0 Client Credentials
                string tenantDomain = new Uri(_siteUrl).Host;
                string tokenUrl = $"https://login.microsoftonline.com/common/oauth2/v2.0/token";

                var requestBody = new Dictionary<string, string>
                {
                    { "grant_type", "client_credentials" },
                    { "client_id", _clientId },
                    { "client_secret", _clientSecret },
                    { "scope", "https://graph.microsoft.com/.default" }
                };

                var resp = await client.PostAsync(tokenUrl, new FormUrlEncodedContent(requestBody));
                if (resp.IsSuccessStatusCode)
                {
                    string json = await resp.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("access_token", out var tokenProp))
                    {
                        _accessToken = tokenProp.GetString() ?? string.Empty;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SharePointClient] Aviso no token OAuth: {ex.Message}");
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
                await EnsureAccessTokenAsync(client);
                if (!string.IsNullOrEmpty(_accessToken))
                {
                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                }

                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                try
                {
                    // 1. Verificar se item já existe
                    string getUrl = $"{_siteUrl}/_api/web/lists/getbytitle('{_listName}')/items?$filter=Title eq '{title}'";
                    var getResp = await client.GetAsync(getUrl);

                    int existingItemId = -1;
                    if (getResp.IsSuccessStatusCode)
                    {
                        string getJson = await getResp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(getJson);
                        if (doc.RootElement.TryGetProperty("value", out var valueArray) && valueArray.GetArrayLength() > 0)
                        {
                            existingItemId = valueArray[0].GetProperty("Id").GetInt32();
                        }
                    }

                    var payload = new Dictionary<string, object>
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

                    if (existingItemId == -1)
                    {
                        // Criar novo item
                        payload["Versao_Desejada"] = versaoInstalada;
                        payload["Acao_Solicitada"] = "Nenhuma";
                        payload["Status_Atualizacao"] = "Aguardando";

                        string postUrl = $"{_siteUrl}/_api/web/lists/getbytitle('{_listName}')/items";
                        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                        await client.PostAsync(postUrl, content);
                        Console.WriteLine($"[SharePointClient] Novo item criado no SharePoint: {title}");
                    }
                    else
                    {
                        // Atualizar item existente
                        string patchUrl = $"{_siteUrl}/_api/web/lists/getbytitle('{_listName}')/items({existingItemId})";
                        var updatePayload = new Dictionary<string, object>
                        {
                            { "Hostname", hostname },
                            { "CS", cs },
                            { "Versao_Instalada", versaoInstalada },
                            { "Status_Servico", statusServico },
                            { "Ultima_atualizacao", nowIso },
                            { "Url_Comunicacao", urlComunicacao }
                        };

                        var request = new HttpRequestMessage(new HttpMethod("MERGE"), patchUrl)
                        {
                            Content = new StringContent(JsonSerializer.Serialize(updatePayload), Encoding.UTF8, "application/json")
                        };
                        request.Headers.Add("IF-MATCH", "*");
                        await client.SendAsync(request);
                        Console.WriteLine($"[SharePointClient] Item atualizado no SharePoint: {title}");
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
                await EnsureAccessTokenAsync(client);
                if (!string.IsNullOrEmpty(_accessToken))
                {
                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                }
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                try
                {
                    string queryUrl = $"{_siteUrl}/_api/web/lists/getbytitle('{_listName}')/items?$filter=Hostname eq '{hostname}' and Acao_Solicitada ne 'Nenhuma'";
                    var resp = await client.GetAsync(queryUrl);
                    if (resp.IsSuccessStatusCode)
                    {
                        string json = await resp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var items))
                        {
                            foreach (var item in items.EnumerateArray())
                            {
                                list.Add(new PendingActionItem
                                {
                                    Id = item.GetProperty("Id").GetInt32(),
                                    Title = item.GetProperty("Title").GetString() ?? "",
                                    NomeServico = item.TryGetProperty("Nome_Servico", out var ns) ? ns.GetString() ?? "" : "",
                                    VersaoInstalada = item.TryGetProperty("Versao_Instalada", out var vi) ? vi.GetString() ?? "" : "",
                                    VersaoDesejada = item.TryGetProperty("Versao_Desejada", out var vd) ? vd.GetString() ?? "" : "",
                                    AcaoSolicitada = item.TryGetProperty("Acao_Solicitada", out var ac) ? ac.GetString() ?? "" : "",
                                    StatusAtualizacao = item.TryGetProperty("Status_Atualizacao", out var sa) ? sa.GetString() ?? "" : ""
                                });
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
                await EnsureAccessTokenAsync(client);
                if (!string.IsNullOrEmpty(_accessToken))
                {
                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                }
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                try
                {
                    string getUrl = $"{_siteUrl}/_api/web/lists/getbytitle('{_listName}')/items?$filter=Title eq '{title}'";
                    var getResp = await client.GetAsync(getUrl);
                    if (getResp.IsSuccessStatusCode)
                    {
                        string json = await getResp.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var valueArray) && valueArray.GetArrayLength() > 0)
                        {
                            int id = valueArray[0].GetProperty("Id").GetInt32();
                            string patchUrl = $"{_siteUrl}/_api/web/lists/getbytitle('{_listName}')/items({id})";

                            var patchData = new Dictionary<string, object>
                            {
                                { "Status_Atualizacao", statusAtualizacao },
                                { "Ultima_atualizacao", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") }
                            };

                            if (acaoSolicitada != null)
                            {
                                patchData["Acao_Solicitada"] = acaoSolicitada;
                            }
                            if (versaoInstalada != null)
                            {
                                patchData["Versao_Instalada"] = versaoInstalada;
                            }

                            var request = new HttpRequestMessage(new HttpMethod("MERGE"), patchUrl)
                            {
                                Content = new StringContent(JsonSerializer.Serialize(patchData), Encoding.UTF8, "application/json")
                            };
                            request.Headers.Add("IF-MATCH", "*");
                            await client.SendAsync(request);
                            Console.WriteLine($"[SharePointClient] Status da ação atualizado no SharePoint [{title}]: {statusAtualizacao}");
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
