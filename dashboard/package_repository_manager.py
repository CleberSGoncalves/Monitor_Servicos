# -*- coding: utf-8 -*-
"""
Módulo de Gerenciamento e Auditoria de Repositório de Pacotes de Serviços
========================================================================
Controla os pacotes binários oficiais (.zip) de todos os serviços do ecossistema,
realiza auditoria automatizada de integridade, valida executáveis principais e
versões PE, calcula hashes SHA-256 e repercute as novas versões em todo o
ecossistema (Releases locais, Google Cloud Storage manifest.json, Matriz de
Governança Central e Trilha de Auditoria RBAC).
"""

import os
import re
import sys
import json
import zipfile
import hashlib
import tempfile
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
RELEASES_DIR = BASE_DIR / "releases"
MANIFEST_LOCAL_PATH = RELEASES_DIR / "manifest_sha256.json"

# Mapeamento oficial de serviços e seus executáveis principais esperados
OFFICIAL_SERVICES_METADATA = {
    "DNA.MonitorServiceSVC": {
        "display_name": "DNA.MonitorServiceSVC",
        "description": "Agente C# de Inventário, Monitoramento e Rollout Remoto",
        "primary_exe": "WinServiceFleetAgent.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\MonitorServiceSVC",
        "service_name_sc": "DNA.MonitorServiceSVC",
        "category": "Agente Central",
        "icon": "fa-heartbeat",
        "color": "#38bdf8"
    },
    "Atria Capture": {
        "display_name": "Atria Capture (DigitalTVCapture)",
        "description": "Receptor DTV, Sintonia de Muxes TS e Gravação de Vídeo",
        "primary_exe": "DigitalTVCapture.exe",
        "secondary_exe": "DigitalTVReceiver.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\DTVCapture64",
        "service_name_sc": "Atria Capture",
        "category": "Captura & Broadcast",
        "icon": "fa-tv",
        "color": "#10b981"
    },
    "FastMatchingSvc": {
        "display_name": "FastMatchingSvc",
        "description": "Motor C++ de Fingerprinting e Detecção Comercial Rápida",
        "primary_exe": "FastMatchingSvc.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\FastMatchingSvc",
        "service_name_sc": "FastMatchingSvc",
        "category": "Detecção & IA",
        "icon": "fa-bolt",
        "color": "#f59e0b"
    },
    "DNA.DetectionSVC": {
        "display_name": "DNA.DetectionSVC",
        "description": "Motor Secundário / Legado de Detecção de Comerciais",
        "primary_exe": "DNA.DetectionSVC.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\DetectionSVC",
        "service_name_sc": "DNA.DetectionSVC",
        "category": "Detecção",
        "icon": "fa-fingerprint",
        "color": "#a855f7"
    },
    "DNA.FiletransferSVC": {
        "display_name": "DNA.FiletransferSVC",
        "description": "Serviço de Transferência e Escoamento de Áudio/Vídeo para Central",
        "primary_exe": "DNA.FiletransferSVC.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\FiletransferSVC",
        "service_name_sc": "DNA.FiletransferSVC",
        "category": "Escoamento",
        "icon": "fa-exchange-alt",
        "color": "#ec4899"
    },
    "DNA.ConfigMonitorSVC": {
        "display_name": "DNA.ConfigMonitorSVC",
        "description": "Monitor de Configuração, Licenciamento WCF e Integridade SGG",
        "primary_exe": "DNA.ConfigMonitorSVC.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\ConfigMonitorSVC",
        "service_name_sc": "DNA.ConfigMonitorSVC",
        "category": "Governança",
        "icon": "fa-cogs",
        "color": "#6366f1"
    },
    "DNA.MediaRecorderSVC": {
        "display_name": "DNA.MediaRecorderSVC",
        "description": "Gravação Contínua de Streams de Áudio e Vídeo das Emissoras",
        "primary_exe": "DNA.MediaRecorderSVC.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\MediaRecorderSVC",
        "service_name_sc": "DNA.MediaRecorderSVC",
        "category": "Gravação",
        "icon": "fa-video",
        "color": "#06b6d4"
    },
    "DNA.TimeSyncSVC": {
        "display_name": "DNA.TimeSyncSVC",
        "description": "Sincronização de Relógio de Alta Precisão (NTP Broadcast)",
        "primary_exe": "DNA.TimeSyncSVC.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\TimeSyncSVC",
        "service_name_sc": "DNA.TimeSyncSVC",
        "category": "Infraestrutura",
        "icon": "fa-clock",
        "color": "#8b5cf6"
    },
    "DNA.TrackingSVC": {
        "display_name": "DNA.TrackingSVC",
        "description": "Rastreamento e Telemetria de Transmissão Local",
        "primary_exe": "DNA.TrackingSVC.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\TrackingSVC",
        "service_name_sc": "DNA.TrackingSVC",
        "category": "Telemetria",
        "icon": "fa-chart-line",
        "color": "#14b8a6"
    },
    "DNA.RemoteCommandSVC": {
        "display_name": "DNA.RemoteCommandSVC",
        "description": "Canal de Execução de Comandos Remotos e Correções Automatizadas",
        "primary_exe": "DNA.RemoteCommandSVC.exe",
        "default_dir": r"D:\MediaDNA_V2\Applications\RemoteCommandSVC",
        "service_name_sc": "DNA.RemoteCommandSVC",
        "category": "Automação",
        "icon": "fa-terminal",
        "color": "#f97316"
    },
    "Zabbix Agent": {
        "display_name": "Zabbix Agent",
        "description": "Agente de Métricas de Sistema Operacional e Infraestrutura",
        "primary_exe": "zabbix_agentd.exe",
        "default_dir": r"C:\Program Files\Zabbix Agent",
        "service_name_sc": "Zabbix Agent",
        "category": "Monitoração OS",
        "icon": "fa-server",
        "color": "#ef4444"
    },
    "Tanium Client": {
        "display_name": "Tanium Client",
        "description": "Agente Corporativo de Endpoint Management e Segurança",
        "primary_exe": "TaniumClient.exe",
        "default_dir": r"C:\Program Files (x86)\Tanium\Tanium Client",
        "service_name_sc": "Tanium Client",
        "category": "Segurança",
        "icon": "fa-shield-alt",
        "color": "#64748b"
    }
}


def _ensure_releases_dir() -> Path:
    RELEASES_DIR.mkdir(parents=True, exist_ok=True)
    if not MANIFEST_LOCAL_PATH.exists():
        initial = {
            "packages": {},
            "latest_versions": {},
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        with open(MANIFEST_LOCAL_PATH, "w", encoding="utf-8") as f:
            json.dump(initial, f, indent=2)
    return RELEASES_DIR


def calculate_sha256(file_path_or_bytes) -> str:
    """Calcula o hash SHA-256 de um arquivo ou buffer de bytes."""
    h = hashlib.sha256()
    if isinstance(file_path_or_bytes, (str, Path)):
        with open(file_path_or_bytes, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
    elif isinstance(file_path_or_bytes, (bytes, bytearray)):
        h.update(file_path_or_bytes)
    return h.hexdigest().upper()


def extract_pe_file_version(exe_bytes_or_path) -> Optional[str]:
    """
    Extrai a versão binária (FileVersion) de um executável Windows PE.
    Utiliza PowerShell seguro se for arquivo no Windows, ou heurística em memória.
    """
    temp_file = None
    try:
        if isinstance(exe_bytes_or_path, (bytes, bytearray)):
            with tempfile.NamedTemporaryFile(suffix=".exe", delete=False) as tf:
                tf.write(exe_bytes_or_path)
                temp_file = tf.name
            path_to_check = temp_file
        else:
            path_to_check = str(exe_bytes_or_path)

        if sys.platform == "win32" and os.path.exists(path_to_check):
            cmd = f'powershell -NoProfile -Command "(Get-Item \'{path_to_check}\').VersionInfo.FileVersion"'
            p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
            if p.returncode == 0:
                v_out = p.stdout.strip()
                if v_out and re.match(r"^\d+(\.\d+)+", v_out):
                    return v_out
    except Exception:
        pass
    finally:
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass
    return None


def audit_package_zip(zip_source, service_name: str, declared_version: str) -> Dict[str, Any]:
    """
    Auditor automatizado de pacote ZIP antes da homologação.
    Verifica integridade, executável principal, ausência de subpastas duplicadas,
    versão binária embutida e calcula o hash SHA-256.
    """
    checks = []
    is_valid = True
    sha256_hash = ""
    file_size_bytes = 0
    main_exe_found = None
    detected_binary_ver = None
    root_folder_violation = False
    file_list = []

    service_meta = OFFICIAL_SERVICES_METADATA.get(service_name)
    primary_exe = service_meta.get("primary_exe") if service_meta else None

    temp_zip_path = None
    try:
        if isinstance(zip_source, (bytes, bytearray)):
            file_size_bytes = len(zip_source)
            sha256_hash = calculate_sha256(zip_source)
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
                tf.write(zip_source)
                temp_zip_path = tf.name
            zip_path = temp_zip_path
        else:
            zip_path = str(zip_source)
            file_size_bytes = os.path.getsize(zip_path)
            sha256_hash = calculate_sha256(zip_path)

        # 1. Integridade do ZIP
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                bad_file = zf.testzip()
                if bad_file:
                    is_valid = False
                    checks.append({
                        "id": "zip_integrity",
                        "status": "failed",
                        "label": "Integridade do Arquivo ZIP",
                        "details": f"Arquivo corrompido detectado no ZIP: {bad_file}"
                    })
                else:
                    checks.append({
                        "id": "zip_integrity",
                        "status": "passed",
                        "label": "Integridade do Arquivo ZIP",
                        "details": "Estrutura do arquivo ZIP 100% íntegra e sem corrupção."
                    })

                file_list = zf.namelist()
        except zipfile.BadZipFile:
            is_valid = False
            checks.append({
                "id": "zip_integrity",
                "status": "failed",
                "label": "Integridade do Arquivo ZIP",
                "details": "O arquivo enviado não é um arquivo ZIP válido ou está corrompido."
            })
            return {
                "valid": False,
                "service_name": service_name,
                "declared_version": declared_version,
                "sha256": sha256_hash,
                "file_size_bytes": file_size_bytes,
                "file_size_mb": round(file_size_bytes / (1024 * 1024), 2),
                "checks": checks,
                "summary": "Falha crítica: Arquivo ZIP corrompido ou inválido."
            }

        # 2. Executável Principal e Estrutura de Diretórios
        if primary_exe:
            # Verifica se está na raiz
            in_root = any(f.lower() == primary_exe.lower() for f in file_list)
            in_nested = any(f.lower().endswith("/" + primary_exe.lower()) or f.lower().endswith("\\" + primary_exe.lower()) for f in file_list)

            if in_root:
                main_exe_found = primary_exe
                checks.append({
                    "id": "primary_executable",
                    "status": "passed",
                    "label": f"Executável Principal ({primary_exe})",
                    "details": f"Executável '{primary_exe}' localizado diretamente na raiz do pacote."
                })
            elif in_nested:
                main_exe_found = primary_exe
                root_folder_violation = True
                checks.append({
                    "id": "primary_executable",
                    "status": "warning",
                    "label": f"Executável Principal ({primary_exe})",
                    "details": f"Executável '{primary_exe}' localizado dentro de uma subpasta. Recomenda-se descompactar direto na raiz para não quebrar o serviço Windows."
                })
            else:
                is_valid = False
                checks.append({
                    "id": "primary_executable",
                    "status": "failed",
                    "label": f"Executável Principal ({primary_exe})",
                    "details": f"Executável obrigatório '{primary_exe}' NÃO encontrado dentro do ZIP."
                })
        else:
            checks.append({
                "id": "primary_executable",
                "status": "passed",
                "label": "Executável Principal",
                "details": "Serviço sem executável estrito obrigatório."
            })

        # 3. Leitura e Validação do FileVersion Binário
        if main_exe_found and is_valid:
            try:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    # Encontra o nome exato
                    target_entry = next((f for f in file_list if f.lower() == primary_exe.lower() or f.lower().endswith("/" + primary_exe.lower())), None)
                    if target_entry:
                        exe_data = zf.read(target_entry)
                        detected_binary_ver = extract_pe_file_version(exe_data)
            except Exception:
                pass

            if detected_binary_ver:
                dec_clean = str(declared_version).strip().lstrip("vV")
                det_clean = str(detected_binary_ver).strip().lstrip("vV")

                if dec_clean == det_clean or det_clean.startswith(dec_clean) or dec_clean.startswith(det_clean):
                    checks.append({
                        "id": "binary_version",
                        "status": "passed",
                        "label": "Versão Binária PE (FileVersion)",
                        "details": f"Versão binária real ({detected_binary_ver}) confirmada e 100% alinhada com a versão declarada ({declared_version})."
                    })
                else:
                    checks.append({
                        "id": "binary_version",
                        "status": "warning",
                        "label": "Versão Binária PE (FileVersion)",
                        "details": f"Aviso de divergência: O binário compilado reporta v{detected_binary_ver}, mas a versão homologada declarada é v{declared_version}."
                    })
            else:
                checks.append({
                    "id": "binary_version",
                    "status": "info",
                    "label": "Versão Binária PE (FileVersion)",
                    "details": "Não foi possível extrair a assinatura PE binária diretamente. Será considerada a versão declarada pelo operador."
                })

        # 4. Checagem de Estrutura de Raiz (Anti-Pasta Duplicada)
        if root_folder_violation:
            checks.append({
                "id": "directory_structure",
                "status": "warning",
                "label": "Estrutura de Pastas (Anti-Aninhamento)",
                "details": "O ZIP contém uma pasta intermediária raiz. Ao atualizar um serviço Windows nativo, certifique-se de que o executável fique no diretório de destino."
            })
        else:
            checks.append({
                "id": "directory_structure",
                "status": "passed",
                "label": "Estrutura de Pastas (Anti-Aninhamento)",
                "details": "Estrutura plana/correta para descompactação direta no diretório oficial da aplicação."
            })

    except Exception as ex:
        is_valid = False
        checks.append({
            "id": "general_error",
            "status": "failed",
            "label": "Falha na Auditoria",
            "details": f"Erro inesperado durante a análise do pacote: {str(ex)}"
        })
    finally:
        if temp_zip_path and os.path.exists(temp_zip_path):
            try:
                os.remove(temp_zip_path)
            except Exception:
                pass

    summary = "✅ Pacote aprovado com sucesso na auditoria prévia." if is_valid else "❌ Pacote rejeitado: correções de empacotamento necessárias."
    return {
        "valid": is_valid,
        "service_name": service_name,
        "declared_version": declared_version,
        "detected_binary_version": detected_binary_ver,
        "sha256": sha256_hash,
        "file_size_bytes": file_size_bytes,
        "file_size_mb": round(file_size_bytes / (1024 * 1024), 2),
        "total_files": len(file_list),
        "checks": checks,
        "summary": summary
    }


def get_repository_summary() -> Dict[str, Any]:
    """
    Retorna o inventário completo do repositório de releases e pacotes homologados.
    Combina pacotes locais em releases/, manifesto local, Google Cloud Storage manifest.json
    e matriz de governança central.
    """
    _ensure_releases_dir()
    
    # 1. Lê manifesto local
    local_manifest = {}
    if MANIFEST_LOCAL_PATH.exists():
        try:
            with open(MANIFEST_LOCAL_PATH, "r", encoding="utf-8") as f:
                local_manifest = json.load(f)
        except Exception:
            local_manifest = {}

    local_packages = local_manifest.get("packages", {})

    # 2. Lê manifesto GCS público
    gcs_manifest = {}
    try:
        import urllib.request
        with urllib.request.urlopen("https://storage.googleapis.com/kantar-fleet-releases/manifest.json?t=" + str(int(datetime.now().timestamp())), timeout=5) as r:
            gcs_manifest = json.loads(r.read().decode("utf-8"))
    except Exception:
        gcs_manifest = {}

    gcs_services = gcs_manifest.get("services", {})

    # 3. Lê versões desejadas centrais
    from version_governance import get_desired_versions
    desired_versions = get_desired_versions()

    # 4. Constrói a lista detalhada de cada serviço
    services_list = []
    total_local_packages = 0

    for s_name, meta in OFFICIAL_SERVICES_METADATA.items():
        gov_ver = str(desired_versions.get(s_name) or "1.0.0.0").strip().lstrip("vV")
        gcs_svc = gcs_services.get(s_name, {})
        gcs_ver = str(gcs_svc.get("version") or gcs_svc.get("latest_version") or "").strip().lstrip("vV")
        gcs_url = str(gcs_svc.get("download_url") or "").strip()
        gcs_sha = str(gcs_svc.get("sha256") or "").strip()

        # Busca arquivos locais correspondentes em releases/
        expected_filename = f"{s_name}_v{gov_ver}.zip"
        local_file = RELEASES_DIR / expected_filename
        
        # Se não achar com nome exato, busca qualquer zip deste serviço
        if not local_file.exists():
            matched_files = sorted(RELEASES_DIR.glob(f"{s_name}_v*.zip"), key=os.path.getmtime, reverse=True)
            if matched_files:
                local_file = matched_files[0]
                expected_filename = local_file.name

        has_local_file = local_file.exists()
        file_size_mb = round(local_file.stat().st_size / (1024 * 1024), 2) if has_local_file else 0.0
        local_sha = calculate_sha256(local_file) if has_local_file else local_packages.get(expected_filename, "")

        if has_local_file:
            total_local_packages += 1

        # Status de sincronização
        is_gcs_synced = bool(gcs_ver and (gcs_ver == gov_ver))
        package_status = "Homologado & Sincronizado" if (has_local_file and is_gcs_synced) else ("Pendente GCS" if has_local_file else ("Disponível GCS" if gcs_ver else "Pendente Upload"))

        services_list.append({
            "service_name": s_name,
            "display_name": meta["display_name"],
            "description": meta["description"],
            "category": meta["category"],
            "icon": meta["icon"],
            "color": meta["color"],
            "primary_exe": meta["primary_exe"],
            "default_dir": meta["default_dir"],
            "governed_version": gov_ver,
            "gcs_version": gcs_ver or "--",
            "gcs_download_url": gcs_url,
            "filename": expected_filename,
            "has_local_file": has_local_file,
            "file_size_mb": file_size_mb,
            "sha256": local_sha or gcs_sha or "--",
            "is_gcs_synced": is_gcs_synced,
            "status": package_status,
            "last_updated": gcs_svc.get("updated_at") or datetime.now(timezone.utc).isoformat()
        })

    return {
        "status": "success",
        "total_official_services": len(OFFICIAL_SERVICES_METADATA),
        "total_local_packages": total_local_packages,
        "gcs_manifest_available": bool(gcs_manifest),
        "gcs_updated_at": gcs_manifest.get("updated_at") or "--",
        "services": services_list
    }


def publish_service_package(
    zip_bytes: bytes,
    service_name: str,
    target_version: str,
    operator: str = "Admin",
    justification: str = "Homologação de novo pacote binário no repositório"
) -> Dict[str, Any]:
    """
    Publica um novo pacote de serviço no repositório oficial:
    1. Executa a auditoria automatizada do ZIP.
    2. Se aprovado, grava o ZIP em releases/ e gera o .sha256.
    3. Atualiza releases/manifest_sha256.json.
    4. Atualiza o manifest.json no Google Cloud Storage (gs://kantar-fleet-releases).
    5. Atualiza a versão homologada na Governança Central.
    6. Registra na trilha de auditoria RBAC.
    """
    _ensure_releases_dir()

    clean_ver = str(target_version).strip().lstrip("vV")
    audit_res = audit_package_zip(zip_bytes, service_name, clean_ver)

    if not audit_res.get("valid"):
        return {
            "success": False,
            "error": "O pacote falhou na auditoria automatizada e não pôde ser homologado.",
            "audit": audit_res
        }

    sha256_hash = audit_res["sha256"]
    package_filename = f"{service_name}_v{clean_ver}.zip"
    dest_zip_path = RELEASES_DIR / package_filename
    dest_sha_path = RELEASES_DIR / f"{package_filename}.sha256"

    # 1. Grava o pacote binário
    with open(dest_zip_path, "wb") as f:
        f.write(zip_bytes)

    with open(dest_sha_path, "w", encoding="utf-8") as f:
        f.write(f"{sha256_hash} *{package_filename}\n")

    # 2. Atualiza o manifesto local
    try:
        manifest_data = {}
        if MANIFEST_LOCAL_PATH.exists():
            with open(MANIFEST_LOCAL_PATH, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
        packages_dict = manifest_data.setdefault("packages", {})
        packages_dict[package_filename] = sha256_hash
        manifest_data.setdefault("latest_versions", {})[service_name] = clean_ver
        manifest_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        with open(MANIFEST_LOCAL_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)
    except Exception as ex:
        pass

    # 3. Atualiza o manifesto no Google Cloud Storage
    gcs_manifest_ok = False
    try:
        from gcp_sync import update_gcs_manifest_version
        gcs_manifest_ok = update_gcs_manifest_version(service_name, clean_ver)
    except Exception:
        pass

    # 4. Atualiza a versão na Governança Central (Single Source of Truth)
    gov_ok = False
    try:
        from version_governance import set_desired_version
        gov_res = set_desired_version(service_name, clean_ver)
        gov_ok = gov_res.get("success", False)
    except Exception:
        pass

    # 5. Registra na Trilha de Auditoria RBAC
    try:
        from fleet_rbac import record_audit_action
        record_audit_action(
            username=operator,
            role="ADMIN",
            operation="PUBLISH_PACKAGE",
            service_name=service_name,
            target_hosts=["REPOSITORIO_CENTRAL"],
            justification=f"[REPOSITÓRIO] Publicação do pacote {package_filename} (SHA256: {sha256_hash[:12]}...). {justification}",
            status="SUCCESS",
            details={
                "filename": package_filename,
                "version": clean_ver,
                "sha256": sha256_hash,
                "file_size_mb": audit_res["file_size_mb"],
                "gcs_synced": gcs_manifest_ok,
                "governance_synced": gov_ok
            }
        )
    except Exception:
        pass

    return {
        "success": True,
        "message": f"Pacote {package_filename} auditado, homologado e publicado com sucesso no ecossistema!",
        "filename": package_filename,
        "service_name": service_name,
        "version": clean_ver,
        "sha256": sha256_hash,
        "file_size_mb": audit_res["file_size_mb"],
        "gcs_manifest_updated": gcs_manifest_ok,
        "governance_updated": gov_ok,
        "audit": audit_res
    }
