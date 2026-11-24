"""
test_praca_analyzer_cs_filtering_and_radio.py
Validação automatizada das regras férreas:
1. Detecção comercial é exclusiva do CS01 (nunca audita detecção em CS02/CS03).
2. Rádios Sonifex/Streaming com gravando_mp3 == 'Sim' e qualidade == 0 são 100% NOMINAIS (VERDE).
3. Filtragem estrita de canais por CS sem duplicações.
4. Pipeline forense de 6 estágios.
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0, "dashboard")

import pytest
from unittest.mock import patch
from praca_analyzer import audit_praca_ecosystem, generate_ai_solutions_plan


def test_radio_sonifex_recording_is_nominal_and_not_penalized():
    """
    Rádios não possuem tuner RF digital. qualidade_sinal == 0 é normal.
    Se gravando_mp3 == 'Sim', deve ser classificado como NOMINAL verde e NÃO gerar problema de queda.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    mock_cache = {
        "services": [
            {
                "hostname": "Belo_Horizonte_Radio-SMME-377-CS3",
                "praca": "Belo Horizonte",
                "cs": 3,
                "nome_servico": "DNA.ConfigMonitorSVC",
                "service_name": "DNA.ConfigMonitorSVC",
                "status": "Running",
                "status_servico": "Em Execução",
                "cpu_uso": "26%",
                "ram_uso": "4.2 GB",
                "disco_d_livre": "120 GB",
                "versao_agente": "1.0.20.0",
                "ultima_atualizacao": now_iso
            }
        ],
        "channels": [
            {
                "cidade": "Belo Horizonte",
                "canal": "Rádio MIX FM",
                "hostname": "Belo_Horizonte_Radio-SMME-377-CS3",
                "qualidade": 0,
                "status_tuner": "N/A",
                "gravando": "Sim",
                "gravando_mp3": "Sim"
            },
            {
                "cidade": "Belo Horizonte",
                "canal": "Band FM (Florianópolis)",
                "hostname": "Belo_Horizonte_Radio-SMME-377-CS3",
                "qualidade": 0,
                "status_tuner": "Connected with tuner. WORKING.",
                "gravando": None,
                "gravando_mp3": "Não",
                "meio": "Streaming (RTSP)",
                "motivo": "Operando Normalmente (Telemetria Google Cloud)",
                "has_outage": False
            }
        ]
    }

    with patch("praca_analyzer.get_cached_data", return_value=mock_cache):
        audit = audit_praca_ecosystem("Belo Horizonte", selected_cs="CS03")

        # Verifica canais
        assert len(audit["canais"]) == 2
        for ch in audit["canais"]:
            assert ch["is_radio"] is True
            assert ch["has_outage"] is False
            assert ch["is_nominal"] is True

        # Verifica que nenhum problema de sinal de rádio foi gerado
        assert len(audit["problems"]) == 0
        assert audit["health_score"] == 100
        signal_problems = [p for p in audit["problems"] if "SIGNAL" in p["code"]]
        assert len(signal_problems) == 0

        # Health score deve ser alto (sem penalidade de sinal de rádio)
        assert audit["health_score"] >= 90


def test_detection_engine_ignored_on_cs02_and_cs03():
    """
    Ao selecionar CS02 ou CS03, o motor de detecção NUNCA deve ser analisado como falha.
    Deve constar como N/A — Exclusivo CS01 no estágio 2 do pipeline.
    """
    mock_cache = {
        "services": [
            {
                "hostname": "Vitoria-SMME-223-CS2",
                "praca": "Vitoria",
                "cs": 2,
                "service_name": "DNA.ConfigMonitorSVC",
                "status": "Running",
                "cpu_uso": "26%",
                "ram_uso": "6.1 GB",
                "disco_d_livre": "250 GB",
                "versao_agente": "1.0.20.0"
            }
        ],
        "channels": [
            {
                "cidade": "Vitoria",
                "canal": "TV Gazeta",
                "hostname": "Vitoria-SMME-223-CS2",
                "qualidade": 90,
                "status_tuner": "OK",
                "gravando": "Sim"
            }
        ]
    }

    with patch("praca_analyzer.get_cached_data", return_value=mock_cache):
        audit = audit_praca_ecosystem("Vitoria", selected_cs="CS02")

        # Verifica que motor foi marcado como N/A
        assert "N/A" in audit["active_engine"]
        assert audit["is_single_cs_focus"] is True
        assert audit["active_cs_tier"] == 2

        # Verifica estágio 2 do pipeline
        detection_stage = next(s for s in audit["pipeline_stages"] if s["id"] == "detection")
        assert detection_stage["status"] == "NA"
        assert "N/A" in detection_stage["badge"]

        # Não deve haver problema de DETECTION_ENGINE_STOPPED
        det_problems = [p for p in audit["problems"] if "DETECTION" in p["code"]]
        assert len(det_problems) == 0

        # Health score não deve ser penalizado por detecção
        assert audit["health_score"] == 100


def test_pipeline_stages_integrity():
    """
    Verifica a presença e consistência dos 7 estágios do pipeline forense (incluindo Link WAN).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    mock_cache = {
        "services": [
            {
                "hostname": "Aracaju-SMME-101-CS1",
                "praca": "Aracaju",
                "cs": 1,
                "nome_servico": "FastMatchingSvc",
                "service_name": "Fast Matching Service",
                "status": "Running",
                "status_servico": "Em Execução",
                "cpu_uso": "35%",
                "ram_uso": "8.0 GB",
                "disco_d_livre": "300 GB",
                "versao_agente": "1.0.20.0",
                "ultima_atualizacao": now_iso
            },
            {
                "hostname": "Aracaju-SMME-101-CS1",
                "praca": "Aracaju",
                "cs": 1,
                "nome_servico": "DNA.ConfigMonitorSVC",
                "service_name": "DNA.ConfigMonitorSVC",
                "status": "Running",
                "status_servico": "Em Execução",
                "cpu_uso": "35%",
                "ram_uso": "8.0 GB",
                "disco_d_livre": "300 GB",
                "versao_agente": "1.0.20.0",
                "ultima_atualizacao": now_iso
            }
        ],
        "channels": [
            {
                "cidade": "Aracaju",
                "canal": "TV Sergipe",
                "hostname": "Aracaju-SMME-101-CS1",
                "qualidade": 95,
                "status_tuner": "OK",
                "gravando": "Sim"
            }
        ]
    }

    with patch("praca_analyzer.get_cached_data", return_value=mock_cache), \
         patch("tracking_detection_monitor.get_fastmatching_node_telemetry", return_value={"catalog_recon_zero": False}):
        audit = audit_praca_ecosystem("Aracaju", selected_cs="CS01")
        stages = audit["pipeline_stages"]

        assert len(stages) == 7
        stage_ids = [s["id"] for s in stages]
        assert stage_ids == ["link", "wan_link", "signal", "recording", "hardware", "detection", "dispatch"]

        # No CS01 com FastMatching ativo, detecção deve ser NOMINAL
        det_stage = next(s for s in stages if s["id"] == "detection")
        assert det_stage["status"] == "NOMINAL"
        assert "FastMatching" in det_stage["badge"]

        # Link WAN deve estar presente
        wan_stage = next(s for s in stages if s["id"] == "wan_link")
        assert wan_stage["status"] == "NOMINAL"
        assert "Mbps" in wan_stage["badge"] or "SLA" in wan_stage["badge"]


def test_cs02_and_cs03_wcf_and_detection_strictly_na_and_wan_link():
    """
    Garante que em CS02 e CS03:
    1. Detecção Automática seja N/A — Exclusivo CS01.
    2. Despacho WCF seja N/A — Exclusivo CS01.
    3. Link WAN esteja presente com operadora e RTT.
    4. Filtros com float como 'CS02.0' funcionem perfeitamente.
    """
    audit_cs2 = audit_praca_ecosystem("Brasília", selected_cs="CS02.0")
    assert audit_cs2["selected_cs"] == "CS02"
    assert audit_cs2["is_single_cs_focus"] is True
    assert audit_cs2["active_cs_tier"] == 2
    assert audit_cs2["total_hosts"] == 1
    assert "CS2" in audit_cs2["focused_host"]

    # Detecção e WCF devem ser estritamente N/A
    stages_cs2 = audit_cs2["pipeline_stages"]
    det_st = next(s for s in stages_cs2 if s["id"] == "detection")
    assert det_st["status"] == "NA"
    assert "N/A — Exclusivo CS01" in det_st["badge"]

    disp_st = next(s for s in stages_cs2 if s["id"] == "dispatch")
    assert disp_st["status"] == "NA"
    assert "N/A — Exclusivo CS01" in disp_st["badge"]

    # Link WAN deve estar presente e com telemetria
    wan_st = next(s for s in stages_cs2 if s["id"] == "wan_link")
    assert wan_st["status"] == "NOMINAL"
    assert "Telebras" in wan_st["badge"]
    assert "Mbps" in wan_st["badge"]
