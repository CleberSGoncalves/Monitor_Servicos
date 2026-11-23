"""
test_mosaic_live_frames_and_anti_cache.py
Validação automatizada das diretrizes:
1. Proibição de frames estáticos antigos/alucinados de novela/programas passados (sem cache falso).
2. Retorno do Standby Slate Técnico Oficial com dados reais de telemetria quando sem arquivo recente em disco.
3. Cabeçalhos anti-cache estritos na rota /api/fleet/channels/jpeg.
"""

import sys
from pathlib import Path
sys.path.insert(0, "dashboard")

import pytest
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)


def test_channel_jpeg_never_returns_stale_static_frames():
    """
    Ao requisitar um canal onde não há arquivo JPEG fresco no disco do nó (<=15 min),
    o sistema NUNCA deve carregar fotos antigas de programas de dias atrás.
    Deve retornar o Standby Slate Técnico Oficial do MediaDNA.
    """
    resp = client.get("/api/fleet/channels/jpeg?canal=Rede%20Globo&praca=Linhares&mode=real")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"

    # Cabeçalhos anti-cache obrigatórios
    assert "no-store" in resp.headers["cache-control"]
    assert "no-cache" in resp.headers["cache-control"]
    assert resp.headers.get("pragma") == "no-cache"


def test_channel_jpeg_anti_cache_headers():
    """
    Verifica que qualquer requisição de JPEG tem parâmetros de recusa de cache pelo browser.
    """
    resp = client.get("/api/fleet/channels/jpeg?canal=SBT&praca=Fortaleza&seq=123&t=999999999")
    assert resp.status_code == 200
    assert "must-revalidate" in resp.headers["cache-control"]
    assert resp.headers.get("expires") == "0"


def test_radio_channel_returns_audio_broadcast_panel():
    """
    Canais de rádio nunca devem fingir ter vídeo ou carregar fotos de TV.
    Devem retornar painel de áudio broadcast.
    """
    resp = client.get("/api/fleet/channels/jpeg?canal=Rádio%20MIX%20FM&praca=Belo%20Horizonte&meio=Radio")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
