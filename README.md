# Windows Services Fleet Manager (C# .NET 8)

Plataforma nativa em **C# / .NET 8** para monitoramento remoto, controle de inventário de versões e atualização remota de serviços Windows legados baseados em .NET Framework.

---

## 🏛️ Estrutura do Repositório (100% C# .NET)

```
Monitor_Servicos/
├── WinServiceFleetManager.sln        # Solução C# .NET 8
├── WinServiceFleetAgent/             # Projeto do Agente (Serviço Windows Nativo)
│   ├── Program.cs                    # Configuração de hospedagem nativa no Windows
│   ├── Worker.cs                     # Worker Service principal
│   ├── appsettings.json              # Configurações do SharePoint, GitHub e Serviços
│   ├── Core/
│   │   ├── MetadataReader.cs         # Extração de Praça (idHost), CS (Windows-1252) e WCFMainURL
│   │   ├── VersionInspector.cs       # Leitura de versão PE via FileVersionInfo
│   │   ├── ConfigMerger.cs           # Motor Smart XML Merge de .config
│   │   ├── WinController.cs          # ServiceController (Start, Stop, Restart)
│   │   ├── GitHubDownloader.cs       # Download e extração de pacotes .zip
│   │   ├── SharePointClient.cs       # Cliente REST API para SharePoint List
│   │   └── FleetOrchestrator.cs      # Orquestrador com Backup e Rollback Automático
│   └── Scripts/
│       ├── install_service.bat       # Script de instalação do serviço Windows (sc.exe)
│       └── uninstall_service.bat     # Script de remoção do serviço Windows
├── PublisherApp/                     # Aplicativo de Publicação de Releases
│   ├── Program.cs                    # Publicador batch por pasta/zip
│   └── Services/
│       └── GitHubReleaseClient.cs    # Upload de releases no GitHub
└── publish/                          # Pasta de Publicação Pronta para Implantação
    ├── agent/                        # WinServiceFleetAgent.exe (Single-File Standalone)
    ├── publisher/                    # PublisherApp.exe (Single-File Standalone)
    ├── servicos/                     # Pasta para colocar pastas/zips dos serviços a publicar
    └── publicar_servicos.bat         # Script para publicar todas as pastas de 'servicos' no GitHub
```

---

## 🚀 Como Usar

### 1. Publicar Novas Releases no GitHub
1. Copie a pasta compilada do seu serviço para a pasta `publish/servicos/` (ex: `publish/servicos/ConfigMonitorSVC`).
2. Dê um duplo clique no script **`publish/publicar_servicos.bat`**.
3. O script compactará a pasta automaticamente, solicitará a Tag da versão (ex: `v2.4.1`) e enviará a Release diretamente para o GitHub.

### 2. Instalar o Agente nas Máquinas Servidoras (Windows 11)
1. Copie a pasta `publish/agent/` para a máquina servidora Windows 11 (ex: `C:\WinServiceFleetAgent\`).
2. Ajuste o arquivo `appsettings.json` com os dados do seu SharePoint e GitHub.
3. Execute o script **`install_service.bat`** como Administrador.

---

## 🛠️ Compilação do Projeto

Para reconstruir os executáveis Self-Contained:

```bash
# Compilar a solução em Release
dotnet build -c Release

# Publicar Agente Single-File
dotnet publish WinServiceFleetAgent/WinServiceFleetAgent.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish/agent

# Publicar Publisher Single-File
dotnet publish PublisherApp/PublisherApp.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish/publisher
```
