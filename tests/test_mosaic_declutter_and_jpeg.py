import pytest
from pathlib import Path

def test_mosaic_wall_js_decluttered_layout():
    """Valida que o mosaic_wall.js nao possui mais o VU meter e nem o gradiente cobrindo o video."""
    js_path = Path("dashboard/static/js/mosaic_wall.js")
    assert js_path.exists(), "mosaic_wall.js deve existir"
    content = js_path.read_text(encoding="utf-8")

    # Nao deve conter o VU meter cobrindo a lateral do video
    assert "Micro VU Meter Estéreo Vertical Overlaid na Lateral Direita do Vídeo" not in content
    # Nao deve conter o overlay inferior escuro cobrindo 40% da imagem
    assert "HUD Bottom Overlay Sobreposto com Gradiente Escuro" not in content
    # Deve conter a chamada de Sinal & RF no rodape abaixo da imagem
    assert "Sinal &amp; RF: <span" in content
    # Auto-rotacao deve iniciar desligada por padrao
    assert "let isMosaicRotatePlaying = false;" in content

@pytest.mark.anyio
async def test_get_channel_jpeg_always_serves_valid_image():
    """Valida que o endpoint de JPEG sempre serve uma imagem real valida sem gerar slate preto."""
    import sys
    sys.path.insert(0, "dashboard")
    from app import get_channel_jpeg
    resp = await get_channel_jpeg(canal="Rede Globo", praca="Linhares", mode="real")
    assert resp.media_type == "image/jpeg"
    assert len(resp.body) > 5000, "Deve retornar imagem JPEG com conteudo real"
