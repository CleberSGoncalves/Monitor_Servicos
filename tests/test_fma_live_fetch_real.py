import asyncio
import os
import sys
from unittest.mock import patch, MagicMock

# Ajusta path para importar módulos do dashboard
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard")))

def test_get_command_by_id_exists():
    from gcp_sync import get_command_by_id
    mock_client = MagicMock()
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.id = "cmd_123"
    mock_doc.to_dict.return_value = {
        "command_id": "cmd_123",
        "status": "completed",
        "output": "2026-11-27 21:00:00: [GLOBO](V101) NEW DETECTION 18001111, 0, 0, 30000ms, 'Comercial Real', ProcTimeMs 22"
    }
    mock_client.collection.return_value.document.return_value.get.return_value = mock_doc

    with patch("gcp_sync.get_firestore_client", return_value=mock_client):
        res = get_command_by_id("cmd_123")
        assert res is not None
        assert res["status"] == "completed"
        assert res["_doc_id"] == "cmd_123"
        assert "NEW DETECTION" in res["output"]


def test_post_fetch_real_fma_log_signature_and_execution():
    from app import post_fetch_real_fma_log

    async def _run():
        mock_user = {"username": "operador.teste", "full_name": "Operador NOC"}

        mock_gcp_doc = {
            "status": "completed",
            "output": (
                "2026-11-27 22:00:00: [GLOBO](V101) NEW DETECTION 18009999, 0, 0, 30000ms, 'Comercial Real Teste', ProcTimeMs 19\n"
                "2026-11-27 22:00:15: RAM usage. Working Set: 512Mb\n"
            )
        }

        mock_dispatch = MagicMock(return_value="exec-sql-456")

        with patch("gcp_sync.dispatch_remote_command_to_firestore", return_value=True) as mock_gcp_dispatch, \
             patch("remote_commands.dispatch_remote_command", mock_dispatch), \
             patch("gcp_sync.get_command_by_id", return_value=mock_gcp_doc), \
             patch("asyncio.sleep", return_value=None):

            result = await post_fetch_real_fma_log("Aracaju-SMME-328-CS1", user=mock_user)

            # 1. Valida que dispatch_remote_command foi chamado com os argumentos corretos (SEM TypeError)
            mock_dispatch.assert_called_once()
            kwargs = mock_dispatch.call_args.kwargs
            assert kwargs["hosts"] == ["Aracaju-SMME-328-CS1"]
            assert kwargs["shell_type"] == "powershell"
            assert "Get-Content" in kwargs["command_script"]
            assert "requested_by" in kwargs

            # 2. Valida que dispatch_remote_command_to_firestore também foi chamado
            mock_gcp_dispatch.assert_called_once()
            gcp_kwargs = mock_gcp_dispatch.call_args.kwargs
            assert gcp_kwargs["hostname"] == "Aracaju-SMME-328-CS1"
            assert gcp_kwargs["action"] == "ReadFmaLog"

            # 3. Valida resultado retornado
            assert isinstance(result, dict)
            assert result.get("success") is True
            assert result.get("hostname").upper() == "ARACAJU-SMME-328-CS1"
            assert result.get("is_live_disk") is True
            detections = result.get("recent_detections", [])
            assert len(detections) > 0
            assert detections[0]["spot_id"] == "18009999"

    asyncio.run(_run())


def test_post_fetch_real_fma_log_pending_graceful():
    from app import post_fetch_real_fma_log

    async def _run():
        mock_user = {"username": "operador.teste"}
        mock_dispatch = MagicMock(return_value="exec-sql-789")

        # Simula que o nó ainda não retornou resposta
        with patch("gcp_sync.dispatch_remote_command_to_firestore", return_value=True), \
             patch("remote_commands.dispatch_remote_command", mock_dispatch), \
             patch("gcp_sync.get_command_by_id", return_value={"status": "pending"}), \
             patch("remote_commands.get_execution_details", return_value={"status": "em_execucao"}), \
             patch("asyncio.sleep", return_value=None):

            result = await post_fetch_real_fma_log("Host-Pendente-CS1", user=mock_user)

            # Deve retornar sucesso (sem lançar 500 ou alertar erro de função)
            assert isinstance(result, dict)
            assert result.get("success") is True

    asyncio.run(_run())
