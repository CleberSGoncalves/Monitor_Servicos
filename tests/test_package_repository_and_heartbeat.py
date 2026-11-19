# -*- coding: utf-8 -*-
"""
Suíte de Testes Automatizados: Repositório de Pacotes & Auditoria de Heartbeat Unificado
========================================================================================
Valida:
1. Resolução unificada de Heartbeat evitando falsos "Aguardando Heartbeat" em máquinas
   com telemetria recente de canais DTV ou Firestore.
2. Auditoria automatizada de pacotes ZIP (integridade, detecção de executável principal,
   regras anti-aninhamento de pastas e cálculo de hash SHA-256).
3. Publicação e homologação de novos pacotes de serviço com reflexo na governança central.
4. Endpoints REST da API do Repositório (/api/fleet/packages/...).
"""

import os
import sys
import json
import zipfile
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_DIR = PROJECT_ROOT / "dashboard"
if str(DASHBOARD_DIR) not in sys.path:
    sys.path.insert(0, str(DASHBOARD_DIR))

from package_repository_manager import (
    audit_package_zip,
    get_repository_summary,
    publish_service_package,
    calculate_sha256,
    OFFICIAL_SERVICES_METADATA,
    RELEASES_DIR
)
from fleet_actions import get_host_service_action_status
from app import app
from auth import create_session


@pytest.fixture
def auth_headers():
    token = create_session("admin_test", "ADMIN")
    return {"Authorization": f"Bearer {token}"}


def test_heartbeat_unification_prevents_false_stale_alert():
    """
    Testa se o cálculo de telemetria do host considera o heartbeat de canais DTV
    ou Firestore, impedindo falso 'Aguardando Heartbeat' em máquinas ativas.
    """
    status = get_host_service_action_status("Araguaina-SMME-238-CS2", "DNA.FiletransferSVC")
    assert status["success"] is True
    # O host Araguaina tem telemetria viva (< 15 minutos via canais/host)
    # Portanto is_stale_heartbeat DEVE ser False
    assert status.get("is_stale_heartbeat") is False
    assert "Aguardando Heartbeat" not in status.get("status_badge", "")
    assert status.get("current_step") in (1, 2)


def test_package_audit_valid_flat_zip():
    """
    Testa se o auditor aprova um pacote ZIP estruturado corretamente
    com o executável na raiz e calcula o SHA-256 esperado.
    """
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
        zip_path = tf.name

    try:
        with zipfile.ZipFile(zip_path, "w") as zf:
            # Coloca o executável obrigatório diretamente na raiz
            zf.writestr("WinServiceFleetAgent.exe", b"MZ_FAKE_PE_HEADER_1234567890")
            zf.writestr("appsettings.json", b'{"PollingIntervalSeconds": 180}')

        audit = audit_package_zip(zip_path, "DNA.MonitorServiceSVC", "1.0.21.6")
        assert audit["valid"] is True
        assert audit["sha256"] != ""
        assert len(audit["sha256"]) == 64
        assert audit["total_files"] == 2

        check_exe = next(c for c in audit["checks"] if c["id"] == "primary_executable")
        assert check_exe["status"] == "passed"

        check_dir = next(c for c in audit["checks"] if c["id"] == "directory_structure")
        assert check_dir["status"] == "passed"
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)


def test_package_audit_detects_nested_directory_warning():
    """
    Testa se o auditor detecta e emite alerta quando o executável
    está dentro de uma subpasta intermediária (violação da estrutura plana).
    """
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
        zip_path = tf.name

    try:
        with zipfile.ZipFile(zip_path, "w") as zf:
            # Executável colocado dentro de subpasta incorreta
            zf.writestr("Pasta_Incorreta/DigitalTVCapture.exe", b"MZ_FAKE_PE_DATA")

        audit = audit_package_zip(zip_path, "Atria Capture", "2.0.0.3")
        check_dir = next(c for c in audit["checks"] if c["id"] == "directory_structure")
        assert check_dir["status"] == "warning"
        det_low = check_dir["details"].lower()
        assert "pasta intermediária" in det_low or "subpasta" in det_low or "aninhada" in det_low or "raiz" in det_low
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)


def test_package_audit_rejects_missing_primary_executable():
    """
    Testa se o auditor rejeita um pacote que não contém o executável
    principal obrigatório do serviço.
    """
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
        zip_path = tf.name

    try:
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("arquivo_qualquer.txt", b"Texto de teste")

        audit = audit_package_zip(zip_path, "FastMatchingSvc", "1.1.0.1")
        assert audit["valid"] is False
        check_exe = next(c for c in audit["checks"] if c["id"] == "primary_executable")
        assert check_exe["status"] == "failed"
        assert "FastMatchingSvc.exe" in check_exe["details"]
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)


def test_package_repository_summary_structure():
    """
    Testa se o resumo do repositório lista todos os 12 serviços oficiais
    com suas versões homologadas, executáveis e caminhos padrão.
    """
    summary = get_repository_summary()
    assert summary["status"] == "success"
    assert summary["total_official_services"] == 12
    assert len(summary["services"]) == 12

    atria = next(s for s in summary["services"] if s["service_name"] == "Atria Capture")
    assert atria["primary_exe"] == "DigitalTVCapture.exe"
    assert "DTVCapture64" in atria["default_dir"]

    agent = next(s for s in summary["services"] if s["service_name"] == "DNA.MonitorServiceSVC")
    assert agent["primary_exe"] == "WinServiceFleetAgent.exe"


def test_api_package_endpoints_lifecycle(auth_headers):
    """
    Testa o ciclo de vida dos endpoints REST do repositório:
    GET /summary, POST /audit e POST /publish.
    """
    client = TestClient(app)

    # 1. GET /api/fleet/packages/summary
    r_sum = client.get("/api/fleet/packages/summary", headers=auth_headers)
    assert r_sum.status_code == 200
    data = r_sum.json()
    assert "services" in data
    assert data["total_official_services"] == 12

    # 2. POST /api/fleet/packages/audit (sem salvar)
    zip_buf = None
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
        tmp_name = tf.name
    try:
        with zipfile.ZipFile(tmp_name, "w") as zf:
            zf.writestr("DNA.TimeSyncSVC.exe", b"MZ_PE_TIMESYNC")
        with open(tmp_name, "rb") as f:
            zip_buf = f.read()
    finally:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)

    files = {"package_file": ("DNA.TimeSyncSVC_v3.1.6040.21437.zip", zip_buf, "application/zip")}
    data = {
        "service_name": "DNA.TimeSyncSVC",
        "target_version": "3.1.6040.21437"
    }

    r_audit = client.post("/api/fleet/packages/audit", headers=auth_headers, files=files, data=data)
    assert r_audit.status_code == 200
    audit_res = r_audit.json()["audit"]
    assert audit_res["valid"] is True
    assert len(audit_res["sha256"]) == 64

    # 3. POST /api/fleet/packages/publish (homologação completa)
    files2 = {"package_file": ("DNA.TimeSyncSVC_v3.1.6040.21437.zip", zip_buf, "application/zip")}
    data2 = {
        "service_name": "DNA.TimeSyncSVC",
        "target_version": "3.1.6040.21437",
        "justification": "Teste unitário de homologação de pacote com auditoria automatizada"
    }
    r_pub = client.post("/api/fleet/packages/publish", headers=auth_headers, files=files2, data=data2)
    assert r_pub.status_code == 200
    pub_res = r_pub.json()
    assert pub_res["success"] is True
    assert pub_res["version"] == "3.1.6040.21437"
    assert pub_res["governance_updated"] is True

    # 4. GET /api/fleet/packages/download/DNA.TimeSyncSVC
    r_down = client.get("/api/fleet/packages/download/DNA.TimeSyncSVC", headers=auth_headers)
    assert r_down.status_code == 200
    assert r_down.headers["content-type"] == "application/zip"
