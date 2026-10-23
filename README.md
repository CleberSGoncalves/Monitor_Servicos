# Windows Services Fleet Manager & NOC Central (C# .NET 8 + FastAPI)

Plataforma integrada em **C# / .NET 8** (Agente Nativo nos Capture Sites) e **Python FastAPI** (Central de Controle NOC 24x7) para monitoramento remoto, telemetria de RF/Canais, execução de comandos assinados, controle de inventário de versões e atualização remota com governança canário.

---

## 🛡️ Diretriz Arquitetural Mandatória: Proteção de Recursos (Zero-Overhead) & Sincronia de Versão do Serviço C#

> [!IMPORTANT]
> **REGRA DE OURO DE ENGENHARIA (CAPTURE SITES vs. CENTRAL NOC):**
> 1. **Preservação Máxima de CPU/RAM/Disco nos Capture Sites:**
>    - Os servidores das praças (Capture Sites) têm como missão crítica sintonizar placas TBS, decodificar streams e gravar vídeos `.MP4`/`.ASF` 24x7 sem perda de frames.
>    - Todo processamento pesado — **Heurísticas de IA (Gemini Pro), Correlação Topográfica de RF/Zona de Fresnel, Simulação de Mastro, Mosaico Visual, Clusterização de Incidentes e Governança** — deve rodar **100% na Camada Central (`dashboard/`)**, com **Zero-Overhead** nas máquinas das cidades.
>    - No Capture Site, toda operação auxiliar do agente C# roda com prioridade reduzida (`ProcessPriorityClass.BelowNormal`), leitura incremental (`FileShare.ReadWrite` tail de no máximo 2 MB) e sem processos em loop contínuo.
>
> 2. **Sincronia Obrigatória da Versão do Serviço C# (`DNA.MonitorServiceSVC` / `WinServiceFleetAgent`):**
>    - Sempre que uma funcionalidade exigir **interação direta com o sistema operacional ou disco da cidade** — tais como:
>      - Varredura de pastas de gravação (`.MP4`, `.ASF` do `DNA.MediaConverter`, `c_BKP\registered`);
>      - Coleta e leitura sob demanda de logs locais (`DTVCaptureLog`, logs de serviços e Event Viewer);
>      - Execução real de scripts/comandos remotos via fila segura (`Fila_Comandos` no SharePoint Drive);
>      - Instalação e abertura da interface gráfica do **Atria Capture (`DigitalTVCapture.exe`)** na sessão interativa do usuário;
>    - Essa evolução **DEVE obrigatoriamente ser implementada no código C# (`WinServiceFleetAgent`)**, ter sua versão incrementada em `WinServiceFleetAgent.csproj` (ex: `1.0.15.0` → `1.0.16.0`), ser compilada (`dotnet publish`) e empacotada em `publish/DNA.MonitorServiceSVC_vX.X.X.X.zip`.
>    - **Nenhuma feature local existe na prática enquanto a versão do serviço C# não for incrementada e distribuída.**
>
> 3. **Combinado de Rollout na Aba Frota: Homologação Canário (5 Praças Piloto → Demais Praças):**
>    - Nenhuma nova versão do `DNA.MonitorServiceSVC` é disparada para todas as cidades simultaneamente.
>    - **Fase 1 (Canário — 5 Pilotos):** Pela aba **Frota** (`#tab-fleet`) ou `Deploy_Canary_Pipeline.ps1`, o sistema seleciona **5 praças piloto online** e define `Versao_Desejada = <nova_versão>` e `Acao_Solicitada = Atualizar` exclusivamente para essas 5 máquinas. O agente C# possui trava nativa (`FleetOrchestrator.cs` / `SharePointClient.cs`) que ignora releases do GitHub que ainda não estejam autorizadas na coluna `Versao_Desejada` do seu próprio host.
>    - **Fase 2 (Despacho para a Frota):** Após as 5 praças piloto confirmarem `Versao_Instalada == Versao_Desejada` e `Status_Servico == Em Execução` sem falhas, a esteira despacha automaticamente (ou via botão **Despachar para Demais Praças da Frota**) a atualização para todas as demais máquinas do parque.

---

## 🖥️ Solução Definitiva de Interface do Atria Capture (Isolamento de Sessão 0 do Windows)

- **Problema Clássico do Windows Service:** Quando um serviço Windows (que roda na **Sessão 0** como `NT AUTHORITY\SYSTEM`) executa `Start-Process` ou `Process.Start` durante o update do Atria, os processos `DigitalTVCapture.exe` e `DigitalTVReceiver.exe` sobem presos na **Sessão 0**. Eles aparecem no Gerenciador de Tarefas consumindo CPU e RAM, mas **a janela gráfica nunca aparece na área de trabalho do operador**.
- **Correção Arquitetural (`v1.0.16.0` — `InteractiveProcessLauncher.cs` & `AtriaInstaller.cs`):**
  1. O script PowerShell de instalação silenciosa não executa mais `Start-Process` na Sessão 0.
  2. Ao finalizar a instalação (ou durante o AutoRestart), o agente enumera as sessões WTS (`WTSEnumerateSessions`) para localizar a sessão interativa ativa do usuário (Console físico, RDP ou TeamViewer).
  3. Qualquer instância "fantasma" do Atria presa na Sessão 0 (`SessionId == 0`) é encerrada (`KillSessionZeroAtriaInstances`) antes da abertura.
  4. O agente obtém o **token elevado (`TokenLinkedToken`)** do usuário logado (ou aplica fallback de token `SYSTEM` re-sessionado via `SetTokenInformation(..., TokenSessionId)` com `CreateEnvironmentBlock`) e invoca `CreateProcessAsUser` apontando explicitamente para `winsta0\default` com `SW_SHOW`.
  5. Se o Atria estiver rodando apenas na Sessão 0 enquanto há um usuário logado, o `FleetOrchestrator` classifica como requerendo reabertura interativa e migra o processo automaticamente para a área de trabalho visível.

---

## 🏛️ Estrutura do Repositório

```
Monitor_Servicos/
├── WinServiceFleetManager.sln        # Solução C# .NET 8
├── WinServiceFleetAgent/             # Projeto do Agente (Serviço Windows Nativo — v1.0.16.0)
│   ├── Program.cs                    # Configuração de hospedagem nativa no Windows
│   ├── Worker.cs                     # Worker Service principal
│   ├── appsettings.json              # Configurações do SharePoint, GitHub, AutoUpdate e Serviços
│   ├── Core/
│   │   ├── AgentAutoUpdater.cs       # Orquestrador de auto-atualização autônoma, staging e agendamento
│   │   ├── AtriaInstaller.cs         # Instalador silencioso do Atria + sincronia AppConfig.xml + abertura GUI
│   │   ├── InteractiveProcessLauncher.cs # Launcher Win32 WTS (Sessão 0 -> Sessão Interativa com Token Elevado)
│   │   ├── RemoteCommandExecutor.cs  # Executor real de comandos/logs assinados HMAC-SHA256 via SharePoint Drive
│   │   ├── ChannelOrchestrator.cs    # Telemetria de MUX/RF e auditoria NTFS de gravações .MP4/.ASF
│   │   ├── IntegrityValidator.cs     # Validador de integridade (SHA256, ZIP headers, PE headers)
│   │   ├── FileLogger.cs             # Log local com rotação (10MB) e integração nativa com Windows Event Log
│   │   ├── MetadataReader.cs         # Extração de Praça (idHost), CS (Windows-1252) e WCFMainURL
│   │   ├── VersionInspector.cs       # Leitura de versão PE via FileVersionInfo
│   │   ├── ConfigMerger.cs           # Motor Smart XML Merge de .config
│   │   ├── WinController.cs          # ServiceController (Start, Stop, Restart)
│   │   ├── GitHubDownloader.cs       # Download e extração de pacotes .zip
│   │   ├── SharePointClient.cs       # Cliente Graph API (Listas + Fila_Comandos no SharePoint Drive)
│   │   └── FleetOrchestrator.cs      # Orquestrador de serviços, canais e governança canário
│   └── Scripts/
│       ├── Apply-AgentUpdate.ps1     # Script de substituição atômica, backup, health check e rollback
│       ├── install_service.bat       # Script de instalação do serviço Windows (sc.exe)
│       ├── uninstall_service.bat     # Script de remoção do serviço Windows
│       └── update_agent.bat          # Script auxiliar de atualização manual/emergencial
├── dashboard/                        # Central de Controle NOC 24x7 (Python FastAPI — v3.9.37)
│   ├── app.py                        # API Central, Cockpit N1, Mosaico, Topografia RF e Governança
│   ├── remote_commands.py            # Catálogo, Co-Piloto de Logs e Despacho de Comandos
│   ├── remote_queue.py               # Ponte HMAC-SHA256 com SharePoint Drive + Orquestrador Canário (5 Pilotos)
│   ├── fleet_actions.py              # Ações operacionais e disparo de homologação canário
│   └── static/                       # Interface Web Dark-Mode NOC
├── PublisherApp/                     # Aplicativo de Publicação de Releases no GitHub
└── publish/                          # Binários e Pacotes .ZIP Prontos para Deploy
    ├── agent_v1.0.16.0/              # WinServiceFleetAgent.exe v1.0.16.0 (Single-File Standalone)
    └── DNA.MonitorServiceSVC_v1.0.16.0.zip
```

---

## 🛠️ Compilação e Publicação de Nova Versão do Serviço C#

Sempre que alterar qualquer arquivo em `WinServiceFleetAgent/`:

```bash
# 1. Incrementar <Version>, <FileVersion> e <AssemblyVersion> em WinServiceFleetAgent/WinServiceFleetAgent.csproj

# 2. Publicar Agente Single-File em Release
dotnet publish WinServiceFleetAgent/WinServiceFleetAgent.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish/agent_v1.0.16.0

# 3. Gerar pacote ZIP para o GitHub Releases (CleberSGoncalves/DNA.MonitorServiceSVC)
# 4. Homologar em 5 Praças Piloto na Aba Frota antes de despachar para as demais
```

---

## 📌 Regra Mandatória de Versionamento e Deploy no GitHub

> [!IMPORTANT]
> **SEMPRE QUE UMA NOVA VERSÃO FOR GERADA:**
> 1. O código-fonte DEVE ser commitado e enviado imediatamente para o repositório remoto (`git add .`, `git commit`, `git push origin main`).
> 2. Quando houver mudança no agente C#, a release correspondente (`v1.0.16.0+`) deve ser publicada no repositório de distribuição dos agentes e homologada via lote canário de 5 máquinas piloto.
