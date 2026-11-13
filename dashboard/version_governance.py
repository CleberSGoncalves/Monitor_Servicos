"""
Módulo de Governança Central de Versões da Frota CS — Kantar IBOPE Media
Desacopla o controle de versões desejadas da lista congestionada do SharePoint.
Permite gestão em 1 clique com 0 chamadas externas e sem risco de HTTP 429 (throttling).
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger("version_governance")

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DESIRED_VERSIONS_FILE = DATA_DIR / "desired_versions.json"

# Versões oficiais padrão homologadas pela engenharia
DEFAULT_DESIRED_VERSIONS: Dict[str, str] = {
    "DNA.MonitorServiceSVC": "1.0.21.3",
    "FastMatchingSvc": "1.1.0.0",
    "DNA.DetectionSVC": "3.4.6040.21056",
    "DNA.ConfigMonitorSVC": "4.8.0.0",
    "Atria Capture": "2.0.0.2",
    "DNA.FiletransferSVC": "3.6.6828.34652",
    "DNA.TimeSyncSVC": "3.1.6040.21436",
    "DNA.MediaConverterSVC": "2.0.2.4",
    "DNA.MediaRecorderSVC": "4.5.6024.30490",
    "DNA.TrackingSVC": "3.2.6040.21460",
    "Zabbix Agent": "7.0.0.49955f1fb5c",
    "Tanium Client": "7.8.4.1394",
    "DNA.RemoteCommandSVC": "3.0.6079.30614"
}


def get_desired_versions() -> Dict[str, str]:
    """Retorna o mapeamento de serviço -> versão homologada desejada."""
    if DESIRED_VERSIONS_FILE.exists():
        try:
            with open(DESIRED_VERSIONS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    # Garante que chaves padrão estejam presentes
                    merged = DEFAULT_DESIRED_VERSIONS.copy()
                    merged.update(data)
                    return merged
        except Exception as ex:
            logger.warning(f"Erro ao ler {DESIRED_VERSIONS_FILE}: {ex}. Usando defaults.")
    
    # Salva os defaults se o arquivo não existir
    save_desired_versions(DEFAULT_DESIRED_VERSIONS)
    return DEFAULT_DESIRED_VERSIONS.copy()


def save_desired_versions(versions: Dict[str, str]) -> bool:
    """Persiste as versões desejadas no arquivo local."""
    try:
        with open(DESIRED_VERSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(versions, f, indent=2, ensure_ascii=False)
        return True
    except Exception as ex:
        logger.error(f"Erro ao salvar {DESIRED_VERSIONS_FILE}: {ex}")
        return False


def set_desired_version(service_name: str, version: str) -> Dict[str, Any]:
    """
    Atualiza a versão desejada oficial de um serviço em 1 clique.
    Zero chamadas ao SharePoint Graph API, prevenindo erro 429.
    """
    clean_svc = service_name.strip()
    clean_ver = version.strip().lstrip("vV")
    
    if not clean_svc or not clean_ver:
        return {"success": False, "error": "Nome do serviço e versão são obrigatórios"}

    current = get_desired_versions()
    old_version = current.get(clean_svc, "N/A")
    current[clean_svc] = clean_ver
    
    ok = save_desired_versions(current)
    if ok:
        return {
            "success": True,
            "service_name": clean_svc,
            "old_version": old_version,
            "new_version": clean_ver,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    return {"success": False, "error": "Falha ao gravar arquivo de governança"}


def get_service_fleet_evolution(service_name: str, target_version: Optional[str] = None) -> Dict[str, Any]:
    """
    Computa a esteira de evolução e adoção de atualizações de versão de QUALQUER serviço
    em tempo real a partir do cache da frota em memória (0ms, zero chamadas externas).
    """
    from sharepoint_sync import get_cached_data

    desired_map = get_desired_versions()
    if not target_version:
        target_version = desired_map.get(service_name, "latest")

    clean_target = str(target_version).strip().lstrip("vV")
    data = get_cached_data()
    services = data.get("services", [])

    # Filtra serviços por correspondência exata ou parcial segura
    s_lower = service_name.lower()
    matched_svcs = [
        s for s in services 
        if s.get("nome_servico") == service_name or s_lower in str(s.get("nome_servico", "")).lower()
    ]

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_hosts = len(matched_svcs)

    versions_breakdown: Dict[str, int] = {}
    pending_online_hosts: List[str] = []
    hosts_detail: List[Dict[str, Any]] = []

    updated_count = 0
    updated_online_count = 0
    online_count = 0
    pending_online_count = 0
    offline_count = 0

    for s in matched_svcs:
        hostname = s.get("hostname", "N/A")
        praca = s.get("praca", "N/A")
        cs = s.get("cs", 1)
        v_inst = str(s.get("versao_instalada", "Desconhecido")).strip().lstrip("vV")
        st_svc = s.get("status_servico", "Desconhecido")
        act = s.get("acao_solicitada", "Nenhuma")
        ts = str(s.get("ultima_atualizacao") or "")

        is_today = (today_str in ts) if ts else False
        if is_today:
            online_count += 1

        versions_breakdown[v_inst] = versions_breakdown.get(v_inst, 0) + 1

        is_updated = (v_inst == clean_target) or (
            "monitorservice" in s_lower and v_inst.startswith("1.0.21.") and clean_target.startswith("1.0.21.")
        )
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
            "versao_desejada": clean_target,
            "status_servico": st_svc,
            "status_atualizacao": "Atualizado" if is_updated else "Desatualizado",
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
        "service_name": service_name,
        "target_version": clean_target,
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


def get_all_services_governance_summary() -> Dict[str, Any]:
    """
    Retorna a matriz completa de governança com status de adoção
    para todos os serviços monitorados na frota.
    """
    desired_map = get_desired_versions()
    summaries = []

    # Ordem prioritária de exibição operacional
    priority_order = [
        "DNA.MonitorServiceSVC",
        "FastMatchingSvc",
        "DNA.DetectionSVC",
        "DNA.ConfigMonitorSVC",
        "Atria Capture",
        "DNA.FiletransferSVC",
        "DNA.TimeSyncSVC",
        "DNA.MediaConverterSVC",
        "DNA.MediaRecorderSVC",
        "DNA.TrackingSVC",
        "DNA.RemoteCommandSVC",
        "Zabbix Agent",
        "Tanium Client"
    ]

    for svc_name in priority_order:
        target_ver = desired_map.get(svc_name, "1.0.0.0")
        try:
            evol = get_service_fleet_evolution(svc_name, target_ver)
            pct = evol.get("updated_pct", 0.0)
            
            if pct >= 90.0:
                health = "nominal"
                health_label = "🟢 Homologado"
            elif pct >= 60.0:
                health = "warning"
                health_label = "🟡 Em Rollout"
            else:
                health = "critical"
                health_label = "🔴 Defasado"

            summaries.append({
                "service_name": svc_name,
                "target_version": target_ver,
                "total_hosts": evol.get("total_hosts", 0),
                "updated_count": evol.get("updated_count", 0),
                "updated_pct": pct,
                "pending_online_count": evol.get("pending_online_count", 0),
                "offline_count": evol.get("offline_count", 0),
                "health": health,
                "health_label": health_label,
                "top_versions": list(evol.get("versions_breakdown", {}).keys())[:3]
            })
        except Exception as ex:
            logger.error(f"Erro ao processar sumário de {svc_name}: {ex}")

    return {
        "services": summaries,
        "total_services_tracked": len(summaries),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


def enrich_services_with_central_governance(services: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Enriquece cada item de serviço da frota com a versão desejada oficial central
    e recalcula o status de atualização dinamicamente.
    Elimina falsos alertas causados por colunas defasadas do SharePoint.
    """
    desired_map = get_desired_versions()

    for s in services:
        s_name = s.get("nome_servico", "")
        target_ver = desired_map.get(s_name)
        if not target_ver:
            # Tenta busca case-insensitive
            for k, v in desired_map.items():
                if k.lower() in s_name.lower():
                    target_ver = v
                    break

        if target_ver:
            s["versao_desejada"] = target_ver
            v_inst = str(s.get("versao_instalada", "")).strip().lstrip("vV")
            is_match = (v_inst == target_ver) or (
                "monitorservice" in s_name.lower() and v_inst.startswith("1.0.21.") and target_ver.startswith("1.0.21.")
            )
            if is_match:
                s["status_atualizacao"] = "Atualizado"
                if s.get("acao_solicitada") == "Atualizar":
                    s["acao_solicitada"] = "Nenhuma"
            elif v_inst in ("Não Instalado", "Desconhecido", "0.0.0.0", ""):
                s["status_atualizacao"] = "Não Instalado"
            elif s.get("acao_solicitada") == "Atualizar" or str(s.get("status_atualizacao", "")).lower() in ("em progresso", "atualizando"):
                s["status_atualizacao"] = "Em Progresso"
            else:
                s["status_atualizacao"] = "Desatualizado"

    return services


apply_governance_to_services = enrich_services_with_central_governance
