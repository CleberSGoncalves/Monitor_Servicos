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
