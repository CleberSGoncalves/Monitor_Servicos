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
        public static async Task UpdateDesiredVersionInSharePointAsync(
            string serviceName,
            string newVersionTag,
            string siteUrl,
            string listName,
            string clientId,
            string clientSecret)
        {
            if (string.IsNullOrWhiteSpace(siteUrl) || string.IsNullOrWhiteSpace(listName))
            {
                return;
            }

            // Normalizar nome do serviço se necessário
            string targetServiceName = serviceName;
            if (!targetServiceName.StartsWith("DNA.", StringComparison.OrdinalIgnoreCase))
            {
                targetServiceName = $"DNA.{serviceName}";
            }

            using (var client = new HttpClient())
            {
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                // Obter Access Token OAuth se ClientId for fornecido
                if (!string.IsNullOrWhiteSpace(clientId) && !string.IsNullOrWhiteSpace(clientSecret))
                {
                    try
                    {
                        string tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
                        var tokenReq = new Dictionary<string, string>
                        {
                            { "grant_type", "client_credentials" },
                            { "client_id", clientId },
                            { "client_secret", clientSecret },
                            { "scope", "https://graph.microsoft.com/.default" }
                        };

                        var tokenResp = await client.PostAsync(tokenUrl, new FormUrlEncodedContent(tokenReq));
                        if (tokenResp.IsSuccessStatusCode)
                        {
                            string json = await tokenResp.Content.ReadAsStringAsync();
                            using var doc = JsonDocument.Parse(json);
                            if (doc.RootElement.TryGetProperty("access_token", out var tokenProp))
                            {
                                string token = tokenProp.GetString() ?? "";
                                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SharePointSync] Aviso ao obter token OAuth: {ex.Message}");
                    }
                }

                try
                {
                    string cleanSiteUrl = siteUrl.TrimEnd('/');
                    string queryUrl = $"{cleanSiteUrl}/_api/web/lists/getbytitle('{listName}')/items?$filter=Nome_Servico eq '{targetServiceName}' or Nome_Servico eq '{serviceName}'";

                    Console.WriteLine($"[SharePointSync] Atualizando 'Versao_Desejada' = '{newVersionTag}' para o serviço '{targetServiceName}' no SharePoint...");

                    var response = await client.GetAsync(queryUrl);
                    if (response.IsSuccessStatusCode)
                    {
                        string json = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.TryGetProperty("value", out var items))
                        {
                            int updatedCount = 0;
                            foreach (var item in items.EnumerateArray())
                            {
                                int id = item.GetProperty("Id").GetInt32();
                                string title = item.TryGetProperty("Title", out var t) ? t.GetString() ?? "" : "";

                                string patchUrl = $"{cleanSiteUrl}/_api/web/lists/getbytitle('{listName}')/items({id})";
                                var patchData = new Dictionary<string, object>
                                {
                                    { "Versao_Desejada", newVersionTag }
                                };

                                var request = new HttpRequestMessage(new HttpMethod("MERGE"), patchUrl)
                                {
                                    Content = new StringContent(JsonSerializer.Serialize(patchData), Encoding.UTF8, "application/json")
                                };
                                request.Headers.Add("IF-MATCH", "*");
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
