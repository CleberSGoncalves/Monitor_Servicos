import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Any

def get_global_machine_metadata(configxml_path: str, configmonitor_config_path: str) -> Dict[str, Any]:
    """
    Extrai Praça (idHost), CS e Url_Comunicacao (WCFMainURL).
    - Praça e CS são lidos do arquivo configxml.xml (com suporte a encoding Windows-1252).
    - Url_Comunicacao é lida da tag <setting name="WCFMainURL"> no DNA.ConfigMonitorSVC.exe.config.
    """
    metadata = {
        "praca": "",
        "cs": 0,
        "url_comunicacao": ""
    }

    # 1. Leitura do configxml.xml (codificação Windows-1252)
    cfg_file = Path(configxml_path)
    if cfg_file.exists():
        try:
            parser = ET.XMLParser(encoding="Windows-1252")
            tree = ET.parse(cfg_file, parser=parser)
            root = tree.getroot()
            host_info = root.find("hostInformation")
            if host_info is not None:
                id_host = host_info.find("idHost")
                cs_elem = host_info.find("CS")
                if id_host is not None and id_host.text:
                    metadata["praca"] = id_host.text.strip()
                if cs_elem is not None and cs_elem.text:
                    try:
                        metadata["cs"] = int(cs_elem.text.strip())
                    except ValueError:
                        metadata["cs"] = 0
        except Exception as e:
            print(f"[metadata_reader] Erro ao ler {configxml_path}: {e}")
    else:
        print(f"[metadata_reader] Arquivo não encontrado: {configxml_path}")

    # 2. Leitura do WCFMainURL no DNA.ConfigMonitorSVC.exe.config
    cm_file = Path(configmonitor_config_path)
    if cm_file.exists():
        try:
            tree = ET.parse(cm_file)
            root = tree.getroot()
            for setting in root.findall(".//setting"):
                if setting.get("name") == "WCFMainURL":
                    val = setting.find("value")
                    if val is not None and val.text:
                        metadata["url_comunicacao"] = val.text.strip()
                    break
        except Exception as e:
            print(f"[metadata_reader] Erro ao ler {configmonitor_config_path}: {e}")
    else:
        print(f"[metadata_reader] Arquivo não encontrado: {configmonitor_config_path}")

    return metadata
