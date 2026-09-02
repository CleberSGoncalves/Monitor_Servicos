import datetime
from typing import List, Dict, Any, Optional

try:
    from office365.runtime.auth.client_credential import ClientCredential
    from office365.sharepoint.client_context import ClientContext
except ImportError:
    ClientCredential = None
    ClientContext = None


class SharePointClient:
    """
    Cliente para integração com a lista do SharePoint usando office365-rest-python-client.
    Gerencia a leitura de ações pendentes e a sincronização do estado e inventário dos serviços.
    """
    def __init__(self, site_url: str, list_name: str, client_id: str, client_secret: str):
        self.site_url = site_url
        self.list_name = list_name
        self.client_id = client_id
        self.client_secret = client_secret
        self.ctx = None

        if ClientContext is not None and client_id and client_secret:
            try:
                credentials = ClientCredential(client_id, client_secret)
                self.ctx = ClientContext(site_url).with_credentials(credentials)
            except Exception as e:
                print(f"[sharepoint_client] Erro ao inicializar ClientContext do SharePoint: {e}")

    def _get_target_list(self):
        if self.ctx is None:
            raise RuntimeError("ClientContext do SharePoint não foi inicializado.")
        return self.ctx.web.lists.get_by_title(self.list_name)

    def get_service_item_by_title(self, title: str) -> Optional[Any]:
        """
        Busca o item na lista do SharePoint pela chave única Title (Hostname_Nome_Servico).
        """
        if self.ctx is None:
            return None

        sp_list = self._get_target_list()
        items = sp_list.items.filter(f"Title eq '{title}'").get().execute_query()
        if len(items) > 0:
            return items[0]
        return None

    def sync_service_inventory(
        self,
        hostname: str,
        praca: str,
        cs: int,
        nome_servico: str,
        versao_instalada: str,
        status_servico: str,
        url_comunicacao: str
    ) -> Dict[str, Any]:
        """
        Cadastra ou atualiza o item de inventário na lista do SharePoint.
        Preserva Versao_Desejada e Acao_Solicitada existentes se o registro já existir.
        """
        title = f"{hostname}_{nome_servico}"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        if self.ctx is None:
            print(f"[sharepoint_client] Modo offline/simulado para '{title}'.")
            return {"Title": title, "Acao_Solicitada": "Nenhuma"}

        try:
            sp_list = self._get_target_list()
            item = self.get_service_item_by_title(title)

            payload = {
                "Title": title,
                "Hostname": hostname,
                "Pra_x00e7_a": praca,  # Nome interno codificado do SharePoint para 'Praça' se necessário
                "Praca": praca,
                "CS": cs,
                "Nome_Servico": nome_servico,
                "Versao_Instalada": versao_instalada,
                "Status_Servico": status_servico,
                "Ultima_atualizacao": now_iso,
                "Url_Comunicacao": url_comunicacao
            }

            if item is None:
                payload.update({
                    "Versao_Desejada": versao_instalada,
                    "Acao_Solicitada": "Nenhuma",
                    "Status_Atualizacao": "Aguardando"
                })
                # Tentar criar item garantindo compatibilidade com nome interno da coluna
                clean_payload = {k: v for k, v in payload.items() if k != "Pra_x00e7_a"}
                try:
                    new_item = sp_list.add_item(clean_payload).execute_query()
                except Exception:
                    # Tentar com mapeamento alterado de Praça se o SharePoint exigir
                    clean_payload["Praça"] = praca
                    new_item = sp_list.add_item(clean_payload).execute_query()
                print(f"[sharepoint_client] Novo registro criado no SharePoint: {title}")
                return new_item.properties
            else:
                # Atualiza item existente
                clean_payload = {
                    "Hostname": hostname,
                    "CS": cs,
                    "Nome_Servico": nome_servico,
                    "Versao_Instalada": versao_instalada,
                    "Status_Servico": status_servico,
                    "Ultima_atualizacao": now_iso,
                    "Url_Comunicacao": url_comunicacao
                }
                try:
                    item.set_property("Versao_Instalada", versao_instalada)
                    item.set_property("Status_Servico", status_servico)
                    item.set_property("Ultima_atualizacao", now_iso)
                    item.set_property("Url_Comunicacao", url_comunicacao)
                    item.update().execute_query()
                except Exception as ex:
                    print(f"[sharepoint_client] Erro ao atualizar campos individuais: {ex}")

                print(f"[sharepoint_client] Registro atualizado no SharePoint: {title}")
                return item.properties
        except Exception as e:
            print(f"[sharepoint_client] Erro na sincronização com SharePoint para '{title}': {e}")
            return {"Title": title, "Acao_Solicitada": "Nenhuma"}

    def get_pending_actions(self, hostname: str) -> List[Dict[str, Any]]:
        """
        Busca itens da máquina onde Acao_Solicitada != 'Nenhuma'.
        """
        if self.ctx is None:
            return []

        try:
            sp_list = self._get_target_list()
            query_str = f"Hostname eq '{hostname}' and Acao_Solicitada ne 'Nenhuma'"
            items = sp_list.items.filter(query_str).get().execute_query()

            pending = []
            for item in items:
                pending.append({
                    "id": item.properties.get("Id"),
                    "Title": item.properties.get("Title"),
                    "Nome_Servico": item.properties.get("Nome_Servico"),
                    "Versao_Instalada": item.properties.get("Versao_Instalada"),
                    "Versao_Desejada": item.properties.get("Versao_Desejada"),
                    "Acao_Solicitada": item.properties.get("Acao_Solicitada"),
                    "Status_Atualizacao": item.properties.get("Status_Atualizacao")
                })
            return pending
        except Exception as e:
            print(f"[sharepoint_client] Erro ao buscar ações pendentes para hostname '{hostname}': {e}")
            return []

    def update_action_status(
        self,
        title: str,
        status_atualizacao: str,
        acao_solicitada: Optional[str] = None,
        versao_instalada: Optional[str] = None
    ) -> None:
        """
        Atualiza o status de execução da ação no SharePoint.
        """
        if self.ctx is None:
            print(f"[sharepoint_client] Simulação de atualização de status para {title}: {status_atualizacao}")
            return

        try:
            item = self.get_service_item_by_title(title)
            if item is not None:
                item.set_property("Status_Atualizacao", status_atualizacao)
                now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                item.set_property("Ultima_atualizacao", now_iso)
                if acao_solicitada is not None:
                    item.set_property("Acao_Solicitada", acao_solicitada)
                if versao_instalada is not None:
                    item.set_property("Versao_Instalada", versao_instalada)
                item.update().execute_query()
                print(f"[sharepoint_client] Status atualizado no SharePoint [{title}]: {status_atualizacao}")
        except Exception as e:
            print(f"[sharepoint_client] Erro ao atualizar status no SharePoint para '{title}': {e}")
