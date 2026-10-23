using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace PublisherApp.Services
{
    /// <summary>
    /// Publicador Corporativo Homologado para SharePoint Online (Microsoft Graph API).
    /// Substitui a publicação em repositórios externos do GitHub, enviando os pacotes .zip e hashes SHA-256
    /// diretamente para a biblioteca 'Repositorio_Automacoes/Releases_Servicos_CS'.
    /// </summary>
    public static class GitHubReleaseClient
    {
        private const string TenantId = "b2767241-fab5-454b-8b62-f6324650e316";
        private const string SpnClientId = "0a8faad1-6f41-4b6f-ac0d-d18399b4e9dc";
        private const string EncryptedSpnSecret = "ENC:pmGCK1dfa+FaAQAtlvRow3fpazdGco1b5BlFcuBrkhvGnneyKLXk93FsMzUJZWE6Hcy2YtNVIgn+70DsqWJP8g==";
        private const string AutomacoesDriveId = "b!R5fko7abk0yZMN2ibI0QUFX-yDT-LPxOjOApWP13XuB7rzp8hYGATLhyYvhIJ0iG";
        private const string ReleasesFolder = "Releases_Servicos_CS";

        private static string DecryptSpnSecret()
        {
            string rawB64 = EncryptedSpnSecret.Substring(4);
            byte[] rawBytes = Convert.FromBase64String(rawB64);
            byte[] key = Encoding.UTF8.GetBytes("DNA_MONITOR_FLEET_SEC_2026_ADGBL");
            byte[] iv = new byte[16];
            Array.Copy(rawBytes, 0, iv, 0, 16);
            byte[] cipherBytes = new byte[rawBytes.Length - 16];
            Array.Copy(rawBytes, 16, cipherBytes, 0, cipherBytes.Length);

            using var aes = Aes.Create();
            aes.Key = key;
            aes.IV = iv;
            using var decryptor = aes.CreateDecryptor();
            byte[] plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
            return Encoding.UTF8.GetString(plainBytes);
        }

        private static string ComputeSha256(string filePath)
        {
            using var sha = SHA256.Create();
            using var stream = File.OpenRead(filePath);
            byte[] hash = sha.ComputeHash(stream);
            return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        }

        public static async Task<string> CreateReleaseAndUploadAssetAsync(
            string owner,
            string repo,
            string tagName,
            string title,
            string changelog,
            string zipFilePath,
            string githubToken)
        {
            if (!File.Exists(zipFilePath))
            {
                throw new FileNotFoundException($"Arquivo .zip não encontrado: {zipFilePath}");
            }

            string cleanTag = tagName.Trim().TrimStart('v', 'V');
            string tagWithV = $"v{cleanTag}";
            string versionedName = $"{repo}_{tagWithV}.zip";
            string genericName = $"{repo}.zip";
            string sha256 = ComputeSha256(zipFilePath);
            long fileSize = new FileInfo(zipFilePath).Length;

            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };

            // 1. Autenticar via OAuth2 Microsoft Entra ID (SPN)
            var form = new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = SpnClientId,
                ["client_secret"] = DecryptSpnSecret(),
                ["scope"] = "https://graph.microsoft.com/.default"
            };
            var tokenResp = await client.PostAsync($"https://login.microsoftonline.com/{TenantId}/oauth2/v2.0/token", new FormUrlEncodedContent(form));
            tokenResp.EnsureSuccessStatusCode();
            string accessToken = JsonDocument.Parse(await tokenResp.Content.ReadAsStringAsync()).RootElement.GetProperty("access_token").GetString() ?? "";

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            // 2. Upload do pacote versionado e do pacote latest (.zip) no SharePoint
            string uploadVersionedUrl = $"https://graph.microsoft.com/v1.0/drives/{AutomacoesDriveId}/root:/{ReleasesFolder}/{versionedName}:/content";
            string uploadGenericUrl = $"https://graph.microsoft.com/v1.0/drives/{AutomacoesDriveId}/root:/{ReleasesFolder}/{genericName}:/content";
            string uploadShaUrl = $"https://graph.microsoft.com/v1.0/drives/{AutomacoesDriveId}/root:/{ReleasesFolder}/{versionedName}.sha256:/content";

            Console.WriteLine($"[SharePointPublisher] Enviando '{versionedName}' ({fileSize} bytes | SHA256: {sha256})...");

            byte[] zipBytes = await File.ReadAllBytesAsync(zipFilePath);
            using (var content1 = new ByteArrayContent(zipBytes))
            {
                content1.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
                var resp1 = await client.PutAsync(uploadVersionedUrl, content1);
                resp1.EnsureSuccessStatusCode();
            }

            using (var content2 = new ByteArrayContent(zipBytes))
            {
                content2.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
                var resp2 = await client.PutAsync(uploadGenericUrl, content2);
                resp2.EnsureSuccessStatusCode();
            }

            using (var shaContent = new StringContent($"{sha256}  {versionedName}\n", Encoding.UTF8, "text/plain"))
            {
                await client.PutAsync(uploadShaUrl, shaContent);
            }

            string sharepointUrl = $"https://adgbl.sharepoint.com/sites/suportecaptacao/Repositorio_Automacoes/{ReleasesFolder}/{versionedName}";
            Console.WriteLine($"[SharePointPublisher] ✅ Pacote publicado com sucesso no SharePoint Corporativo!");
            return sharepointUrl;
        }
    }
}
