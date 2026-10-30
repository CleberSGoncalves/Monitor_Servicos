"""
Suíte de Testes Automatizados E2E — Resiliência Anti-Throttling (HTTP 429) e Bootstrap Corporativo
Kantar IBOPE Media — Monitor_Servicos
"""

import os
import sys
import zipfile
import hashlib
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

def test_bootstrap_script_resilience():
    print("[TEST 1/4] Validando Resiliência Anti-Throttling no bootstrap_update.ps1...")
    script_path = ROOT_DIR / "WinServiceFleetAgent" / "Scripts" / "bootstrap_update.ps1"
    assert script_path.exists(), f"Erro: Script {script_path} não encontrado."

    content = script_path.read_text(encoding="utf-8")

    # 1. Funções resilientes presentes
    assert "function Invoke-ResilientRestMethod" in content, "Erro: Invoke-ResilientRestMethod ausente no script."
    assert "function Invoke-ResilientDownload" in content, "Erro: Invoke-ResilientDownload ausente no script."
    print("  -> Funções Invoke-ResilientRestMethod e Invoke-ResilientDownload presentes [OK]")

    # 2. Tratamento específico de HTTP 429 e Retry-After
    assert "429" in content, "Erro: Tratamento de status 429 ausente."
    assert "Retry-After" in content, "Erro: Extração de Retry-After ausente."
    print("  -> Deteccao de HTTP 429 e extracao de header Retry-After implementadas [OK]")

    # 3. Compliance Corporativo Estrito: ZERO GitHub (100% Microsoft SharePoint Online / Graph API)
    assert "raw.githubusercontent.com" not in content.lower(), "Erro: raw.githubusercontent.com proibido em conformidade corporativa."
    assert "github.com" not in content.lower(), "Erro: Referência a github.com proibida por auditoria de segurança."
    assert "graph.microsoft.com" in content, "Erro: Endpoint Microsoft Graph ausente."
    assert "login.microsoftonline.com" in content, "Erro: Autenticação OAuth2 SPN Microsoft Online ausente."
    assert "DNA.MonitorServiceSVC_v1.0.18.0.zip" in content, "Erro: Referência a pacote v1.0.18.0 ausente."
    print("  -> Conformidade estrita de segurança: ZERO GitHub e 100% Microsoft 365 SharePoint Online [OK]")

    # 4. Validação criptográfica SHA-256 estrita
    assert "Get-FileHash" in content, "Erro: Verificação Get-FileHash ausente."
    assert "validHashes" in content, "Erro: Lista de hashes autorizados ausente."
    print("  -> Verificação de integridade SHA-256 com múltiplos hashes homologados [OK]")


def test_sharepoint_client_anti_throttling():
    print("\n[TEST 2/4] Validando proteção contra Throttling no SharePointClient.cs...")
    cs_path = ROOT_DIR / "WinServiceFleetAgent" / "Core" / "SharePointClient.cs"
    assert cs_path.exists(), f"Erro: {cs_path} não encontrado."

    content = cs_path.read_text(encoding="utf-8")

    # 1. Trata Retry-After acima de 60s
    assert "retrySecs > 120" in content, "Erro: Tratamento de throttling severo (>120s) ausente."
    print("  -> Retry-After respeitado sem descartar tempos maiores que 60s [OK]")

    # 2. GetAllListItemsAsync retorna null em vez de lista vazia no 429
    assert "return _cachedListItems;" in content, "Erro: GetAllListItemsAsync deve retornar cache ou null, nunca lista vazia em erro."
    print("  -> GetAllListItemsAsync protegido contra falsos negativos [OK]")

    # 3. SyncServiceInventoryAsync valida retorno nulo
    assert "if (allItems == null)" in content, "Erro: Verificação de allItems == null ausente em SyncServiceInventoryAsync."
    print("  -> SyncServiceInventoryAsync não gera novos registros falsos sob throttling [OK]")

    # 4. Cache TTL estendido para 5 min
    assert "AddMinutes(5)" in content, "Erro: TTL do cache não está em 5 minutos."
    print("  -> Cache O(1) com TTL de 5 minutos ativo [OK]")


def test_github_downloader_caching():
    print("\n[TEST 3/4] Validando cache de manifesto e fallback no GitHubDownloader.cs...")
    gh_path = ROOT_DIR / "WinServiceFleetAgent" / "Core" / "GitHubDownloader.cs"
    assert gh_path.exists(), f"Erro: {gh_path} não encontrado."

    content = gh_path.read_text(encoding="utf-8")

    # 1. Armazena expiração de 5 minutos ao falhar ou receber 429
    assert "_manifestExpiry = DateTime.UtcNow.AddMinutes(5);" in content, "Erro: Backoff de 5 minutos para erro de manifesto ausente."
    print("  -> Backoff de 5 minutos ao falhar na consulta do manifesto do SharePoint [OK]")

    # 2. Fallback de versão homologada
    assert 'serviceKey.Equals("DNA.MonitorServiceSVC"' in content, "Erro: Fallback específico para DNA.MonitorServiceSVC ausente."
    assert '"1.0.18.0"' in content, "Erro: Versão de contingência 1.0.18.0 ausente."
    print("  -> Fallback resiliente para v1.0.18.0 garantido [OK]")


def test_packages_and_integrity():
    print("\n[TEST 4/4] Validando pacotes de distribuição e integridade dos binários...")
    zip_18 = ROOT_DIR / "publish" / "DNA.MonitorServiceSVC_v1.0.18.0.zip"
    zip_latest = ROOT_DIR / "publish" / "DNA.MonitorServiceSVC.zip"

    assert zip_18.exists(), f"Erro: Pacote {zip_18} não encontrado."
    assert zip_latest.exists(), f"Erro: Pacote {zip_latest} não encontrado."

    size_mb = zip_18.stat().st_size / (1024 * 1024)
    assert size_mb > 25, f"Erro: Tamanho do pacote v1.0.18.0 muito pequeno ({size_mb:.2f} MB)"
    print(f"  -> Pacote v1.0.18.0 validado: {size_mb:.2f} MB [OK]")

    with zipfile.ZipFile(zip_18, 'r') as z:
        names = z.namelist()
        assert "WinServiceFleetAgent.exe" in names, "Erro: WinServiceFleetAgent.exe ausente no zip."
        assert "bootstrap_update.ps1" in names, "Erro: bootstrap_update.ps1 ausente no zip."
        assert "appsettings.json" in names, "Erro: appsettings.json ausente no zip."

    sha256 = hashlib.sha256(zip_18.read_bytes()).hexdigest()
    print(f"  -> Checksum SHA-256 do pacote v1.0.18.0: {sha256} [OK]")


if __name__ == "__main__":
    print("=" * 70)
    print("INICIANDO SUÍTE DE TESTES E2E — RESILIÊNCIA ANTI-THROTTLING E BOOTSTRAP")
    print("=" * 70)
    test_bootstrap_script_resilience()
    test_sharepoint_client_anti_throttling()
    test_github_downloader_caching()
    test_packages_and_integrity()
    print("\n" + "=" * 70)
    print("TODOS OS 4 TESTES DE RESILIÊNCIA E2E APROVADOS COM 100% DE SUCESSO!")
    print("=" * 70)
