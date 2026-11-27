# -*- coding: utf-8 -*-
"""
Validação da esteira FastMatching para hosts em modo Windows Service com RAM Parcial (ex: Ariquemes 90 MB).
Garante que o Estágio 2 (Catálogo SGG / Memória RAM) não apresente falso positivo [FALHA].
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
        spots = live_data["spots_status"]
        assert spots["loaded"] is True
        assert spots["is_ram_partial"] is True
        assert spots["recon_count"] > 0

        plan = generate_pipeline_ai_solution_plan("ARIQUEMES-SMME-261-CS1")
        assert plan["success"] is True
        assert plan["health_score"] >= 90
        
        # Valida que Estágio 2 está OK (e NÃO em FALHA)
        stage2 = [s for s in plan["stages"] if "2. Carga Catálogo SGG" in s["stage"]][0]
        assert stage2["status"] == "OK"
        assert stage2["badge_color"] == "#22c55e"
        assert "90 MB" in stage2["detail"]
