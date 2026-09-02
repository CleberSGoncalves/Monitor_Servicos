using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WinServiceFleetAgent;

var builder = Host.CreateApplicationBuilder(args);

// Habilitar suporte nativo para rodar como Serviço do Windows
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "Dna.Monitor_Service";
});

builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
