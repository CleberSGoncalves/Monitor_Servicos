using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace WinServiceFleetAgent.Core
{
    public static class GoogleCloudAuth
    {
        public const string ProjectId = "bamboo-dryad-494619-c9";
        public const string ClientEmail = "fleet-telemetria@bamboo-dryad-494619-c9.iam.gserviceaccount.com";
        private const string EncryptedPrivateKey = "ENC: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";

        private static string _cachedToken = string.Empty;
        private static DateTime _tokenExpiry = DateTime.MinValue;
        private static readonly object _tokenLock = new object();

        private static string DecryptPrivateKey()
        {
            try
            {
                string b64 = EncryptedPrivateKey.StartsWith("ENC:") ? EncryptedPrivateKey.Substring(4) : EncryptedPrivateKey;
                byte[] raw = Convert.FromBase64String(b64);
                byte[] key = Encoding.UTF8.GetBytes("DNA_MONITOR_FLEET_SEC_2026_ADGBL");
                byte[] iv = new byte[16];
                Array.Copy(raw, 0, iv, 0, 16);
                byte[] cipher = new byte[raw.Length - 16];
                Array.Copy(raw, 16, cipher, 0, cipher.Length);

                using var aes = Aes.Create();
                aes.Key = key;
                aes.IV = iv;
                using var decryptor = aes.CreateDecryptor();
                byte[] plain = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);
                return Encoding.UTF8.GetString(plain);
            }
            catch (Exception ex)
            {
                FileLogger.LogError("[GoogleCloudAuth] Erro ao descriptografar chave GCP", ex);
                return string.Empty;
            }
        }

        public static async Task<string?> GetAccessTokenAsync()
        {
            lock (_tokenLock)
            {
                if (!string.IsNullOrEmpty(_cachedToken) && DateTime.UtcNow < _tokenExpiry)
                {
                    return _cachedToken;
                }
            }

            try
            {
                string privKey = string.Empty;
                string email = ClientEmail;

                // 1. Tenta credenciais locais em disco se houver
                string localCreds = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "google_credentials.json");
                if (File.Exists(localCreds))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(File.ReadAllText(localCreds));
                        if (doc.RootElement.TryGetProperty("client_email", out var eProp)) email = eProp.GetString() ?? ClientEmail;
                        if (doc.RootElement.TryGetProperty("private_key", out var kProp)) privKey = kProp.GetString() ?? "";
                    }
                    catch { }
                }

                if (string.IsNullOrWhiteSpace(privKey))
                {
                    privKey = DecryptPrivateKey();
                }

                if (string.IsNullOrWhiteSpace(privKey)) return null;

                // Assina JWT RS256
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string headerJson = "{\"alg\":\"RS256\",\"typ\":\"JWT\"}";
                string headerB64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(headerJson)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

                var claimObj = new
                {
                    iss = email,
                    scope = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_only",
                    aud = "https://oauth2.googleapis.com/token",
                    exp = now + 3600,
                    iat = now
                };
                string claimJson = JsonSerializer.Serialize(claimObj);
                string claimB64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(claimJson)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

                string unsigned = $"{headerB64}.{claimB64}";

                using var rsa = RSA.Create();
                rsa.ImportFromPem(privKey);
                byte[] sig = rsa.SignData(Encoding.UTF8.GetBytes(unsigned), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                string sigB64 = Convert.ToBase64String(sig).TrimEnd('=').Replace('+', '-').Replace('/', '_');

                string assertion = $"{unsigned}.{sigB64}";

                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
                var form = new Dictionary<string, string>
                {
                    ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    ["assertion"] = assertion
                };

                var resp = await http.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(form));
                if (!resp.IsSuccessStatusCode)
                {
                    FileLogger.Log($"[GoogleCloudAuth] Erro ao obter token GCP (HTTP {(int)resp.StatusCode})");
                    return null;
                }

                string json = await resp.Content.ReadAsStringAsync();
                using var respDoc = JsonDocument.Parse(json);
                string token = respDoc.RootElement.GetProperty("access_token").GetString() ?? "";

                lock (_tokenLock)
                {
                    _cachedToken = token;
                    _tokenExpiry = DateTime.UtcNow.AddMinutes(50);
                }

                return token;
            }
            catch (Exception ex)
            {
                FileLogger.LogError("[GoogleCloudAuth] Falha na autenticação Google Cloud", ex);
                return null;
            }
        }
    }
}
