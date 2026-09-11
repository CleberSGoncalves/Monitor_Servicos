using System;
using System.IO;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WinServiceFleetAgent;
using WinServiceFleetAgent.Core;

// CRÍTICO: Define o diretório de trabalho como a pasta do executável (evita CWD = C:\Windows\System32 em Serviços do Windows)
Directory.SetCurrentDirectory(AppDomain.CurrentDomain.BaseDirectory);

try
{
    if (args.Length > 0 && args[0].Equals("--clear-sharepoint", StringComparison.OrdinalIgnoreCase))
    {
        var spClient = new WinServiceFleetAgent.Core.SharePointClient(null, null, null, null);
        int count = spClient.ClearAllListItemsAsync().GetAwaiter().GetResult();
        Console.WriteLine($"✅ Limpeza concluída: {count} itens apagados do SharePoint.");
        return;
    }

    var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
    {
        Args = args,
        ContentRootPath = AppDomain.CurrentDomain.BaseDirectory
    });

    // Habilitar suporte nativo para rodar como Serviço do Windows
    builder.Services.AddWindowsService(options =>
    {
        options.ServiceName = "DNA.MonitorServiceSVC";
    });

    builder.Services.AddHostedService<Worker>();

    var host = builder.Build();
    host.Run();
}
catch (Exception ex)
{
    FileLogger.LogError("Falha fatal na inicialização do serviço DNA.MonitorServiceSVC em Program.cs", ex);
    throw;
}
