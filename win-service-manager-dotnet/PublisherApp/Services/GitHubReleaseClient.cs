using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace PublisherApp.Services
{
    public static class GitHubReleaseClient
    {
        public static async Task<string> CreateReleaseAndUploadAssetAsync(
            string owner,
            string repo,
            string tagName,
            string title,
            string changelog,
            string zipFilePath,
            string githubToken)
        {
            if (string.IsNullOrWhiteSpace(githubToken))
            {
                throw new ArgumentException("GitHub Token não pode ser vazio.");
            }

            if (!File.Exists(zipFilePath))
            {
                throw new FileNotFoundException($"Arquivo .zip não encontrado: {zipFilePath}");
            }

            using (var client = new HttpClient())
            {
                client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("PublisherApp", "1.0"));
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", githubToken);
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));

                // 1. Criar Release no GitHub
                string createReleaseUrl = $"https://api.github.com/repos/{owner}/{repo}/releases";
                var releasePayload = new
                {
                    tag_name = tagName,
                    target_commitish = "main",
                    name = string.IsNullOrWhiteSpace(title) ? tagName : title,
                    body = changelog,
                    draft = false,
                    prerelease = false
                };

                var content = new StringContent(JsonSerializer.Serialize(releasePayload), Encoding.UTF8, "application/json");
                Console.WriteLine($"[Publisher] Criando Release '{tagName}' em '{owner}/{repo}'...");

                var response = await client.PostAsync(createReleaseUrl, content);
                string responseBody = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    throw new Exception($"Falha ao criar release no GitHub (HTTP {(int)response.StatusCode}): {responseBody}");
                }

                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;
                string uploadUrlTemplate = root.GetProperty("upload_url").GetString() ?? "";
                string htmlUrl = root.GetProperty("html_url").GetString() ?? "";

                // Limpar template especificador '{?name,label}' da URL de upload
                int idx = uploadUrlTemplate.IndexOf('{');
                string cleanUploadUrl = idx > 0 ? uploadUrlTemplate.Substring(0, idx) : uploadUrlTemplate;

                string filename = Path.GetFileName(zipFilePath);
                string targetAssetUrl = $"{cleanUploadUrl}?name={Uri.EscapeDataString(filename)}";

                Console.WriteLine($"[Publisher] Enviando arquivo '{filename}' ({new FileInfo(zipFilePath).Length} bytes)...");

                using (var fileStream = File.OpenRead(zipFilePath))
                using (var uploadReq = new HttpRequestMessage(HttpMethod.Post, targetAssetUrl))
                {
                    uploadReq.Content = new StreamContent(fileStream);
                    uploadReq.Content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");

                    var uploadResp = await client.SendAsync(uploadReq);
                    string uploadRespBody = await uploadResp.Content.ReadAsStringAsync();

                    if (!uploadResp.IsSuccessStatusCode)
                    {
                        throw new Exception($"Falha ao fazer upload do asset .zip (HTTP {(int)uploadResp.StatusCode}): {uploadRespBody}");
                    }

                    Console.WriteLine($"[Publisher] Asset enviado com sucesso!");
                    return htmlUrl;
                }
            }
        }
    }
}
