using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
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
                    Console.ReadKey();
                    return;
                }

                var serviceSubDirs = Directory.GetDirectories(servicosDir);
                var zipFiles = Directory.GetFiles(servicosDir, "*.zip");

                if (serviceSubDirs.Length == 0 && zipFiles.Length == 0)
                {
                    Console.WriteLine($"⚠️  Nenhum serviço ou arquivo .zip encontrado na pasta: {servicosDir}");
                    Console.WriteLine("Copie as pastas dos seus serviços (ex: servicos\\ConfigMonitorSVC) para este local.");
                    Console.WriteLine("\nPressione qualquer tecla para encerrar...");
                    Console.ReadKey();
                    return;
                }

                // Solicitar Token do GitHub se não for informado por argumento
                string token = args.Length > 0 ? args[0] : string.Empty;
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

                Console.Write("🏢 Digite a Organização/Usuário do GitHub (ex: sua-org ou CleberSGoncalves): ");
                string orgName = Console.ReadLine()?.Trim() ?? "CleberSGoncalves";

                // Processar pastas de serviços
                foreach (var dirPath in serviceSubDirs)
                {
                    string serviceName = Path.GetFileName(dirPath);
                    Console.WriteLine($"\n------------------------------------------------------------------");
                    Console.WriteLine($"📦 Serviço detectado: {serviceName}");

                    Console.Write($"🏷️  Digite a Tag/Versão da Release para '{serviceName}' (ex: v2.4.1): ");
                    string tag = Console.ReadLine()?.Trim() ?? "";
                    if (string.IsNullOrWhiteSpace(tag))
                    {
                        Console.WriteLine($"⚠️ Tag não fornecida. Pulando serviço '{serviceName}'.");
                        continue;
                    }

                    string tempZipPath = Path.Combine(servicosDir, $"{serviceName}_{tag}.zip");
                    if (File.Exists(tempZipPath)) File.Delete(tempZipPath);

                    Console.WriteLine($"📂 Compactando pasta '{serviceName}' em '{Path.GetFileName(tempZipPath)}'...");
                    ZipFile.CreateFromDirectory(dirPath, tempZipPath, CompressionLevel.Optimal, includeBaseDirectory: false);

                    string repo = $"{orgName}/{serviceName}";
                    Console.WriteLine($"🚀 Enviando release para {repo}...");

                    try
                    {
                        string htmlUrl = await GitHubReleaseClient.CreateReleaseAndUploadAssetAsync(
                            owner: orgName,
                            repo: serviceName,
                            tagName: tag,
                            title: $"Release {tag} - {serviceName}",
                            changelog: $"Release automatizada da pasta de deploy servicos/{serviceName}",
                            zipFilePath: tempZipPath,
                            githubToken: token
                        );

                        Console.WriteLine($"✅ Release '{tag}' publicada com sucesso!");
                        Console.WriteLine($"🔗 {htmlUrl}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"❌ Erro ao publicar '{serviceName}': {ex.Message}");
                    }
                    finally
                    {
                        try { if (File.Exists(tempZipPath)) File.Delete(tempZipPath); } catch { }
                    }
                }

                // Processar arquivos .zip soltos na pasta servicos
                foreach (var zipPath in zipFiles)
                {
                    string filename = Path.GetFileNameWithoutExtension(zipPath);
                    Console.WriteLine($"\n------------------------------------------------------------------");
                    Console.WriteLine($"📦 Arquivo ZIP detectado: {Path.GetFileName(zipPath)}");

                    Console.Write($"🏢 Nome do Repositório GitHub para '{filename}' (ex: ConfigMonitorSVC): ");
                    string repoName = Console.ReadLine()?.Trim() ?? filename;

                    Console.Write($"🏷️  Digite a Tag/Versão da Release para '{repoName}' (ex: v2.4.1): ");
                    string tag = Console.ReadLine()?.Trim() ?? "";
                    if (string.IsNullOrWhiteSpace(tag))
                    {
                        Console.WriteLine($"⚠️ Tag não fornecida. Pulando arquivo '{filename}'.");
                        continue;
                    }

                    try
                    {
                        string htmlUrl = await GitHubReleaseClient.CreateReleaseAndUploadAssetAsync(
                            owner: orgName,
                            repo: repoName,
                            tagName: tag,
                            title: $"Release {tag} - {repoName}",
                            changelog: $"Release automatizada a partir do arquivo {Path.GetFileName(zipPath)}",
                            zipFilePath: zipPath,
                            githubToken: token
                        );

                        Console.WriteLine($"✅ Release '{tag}' publicada com sucesso!");
                        Console.WriteLine($"🔗 {htmlUrl}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"❌ Erro ao publicar '{repoName}': {ex.Message}");
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

            Console.WriteLine("\nPressione qualquer tecla para sair...");
            Console.ReadKey();
        }
    }
}
