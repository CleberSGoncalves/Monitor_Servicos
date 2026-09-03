using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public static class GitHubDownloader
    {
        public static async Task<string?> GetLatestReleaseVersionAsync(string githubRepo, string token)
        {
            if (string.IsNullOrWhiteSpace(githubRepo)) return null;

            try
            {
                using (var client = new HttpClient())
                {
                    client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("WinServiceFleetAgent", "1.0"));
                    if (!string.IsNullOrWhiteSpace(token))
                    {
                        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    }
                    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));

                    string url = $"https://api.github.com/repos/{githubRepo}/releases/latest";
                    var response = await client.GetAsync(url);
                    if (response.IsSuccessStatusCode)
                    {
                        string jsonString = await response.Content.ReadAsStringAsync();
                        using (var doc = JsonDocument.Parse(jsonString))
                        {
                            if (doc.RootElement.TryGetProperty("tag_name", out var tagProp))
                            {
                                string tag = tagProp.GetString() ?? "";
                                return tag.TrimStart('v', 'V');
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[GitHubDownloader] Erro ao consultar última versão do GitHub para '{githubRepo}'", ex);
            }

            return null;
        }

        public static async Task<string> DownloadAndExtractReleaseAsync(
            string githubRepo,
            string tagName,
            string token,
            string targetDir)
        {
            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            using (var client = new HttpClient())
            {
                client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("WinServiceFleetAgent", "1.0"));
                if (!string.IsNullOrWhiteSpace(token))
                {
                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                }
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));

                string cleanTag = tagName.Trim();
                string url = cleanTag.Equals("latest", StringComparison.OrdinalIgnoreCase)
                    ? $"https://api.github.com/repos/{githubRepo}/releases/latest"
                    : $"https://api.github.com/repos/{githubRepo}/releases/tags/{cleanTag}";

                Console.WriteLine($"[GitHubDownloader] Consultando release no GitHub: {url}");
                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    string errContent = await response.Content.ReadAsStringAsync();
                    throw new Exception($"Falha ao consultar release '{cleanTag}' em '{githubRepo}' (HTTP {(int)response.StatusCode}): {errContent}");
                }

                string jsonString = await response.Content.ReadAsStringAsync();
                using (var doc = JsonDocument.Parse(jsonString))
                {
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("assets", out var assets) || assets.GetArrayLength() == 0)
                    {
                        throw new Exception($"Nenhum asset encontrado na release '{cleanTag}'.");
                    }

                    string assetUrl = string.Empty;
                    string assetName = string.Empty;

                    foreach (var asset in assets.EnumerateArray())
                    {
                        string name = asset.GetProperty("name").GetString() ?? "";
                        if (name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                        {
                            assetUrl = asset.GetProperty("url").GetString() ?? "";
                            assetName = name;
                            break;
                        }
                    }

                    if (string.IsNullOrEmpty(assetUrl))
                    {
                        throw new Exception($"Nenhum asset .zip encontrado na release '{cleanTag}'.");
                    }

                    Console.WriteLine($"[GitHubDownloader] Baixando asset '{assetName}'...");

                    using (var downloadReq = new HttpRequestMessage(HttpMethod.Get, assetUrl))
                    {
                        downloadReq.Headers.Accept.Clear();
                        downloadReq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));

                        var downloadResp = await client.SendAsync(downloadReq, HttpCompletionOption.ResponseHeadersRead);
                        if (!downloadResp.IsSuccessStatusCode)
                        {
                            throw new Exception($"Erro ao baixar asset binário (HTTP {(int)downloadResp.StatusCode}).");
                        }

                        string zipFilePath = Path.Combine(targetDir, assetName);
                        using (var streamToReadFrom = await downloadResp.Content.ReadAsStreamAsync())
                        using (var streamToWriteTo = File.Open(zipFilePath, FileMode.Create))
                        {
                            await streamToReadFrom.CopyToAsync(streamToWriteTo);
                        }

                        Console.WriteLine($"[GitHubDownloader] Extraindo '{zipFilePath}' para '{targetDir}'...");
                        ZipFile.ExtractToDirectory(zipFilePath, targetDir, overwriteFiles: true);

                        try
                        {
                            File.Delete(zipFilePath);
                        }
                        catch { }

                        return targetDir;
                    }
                }
            }
        }
    }
}
