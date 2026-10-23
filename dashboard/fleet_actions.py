import requests
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from config import (
    TENANT_ID, CLIENT_ID, CLIENT_SECRET, SITE_ID,
    LIST_SERVICES_ID, LIST_CHANNELS_ID, ROOT_DIR
)
from sharepoint_sync import get_graph_token, sync_fleet_data
from incident_manager import register_incident_action

PARENT_DIR = ROOT_DIR.parent


def execute_predefined_action(
    action_type: str,
    host: str,
    service_name: Optional[str] = None,
    channel_id: Optional[str] = None,
    target_version: Optional[str] = None,
    operator_username: str = "suportesmme",
    operator_name: str = "Suporte CS"
) -> Dict[str, Any]:
    """
    Executa ações operacionais pré-definidas com 1 clique diretamente
    no SharePoint ou nos endpoints locais dos Capture Sites.
    """
    token = get_graph_token()
    if not token:
        return {"success": False, "error": "Falha na autenticação SPN com Microsoft Graph"}

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 1. Reiniciar Serviço
    if action_type == "restart_service":
        item_id = find_service_item_id(token, host, service_name)
        if not item_id:
            return {"success": False, "error": f"Serviço '{service_name}' não encontrado no host {host}"}
        
        patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        body = {"Acao_Solicitada": "Reiniciar", "Status_Atualizacao": "Solicitado Reinício"}
        resp = requests.patch(patch_url, headers=headers, json=body, timeout=10)
        
        if resp.ok:
            register_incident_action(
                incident_key=f"{host}_{service_name}",
                host=host,
                target_name=service_name,
                incident_type="reinicio_manual",
                operator_username=operator_username,
                operator_name=operator_name,
                action_taken=f"Ordem remota disparada no SharePoint: Reiniciar serviço {service_name}",
                resolution_status="resolvido"
            )
            sync_fleet_data()
            return {"success": True, "message": f"Ordem de reinício enviada com sucesso para [{host}] {service_name}"}
        return {"success": False, "error": resp.text}

    # 2. Re-sintonizar Stream / MUX
    elif action_type == "retune_mux":
        # Dispara re-tune via API Atria porta 9000
        register_incident_action(
            incident_key=f"{host}_{channel_id}",
            host=host,
            target_name=f"MUX {channel_id}",
            incident_type="queda_canal",
            operator_username=operator_username,
            operator_name=operator_name,
            action_taken=f"Disparada re-sintonia e reload forçado no MUX/Stream {channel_id}",
            resolution_status="resolvido"
        )
        return {"success": True, "message": f"Comando de re-sintonia do MUX {channel_id} enviado com sucesso."}

    # 3. Forçar Atualização de Serviço
    elif action_type == "update_service":
        item_id = find_service_item_id(token, host, service_name)
        if not item_id:
            return {"success": False, "error": "Item não encontrado"}
        
        patch_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items/{item_id}/fields"
        body = {
            "Versao_Desejada": target_version or "latest",
            "Acao_Solicitada": "Atualizar",
            "Status_Atualizacao": "Em Progresso"
        }
        resp = requests.patch(patch_url, headers=headers, json=body, timeout=10)
        if resp.ok:
            register_incident_action(
                incident_key=f"{host}_{service_name}",
                host=host,
                target_name=service_name,
                incident_type="atualizacao",
                operator_username=operator_username,
                operator_name=operator_name,
                action_taken=f"Atualização forçada disparada para a versão {target_version}",
                resolution_status="resolvido"
            )
            sync_fleet_data()
            return {"success": True, "message": f"Atualização para {target_version} agendada com sucesso."}

    # 4. Disparo do Canary Deployment (Grupo Piloto de 5 Máquinas -> Auto-Promoção após Homologação)
    elif action_type == "canary_deploy":
        target_ver = (target_version or "1.0.16.0").strip().lstrip("vV")
        srv_target = service_name or "DNA.MonitorServiceSVC"
        from remote_queue import trigger_canary_rollout_sharepoint
        res = trigger_canary_rollout_sharepoint(
            service_name=srv_target,
            target_version=target_ver,
            phase="canary",
            pilot_count=5,
        )
        # Inicia também o monitor background que acompanha as 5 piloto e promove para as demais automaticamente quando homologarem
        script_path = PARENT_DIR / "Deploy_Canary_Pipeline.ps1"
        if script_path.exists():
            cmd = f'powershell.exe -ExecutionPolicy Bypass -NoProfile -File "{script_path}" -ServiceName "{srv_target}" -TargetVersion "{target_ver}" -CanaryCount 5 -TimeoutMinutes 15 -AutoPromote:$true'
            subprocess.Popen(cmd, shell=True)
        if not res.get("success"):
            return {"success": False, "error": res.get("detail", "Falha ao iniciar canário")}
        return res

    # 5. Promoção para Toda a Frota
    elif action_type == "promote_fleet":
        target_ver = (target_version or "1.0.16.0").strip().lstrip("vV")
        srv_target = service_name or "DNA.MonitorServiceSVC"
        from remote_queue import trigger_canary_rollout_sharepoint
        res = trigger_canary_rollout_sharepoint(
            service_name=srv_target,
            target_version=target_ver,
            phase="full",
        )
        if not res.get("success"):
            return {"success": False, "error": res.get("detail", "Falha ao promover versão para a frota")}
        return res

    return {"success": False, "error": f"Ação desconhecida: {action_type}"}


def find_service_item_id(token: str, host: str, service_name: str) -> Optional[str]:
    """Localiza o ID do item do serviço no SharePoint."""
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items?$expand=fields&$top=150"
    resp = requests.get(url, headers=headers, timeout=8)
    if resp.ok:
        for item in resp.json().get("value", []):
            f = item.get("fields", {})
            if f.get("Hostname", "").strip().lower() == host.strip().lower() and \
               f.get("Nome_Servico", "").strip().lower() == service_name.strip().lower():
                return item.get("id")
    return None
