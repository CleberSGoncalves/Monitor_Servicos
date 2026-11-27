# -*- coding: utf-8 -*-
"""
Validação da esteira FastMatching para hosts em modo Windows Service com RAM Parcial (ex: Ariquemes 90 MB).
Garante que o Estágio 2 e todos os cards do modal Pipeline Live operem como NOMINAL (verde).
"""
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dashboard"))

from tracking_detection_monitor import get_fastmatching_pipeline_live, generate_pipeline_ai_solution_plan

def test_ariquemes_ram_partial_stage2_is_nominal_and_not_failed():
    mock_node_tel = {
        "hostname": "ARIQUEMES-SMME-261-CS1",
        "praca": "Ariquemes",
        "cs_host_telemetry": {
            "capture": {"running": True, "status": "Executando"},
            "fastmatching": {
                "running": True,
                "status": "Em Execução",
                "version": "1.0.3.7",
                "ram_mb": 90,
                "cpu_percent": 0.5,
                "uptime": "2d 4h"
            },
            "config_monitor": {"running": True, "status": "Em Execução", "wcf": "Conectado"},
            "emu": {"free_disk_gb": 181.6}
        }
    }

    with patch("tracking_detection_monitor.get_fastmatching_node_telemetry", return_value=mock_node_tel):
        live_data = get_fastmatching_pipeline_live("ARIQUEMES-SMME-261-CS1")
        assert live_data["success"] is True
        
        # 1. Valida Card do Catálogo SGG
        spots = live_data["spots_status"]
        assert spots["loaded"] is True
        assert spots["is_ram_partial"] is True
        assert spots["total_spots_loaded"] == 14820
        assert spots["recon_count"] == 14820
        assert spots["status_color"] == "green"
        assert "Sincronizado" in spots["status_label"]

        # 2. Valida Diagnóstico Geral (Verde, Nominal)
        diag = live_data["diagnosis"]
        assert diag["color"] == "green"
        assert diag["status"] == "NOMINAL"
        assert "Normal" in diag["title"]

        # 3. Valida Card Varredura & Memória
        perf = live_data["engine_performance"]
        assert perf["num_fingers"] > 0
        assert perf["proc_time_ms_avg"] > 0
        assert perf["ram_working_set_mb"] == 90

        # 4. Valida Modal de Diagnóstico IA / 4 Estágios
        plan = generate_pipeline_ai_solution_plan("ARIQUEMES-SMME-261-CS1")
        assert plan["success"] is True
        assert plan["health_score"] >= 90
        
        stage2 = [s for s in plan["stages"] if "2. Carga Catálogo SGG" in s["stage"]][0]
        assert stage2["status"] == "OK"
        assert stage2["badge_color"] == "#22c55e"
        assert "90 MB" in stage2["detail"]
