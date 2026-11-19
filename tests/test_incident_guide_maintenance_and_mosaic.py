# tests/test_incident_guide_maintenance_and_mosaic.py
# =====================================================================
# Testes Automatizados Unitários e de Integração:
# - Gerenciamento de Janelas de Manutenção por Praça (Silenciamento)
# - Persistência Temporal Forense e Eliminação de Falsos Positivos
# - Mapeamento e Validação de Canais de Rádio e TV com HUD Overlay
# - Endpoints REST do Mosaico e Manutenção
# =====================================================================

import os
import sys
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parent.parent
DASHBOARD_DIR = ROOT_DIR / "dashboard"
if str(DASHBOARD_DIR) not in sys.path:
    sys.path.insert(0, str(DASHBOARD_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from maintenance_manager import (
    set_praca_maintenance,
    get_active_maintenance_pracas,
    remove_praca_maintenance,
    is_praca_in_maintenance,
    normalize_praca_name
)
from mosaic_manager import (
    get_channel_live_snapshots,
    _CHANNEL_FAILURE_HISTORY
)
from app import app


@pytest.fixture
def client():
    from auth import create_session
    token = create_session("admin", "admin")
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


def test_maintenance_manager_lifecycle():
    """Testa ciclo completo de agendamento, verificação e encerramento de manutenção."""
    test_praca = "Uruguaiana"
    
    # 1. Garante que praça não está em manutenção inicialmente
    remove_praca_maintenance(test_praca)
    assert not is_praca_in_maintenance(test_praca)
    assert not is_praca_in_maintenance("uruguaiana")

    # 2. Ativa janela de manutenção de 30 minutos
    res = set_praca_maintenance(
        praca=test_praca,
        duration_minutes=30,
        user="test_operator",
        reason="Troca de antena UHF local"
    )
    assert res["status"] == "success"
    assert res["record"]["duration_minutes"] == 30
    assert res["record"]["user"] == "test_operator"

    # 3. Verifica se a normalização de acentos e case funciona perfeitamente
    assert is_praca_in_maintenance("Uruguaiana")
    assert is_praca_in_maintenance("uruguaiana")
    assert is_praca_in_maintenance("URUGUAIANA")

    # 4. Verifica listagem de praças ativas
    active = get_active_maintenance_pracas()
    match = [a for a in active if a.get("praca_norm") == "uruguaiana"]
    assert len(match) == 1
    assert match[0]["remaining_minutes"] <= 30
    assert match[0]["reason"] == "Troca de antena UHF local"

    # 5. Remove janela de manutenção
    del_res = remove_praca_maintenance(test_praca)
    assert del_res["status"] == "success"
    assert not is_praca_in_maintenance(test_praca)


def test_maintenance_api_endpoints(client):
    """Testa os endpoints REST de manutenção no backend."""
    test_praca = "Vitória"

    # POST /api/fleet/maintenance
    resp_post = client.post("/api/fleet/maintenance", json={
        "praca": test_praca,
        "duration_minutes": 45,
        "reason": "Manutenção preventiva de switch"
    })
    assert resp_post.status_code == 200
    assert resp_post.json()["status"] == "success"

    # GET /api/fleet/maintenance
    resp_get = client.get("/api/fleet/maintenance")
    assert resp_get.status_code == 200
    pracas = resp_get.json().get("active_pracas", [])
    norm_vitoria = normalize_praca_name(test_praca)
    assert any(p.get("praca_norm") == norm_vitoria for p in pracas)

    # DELETE /api/fleet/maintenance
    resp_del = client.delete(f"/api/fleet/maintenance?praca={test_praca}")
    assert resp_del.status_code == 200
    assert resp_del.json()["status"] == "success"

    # Confirma remoção
    resp_check = client.get("/api/fleet/maintenance")
    pracas_after = resp_check.json().get("active_pracas", [])
    assert not any(p.get("praca_norm") == norm_vitoria for p in pracas_after)


def test_mosaic_forensic_temporal_persistence_and_maintenance():
    """Valida a calibração da Galeria Forense para eliminar falsos positivos transitórios."""
    _CHANNEL_FAILURE_HISTORY.clear()
    
    mock_channels = [
        {
            "canal": "Rede Globo",
            "cidade": "Santos",
            "id_cs": 1,
            "meio": "Digital Terrestre",
            "qualidade_sinal": 0,
            "forca_sinal": 0,
            "status_tuner": "No Lock",
            "has_outage": True
        },
        {
            "canal": "Band FM 96.1",
            "cidade": "São Paulo",
            "id_cs": 1,
            "meio": "Rádio",
            "qualidade_sinal": 0,
            "forca_sinal": 0,
            "audio_mudo": "Não"
        }
    ]

    # Amostra 1: Canal de TV com queda inicial (amostra isolada / transitória)
    snaps_1 = get_channel_live_snapshots(mock_channels)["snapshots"]
    tv_snap_1 = next(s for s in snaps_1 if s["canal"] == "Rede Globo")
    
    # Na primeira amostra, samples=1 e dur_sec=0 -> NÃO confirmado forense (evita falso positivo imediato)
    assert tv_snap_1["is_forensic_confirmed"] is False
    assert tv_snap_1["is_chronic"] is False

    # Simula avanço de persistência forçando o histórico temporal para >= 3 amostras
    key = "santos::rede globo"
    _CHANNEL_FAILURE_HISTORY[key]["samples"] = 3
    _CHANNEL_FAILURE_HISTORY[key]["first_seen"] = time.time() - 360  # 6 minutos atrás

    snaps_2 = get_channel_live_snapshots(mock_channels)["snapshots"]
    tv_snap_2 = next(s for s in snaps_2 if s["canal"] == "Rede Globo")
    assert tv_snap_2["is_forensic_confirmed"] is True
    assert tv_snap_2["failure_duration_min"] >= 5

    # Simula caso crônico (> 30 minutos)
    _CHANNEL_FAILURE_HISTORY[key]["first_seen"] = time.time() - 2000  # >33 minutos
    snaps_3 = get_channel_live_snapshots(mock_channels)["snapshots"]
    tv_snap_3 = next(s for s in snaps_3 if s["canal"] == "Rede Globo")
    assert tv_snap_3["is_chronic"] is True
    assert tv_snap_3["failure_duration_min"] >= 30

    # Valida Rádio: rádio com áudio nominal NUNCA gera falso positivo de RF 0%
    radio_snap = next(s for s in snaps_1 if s["canal"] == "Band FM 96.1")
    assert radio_snap["is_radio"] is True
    assert radio_snap["tipo_falha"] == "none"
    assert radio_snap["status"] == "ÁUDIO OK"

    # Valida Silenciamento por Manutenção
    set_praca_maintenance("Santos", duration_minutes=60, reason="Test Maint")
    snaps_maint = get_channel_live_snapshots(mock_channels)["snapshots"]
    tv_maint = next(s for s in snaps_maint if s["canal"] == "Rede Globo")
    assert tv_maint["in_maintenance"] is True
    assert tv_maint["tipo_falha"] == "maintenance"
    assert "MANUTENÇÃO" in tv_maint["status"]

    remove_praca_maintenance("Santos")


def test_channel_jpeg_endpoint_tv_and_radio(client):
    """Testa se a geração de frames JPEG responde 200 para TV e para Rádio."""
    # 1. Rádio: Retorna imagem JPEG de console de áudio broadcast nominal
    resp_radio = client.get("/api/fleet/channels/jpeg?canal=93%20FM&praca=Rio%20de%20Janeiro&meio=R%C3%A1dio")
    assert resp_radio.status_code == 200
    assert resp_radio.headers["content-type"] == "image/jpeg"
    assert len(resp_radio.content) > 1000

    # 2. TV: Retorna imagem JPEG de transmissão real ou slate técnico
    resp_tv = client.get("/api/fleet/channels/jpeg?canal=Rede%20Globo&praca=Bauru&mode=real")
    assert resp_tv.status_code == 200
    assert resp_tv.headers["content-type"] == "image/jpeg"
    assert len(resp_tv.content) > 1000
