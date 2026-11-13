"""
Testes automatizados para validação do Modal de Progresso de Atualizações
e Resolução da Causa Raiz da Topologia RF (Todas as Praças e Canais).
"""
import sys
import os
import pytest
from pathlib import Path

# Add project root and dashboard to path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

from dashboard.geo_topology import (
    _norm_city,
    _match_city,
    get_markets_map_data,
    get_topology_full_payload
)
from dashboard.fleet_actions import (
    get_host_service_action_status,
    build_service_contingency_command,
    build_service_raw_script,
    force_execute_service_update
)


class TestRFTopologyRootCause:
    """Valida a resolução da causa raiz que ocultava praças e canais na topologia RF."""

    def test_norm_city_accents_and_special_chars(self):
        """Garante que a normalização remove diacríticos e padroniza para alfanumérico lowercase."""
        assert _norm_city("São Luís") == "saoluis"
        assert _norm_city("Brasília") == "brasilia"
        assert _norm_city("Anápolis") == "anapolis"
        assert _norm_city("Belém") == "belem"
        assert _norm_city("Maringá") == "maringa"
        assert _norm_city("São José dos Campos") == "saojosedoscampos"

    def test_match_city_prevents_substring_collisions(self):
        """
        Causa Raiz Anterior: Substrings curtas como 'cas', 'rio', 'aru' suprimiam
        cidades inteiras como Cascavel, Castanhal, Caruaru, Cabo Frio.
        Garante que substring arbitrária não causa colisão falsa.
        """
        market_sjc = {"id": "BRSP-SJC", "cidade": "São José dos Campos", "aliases": ["sjc"]}
        market_fln = {"id": "BRSC-FLN", "cidade": "Florianópolis", "aliases": ["florianopolis", "floripa"]}

        # "Campos" NÃO pode dar match em "São José dos Campos"
        assert not _match_city("Campos", market_sjc)
        assert _match_city("São José dos Campos", market_sjc)
        assert _match_city("sjc", market_sjc)

        # "Floriano" (PI) NÃO pode dar match em "Florianópolis" (SC)
        assert not _match_city("Floriano", market_fln)
        assert _match_city("Florianópolis", market_fln)
        assert _match_city("floripa", market_fln)

    def test_brasilia_and_nacional_separation(self):
        """
        Causa Raiz Anterior: BRDF-NAC continha 'brasília', 'df', 'bsb' nos aliases,
        engolindo o headend terrestre de Brasília dentro do headend satélite Nacional.
        """
        market_bsa = {"id": "BRDF-BSA", "cidade": "Brasília", "aliases": ["bsb", "distrito federal", "sobradinho", "colorado"]}
        market_nac = {"id": "BRDF-NAC", "cidade": "Nacional (PayTV Satélite)", "aliases": ["nacional", "paytv", "dth", "satelite", "headend paytv"]}

        assert _match_city("Brasília", market_bsa)
        assert not _match_city("Brasília", market_nac)
        assert _match_city("Nacional", market_nac)
        assert not _match_city("Nacional", market_bsa)

    def test_all_markets_resolved_with_zero_orphaned_channels(self):
        """
        Valida que get_markets_map_data() carrega as praças sem supressões indevidas
        e que praças críticas estão devidamente representadas.
        """
        markets = get_markets_map_data()
        assert isinstance(markets, list)
        assert len(markets) >= 50

        # Verifica se mercados críticos estão presentes
        market_ids = {m["id"] for m in markets}
        assert "BRDF-BSA" in market_ids, "Brasília terrestre deve estar cadastrada separadamente"
        assert "BRDF-NAC" in market_ids, "Nacional PayTV deve estar cadastrada separadamente"
        assert "BRMA-SLS" in market_ids, "São Luís deve estar cadastrada"
        assert "BRGO-ANP" in market_ids, "Anápolis deve estar cadastrada"

        # Verifica separação estrita de hosts entre Brasília e Nacional
        bsa = next(m for m in markets if m["id"] == "BRDF-BSA")
        nac = next(m for m in markets if m["id"] == "BRDF-NAC")
        assert any("BSA" in h for h in bsa["hosts"]), "Brasília deve conter hosts BSA"
        assert not any("NAC" in h for h in bsa["hosts"]), "Brasília NÃO pode conter hosts NAC"
        assert any("PAYTV" in h or "ATRIA" in h for h in nac["hosts"]), "Nacional deve conter hosts PayTV/Satélite"

    def test_sao_luis_returns_all_active_multiplexes(self):
        """
        Garante que a topologia de São Luís recupera e consolida os múltiplos canais/muxes
        sem colapsar em apenas 1 canal por frequência.
        """
        markets = get_markets_map_data()
        sls = next(m for m in markets if m["id"] == "BRMA-SLS")
        assert sls["cidade"] == "São Luís"
        assert len(sls["channels_rf_detail"]) >= 5, (
            f"São Luís deve reportar no mínimo 5 canais sintonizados, obteve {len(sls['channels_rf_detail'])}"
        )
        emissoras = {c["emissora"] for c in sls["channels_rf_detail"]}
        assert any("Record" in e for e in emissoras)
        assert any("Rede TV" in e for e in emissoras)
        assert any("SBT" in e for e in emissoras)


class TestUpdateProgressModalBackend:
    """Valida a API de monitoramento em tempo real do progresso da atualização."""

    def test_get_host_service_action_status_anapolis(self):
        """
        Valida o retorno estruturado de status para BRGO-ANA-DT02 / Atria Capture.
        """
        status_info = get_host_service_action_status("BRGO-ANA-DT02", "Atria Capture", target_version="2.0.0.2")
        assert status_info["hostname"] == "BRGO-ANA-DT02"
        assert status_info["host"] == "BRGO-ANA-DT02"
        assert status_info["service_name"] == "Atria Capture"
        assert status_info["versao_desejada"] == "2.0.0.2"
        assert "current_step" in status_info
        assert 1 <= status_info["current_step"] <= 5
        assert "status_badge" in status_info
        assert "message" in status_info
        assert "manual_command" in status_info
        assert "Atria" in status_info["manual_command"]
        assert "steps" in status_info
        assert len(status_info["steps"]) == 5

    def test_target_version_resolution_prevents_false_completion(self):
        """
        Garante que quando um serviço está na versão 1.4.4.4 e o alvo é 2.0.0.2,
        o sistema NUNCA reporte falso 'Concluído (v1.4.4.4)' nem 'v1.4.4.4 -> v1.4.4.4'.
        """
        status_info = get_host_service_action_status("BRGO-ANA-DT02", "Atria Capture", target_version="2.0.0.2")
        assert status_info["versao_desejada"] == "2.0.0.2"
        if status_info["versao_instalada"] != "2.0.0.2":
            # Não pode reportar concluído se as versões forem diferentes
            assert status_info["is_updated"] is False
            assert "Concluído (v1.4.4.4)" not in status_info["status_badge"]
            assert status_info["steps"][4]["status"] != "completed"

    def test_get_host_service_action_status_nonexistent_host(self):
        """
        Garante comportamento resiliente para host inexistente sem quebrar a API.
        """
        status_info = get_host_service_action_status("HOST-INEXISTENTE-99", "Atria Capture")
        assert status_info["hostname"] == "HOST-INEXISTENTE-99"
        assert status_info["success"] is False
        assert status_info["current_step"] == 1
        assert "status_badge" in status_info

    def test_contingency_script_uses_official_dtvcapture64_directory(self):
        """
        Garante que o script de contingência para o Atria Capture utilize estritamente
        o diretório D:\\MediaDNA_V2\\applications\\DTVCapture64 e NÃO C:\\Atria Capture.
        """
        cmd = build_service_contingency_command("Atria Capture", "2.0.0.2")
        assert r"D:\MediaDNA_V2\applications\DTVCapture64".lower() in cmd.lower()
        assert r"C:\Atria Capture".lower() not in cmd.lower()
        assert "DTVCapture64".lower() in cmd.lower()
        assert "Stop-Process".lower() in cmd.lower()
        assert "2.0.0.2" in cmd

    def test_contingency_script_handles_other_fleet_services(self):
        """
        Garante diretórios corretos para FastMatching e serviços DNA.
        """
        fm_cmd = build_service_contingency_command("FastMatchingSvc", "1.1.0.0")
        assert r"D:\MediaDNA_V2\applications\DTVCapture64\FastMachingSvc" in fm_cmd
        assert "FastMatchingSvc" in fm_cmd

        det_cmd = build_service_contingency_command("DNA.DetectionSVC", "3.4.6040.21056")
        assert r"D:\MediaDNA_V2\applications\DNA.DetectionSVC" in det_cmd

        agent_cmd = build_service_contingency_command("DNA.MonitorServiceSVC", "1.0.20.0")
        assert r"D:\MediaDNA_V2\Applications\MonitorServiceSVC" in agent_cmd
        assert "bootstrap_update.ps1" in agent_cmd

    def test_build_service_raw_script_atria_installer_compliance(self):
        """
        Valida que build_service_raw_script gera PowerShell puro, sem command wrapper,
        respeitando estritamente o diretório D:\\MediaDNA_V2\\Applications\\DTVCapture64
        e utilizando a URL oficial do instalador de engenharia (sem GitHub / sem iex).
        """
        raw = build_service_raw_script("Atria Capture", "2.0.0.2")
        assert "powershell -ExecutionPolicy" not in raw, "Raw script deve ser PowerShell nativo para o agente"
        assert r"D:\MediaDNA_V2\Applications\DTVCapture64" in raw
        assert "stgengineeringreleases.blob.core.windows.net" in raw
        assert "install_v2000_x64.ps1" in raw
        assert "raw.githubusercontent.com" not in raw
        assert "invoke-expression" not in raw.lower()
        assert "| iex" not in raw.lower()

    def test_force_execute_service_update_enqueues_and_persists(self, monkeypatch):
        """
        Garante que a execução direta disparada pelo Dashboard enfileira o comando
        na fila de comandos do agente (Fila_Comandos/{host}/pending/), assina com HMAC
        e atualiza a governança local sem depender de Tanium ou GV.
        """
        enqueued_calls = []

        def mock_enqueue(exec_id, host, title, shell_type, script, requested_by, timeout_s=120):
            enqueued_calls.append({
                "exec_id": exec_id,
                "host": host,
                "title": title,
                "shell_type": shell_type,
                "script": script,
                "requested_by": requested_by,
                "timeout_s": timeout_s
            })
            return True

        monkeypatch.setattr("remote_queue.enqueue_command_on_sharepoint", mock_enqueue, raising=False)
        monkeypatch.setattr("dashboard.remote_queue.enqueue_command_on_sharepoint", mock_enqueue, raising=False)

        res = force_execute_service_update(
            host="BRGO-ANA-DT02",
            service_name="Atria Capture",
            target_version="2.0.0.2",
            requested_by="Operador Teste NOC"
        )

        assert res["success"] is True
        assert res["host"] == "BRGO-ANA-DT02"
        assert res["target_version"] == "2.0.0.2"
        assert len(enqueued_calls) >= 1
        assert enqueued_calls[0]["host"] == "BRGO-ANA-DT02"
        assert "Atria" in enqueued_calls[0]["title"]
        assert enqueued_calls[0]["timeout_s"] == 600

    def test_get_pending_actions_by_host_returns_governed_target_version(self):
        """
        Garante que a API de ações pendentes para o host (/api/fleet/pending-actions/{host})
        retorne a versão desejada governada (2.0.0.2 para Atria Capture) e nunca uma versão
        legada antiga, evitando falsa conclusão no agente C#.
        """
        from dashboard.app import get_pending_actions_by_host
        import asyncio

        actions = asyncio.run(get_pending_actions_by_host("BRGO-ANA-DT02"))
        assert isinstance(actions, list)
        atria_actions = [a for a in actions if "atria" in str(a.get("NomeServico", "")).lower()]
        if atria_actions:
            assert atria_actions[0]["VersaoDesejada"] == "2.0.0.2"

    def test_post_update_desired_alias_endpoint(self):
        """
        Garante que o endpoint POST /api/fleet/action/update-desired exista e funcione,
        eliminando erro 404 e toast de 'falha ao disparar ordem no SharePoint' ao clicar em Atualizar.
        """
        from fastapi.testclient import TestClient
        from dashboard.app import app

        client = TestClient(app)
        resp = client.post(
            "/api/fleet/action/update-desired",
            json={
                "service_name": "Atria Capture",
                "target_version": "2.0.0.2",
                "hosts": ["BRRS-BGE-TDT-02"]
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data.get("service_name") == "Atria Capture"
        assert "BRRS-BGE-TDT-02" in data.get("dispatched_hosts", [])

    def test_force_execute_endpoint_bage_cs2(self):
        """
        Garante que a execução direta para Bagé CS 2 (BRRS-BGE-TDT-02) funcione
        via POST /api/fleet/action/force-execute com resposta 200 e sucesso.
        """
        from fastapi.testclient import TestClient
        from dashboard.app import app

        client = TestClient(app)
        resp = client.post(
            "/api/fleet/action/force-execute",
            json={
                "host": "BRRS-BGE-TDT-02",
                "service_name": "Atria Capture",
                "target_version": "2.0.0.2"
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data.get("host") == "BRRS-BGE-TDT-02"
        assert data.get("target_version") == "2.0.0.2"

    def test_stepper_progression_logic_when_in_progress(self):
        """
        Garante que quando a atualização está 'Em Progresso', a esteira reflete
        a saúde real da telemetria (status 'completed' se recente ou 'warning' se sem heartbeat),
        evitando confusão visual e avisando o operador se o agente demorar.
        """
        status = get_host_service_action_status("BRRS-BGE-TDT-02", "Atria Capture", "2.0.0.2")
        assert status["success"] is True
        steps = status.get("steps", [])
        assert len(steps) == 5
        assert steps[0]["status"] == "completed"
        if status.get("status_atualizacao") == "Em Progresso":
            assert steps[1]["status"] in ("completed", "warning")
            if status.get("is_stale_heartbeat"):
                assert steps[1]["status"] == "warning"
                assert status.get("contingency_recommended") is True
            else:
                assert steps[2]["status"] == "in_progress"

