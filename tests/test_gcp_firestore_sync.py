"""
Testes Automatizados para a Integração Google Cloud Firestore (São Paulo).
Projeto GCP: bamboo-dryad-494619-c9
Valida conexão, agrupamento de 205 hosts, comandos remotos em tempo real e endpoints FastAPI.
"""

import pytest
import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Configuração de Paths
DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
if str(DASHBOARD_DIR) not in sys.path:
    sys.path.insert(0, str(DASHBOARD_DIR))

from gcp_sync import (
    is_firestore_available,
    get_gcp_telemetry_status,
    group_fleet_by_host,
    sanitize_doc_id,
    dispatch_remote_command_to_firestore,
    get_pending_commands_for_host,
    complete_remote_command,
    update_host_telemetry,
    fetch_fleet_from_firestore,
)
from app import app
from auth import create_session


@pytest.fixture
def auth_headers():
    token = create_session("admin", "admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(app)


class TestGCPFirestoreSync:

    def test_sanitize_doc_id(self):
        assert sanitize_doc_id("BRGO/ANA/DT02") == "BRGO_ANA_DT02"
        assert sanitize_doc_id("host with space") == "host_with_space"
        assert sanitize_doc_id("") == "UNKNOWN"

    def test_group_fleet_by_host(self):
        services = [
            {
                "hostname": "BRGO-ANA-DT02",
                "praca": "Anápolis",
                "cs": 2,
                "nome_servico": "Atria Capture",
                "versao_instalada": "1.4.4.4",
                "versao_desejada": "2.0.0.2",
                "status_servico": "Em Execução",
                "acao_solicitada": "Atualizar"
            },
            {
                "hostname": "BRGO-ANA-DT02",
                "praca": "Anápolis",
                "cs": 2,
                "nome_servico": "DNA.MonitorServiceSVC",
                "versao_instalada": "1.0.20.0",
                "versao_desejada": "1.0.20.0",
                "status_servico": "Em Execução",
                "acao_solicitada": "Nenhuma"
            }
        ]
        channels = [
            {
                "host": "BRGO-ANA-DT02",
                "praca": "Anápolis",
                "canal": "Globo HD",
                "gravando_mp4": "Sim",
                "has_outage": False
            }
        ]
        grouped = group_fleet_by_host(services, channels)
        assert "BRGO-ANA-DT02" in grouped
        host_doc = grouped["BRGO-ANA-DT02"]
        assert host_doc["services_count"] == 2
        assert host_doc["services_running"] == 2
        assert host_doc["services_outdated"] == 1
        assert len(host_doc["channels"]) == 1

    def test_firestore_connectivity_and_status(self):
        assert is_firestore_available() is True
        status = get_gcp_telemetry_status()
        assert status["status"] in ("online", "degraded")
        assert status["project_id"] == "bamboo-dryad-494619-c9"
        assert "São Paulo" in status.get("region", "")

    def test_dispatch_and_fetch_remote_command(self):
        import uuid
        test_cmd_id = f"test_{uuid.uuid4().hex[:8]}"
        test_host = "TEST-HOST-CI"

        # 1. Enfileira comando
        ok = dispatch_remote_command_to_firestore(
            command_id=test_cmd_id,
            hostname=test_host,
            service_name="Atria Capture",
            action="Atualizar",
            target_version="2.0.0.2",
            script="Write-Host 'Test GCP'",
            requested_by="PyTest CI"
        )
        assert ok is True

        # 2. Busca comando pendente
        pending = get_pending_commands_for_host(test_host)
        matching = [c for c in pending if c.get("command_id") == test_cmd_id]
        assert len(matching) == 1
        assert matching[0]["service_name"] == "Atria Capture"
        assert matching[0]["target_version"] == "2.0.0.2"

        # 3. Completa comando
        done_ok = complete_remote_command(
            command_id=test_cmd_id,
            status="completed",
            output="Upgrade concluído com sucesso 100%",
            exit_code=0
        )
        assert done_ok is True

        # 4. Verifica que não está mais como pendente
        pending_after = get_pending_commands_for_host(test_host)
        matching_after = [c for c in pending_after if c.get("command_id") == test_cmd_id]
        assert len(matching_after) == 0

    def test_update_host_telemetry(self):
        ok = update_host_telemetry(
            hostname="BRGO-ANA-DT02",
            payload={
                "praca": "Anápolis",
                "cs": 2,
                "agent_version": "1.0.20.0"
            }
        )
        assert ok is True

    def test_gcp_api_endpoints(self, client, auth_headers):
        # 1. Status do GCP
        resp_status = client.get("/api/gcp/status")
        assert resp_status.status_code == 200
        data = resp_status.json()
        assert data["connected"] is True
        assert data["project_id"] == "bamboo-dryad-494619-c9"

        # 2. Agent commands endpoint
        resp_cmds = client.get("/api/agent/commands/BRGO-ANA-DT02")
        assert resp_cmds.status_code == 200
        assert "commands" in resp_cmds.json()

        # 3. Agent telemetry endpoint
        telemetry_payload = {
            "hostname": "BRGO-ANA-DT02",
            "praca": "Anápolis",
            "cs": 2,
            "services": [
                {
                    "nome_servico": "Atria Capture",
                    "versao_instalada": "1.4.4.4",
                    "status_servico": "Em Execução"
                }
            ]
        }
        resp_tel = client.post("/api/agent/telemetry", json=telemetry_payload)
        assert resp_tel.status_code == 200
        assert resp_tel.json()["success"] is True
