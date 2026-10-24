# dashboard/updater.py
r"""
Módulo de Atualização Automática do Dashboard Central de Monitoração CS Fleet.
Suporta atualização via 'git pull' ou via GitHub Zipball (sem dependência de git instalado),
com preservação de banco de dados SQLite, configurações locais, logs e PIDs.
"""
import os
import sys
import json
import shutil
import zipfile
import urllib.request
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT_DIR / "version.json"
TOKEN_FILE = ROOT_DIR / "github_token.txt"

GITHUB_REPO = "CleberSGoncalves/Monitor_Servicos"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/commits/main"
GITHUB_ZIPBALL_URL = f"https://api.github.com/repos/{GITHUB_REPO}/zipball/main"

DEFAULT_VERSION = "v3.9.43"

SUBPROCESS_FLAGS = 0
if sys.platform == "win32":
    SUBPROCESS_FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)


def get_token() -> str:
    """Obtém token do ambiente ou arquivo ignorado pelo git."""
    tok = os.getenv("GITHUB_TOKEN", "").strip()
    if not tok and TOKEN_FILE.exists():
        try:
            tok = TOKEN_FILE.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return tok


def get_auth_headers() -> Dict[str, str]:
    headers = {
        "User-Agent": "MonitorServicos-Updater",
        "Accept": "application/vnd.github.v3+json"
    }
    tok = get_token()
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    return headers


def get_local_version_info() -> Dict[str, Any]:
    """Retorna versão local e commit atual resolvendo SHA real do Git quando disponível."""
    git_sha = ""
    try:
        git_sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(ROOT_DIR),
            stderr=subprocess.DEVNULL,
            text=True,
            creationflags=SUBPROCESS_FLAGS
        ).strip()
    except Exception:
        pass

    if VERSION_FILE.exists():
        try:
            info = json.loads(VERSION_FILE.read_text(encoding="utf-8"))
            ver = info.get("version") or DEFAULT_VERSION
            if ver == "v3.9.14":
                ver = DEFAULT_VERSION
            sha = info.get("commit_sha", "")
            if (not sha or sha == "auto") and git_sha:
                sha = git_sha
            info["version"] = ver
            info["commit_sha"] = sha or git_sha or "local"
            return info
        except Exception:
            pass

    return {
        "version": DEFAULT_VERSION,
        "agent_version": "1.0.16.0",
        "commit_sha": git_sha or "local",
        "updated_at": datetime.now().isoformat()
    }


def save_local_version_info(commit_sha: str, version: Optional[str] = None):
    disk_ver = DEFAULT_VERSION
    agent_ver = "1.0.16.0"
    if VERSION_FILE.exists():
        try:
            existing = json.loads(VERSION_FILE.read_text(encoding="utf-8"))
            if existing.get("version") and existing.get("version") != "v3.9.14":
                disk_ver = existing["version"]
            if existing.get("agent_version"):
                agent_ver = existing["agent_version"]
        except Exception:
            pass
    final_version = version if (version and version != "v3.9.14") else disk_ver
    data = {
        "version": final_version,
        "agent_version": agent_ver,
        "commit_sha": commit_sha[:7] if commit_sha else "auto",
        "updated_at": datetime.now().isoformat()
    }
    try:
        VERSION_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print(f"[Updater] Erro ao salvar version.json: {e}")


def check_for_updates() -> Dict[str, Any]:
    """Consulta o GitHub para saber se há novo commit no branch main."""
    local_info = get_local_version_info()
    local_sha = local_info.get("commit_sha", "")

    headers = get_auth_headers()
    req = urllib.request.Request(GITHUB_API_URL, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                remote_sha = data.get("sha", "")[:7]
                commit_info = data.get("commit", {})
                message = commit_info.get("message", "").strip().split("\n")[0]
                date_str = commit_info.get("author", {}).get("date", "")
                author = commit_info.get("author", {}).get("name", "")

                has_update = bool(remote_sha and local_sha and remote_sha.lower() != local_sha.lower())

                return {
                    "status": "success",
                    "has_update": has_update,
                    "local_commit": local_sha,
                    "remote_commit": remote_sha,
                    "commit_message": message,
                    "commit_date": date_str,
                    "commit_author": author,
                    "current_version": local_info.get("version", DEFAULT_VERSION)
                }
    except Exception as e:
        return {
            "status": "error",
            "has_update": False,
            "error": f"Não foi possível checar atualizações no GitHub: {str(e)}",
            "current_version": local_info.get("version", DEFAULT_VERSION),
            "local_commit": local_sha
        }


def apply_update() -> Dict[str, Any]:
    """
    Aplica a atualização do GitHub.
    Tenta primeiro via 'git pull', caso falhe ou git não exista,
    faz download do Zipball direto do GitHub sem requerer git.
    """
    local_info = get_local_version_info()
    git_bin = shutil.which("git")

    # 1. Tentativa via Git se repositório .git existir
    if git_bin and (ROOT_DIR / ".git").exists():
        try:
            subprocess.run(["git", "fetch", "origin", "main"], cwd=str(ROOT_DIR), capture_output=True, timeout=45, creationflags=SUBPROCESS_FLAGS)
            res = subprocess.run(
                ["git", "reset", "--hard", "origin/main"],
                cwd=str(ROOT_DIR),
                capture_output=True,
                text=True,
                timeout=45,
                creationflags=SUBPROCESS_FLAGS
            )
            if res.returncode == 0:
                new_sha = subprocess.check_output(
                    ["git", "rev-parse", "--short", "HEAD"],
                    cwd=str(ROOT_DIR),
                    text=True,
                    creationflags=SUBPROCESS_FLAGS
                ).strip()
                save_local_version_info(new_sha)
                updated_info = get_local_version_info()
                return {
                    "status": "success",
                    "method": "git",
                    "version": updated_info.get("version", DEFAULT_VERSION),
                    "message": f"Atualizado com sucesso via Git para {updated_info.get('version', DEFAULT_VERSION)} (Commit: {new_sha})!",
                    "details": res.stdout,
                    "commit_sha": new_sha
                }
        except Exception as git_err:
            print(f"[Updater] git update falhou: {git_err}. Prosseguindo com fallback universal zip.")

    # 2. Fallback universal via ZIP GitHub
    temp_zip = ROOT_DIR / "temp_update.zip"
    temp_extract = ROOT_DIR / "temp_update_extracted"

    try:
        headers = get_auth_headers()
        req = urllib.request.Request(GITHUB_ZIPBALL_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=120) as resp, open(temp_zip, "wb") as out_f:
            shutil.copyfileobj(resp, out_f)

        if temp_extract.exists():
            shutil.rmtree(temp_extract, ignore_errors=True)

        with zipfile.ZipFile(temp_zip, 'r') as z:
            z.extractall(temp_extract)

        source_dir = None
        for item in temp_extract.iterdir():
            if item.is_dir():
                source_dir = item
                break

        if not source_dir:
            return {"status": "error", "error": "Estrutura do ZIP do GitHub inválida."}

        # Itens e arquivos protegidos que jamais podem ser sobrescritos
        PROTECTED_NAMES = {
            ".env",
            "data",
            "fleet.db",
            "service.pid",
            "dashboard.log",
            "logs",
            ".git",
            "github_token.txt"
        }

        updated_count = 0
        for src_path in source_dir.rglob("*"):
            rel_path = src_path.relative_to(source_dir)
            target_path = ROOT_DIR / rel_path

            # Pula se qualquer parte do caminho for protegida (ex: dashboard/data/fleet.db)
            if any(part in PROTECTED_NAMES for part in rel_path.parts):
                continue

            if src_path.is_dir():
                target_path.mkdir(parents=True, exist_ok=True)
            else:
                try:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src_path, target_path)
                    updated_count += 1
                except Exception as c_err:
                    print(f'[Updater] Aviso: Nao foi possivel sobrescrever {target_path}: {c_err}')

        # Limpeza
        if temp_zip.exists():
            temp_zip.unlink(missing_ok=True)
        if temp_extract.exists():
            shutil.rmtree(temp_extract, ignore_errors=True)

        chk = check_for_updates()
        remote_sha = chk.get("remote_commit", "updated")
        save_local_version_info(remote_sha)

        return {
            "status": "success",
            "method": "direct_zip",
            "message": f"Atualização concluída com sucesso ({updated_count} arquivos atualizados)! Commit: {remote_sha}",
            "updated_files": updated_count,
            "commit_sha": remote_sha
        }

    except Exception as ex:
        if temp_zip.exists():
            temp_zip.unlink(missing_ok=True)
        if temp_extract.exists():
            shutil.rmtree(temp_extract, ignore_errors=True)
        return {"status": "error", "error": f"Erro durante a atualização: {str(ex)}"}


def trigger_service_restart_async():
    """Aciona reinicialização assíncrona do serviço sem travar o worker HTTP e sem matar a própria árvore."""
    script_path = ROOT_DIR / "dashboard" / "service_manager.py"
    py_exe = Path(sys.executable).parent / "python.exe"
    exe_str = str(py_exe) if py_exe.exists() else sys.executable
    cmd = [exe_str, str(script_path), "restart"]
    DETACHED_PROCESS = 0x00000008
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    log_path = ROOT_DIR / "dashboard" / "data" / "updater_restart.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_f = open(log_path, "a", encoding="utf-8")
    subprocess.Popen(
        cmd,
        cwd=str(ROOT_DIR / "dashboard"),
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | SUBPROCESS_FLAGS,
        stdout=log_f,
        stderr=log_f,
        stdin=subprocess.DEVNULL,
        close_fds=True
    )
