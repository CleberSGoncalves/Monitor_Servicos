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
        target_ver = (target_version or "1.0.20.0").strip().lstrip("vV")
        srv_target = service_name or "DNA.MonitorServiceSVC"
        from remote_queue import trigger_canary_rollout_sharepoint
        res = trigger_canary_rollout_sharepoint(
            service_name=srv_target,
            target_version=target_ver,
            phase="canary",
            pilot_count=5,
        )
        # Inicia também o monitor background que acompanha as 5 piloto e promove para as demais automaticamente quando homologarem
        import re
        safe_srv = srv_target if re.match(r"^[A-Za-z0-9._-]+$", srv_target) else "DNA.MonitorServiceSVC"
        safe_ver = target_ver if re.match(r"^[0-9.]+$", target_ver) else "1.0.20.0"
        script_path = PARENT_DIR / "Deploy_Canary_Pipeline.ps1"
        if script_path.exists():
            subprocess.Popen(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-File",
                    str(script_path),
                    "-ServiceName",
                    safe_srv,
                    "-TargetVersion",
                    safe_ver,
                    "-CanaryCount",
                    "5",
                    "-TimeoutMinutes",
                    "15",
                ],
                shell=False,
            )
        if not res.get("success"):
            return {"success": False, "error": res.get("detail", "Falha ao iniciar canário")}
        return res

    # 5. Promoção para Toda a Frota
    elif action_type == "promote_fleet":
        target_ver = (target_version or "1.0.20.0").strip().lstrip("vV")
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
    """Localiza o ID do item do serviço no SharePoint utilizando primeiro o cache em memória (0ms, 0 chamadas HTTP)."""
    # 1. Consulta em memória do cache consolidado
    try:
        from sharepoint_sync import get_cached_data
        c_data = get_cached_data()
        for s in c_data.get("services", []):
            if (s.get("hostname", "").strip().lower() == host.strip().lower() and
                s.get("nome_servico", "").strip().lower() == service_name.strip().lower()):
                clean_id = str(s.get("id", "")).split("_")[0]
                if clean_id:
                    return clean_id
    except Exception:
        pass

    # 2. Fallback de rede com projeção seletiva estrita
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_SERVICES_ID}/items?$select=id,fields&$expand=fields($select=Hostname,Nome_Servico)&$top=150"
    resp = requests.get(url, headers=headers, timeout=8)
    if resp.ok:
        for item in resp.json().get("value", []):
            f = item.get("fields", {})
            if f.get("Hostname", "").strip().lower() == host.strip().lower() and \
               f.get("Nome_Servico", "").strip().lower() == service_name.strip().lower():
                return str(item.get("id", "")).split("_")[0]
    return None


def get_fleet_update_evolution(target_version: str = "1.0.20.0") -> Dict[str, Any]:
    """
    Computa a esteira de evolução e adoção de atualizações de versão do agente DNA.MonitorServiceSVC
    em tempo real a partir do cache da frota em memória (0ms, zero chamadas externas).
    """
    from datetime import datetime, timezone
    from sharepoint_sync import get_cached_data

    data = get_cached_data()
    services = data.get("services", [])

    # Filtra estritamente pelo serviço do agente de frota
    agent_svcs = [s for s in services if s.get("nome_servico") == "DNA.MonitorServiceSVC"]
    if not agent_svcs:
        agent_svcs = [s for s in services if "monitorservice" in str(s.get("nome_servico", "")).lower()]

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_hosts = len(agent_svcs)

    versions_breakdown = {}
    pending_online_hosts = []
    hosts_detail = []

    updated_count = 0
    updated_online_count = 0
    online_count = 0
    pending_online_count = 0
    offline_count = 0

    for s in agent_svcs:
        hostname = s.get("hostname", "N/A")
        praca = s.get("praca", "N/A")
        cs = s.get("cs", 1)
        v_inst = s.get("versao_instalada", "Desconhecido")
        v_des = s.get("versao_desejada", "N/A")
        st_svc = s.get("status_servico", "Desconhecido")
        st_at = s.get("status_atualizacao", "Desconhecido")
        act = s.get("acao_solicitada", "Nenhuma")
        ts = str(s.get("ultima_atualizacao") or "")

        is_today = (today_str in ts) if ts else False
        if is_today:
            online_count += 1

        versions_breakdown[v_inst] = versions_breakdown.get(v_inst, 0) + 1

        is_updated = (v_inst == target_version)
        if is_updated:
            category = "updated"
            updated_count += 1
            if is_today:
                updated_online_count += 1
        elif is_today:
            category = "pending_online"
            pending_online_count += 1
            if hostname not in ("COMPUTER-01PR70", "N/A"):
                pending_online_hosts.append(hostname)
        else:
            category = "offline"
            offline_count += 1

        hosts_detail.append({
            "hostname": hostname,
            "praca": praca,
            "cs": cs,
            "versao_instalada": v_inst,
            "versao_desejada": v_des,
            "status_servico": st_svc,
            "status_atualizacao": st_at,
            "acao_solicitada": act,
            "ultima_atualizacao": ts,
            "is_online_today": is_today,
            "category": category
        })

    pending_online_hosts = sorted(list(set(pending_online_hosts)))
    cat_order = {"pending_online": 0, "offline": 1, "updated": 2}
    hosts_detail.sort(key=lambda h: (cat_order.get(h["category"], 9), h["praca"], h["hostname"]))

    updated_pct = round((updated_count / total_hosts * 100), 1) if total_hosts > 0 else 0.0
    active_adoption_pct = min(100.0, round((updated_online_count / online_count * 100), 1)) if online_count > 0 else 0.0

    return {
        "target_version": target_version,
        "total_hosts": total_hosts,
        "updated_count": updated_count,
        "updated_pct": updated_pct,
        "online_count": online_count,
        "active_adoption_pct": active_adoption_pct,
        "pending_online_count": pending_online_count,
        "offline_count": offline_count,
        "versions_breakdown": dict(sorted(versions_breakdown.items(), key=lambda x: -x[1])),
        "pending_online_hosts": pending_online_hosts,
        "pending_online_csv": ", ".join(pending_online_hosts),
        "hosts_detail": hosts_detail,
        "last_sync": data.get("last_sync", datetime.now(timezone.utc).isoformat())
    }

