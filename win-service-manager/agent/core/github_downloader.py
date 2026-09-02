import os
import zipfile
import requests
from pathlib import Path

class GitHubDownloaderError(Exception):
    """Exception raised for errors in release download process."""
    pass


def download_and_extract_release(
    github_repo: str,
    tag_name: str,
    token: str,
    target_dir: Path
) -> Path:
    """
    Consulta o asset .zip da release desejada via API do GitHub (/repos/{owner}/{repo}/releases/tags/{tag}).
    Efetua download autenticado via token com stream de chunks para pasta temporária e extrai o conteúdo.
    """
    target_dir = Path(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    # Tratar tags com 'v' inicial ou sem
    clean_tag = tag_name.strip()
    if clean_tag.lower() == "latest":
        url = f"https://api.github.com/repos/{github_repo}/releases/latest"
    else:
        url = f"https://api.github.com/repos/{github_repo}/releases/tags/{clean_tag}"

    print(f"[github_downloader] Consultando release no GitHub: {url}")
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code != 200:
        raise GitHubDownloaderError(
            f"Falha ao consultar release '{clean_tag}' no repositório '{github_repo}' (HTTP {resp.status_code}): {resp.text}"
        )

    release_info = resp.json()
    assets = release_info.get("assets", [])

    zip_asset = None
    for asset in assets:
        if asset.get("name", "").endswith(".zip"):
            zip_asset = asset
            break

    if not zip_asset:
        raise GitHubDownloaderError(
            f"Nenhum arquivo .zip foi encontrado entre os assets da release '{clean_tag}' em '{github_repo}'."
        )

    asset_url = zip_asset.get("url")
    asset_name = zip_asset.get("name")
    print(f"[github_downloader] Baixando asset '{asset_name}' ({zip_asset.get('size')} bytes)...")

    # Header específico para download de asset binário da API v3 do GitHub
    asset_headers = headers.copy()
    asset_headers["Accept"] = "application/octet-stream"

    zip_temp_path = target_dir / asset_name
    with requests.get(asset_url, headers=asset_headers, stream=True, timeout=120) as r:
        if r.status_code != 200:
            raise GitHubDownloaderError(
                f"Erro ao baixar o asset binário (HTTP {r.status_code}): {r.text}"
            )
        with open(zip_temp_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

    print(f"[github_downloader] Extraindo '{zip_temp_path}' para '{target_dir}'...")
    with zipfile.ZipFile(zip_temp_path, "r") as zip_ref:
        zip_ref.extractall(target_dir)

    # Remover o arquivo .zip temporário após extração
    try:
        os.remove(zip_temp_path)
    except Exception:
        pass

    print(f"[github_downloader] Extração concluída em '{target_dir}'.")
    return target_dir
