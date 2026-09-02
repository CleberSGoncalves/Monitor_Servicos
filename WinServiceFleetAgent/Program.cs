using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WinServiceFleetAgent;

var builder = Host.CreateApplicationBuilder(args);

// Habilitar suporte nativo para rodar como Serviço do Windows
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "WinServiceFleetAgent";
});

builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
