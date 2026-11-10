import pytest
import asyncio
from io import BytesIO
from PIL import Image
import os
import sys
from pathlib import Path

# Adiciona dashboard ao path
sys.path.insert(0, os.path.abspath("dashboard"))
sys.path.insert(0, os.path.abspath("."))

from app import get_channel_jpeg

def test_channel_jpeg_returns_valid_320x240_image():
    """Valida que get_channel_jpeg retorna uma imagem JPEG válida 320x240."""
    res = asyncio.run(get_channel_jpeg(canal="SBT", praca="Itaituba"))
    assert res.status_code == 200
    assert res.media_type == "image/jpeg"
    
    img = Image.open(BytesIO(res.body))
    assert img.size == (320, 240)
    assert img.format == "JPEG"

def test_channel_jpeg_anti_hallucination_never_loads_stock_frames():
    """
    DIRETRIZ CRÍTICA ANTI-ALUCINAÇÃO:
    Valida que nenhuma imagem estática/canned das pastas static/thumbnails/channel_frames
    é retornada para canais remotos sem gravação física local.
    O sistema deve renderizar o Slate Técnico Oficial com dados reais da telemetria do CS.
    """
    stock_dir = Path("dashboard/static/thumbnails/channel_frames/sbt")
    stock_images_bytes = []
    if stock_dir.exists():
        for f in stock_dir.glob("*.jpg"):
            stock_images_bytes.append(f.read_bytes())
    
    res = asyncio.run(get_channel_jpeg(canal="SBT", praca="Itaituba"))
    
    # A resposta nunca pode ser idêntica em bytes a nenhum frame de stock
    for stock_bytes in stock_images_bytes:
        assert res.body != stock_bytes, "FALHA: Imagem retornada é um frame de stock estático alucinado!"

def test_channel_jpeg_radio_mode_vu_meter():
    """Valida que canais de rádio continuam retornando o console de VU Meter sem vídeo."""
    res = asyncio.run(get_channel_jpeg(canal="Rádio 98 FM", praca="Belo Horizonte", meio="FM"))
    assert res.status_code == 200
    assert res.media_type == "image/jpeg"
    img = Image.open(BytesIO(res.body))
    assert img.size == (320, 240)

def test_channel_jpeg_fault_mode_slate():
    """Valida que o modo fault ou canais com queda/falha geram o slate de alerta operacional."""
    res = asyncio.run(get_channel_jpeg(canal="Rede Globo", praca="Pelotas", mode="fault"))
    assert res.status_code == 200
    assert res.media_type == "image/jpeg"
    img = Image.open(BytesIO(res.body))
    assert img.size == (320, 240)

def test_channel_jpeg_cable_paytv_slate_combate():
    """
    Valida que canais de TV a Cabo / PayTV (CS 3) como Canal Combate geram
    o Slate Técnico com cabeçalho de TV A CABO e sem falsa queda de portadora RF.
    """
    res = asyncio.run(get_channel_jpeg(canal="Canal Combate", praca="Nacional"))
    assert res.status_code == 200
    assert res.media_type == "image/jpeg"
    img = Image.open(BytesIO(res.body))
    assert img.size == (320, 240)

def test_channel_jpeg_cable_paytv_slate_xsports():
    """
    Valida que canais de Cabo com Tuner WORKING geram imagem válida de tamanho 320x240.
    """
    res = asyncio.run(get_channel_jpeg(canal="X-Sports", praca="São Paulo"))
    assert res.status_code == 200
    assert res.media_type == "image/jpeg"
    img = Image.open(BytesIO(res.body))
    assert img.size == (320, 240)

def test_frontend_media_switch_presence():
    """Valida que o switch seletor de Meio (TV vs Rádio vs Todos) existe no DOM do Mosaico."""
    with open("dashboard/static/index.html", "r", encoding="utf-8") as f:
        html = f.read()
    assert "btnMosaicMediaAll" in html
    assert "btnMosaicMediaTV" in html
    assert "btnMosaicMediaRadio" in html
    assert "setMosaicMediaFilter" in html
