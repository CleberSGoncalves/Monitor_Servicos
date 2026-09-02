import os
from pathlib import Path

try:
    import win32api
except ImportError:
    win32api = None


def get_executable_version(file_path: str) -> str:
    """
    Lê a versão binária compilada no executável .exe via win32api.GetFileVersionInfo.
    Converte a tupla de inteiros para string semântica (Major.Minor.Build.Private).
    Retorna 'Não Encontrado' se o arquivo não existir ou se ocorrer erro de leitura.
    """
    p = Path(file_path)
    if not p.exists():
        return "Não Encontrado"

    if win32api is None:
        return "Desconhecido (win32api indisponível)"

    try:
        info = win32api.GetFileVersionInfo(str(p), "\\")
        ms = info['FileVersionMS']
        ls = info['FileVersionLS']
        major = win32api.HIWORD(ms)
        minor = win32api.LOWORD(ms)
        build = win32api.HIWORD(ls)
        private = win32api.LOWORD(ls)
        return f"{major}.{minor}.{build}.{private}"
    except Exception as e:
        print(f"[version_inspector] Erro ao extrair versão de {file_path}: {e}")
        return "Erro ao Ler Versão"
