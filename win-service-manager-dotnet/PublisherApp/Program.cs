using System;
using System.IO;
using System.Threading.Tasks;
using PublisherApp.Services;

namespace PublisherApp
{
    internal class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("==================================================================");
            Console.WriteLine("   🚀 Windows Service Fleet Manager - Publisher (C# .NET 8)");
            Console.WriteLine("==================================================================\n");

            try
            {
                string token = string.Empty;
                string repoInput = string.Empty;
                string tag = string.Empty;
                string title = string.Empty;
                string changelog = string.Empty;
                string zipPath = string.Empty;

                if (args.Length >= 4)
                {
                    token = args[0];
                    repoInput = args[1];
                    tag = args[2];
                    zipPath = args[3];
                    if (args.Length >= 5) title = args[4];
                    if (args.Length >= 6) changelog = args[5];
                }
                else
                {
                    Console.Write("🔑 Digite o GitHub Personal Access Token: ");
                    token = Console.ReadLine()?.Trim() ?? "";

                    Console.Write("📦 Digite o Repositório GitHub (ex: sua-org/ConfigMonitorSVC): ");
                    repoInput = Console.ReadLine()?.Trim() ?? "";

                    Console.Write("🏷️  Digite a Tag/Versão da Release (ex: v2.4.1 ou 1.0.0.16): ");
                    tag = Console.ReadLine()?.Trim() ?? "";

                    Console.Write("📝 Digite o Título da Release (Opcional): ");
                    title = Console.ReadLine()?.Trim() ?? "";

                    Console.Write("📄 Digite as Notas da Versão / Changelog (Opcional): ");
                    changelog = Console.ReadLine()?.Trim() ?? "";

                    Console.Write("📁 Digite o Caminho Completo do Arquivo .zip: ");
                    zipPath = Console.ReadLine()?.Trim()?.Trim('"') ?? "";
                }

                if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(repoInput) || string.IsNullOrWhiteSpace(tag) || string.IsNullOrWhiteSpace(zipPath))
                {
                    Console.WriteLine("\n❌ Erro: Todos os campos obrigatórios (Token, Repositório, Tag e Arquivo .zip) devem ser fornecidos.");
                    return;
                }

                string[] parts = repoInput.Split('/');
                if (parts.Length != 2)
                {
                    Console.WriteLine("\n❌ Erro: Formato de repositório inválido. Utilize o formato 'proprietario/repositorio'.");
                    return;
                }

                string owner = parts[0];
                string repo = parts[1];

                Console.WriteLine("\n🚀 Iniciando publicação...");
                string htmlUrl = await GitHubReleaseClient.CreateReleaseAndUploadAssetAsync(
                    owner: owner,
                    repo: repo,
                    tagName: tag,
                    title: title,
                    changelog: changelog,
                    zipFilePath: zipPath,
                    githubToken: token
                );

                Console.WriteLine("\n==================================================================");
                Console.WriteLine($"✅ Release '{tag}' criada com sucesso!");
                Console.WriteLine($"🔗 Link da Release: {htmlUrl}");
                Console.WriteLine("==================================================================");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\n❌ Erro na publicação: {ex.Message}");
            }

            Console.WriteLine("\nPressione qualquer tecla para sair...");
            Console.ReadKey();
        }
    }
}
