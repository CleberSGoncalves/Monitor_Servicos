using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using PublisherApp.Services;

namespace PublisherApp
{
    internal class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("==================================================================");
            Console.WriteLine(" 🚀 Publisher Automático de Serviços para GitHub (.NET 8)");
            Console.WriteLine("==================================================================\n");

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string servicosDir = Path.Combine(baseDir, "servicos");

                if (!Directory.Exists(servicosDir))
                {
                    servicosDir = Path.Combine(Directory.GetCurrentDirectory(), "servicos");
                }

                if (!Directory.Exists(servicosDir))
                {
                    Directory.CreateDirectory(servicosDir);
                    Console.WriteLine($"📁 Pasta 'servicos' criada em: {servicosDir}");
                    Console.WriteLine("Coloque as pastas dos serviços compilados dentro de 'servicos' e execute este script novamente.");
                    Console.WriteLine("\nPressione qualquer tecla para encerrar...");
                    return;
                }

                var serviceSubDirs = Directory.GetDirectories(servicosDir);
                var zipFiles = Directory.GetFiles(servicosDir, "*.zip");

                if (serviceSubDirs.Length == 0 && zipFiles.Length == 0)
                {
                    Console.WriteLine($"⚠️  Nenhum serviço ou arquivo .zip encontrado na pasta: {servicosDir}");
                    Console.WriteLine("Copie as pastas dos seus serviços (ex: servicos\\ConfigMonitorSVC) para este local.");
                    Console.WriteLine("\nPressione qualquer tecla para encerrar...");
                    return;
                }

                // Carregar configurações de SharePoint do appsettings.json se disponível
                string siteUrl = string.Empty;
                string listName = "Controle_Servicos";
                string clientId = string.Empty;
                string clientSecret = string.Empty;

                try
                {
                    string appSettingsFile = Path.Combine(baseDir, "appsettings.json");
                    if (!File.Exists(appSettingsFile))
                    {
                        appSettingsFile = Path.Combine(baseDir, "..", "agent", "appsettings.json");
                    }

                    if (File.Exists(appSettingsFile))
                    {
                        using var doc = JsonDocument.Parse(File.ReadAllText(appSettingsFile));
                        if (doc.RootElement.TryGetProperty("SharePoint", out var sp))
                        {
                            siteUrl = sp.TryGetProperty("SiteUrl", out var su) ? su.GetString() ?? "" : "";
                            listName = sp.TryGetProperty("ListName", out var ln) ? ln.GetString() ?? "Controle_Servicos" : "Controle_Servicos";
                            clientId = sp.TryGetProperty("ClientId", out var ci) ? ci.GetString() ?? "" : "";
                            clientSecret = sp.TryGetProperty("ClientSecret", out var cs) ? cs.GetString() ?? "" : "";
                        }
                    }
                }
                catch { }

                // 1. Obter Token implícito por argumento, arquivo local github_token.txt ou variável de ambiente
                string token = args.Length > 0 ? args[0] : string.Empty;
                string orgName = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : "CleberSGoncalves";

                if (string.IsNullOrWhiteSpace(token))
                {
                    string localTokenFile = Path.Combine(baseDir, "github_token.txt");
                    if (File.Exists(localTokenFile))
                    {
                        token = File.ReadAllText(localTokenFile).Trim();
                    }
                }

                if (string.IsNullOrWhiteSpace(token))
                {
                    token = Environment.GetEnvironmentVariable("GITHUB_TOKEN")?.Trim() ?? string.Empty;
                }

                if (string.IsNullOrWhiteSpace(token))
                {
                    Console.Write("🔑 Digite seu Personal Access Token do GitHub: ");
                    token = Console.ReadLine()?.Trim() ?? "";
                }

                if (string.IsNullOrWhiteSpace(token))
                {
                    Console.WriteLine("\n❌ Erro: Token do GitHub não fornecido.");
                    return;
                }

                Console.WriteLine($"🔑 Autenticado no GitHub.");
                Console.WriteLine($"🏢 Organização/Usuário GitHub: {orgName}");
                Console.WriteLine($"📋 Serviços detectados para publicação ({serviceSubDirs.Length}):");
                foreach (var dir in serviceSubDirs)
                {
                    Console.WriteLine($"   - {Path.GetFileName(dir)}");
                }
                Console.WriteLine();

                // Processar pastas de serviços
                foreach (var dirPath in serviceSubDirs)
                {
                    string serviceFolderName = Path.GetFileName(dirPath);
                    Console.WriteLine($"------------------------------------------------------------------");
                    Console.WriteLine($"📦 Processando Serviço: {serviceFolderName}");

                    // Detectar executável principal na pasta e ler versão compilada
                    string autoVersion = DetectExecutableVersion(dirPath);
                    string tag = string.IsNullOrWhiteSpace(autoVersion) ? "v1.0.0.0" : $"v{autoVersion}";

                    Console.WriteLine($"🏷️  Versão detectada e atribuída automaticamente: '{tag}'");

                    // Gerar arquivo ZIP temporário na pasta TEMP
                    string tempZipPath = Path.Combine(Path.GetTempPath(), $"{serviceFolderName}_{tag}_{Guid.NewGuid():N}.zip");
                    if (File.Exists(tempZipPath)) File.Delete(tempZipPath);

                    Console.WriteLine($"📂 Compactando pasta '{serviceFolderName}'...");
                    ZipFile.CreateFromDirectory(dirPath, tempZipPath, CompressionLevel.Optimal, includeBaseDirectory: false);

                    string repo = serviceFolderName;
                    Console.WriteLine($"🚀 Enviando release para {orgName}/{repo}...");

                    try
                    {
                        string htmlUrl = await GitHubReleaseClient.CreateReleaseAndUploadAssetAsync(
                            owner: orgName,
                            repo: repo,
                            tagName: tag,
                            title: $"Release {tag} - {serviceFolderName}",
                            changelog: $"Release automatizada da pasta de deploy servicos/{serviceFolderName}",
                            zipFilePath: tempZipPath,
                            githubToken: token
                        );

                        Console.WriteLine($"✅ Release '{tag}' publicada com sucesso no GitHub!");
                        Console.WriteLine($"🔗 {htmlUrl}");

                        // Sincronizar Versao_Desejada no SharePoint automaticamente
                        if (!string.IsNullOrWhiteSpace(siteUrl))
                        {
                            await SharePointPublisherSync.UpdateDesiredVersionInSharePointAsync(
                                serviceName: serviceFolderName,
                                newVersionTag: tag,
                                siteUrl: siteUrl,
                                listName: listName,
                                clientId: clientId,
                                clientSecret: clientSecret
                            );
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"❌ Erro ao publicar '{serviceFolderName}': {ex.Message}");
                    }
                    finally
                    {
                        try { if (File.Exists(tempZipPath)) File.Delete(tempZipPath); } catch { }
                    }
                }

                Console.WriteLine("\n==================================================================");
                Console.WriteLine("🎉 Processamento de todos os serviços concluído com sucesso!");
                Console.WriteLine("==================================================================");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\n❌ Ocorreu um erro inesperado: {ex.Message}");
            }
        }

        private static string DetectExecutableVersion(string dirPath)
        {
            try
            {
                var exeFiles = Directory.GetFiles(dirPath, "*.exe", SearchOption.TopDirectoryOnly)
                    .Where(f => !Path.GetFileName(f).Equals("InstallUtil.exe", StringComparison.OrdinalIgnoreCase) &&
                                !Path.GetFileName(f).Equals("RegAsm.exe", StringComparison.OrdinalIgnoreCase) &&
                                !Path.GetFileName(f).Equals("ccextractorwin.exe", StringComparison.OrdinalIgnoreCase) &&
                                !Path.GetFileName(f).EndsWith(".vshost.exe", StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var mainExe = exeFiles.FirstOrDefault(f => Path.GetFileName(f).StartsWith("DNA.", StringComparison.OrdinalIgnoreCase))
                              ?? exeFiles.FirstOrDefault();

                if (mainExe != null)
                {
                    var info = FileVersionInfo.GetVersionInfo(mainExe);
                    if (!string.IsNullOrWhiteSpace(info.FileVersion))
                    {
                        return info.FileVersion.Trim();
                    }
                }
            }
            catch { }

            return string.Empty;
        }
    }
}
