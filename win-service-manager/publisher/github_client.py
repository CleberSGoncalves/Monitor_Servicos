import requests
from typing import Dict, Any

class GitHubClientError(Exception):
    """Custom exception for GitHub API operations."""
    pass


def create_github_release(
    owner: str,
    repo: str,
    tag_name: str,
    name: str,
    body: str,
    token: str
) -> Dict[str, Any]:
    """
    Creates a formal GitHub Release via REST API v3.
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/releases"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    payload = {
        "tag_name": tag_name,
        "target_commitish": "main",
        "name": name if name else tag_name,
        "body": body,
        "draft": False,
        "prerelease": False
    }

    response = requests.post(url, json=payload, headers=headers, timeout=30)
    if response.status_code not in (200, 201):
        raise GitHubClientError(
            f"Failed to create GitHub release (HTTP {response.status_code}): {response.text}"
        )
    return response.json()


def upload_release_asset(
    upload_url: str,
    file_bytes: bytes,
    filename: str,
    token: str
) -> Dict[str, Any]:
    """
    Uploads a binary file asset (.zip) to a GitHub Release endpoint.
    """
    # Clean template specifier like '{?name,label}' from upload_url
    clean_upload_url = upload_url.split('{')[0]
    target_url = f"{clean_upload_url}?name={filename}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/zip",
        "Accept": "application/vnd.github.v3+json",
    }

    response = requests.post(target_url, data=file_bytes, headers=headers, timeout=120)
    if response.status_code not in (200, 201):
        raise GitHubClientError(
            f"Failed to upload asset (HTTP {response.status_code}): {response.text}"
        )
    return response.json()
