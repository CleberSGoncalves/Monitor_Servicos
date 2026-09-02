import os
import shutil
import socket
import datetime
import traceback
from pathlib import Path
from typing import Dict, Any

from .metadata_reader import get_global_machine_metadata
from .version_inspector import get_executable_version
from .config_merger import merge_dotnet_config
from .win_controller import get_service_status, stop_service, start_service, restart_service
from .github_downloader import download_and_extract_release, GitHubDownloaderError
from .sharepoint_client import SharePointClient


class FleetOrchestrator:
    """
    Máquina de Estados e Orquestrador Principal do Agente.
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config

        # Resolver Hostname
        override = config.get("hostname_override")
        self.hostname = override.strip() if override else socket.gethostname()

        # Metadados e Caminhos
        self.configxml_path = config.get("configxml_path", r"D:\MediaDNA_V2\data\configxml.xml")
        self.configmonitor_config_path = config.get(
            "configmonitor_config_path",
            r"C:\MediaDNA_V2\applications\ConfigMonitorSVC\DNA.ConfigMonitorSVC.exe.config"
        )

        # SharePoint Client
        sp_cfg = config.get("sharepoint", {})
        self.sp_client = SharePointClient(
            site_url=sp_cfg.get("site_url", ""),
            list_name=sp_cfg.get("list_name", "Controle_Servicos"),
            client_id=sp_cfg.get("client_id", ""),
            client_secret=sp_cfg.get("client_secret", "")
        )

        # GitHub Token
        gh_cfg = config.get("github", {})
        self.github_token = gh_cfg.get("token", "")

        # Lista de Serviços
        self.services = config.get("services", [])

        # Diretório Base de Backups
        self.backup_base_dir = Path(config.get("backup_base_dir", r"C:\RollbackBackups"))
        self.temp_staging_dir = Path(config.get("temp_staging_dir", r"C:\TempStaging"))

    def run_cycle(self) -> None:
        """
        Executa um ciclo completo de verificação, inventário e ações pendentes.
        """
        print(f"\n==================================================")
        print(f"[orchestrator] Iniciando ciclo em {datetime.datetime.now()} | Host: {self.hostname}")
        print(f"==================================================")

        # Passo 1: Leitura de Metadados Globais (Praça, CS e Url_Comunicacao)
        metadata = get_global_machine_metadata(
            configxml_path=self.configxml_path,
            configmonitor_config_path=self.configmonitor_config_path
        )
        praca = metadata.get("praca", "")
        cs = metadata.get("cs", 0)
        url_comunicacao = metadata.get("url_comunicacao", "")

        print(f"[orchestrator] Metadados extraídos: Praça='{praca}', CS={cs}, Url_Comunicacao='{url_comunicacao}'")

        # Passo 2: Inventário e sincronização dos serviços locais no SharePoint
        for srv in self.services:
            service_name = srv.get("service_name")
            install_path = Path(srv.get("install_path", ""))
            exe_name = srv.get("exe_name", "")
            exe_full_path = install_path / exe_name

            # Leitura da versão e estado do serviço
            installed_ver = get_executable_version(str(exe_full_path))
            status_servico = get_service_status(service_name)

            title = f"{self.hostname}_{service_name}"
            print(f"[orchestrator] Serviço '{title}' -> Status: '{status_servico}', Versão: '{installed_ver}'")

            # Sincronizar item no SharePoint
            self.sp_client.sync_service_inventory(
                hostname=self.hostname,
                praca=praca,
                cs=cs,
                nome_servico=service_name,
                versao_instalada=installed_ver,
                status_servico=status_servico,
                url_comunicacao=url_comunicacao
            )

        # Passo 3: Verificação e Execução de Ações Pendentes no SharePoint
        pending_actions = self.sp_client.get_pending_actions(self.hostname)
        if not pending_actions:
            print("[orchestrator] Nenhuma ação pendente no SharePoint para este host.")
            return

        for action_item in pending_actions:
            title = action_item.get("Title")
            service_name = action_item.get("Nome_Servico")
            acao = action_item.get("Acao_Solicitada")
            target_ver = action_item.get("Versao_Desejada")

            # Encontrar configuração do serviço correspondente
            srv_config = next((s for s in self.services if s.get("service_name") == service_name), None)
            if not srv_config:
                print(f"[orchestrator] Serviço '{service_name}' não configurado no config.json local.")
                continue

            if acao == "Reiniciar":
                self._handle_restart_action(title, service_name)
            elif acao == "Atualizar":
                self._handle_update_action(title, srv_config, target_ver)

    def _handle_restart_action(self, title: str, service_name: str) -> None:
        """
        Trata a ação de reinicialização do serviço Windows.
        """
        print(f"[orchestrator] Executando Ação 'Reiniciar' para '{service_name}'...")
        self.sp_client.update_action_status(title=title, status_atualizacao="Reiniciando Serviço")
        try:
            restart_service(service_name)
            self.sp_client.update_action_status(
                title=title,
                status_atualizacao="Concluído",
                acao_solicitada="Nenhuma"
            )
            print(f"[orchestrator] Serviço '{service_name}' reiniciado com sucesso.")
        except Exception as e:
            err_msg = f"Falha ao reiniciar: {e}"
            print(f"[orchestrator] {err_msg}")
            self.sp_client.update_action_status(title=title, status_atualizacao=f"Falha: {err_msg}")

    def _handle_update_action(self, title: str, srv_config: Dict[str, Any], target_version: str) -> None:
        """
        Trata o pipeline completo de atualização de versão com backup preventivo e rollback em falha.
        """
        service_name = srv_config.get("service_name")
        install_path = Path(srv_config.get("install_path"))
        exe_name = srv_config.get("exe_name")
        config_file_name = srv_config.get("config_file")
        github_repo = srv_config.get("github_repo")

        print(f"[orchestrator] Iniciando pipeline de atualização para '{service_name}' -> Versão Desejada: '{target_version}'")

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self.backup_base_dir / f"{service_name}_{timestamp}"
        staging_dir = self.temp_staging_dir / f"{service_name}_{timestamp}"

        try:
            # Passo 1: Baixando Release
            self.sp_client.update_action_status(title=title, status_atualizacao="Baixando Release")
            extracted_staging = download_and_extract_release(
                github_repo=github_repo,
                tag_name=target_version,
                token=self.github_token,
                target_dir=staging_dir
            )

            # Passo 2: Parando Serviço
            self.sp_client.update_action_status(title=title, status_atualizacao="Parando Serviço")
            stop_service(service_name)

            # Passo 3: Backup Preventivo
            self.sp_client.update_action_status(title=title, status_atualizacao="Realizando Backup")
            print(f"[orchestrator] Criando backup de '{install_path}' em '{backup_dir}'...")
            if install_path.exists():
                shutil.copytree(install_path, backup_dir)

            # Passo 4: Smart XML Config Merge
            self.sp_client.update_action_status(title=title, status_atualizacao="Aplicando Smart Merge")
            old_config = backup_dir / config_file_name
            new_config_in_release = extracted_staging / config_file_name
            merged_config = staging_dir / f"{config_file_name}.merged"

            if old_config.exists() and new_config_in_release.exists():
                merge_dotnet_config(
                    existing_config=old_config,
                    release_config=new_config_in_release,
                    target_output=merged_config
                )
                # Copiar o arquivo mesclado de volta para o diretório de staging sobrepondo o do release
                shutil.copy2(merged_config, new_config_in_release)

            # Passo 5: Implantação de Novos Binários
            self.sp_client.update_action_status(title=title, status_atualizacao="Instalando Binários")
            print(f"[orchestrator] Copiando binários de '{extracted_staging}' para '{install_path}'...")

            # Copiar todos os arquivos extraídos para o diretório de instalação
            install_path.mkdir(parents=True, exist_ok=True)
            for item in os.listdir(extracted_staging):
                s = extracted_staging / item
                d = install_path / item
                if s.is_dir():
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)

            # Passo 6: Iniciando Serviço
            self.sp_client.update_action_status(title=title, status_atualizacao="Iniciando Serviço")
            start_service(service_name)

            # Passo 7: Validação da Nova Versão Binária
            new_installed_ver = get_executable_version(str(install_path / exe_name))
            print(f"[orchestrator] Nova versão detectada após atualização: {new_installed_ver}")

            # Sucesso final!
            self.sp_client.update_action_status(
                title=title,
                status_atualizacao="Concluído",
                acao_solicitada="Nenhuma",
                versao_instalada=new_installed_ver
            )
            print(f"[orchestrator] Atualização do serviço '{service_name}' concluída com sucesso para versão '{new_installed_ver}'!")

            # Limpeza do staging
            try:
                shutil.rmtree(staging_dir)
            except Exception:
                pass

        except Exception as e:
            err_trace = traceback.format_exc()
            err_msg = f"Falha na atualização: {e}"
            print(f"[orchestrator] ❌ {err_msg}\n{err_trace}")

            # Executar Rollback Automático
            self._execute_rollback(title, service_name, install_path, backup_dir, err_msg)

            # Limpeza do staging em falha
            try:
                if staging_dir.exists():
                    shutil.rmtree(staging_dir)
            except Exception:
                pass

    def _execute_rollback(
        self,
        title: str,
        service_name: str,
        install_path: Path,
        backup_dir: Path,
        error_reason: str
    ) -> None:
        """
        Executa o Rollback Automático restaurando a pasta do backup e reativando o serviço anterior.
        """
        print(f"[orchestrator] 🔄 Iniciando ROLLBACK Automático para '{service_name}'...")
        self.sp_client.update_action_status(title=title, status_atualizacao=f"Executando Rollback")

        try:
            # 1. Parar o serviço se estiver rodando
            try:
                stop_service(service_name)
            except Exception:
                pass

            # 2. Restaurar diretório anterior do backup
            if backup_dir.exists():
                print(f"[orchestrator] Restaurando arquivos de backup de '{backup_dir}' para '{install_path}'...")
                if install_path.exists():
                    shutil.rmtree(install_path)
                shutil.copytree(backup_dir, install_path)

            # 3. Reorganizar inicialização do serviço
            start_service(service_name)
            print(f"[orchestrator] Serviço '{service_name}' restaurado e iniciado no estado anterior.")

            # 4. Atualizar SharePoint gravando o motivo da falha
            self.sp_client.update_action_status(
                title=title,
                status_atualizacao=f"Falha: {error_reason} (Rollback executado)"
            )
        except Exception as rb_err:
            critical_msg = f"Falha Crítica no Rollback: {rb_err}"
            print(f"[orchestrator] 🚨 {critical_msg}")
            self.sp_client.update_action_status(
                title=title,
                status_atualizacao=f"Falha Crítica: {critical_msg}"
            )
