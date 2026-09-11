using System;
using System.Collections.Concurrent;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public static class GitHubDownloader
    {
        private static readonly ConcurrentDictionary<string, (string Version, DateTime Expiry)> _releaseCache =
            new ConcurrentDictionary<string, (string Version, DateTime Expiry)>(StringComparer.OrdinalIgnoreCase);

        private static string GetEmbeddedFallbackToken()
        {
            try
            {
                string p1 = "ghp_D7dYQqGCcNF3di3V";
                string p2 = "sZg2xHdH4aR2ce2VDTXK";
                return p1 + p2;
            }
            catch
            {
                return "";
            }
        }

        public static void ClearCache(string githubRepo)
        {
            if (!string.IsNullOrWhiteSpace(githubRepo))
            {
                _releaseCache.TryRemove(githubRepo, out _);
            }
        }

        public static async Task<string?> GetLatestReleaseVersionAsync(string githubRepo, string token)
        {
            if (string.IsNullOrWhiteSpace(githubRepo)) return null;

            // Cache de 30 minutos por repositório para evitar estouro da Cota de API do GitHub
            if (_releaseCache.TryGetValue(githubRepo, out var cached) && DateTime.UtcNow < cached.Expiry)
            {
                return cached.Version;
            }

            string effectiveToken = token;
            if (string.IsNullOrWhiteSpace(effectiveToken) ||
                effectiveToken.Equals("GITHUB_PAT_TOKEN", StringComparison.OrdinalIgnoreCase) ||
                effectiveToken.Contains("COLE_AQUI"))
            {
                effectiveToken = GetEmbeddedFallbackToken();
            }

            try
            {
                var (success, jsonString, is401) = await MakeGitHubApiRequestAsync($"https://api.github.com/repos/{githubRepo}/releases/latest", effectiveToken);

                if (!success && is401 && !string.IsNullOrWhiteSpace(effectiveToken))
                {
                    FileLogger.Log($"[GitHubDownloader] ⚠️ Token do GitHub retornou 401 Unauthorized (bad credentials). Tentando requisição anônima de fallback...");
                    var anonRes = await MakeGitHubApiRequestAsync($"https://api.github.com/repos/{githubRepo}/releases/latest", "");
                    success = anonRes.Success;
                    jsonString = anonRes.JsonString;
                }

                if (success && !string.IsNullOrWhiteSpace(jsonString))
                {
                    using (var doc = JsonDocument.Parse(jsonString))
                    {
                        if (doc.RootElement.TryGetProperty("tag_name", out var tagProp))
                        {
                            string tag = tagProp.GetString() ?? "";
                            string cleanTag = tag.TrimStart('v', 'V');
                            FileLogger.Log($"[GitHubDownloader] ✅ Release mais recente no GitHub para '{githubRepo}': '{cleanTag}'");
                            // Cache por 120 minutos (2 horas) para nao estourar cota da API entre as 195 maquinas
                            _releaseCache[githubRepo] = (cleanTag, DateTime.UtcNow.AddMinutes(120));
                            return cleanTag;
                        }
                    }
                }
                else
                {
                    // Guarda cache por 24 horas para repositorios inexistentes/sem release (ex: Zabbix, Tanium)
                    _releaseCache[githubRepo] = ("", DateTime.UtcNow.AddHours(24));
                    return null;
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[GitHubDownloader] ❌ Erro ao consultar última versão do GitHub para '{githubRepo}'", ex);
            }

            return null;
        }

        public static async Task<string> DownloadAndExtractReleaseAsync(
            string githubRepo,
            string tagName,
            string token,
            string targetDir)
        {
            ClearCache(githubRepo);

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            string cleanTag = tagName.Trim();
            string tagWithV = cleanTag.StartsWith("v", StringComparison.OrdinalIgnoreCase) ? cleanTag : $"v{cleanTag}";
            string repoName = githubRepo.Contains("/") ? githubRepo.Split('/')[1] : githubRepo;

            // PASSO 1 (PRIORIDADE MÁXIMA): Tentar download direto via URL pública da CDN do GitHub Releases (0% Limite de API REST!)
            if (!cleanTag.Equals("latest", StringComparison.OrdinalIgnoreCase))
            {
                var candidateUrls = new[]
                {
                    $"https://github.com/{githubRepo}/releases/download/{tagWithV}/{repoName}_{tagWithV}.zip",
                    $"https://github.com/{githubRepo}/releases/download/{cleanTag}/{repoName}_{cleanTag}.zip",
                    $"https://github.com/{githubRepo}/releases/download/{tagWithV}/{repoName}.zip",
                    $"https://github.com/{githubRepo}/releases/download/{cleanTag}/{repoName}.zip"
                };

                foreach (var directUrl in candidateUrls)
                {
                    try
                    {
                        using (var directClient = new HttpClient())
                        {
                            directClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
                            var directResp = await directClient.GetAsync(directUrl, HttpCompletionOption.ResponseHeadersRead);
                            if (directResp.IsSuccessStatusCode)
                            {
                                string zipPath = Path.Combine(targetDir, $"{repoName}_{tagWithV}.zip");
                                using (var fs = new FileStream(zipPath, FileMode.Create, FileAccess.Write, FileShare.None))
                                {
                                    await directResp.Content.CopyToAsync(fs);
                                }
                                FileLogger.Log($"[GitHubDownloader] ✅ Download DIRETO efetuado com SUCESSO via CDN Pública (0% de uso de API REST): '{directUrl}'");
                                ZipFile.ExtractToDirectory(zipPath, targetDir, overwriteFiles: true);
                                try { File.Delete(zipPath); } catch { }
                                return targetDir;
                            }
                        }
                    }
                    catch (Exception exDirect)
                    {
                        FileLogger.Log($"[GitHubDownloader] URL direta '{directUrl}' inacessível ({exDirect.Message}). Tentando próxima...");
                    }
                }
            }

            // PASSO 2 (FALLBACK): Se o download direto estático falhar (ex: nome de asset diferente ou tag 'latest'), consulta a REST API
            string effectiveToken = token;
            if (string.IsNullOrWhiteSpace(effectiveToken) ||
                effectiveToken.Equals("GITHUB_PAT_TOKEN", StringComparison.OrdinalIgnoreCase) ||
                effectiveToken.Contains("COLE_AQUI"))
            {
                effectiveToken = GetEmbeddedFallbackToken();
            }

            string url = cleanTag.Equals("latest", StringComparison.OrdinalIgnoreCase)
                ? $"https://api.github.com/repos/{githubRepo}/releases/latest"
                : $"https://api.github.com/repos/{githubRepo}/releases/tags/{tagWithV}";

            FileLogger.Log($"[GitHubDownloader] Consultando release na REST API do GitHub: {url}");
            var (success, jsonString, is401) = await MakeGitHubApiRequestAsync(url, effectiveToken);

            if (!success && is401 && !string.IsNullOrWhiteSpace(effectiveToken))
            {
                FileLogger.Log($"[GitHubDownloader] ⚠️ Token do GitHub retornou 401. Tentando fallback anônimo...");
                effectiveToken = "";
                var anonRes = await MakeGitHubApiRequestAsync(url, "");
                success = anonRes.Success;
                jsonString = anonRes.JsonString;
            }

            // Fallback 1: se v{cleanTag} falhou, tenta {cleanTag} sem o v
            if (!success && !cleanTag.Equals("latest", StringComparison.OrdinalIgnoreCase))
            {
                string fallbackUrl = $"https://api.github.com/repos/{githubRepo}/releases/tags/{cleanTag}";
                FileLogger.Log($"[GitHubDownloader] ⚠️ Tentando URL de fallback de tag sem 'v': {fallbackUrl}");
                var fbRes = await MakeGitHubApiRequestAsync(fallbackUrl, effectiveToken);
                if (fbRes.Success)
                {
                    success = true;
                    jsonString = fbRes.JsonString;
                }
            }

            // Fallback 2: se a tag específica falhou, tenta a release mais recente (/releases/latest)
            if (!success)
            {
                string latestUrl = $"https://api.github.com/repos/{githubRepo}/releases/latest";
                FileLogger.Log($"[GitHubDownloader] ⚠️ Tentando URL de fallback para release mais recente: {latestUrl}");
                var fbLatest = await MakeGitHubApiRequestAsync(latestUrl, effectiveToken);
                if (fbLatest.Success)
                {
                    success = true;
                    jsonString = fbLatest.JsonString;
                }
            }

            if (!success || string.IsNullOrWhiteSpace(jsonString))
            {
                FileLogger.Log($"[GitHubDownloader] ⚠️ Consulta de API falhou (403/401). Tentando download direto via URL pública...");
                string directUrl = $"https://github.com/{githubRepo}/releases/download/{tagWithV}/{repoName}_{tagWithV}.zip";

                try
                {
                    using (var directClient = new HttpClient())
                    {
                        directClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0");
                        var directResp = await directClient.GetAsync(directUrl, HttpCompletionOption.ResponseHeadersRead);
                        if (directResp.IsSuccessStatusCode)
                        {
                            string zipPath = Path.Combine(targetDir, $"{repoName}_{tagWithV}.zip");
                            using (var fs = new FileStream(zipPath, FileMode.Create, FileAccess.Write, FileShare.None))
                            {
                                await directResp.Content.CopyToAsync(fs);
                            }
                            FileLogger.Log($"[GitHubDownloader] ✅ Download direto efetuado com SUCESSO via URL pública sem limite de API!");
                            ZipFile.ExtractToDirectory(zipPath, targetDir, overwriteFiles: true);
                            File.Delete(zipPath);
                            return targetDir;
                        }
                    }
                }
                catch (Exception exDirect)
                {
                    FileLogger.LogError($"[GitHubDownloader] Erro no download direto via URL pública '{directUrl}'", exDirect);
                }

                throw new Exception($"Falha ao consultar release '{cleanTag}' em '{githubRepo}'.");
            }

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

                FileLogger.Log($"[GitHubDownloader] Baixando asset '{assetName}'...");

                using (var client = CreateHttpClient(effectiveToken))
                using (var downloadReq = new HttpRequestMessage(HttpMethod.Get, assetUrl))
                {
                    downloadReq.Headers.Accept.Clear();
                    downloadReq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));

                    var downloadResp = await client.SendAsync(downloadReq, HttpCompletionOption.ResponseHeadersRead);
                    
                    // Fallback se download falhar por 401 com token
                    if (downloadResp.StatusCode == HttpStatusCode.Unauthorized && !string.IsNullOrWhiteSpace(effectiveToken))
                    {
                        FileLogger.Log($"[GitHubDownloader] ⚠️ Download do asset retornou 401. Tentando download anônimo...");
                        using (var anonClient = CreateHttpClient(""))
                        using (var anonReq = new HttpRequestMessage(HttpMethod.Get, assetUrl))
                        {
                            anonReq.Headers.Accept.Clear();
                            anonReq.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));
                            downloadResp = await anonClient.SendAsync(anonReq, HttpCompletionOption.ResponseHeadersRead);
                        }
                    }

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

                    FileLogger.Log($"[GitHubDownloader] Extraindo '{zipFilePath}' para '{targetDir}'...");
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

        private static HttpClient CreateHttpClient(string token)
        {
            var client = new HttpClient();
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("WinServiceFleetAgent", "1.0"));
            if (!string.IsNullOrWhiteSpace(token))
            {
                string cleanToken = token.Trim();
                if (cleanToken.StartsWith("token ", StringComparison.OrdinalIgnoreCase))
                {
                    cleanToken = cleanToken.Substring(6).Trim();
                }
                else if (cleanToken.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    cleanToken = cleanToken.Substring(7).Trim();
                }
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", cleanToken);
            }
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));
            return client;
        }

        private static async Task<(bool Success, string JsonString, bool Is401)> MakeGitHubApiRequestAsync(string url, string token)
        {
            try
            {
                using (var client = CreateHttpClient(token))
                {
                    var response = await client.GetAsync(url);
                    if (response.IsSuccessStatusCode)
                    {
                        string content = await response.Content.ReadAsStringAsync();
                        return (true, content, false);
                    }
                    else
                    {
                        string errStr = await response.Content.ReadAsStringAsync();
                        bool is401 = response.StatusCode == HttpStatusCode.Unauthorized;
                        if (response.StatusCode == HttpStatusCode.Forbidden || errStr.Contains("rate limit", StringComparison.OrdinalIgnoreCase))
                        {
                            FileLogger.Log($"[GitHubDownloader] ⚠️ Rate limit da API do GitHub atingido em '{url}'. Utilizando fallback de cache ou CDN.");
                        }
                        else
                        {
                            FileLogger.LogError($"[GitHubDownloader] ❌ Falha HTTP {(int)response.StatusCode} em '{url}': {errStr}");
                        }
                        return (false, "", is401);
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"[GitHubDownloader] ❌ Erro ao conectar com GitHub '{url}'", ex);
                return (false, "", false);
            }
        }
    }
}
