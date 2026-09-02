using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace PublisherApp.Services
{
    public static class SharePointPublisherSync
    {
        private static readonly string TenantId = "b2767241-fab5-454b-8b62-f6324650e316";
        private static readonly string ClientId = "1950a258-227b-4e31-a9cf-717495945fc2";
        private static readonly string SiteHost = "adgbl.sharepoint.com";
        private static readonly string SitePath = "/sites/suportecaptacao";
        private static readonly string Username = "svc.captacao@adgbl.com";
        private static readonly string Password = "Acount@!2026";

        public static async Task UpdateDesiredVersionInSharePointAsync(
            string serviceName,
            string newVersionTag,
            string siteUrl,
            string listName,
            string clientId,
            string clientSecret)
        {
            string targetListName = string.IsNullOrWhiteSpace(listName) ? "Painel de gestão de serviços dos CS" : listName;

            string targetServiceName = serviceName;
            if (!targetServiceName.StartsWith("DNA.", StringComparison.OrdinalIgnoreCase))
            {
                targetServiceName = $"DNA.{serviceName}";
            }

            using (var client = new HttpClient())
            {
                try
                {
                    // 1. Token via Microsoft Graph API v2.0
                    string tokenUrl = $"https://login.microsoftonline.com/{TenantId}/oauth2/v2.0/token";
                    var tokenReq = new Dictionary<string, string>
                    {
                        { "grant_type", "password" },
                        { "client_id", ClientId },
                        { "username", Username },
                        { "password", Password },
                        { "scope", "https://graph.microsoft.com/.default" }
                    };

                    var tokenResp = await client.PostAsync(tokenUrl, new FormUrlEncodedContent(tokenReq));
                    if (!tokenResp.IsSuccessStatusCode)
                    {
                        return;
                    }

                    string tokenJson = await tokenResp.Content.ReadAsStringAsync();
                    string accessToken = string.Empty;
                    using (var doc = JsonDocument.Parse(tokenJson))
                    {
                        accessToken = doc.RootElement.GetProperty("access_token").GetString() ?? "";
                    }

                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

                    // 2. Site ID
                    string siteGraphUrl = $"https://graph.microsoft.com/v1.0/sites/{SiteHost}:{SitePath}";
                    var siteResp = await client.GetAsync(siteGraphUrl);
                    if (!siteResp.IsSuccessStatusCode) return;

                    string siteId = JsonDocument.Parse(await siteResp.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetString() ?? "";

                    // 3. List ID
                    string listsUrl = $"https://graph.microsoft.com/v1.0/sites/{siteId}/lists";
                    var listsResp = await client.GetAsync(listsUrl);
                    if (!listsResp.IsSuccessStatusCode) return;

                    string listId = string.Empty;
                    using (var listsDoc = JsonDocument.Parse(await listsResp.Content.ReadAsStringAsync()))
                    {
                        if (listsDoc.RootElement.TryGetProperty("value", out var listsArray))
                        {
                            foreach (var l in listsArray.EnumerateArray())
                            {
                                if (l.GetProperty("displayName").GetString()?.Equals(targetListName, StringComparison.OrdinalIgnoreCase) == true)
                                {
                                    listId = l.GetProperty("id").GetString() ?? "";
                                    break;
                                }
                            }
                        }
                    }

                    if (string.IsNullOrEmpty(listId)) return;

                    Console.WriteLine($"[SharePointSync] Atualizando 'Versao_Desejada' = '{newVersionTag}' para o serviço '{targetServiceName}' no SharePoint...");

                    // 4. Buscar e atualizar itens
                    string getItemsUrl = $"https://graph.microsoft.com/v1.0/sites/{siteId}/lists/{listId}/items?expand=fields&$filter=fields/Nome_Servico eq '{targetServiceName}' or fields/Nome_Servico eq '{serviceName}'";
                    var itemsResp = await client.GetAsync(getItemsUrl);

                    if (itemsResp.IsSuccessStatusCode)
                    {
                        using var itemsDoc = JsonDocument.Parse(await itemsResp.Content.ReadAsStringAsync());
                        if (itemsDoc.RootElement.TryGetProperty("value", out var itemsArray))
                        {
                            int updatedCount = 0;
                            foreach (var item in itemsArray.EnumerateArray())
                            {
                                string itemId = item.GetProperty("id").GetString() ?? "";
                                string patchUrl = $"https://graph.microsoft.com/v1.0/sites/{siteId}/lists/{listId}/items/{itemId}/fields";

                                var patchData = new Dictionary<string, object>
                                {
                                    { "Versao_Desejada", newVersionTag }
                                };

                                var content = new StringContent(JsonSerializer.Serialize(patchData), Encoding.UTF8, "application/json");
                                var request = new HttpRequestMessage(new HttpMethod("PATCH"), patchUrl) { Content = content };

                                var patchResp = await client.SendAsync(request);
                                if (patchResp.IsSuccessStatusCode)
                                {
                                    updatedCount++;
                                }
                            }

                            Console.WriteLine($"[SharePointSync] ✅ Versao_Desejada '{newVersionTag}' atualizada com sucesso em {updatedCount} registros no SharePoint!");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SharePointSync] Erro ao sincronizar SharePoint: {ex.Message}");
                }
            }
        }
    }
}
