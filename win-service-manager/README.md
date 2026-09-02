# Windows Services Fleet Manager

Plataforma completa para monitoramento remoto, controle de inventário de versões e atualização remota de serviços Windows legados baseados em .NET Framework.

---

## 🏛️ Visão Geral da Arquitetura

O sistema é composto por dois módulos independentes e desacoplados:

1. **Publisher (Web UI - Streamlit)**:
   - Interface web interativa para publicação de releases.
   - Conecta-se à API REST v3 do GitHub para criar Releases formais e realizar upload do pacote binário `.zip`.

2. **Agent (Windows Service Nativo em Python com PyWin32)**:
   - Serviço Windows nativo que executa em segundo plano.
   - **Leitor de Metadados**: Extrai `Praça` (`idHost`) e `CS` de `D:\MediaDNA_V2\data\configxml.xml` (suportando encoding `Windows-1252`) e `Url_Comunicacao` (`WCFMainURL`) do `.exe.config`.
   - **Inspetor de Versão PE**: Lê a versão binária compilada nos executáveis `.exe` via `win32api.GetFileVersionInfo`.
   - **Barramento SharePoint**: Sincroniza periodicamente o status da máquina e responde a comandos operacionais (`Reiniciar`, `Atualizar`).
   - **Motor Smart XML Merge**: Preserva intactas as configurações locais de máquina em `<applicationSettings>` e `<appSettings>` durante atualizações de versão.
   - **Backup e Rollback Automático**: Garante a criação de backup em `C:\RollbackBackups` antes de aplicar atualizações e executa rollback automático em caso de falha.

---

## 📁 Estrutura de Diretórios

```
win-service-manager/
├── docs/
│   └── sharepoint_schema.md    # Esquema detalhado da lista do SharePoint
├── publisher/
│   ├── app.py                  # Interface gráfica Streamlit
│   ├── github_client.py        # Cliente API do GitHub (Releases & Upload)
│   └── requirements.txt        # Dependências do Publisher
├── agent/
│   ├── config.json             # Configuração local do agente (SharePoint, GitHub, Serviços)
│   ├── requirements.txt        # Dependências do Agent (pywin32, office365-rest-python-client, requests)
│   ├── service_host.py         # Entrypoint do Serviço Windows com suporte a modo debug
│   ├── install_service.bat     # Script de instalação do serviço Windows (Executar como Admin)
│   ├── uninstall_service.bat   # Script de remoção do serviço Windows
│   └── core/
│       ├── __init__.py
│       ├── metadata_reader.py  # Leitor de configxml.xml e WCFMainURL
│       ├── version_inspector.py# Inspetor de versão PE via win32api
│       ├── config_merger.py    # Motor Smart XML Merge de arquivos .config
│       ├── win_controller.py   # Controle de ciclo de vida (Start, Stop, Query) dos Serviços Windows
│       ├── github_downloader.py# Downloader e extrator de assets .zip do GitHub
│       ├── sharepoint_client.py# Cliente de integração com SharePoint
│       └── orchestrator.py     # Máquina de estados principal do Agente
└── README.md
```

---

## 🚀 Como Executar

### 1. Módulo Publisher (Streamlit)

```bash
# 1. Navegar até o diretório do publisher
cd publisher

# 2. Instalar dependências
pip install -r requirements.txt

# 3. Executar a aplicação Web
streamlit run app.py
```

Acesse o painel web no navegador em `http://localhost:8501`. Informe seu **GitHub Personal Access Token**, selecione o repositório, insira a Tag (ex: `v2.4.1`), adicione a descrição do changelog e faça upload do arquivo `.zip` para criar a release.

---

### 2. Módulo Agent (Windows Service)

#### A. Configuração Local (`agent/config.json`)
Edite o arquivo `agent/config.json` definindo:
- Credenciais do SharePoint (`site_url`, `list_name`, `client_id`, `client_secret`).
- GitHub Access Token (`github.token`).
- Lista de serviços a serem monitorados (`service_name`, `install_path`, `exe_name`, `config_file`, `github_repo`).

#### B. Testar em Modo Debug / Standalone (Sem registrar serviço)
```bash
cd agent
pip install -r requirements.txt
python service_host.py debug
```

#### C. Instalar como Serviço Nativo do Windows
Abra o terminal de comando (CMD) **como Administrador** e execute:
```cmd
cd agent
install_service.bat
```

Para remover o serviço:
```cmd
cd agent
uninstall_service.bat
```

---

## 🛡️ Regra do Smart XML Merge (`config_merger.py`)

O motor de merge preserva as configurações locais da máquina sem sobrescrevê-las ao instalar uma nova release:
- **`applicationSettings/setting/value`**: Preserva os valores das tags `<value>` das configurações com nomes correspondentes.
- **`appSettings/add`**: Preserva os valores do atributo `value` para cada chave `key` em `<appSettings>`.
- **Novas seções / tags da release**: Quaisquer novas seções ou tags adicionadas na release são mantidas intactas no XML final.

---

## 📋 Lista do SharePoint (`Controle_Servicos`)

Certifique-se de que a lista criada no SharePoint contenha os seguintes campos exatamente como descritos no documento [`docs/sharepoint_schema.md`](docs/sharepoint_schema.md):
- `Title` (Texto, Ex: `SRV-CAP-01_DNA.ConfigMonitorSVC`)
- `Hostname` (Texto)
- `Praça` (Texto)
- `CS` (Número)
- `Nome_Servico` (Texto)
- `Versao_Instalada` (Texto)
- `Versao_Desejada` (Texto)
- `Status_Servico` (Opção: `Em Execução`, `Parado`, `Não Encontrado`)
- `Acao_Solicitada` (Opção: `Nenhuma`, `Atualizar`, `Reiniciar`)
- `Status_Atualizacao` (Texto)
- `Ultima_atualizacao` (Data/Hora)
- `Url_Comunicacao` (Texto)
