# Windows Services Fleet Manager (C# .NET 8)

Plataforma nativa em **C# / .NET 8** para monitoramento remoto, controle de inventário de versões e atualização remota de serviços Windows legados baseados em .NET Framework.

---

## 🚀 Principais Recursos da Versão C# .NET 8

- **Zero Dependência Externa**: Compilado em formato **Self-Contained Single-File (`.exe`)**.
- **Compatível com Windows 11**: Funciona diretamente em qualquer máquina Windows 11 **sem necessitar de Python ou .NET SDK pré-instalados**.
- **Serviço Windows Nativo (`WinServiceFleetAgent.exe`)**:
  - Executa como um serviço de segundo plano nativo (`BackgroundService` do .NET com `System.ServiceProcess`).
  - **Leitor de Metadados**: Extrai `Praça` (`idHost`) e `CS` de `D:\MediaDNA_V2\data\configxml.xml` (codificação `Windows-1252`) e `Url_Comunicacao` (`WCFMainURL`) do `.exe.config`.
  - **Inspetor de Versão PE**: Lê a versão binária compilada nos executáveis `.exe` via `System.Diagnostics.FileVersionInfo`.
  - **Barramento SharePoint**: Sincroniza periodicamente o status da máquina e responde a comandos operacionais (`Reiniciar`, `Atualizar`).
  - **Motor Smart XML Merge**: Preserva intactas as configurações locais de máquina em `<applicationSettings>` e `<appSettings>` durante atualizações de versão.
  - **Backup e Rollback Automático**: Garante a criação de backup em `C:\RollbackBackups` antes de aplicar atualizações e executa rollback automático em caso de falha.
- **Publisher Nativo (`PublisherApp.exe`)**:
  - Executável `.exe` leve para geração de releases e upload de pacotes `.zip` via API REST v3 do GitHub.

---

## 📁 Estrutura da Solução .NET

```
win-service-manager-dotnet/
├── WinServiceFleetManager.sln        # Solução C# .NET 8
├── WinServiceFleetAgent/             # Projeto do Agente (Serviço Windows)
│   ├── Program.cs
│   ├── Worker.cs
│   ├── appsettings.json
│   ├── Core/
│   │   ├── MetadataReader.cs         # Parser de configxml.xml e WCFMainURL
│   │   ├── VersionInspector.cs       # Leitor da versão compilada (.exe)
│   │   ├── ConfigMerger.cs           # Motor Smart XML Merge de .config
│   │   ├── WinController.cs          # ServiceController (Start, Stop, Restart)
│   │   ├── GitHubDownloader.cs       # Download e extração de assets .zip
│   │   ├── SharePointClient.cs       # Cliente REST API para a lista do SharePoint
│   │   └── FleetOrchestrator.cs      # Máquina de estados com Backup e Rollback
│   └── Scripts/
│       ├── install_service.bat       # Script de instalação via sc.exe
│       └── uninstall_service.bat     # Script de remoção do serviço
├── PublisherApp/                     # Aplicativo Publisher (CLI / Gui executable)
│   ├── Program.cs
│   └── Services/
│       └── GitHubReleaseClient.cs    # Upload de releases no GitHub
└── publish/                          # Binários executáveis prontos para implantação
    ├── agent/                        # WinServiceFleetAgent.exe standalone
    └── publisher/                    # PublisherApp.exe standalone
```

---

## 📦 Como Implantar nas Máquinas Servidoras (Windows 11)

### 1. Implantação do Agente (`WinServiceFleetAgent.exe`)

1. Copie a pasta `publish/agent/` para a máquina de destino (ex: `C:\WinServiceFleetAgent\`).
2. Edite o arquivo `appsettings.json` definindo as credenciais do SharePoint, token do GitHub e caminhos dos serviços.
3. Abra o Prompt de Comando (CMD) **como Administrador** na pasta e execute:
   ```cmd
   install_service.bat
   ```

Para desinstalar o serviço:
```cmd
uninstall_service.bat
```

---

### 2. Publicação de Releases (`PublisherApp.exe`)

Para publicar uma nova release no GitHub, abra o prompt e execute:
```cmd
PublisherApp.exe
```
Ou passe os argumentos diretamente via linha de comando:
```cmd
PublisherApp.exe <GITHUB_TOKEN> <PROPRIETARIO/REPOS> <TAG> <CAMINHO_ZIP> "<TITULO>" "<CHANGELOG>"
```

---

## 🛠️ Como Compilar o Projeto (Desenvolvimento)

Para gerar novos executáveis single-file:

```bash
# Compilar a solução em Release
dotnet build -c Release

# Publicar Agente Single-File
dotnet publish WinServiceFleetAgent/WinServiceFleetAgent.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish/agent

# Publicar Publisher Single-File
dotnet publish PublisherApp/PublisherApp.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish/publisher
```
