import xml.etree.ElementTree as ET
from pathlib import Path

def merge_dotnet_config(existing_config: Path, release_config: Path, target_output: Path) -> None:
    """
    Executa o Smart Merge de arquivos .config do .NET.
    Garante que parâmetros locais da máquina (chaves Zabbix, paths locais e endpoints)
    existentes no .config antigo não sejam sobrescritos pelo .config novo da release.
    Novas seções ou chaves trazidas na release são preservadas intactas.
    """
    existing_config = Path(existing_config)
    release_config = Path(release_config)
    target_output = Path(target_output)

    old_settings = {}
    old_app_settings = {}

    # 1. Mapear configurações do arquivo existente
    if existing_config.exists():
        try:
            old_tree = ET.parse(existing_config)
            old_root = old_tree.getroot()

            # Mapear applicationSettings e userSettings existentes
            for s in old_root.findall(".//setting"):
                name = s.get("name")
                val = s.find("value")
                if name and val is not None:
                    old_settings[name] = val.text

            # Mapear appSettings existentes
            for a in old_root.findall(".//appSettings/add"):
                k = a.get("key")
                v = a.get("value")
                if k:
                    old_app_settings[k] = v
        except Exception as e:
            print(f"[config_merger] Aviso: Erro ao ler config existente {existing_config}: {e}")

    # 2. Carregar o novo arquivo de configuração da release
    if not release_config.exists():
        raise FileNotFoundError(f"Arquivo de release .config não encontrado em {release_config}")

    new_tree = ET.parse(release_config)
    new_root = new_tree.getroot()

    # 3. Injetar valores salvos de applicationSettings / userSettings no novo XML
    for s in new_root.findall(".//setting"):
        name = s.get("name")
        if name in old_settings:
            val = s.find("value")
            if val is not None:
                val.text = old_settings[name]

    # 4. Injetar valores salvos de appSettings no novo XML
    for a in new_root.findall(".//appSettings/add"):
        k = a.get("key")
        if k in old_app_settings:
            a.set("value", old_app_settings[k])

    # 5. Salvar arquivo mesclado garantindo declaração UTF-8
    target_output.parent.mkdir(parents=True, exist_ok=True)
    new_tree.write(target_output, encoding="utf-8", xml_declaration=True)
    print(f"[config_merger] Smart Merge concluído com sucesso: {target_output}")
