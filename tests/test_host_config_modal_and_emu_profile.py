import pytest
import os
import sys

# Garante path do dashboard
dashboard_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard"))
if dashboard_dir not in sys.path:
    sys.path.insert(0, dashboard_dir)

from fleet_actions import (
    build_emu_profile_hardening_snippet,
    build_fastmatching_cleaner_migration_snippet,
    build_service_raw_script
)


def test_emu_profile_hardening_snippet_generation():
    """Valida a geração do snippet PowerShell para forçar 'EMU MediaDNA 1min'."""
    snippet = build_emu_profile_hardening_snippet(r"D:\MediaDNA_V2\Applications\DTVCapture64")
    assert "EMU_HARDENING" in snippet
    assert "EMU MediaDNA 1min" in snippet
    assert "Multiplexes.xml" in snippet
    assert "EMU_IsRecording" in snippet
    assert "EMU_ProfileName" in snippet
    assert "Copy-Item -Path $mPath -Destination \"$mPath.bak\"" in snippet


def test_atria_update_script_with_migration_places_hardening_before_interactive_start():
    """
    Valida que ao atualizar Atria com chave migrate_to_fastmatching=True:
    1. A blindagem de EMU Profile e remoção de legados ocorre ANTES do Start_Atria_Interactive.
    2. O Atria sobe já lendo a configuração corrigida.
    """
    raw_script = build_service_raw_script(
        service_name="Atria Capture",
        target_version="2.0.0.2",
        migrate_to_fastmatching=True
    )
    assert "EMU MediaDNA 1min" in raw_script
    assert "DNA.DetectionSVC" in raw_script
    assert "FastMatchingSvc" in raw_script
    assert "FileCleaner" in raw_script

    idx_emu = raw_script.find("EMU MediaDNA 1min")
    idx_start_atria = raw_script.find("Start_Atria_Interactive")
    assert idx_emu != -1
    assert idx_start_atria != -1
    # Hardening deve ser estritamente ANTES de reabrir o Atria interativo
    assert idx_emu < idx_start_atria, "O hardening do EMU deve ocorrer ANTES da abertura do Atria interativo"


def test_cs02_cs03_exclusion_from_detection_migration():
    """
    Valida que quando migrate_to_fastmatching=False (comportamento padrão para CS02 e CS03),
    o script de atualização do Atria NÃO tenta desinstalar DetectionSVC/TrackingSVC nem inicia FastMatching.
    """
    raw_script = build_service_raw_script(
        service_name="Atria Capture",
        target_version="2.0.0.2",
        migrate_to_fastmatching=False
    )
    # Não deve haver comando de desinstalação / delete do DetectionSVC
    assert "sc.exe delete DNA.DetectionSVC" not in raw_script
    assert "sc.exe delete DNA.TrackingSVC" not in raw_script
    assert "[MIGRACAO] Chave ativada" not in raw_script


def test_api_host_config_get_and_post():
    """Valida as rotas GET e POST /api/fleet/host-config/{hostname} do FastAPI."""
    from fastapi.testclient import TestClient
    from app import app
    from auth import create_session

    client = TestClient(app)
    token = create_session("admin_test", "admin")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Teste GET
    test_host = "BRMG-UDI-DT01"
    resp_get = client.get(f"/api/fleet/host-config/{test_host}", headers=headers)
    assert resp_get.status_code == 200, f"Erro GET: {resp_get.text}"
    data = resp_get.json()
    assert data["hostname"] == test_host
    assert "channels" in data
    assert isinstance(data["channels"], list)
    assert len(data["channels"]) > 0
    assert "app_config" in data
    assert data["app_config"]["api_port"] == 9000
    assert "logrotate" in data
    assert data["logrotate"]["rotate_days"] == 10
    assert "fma.log" in data["logrotate"]["target_log_path"]

    # 2. Teste POST
    payload = {
        "channels": [
            {
                "name": data["channels"][0]["name"],
                "emu_is_recording": True,
                "emu_profile_name": "EMU MediaDNA 1min",
                "mp4_is_recording": True
            }
        ],
        "app_config": {
            "api_port": 9000,
            "video_dir": r"D:\MediaDNA_V2\Data\video",
            "emu_dir": r"D:\MediaDNA_V2\Data\emu"
        },
        "logrotate": {
            "target_log_path": r"D:\MediaDNA_V2\Applications\DTVCapture64\FastMatchingSvc\fma.log",
            "rotate_days": 10,
            "frequency": "daily"
        },
        "reason": "Auditoria automatizada de teste pytest"
    }
    resp_post = client.post(f"/api/fleet/host-config/{test_host}", json=payload, headers=headers)
    assert resp_post.status_code == 200, f"Erro POST: {resp_post.text}"
    res_data = resp_post.json()
    assert res_data["success"] is True
    assert "execution_id" in res_data
    assert "script_preview" in res_data
    assert "Multiplexes.xml" in res_data["script_preview"]
    assert "rotate 10" in res_data["script_preview"]
    assert "Start_Atria_Interactive" in res_data["script_preview"]


def test_ui_elements_in_html_and_js():
    """Valida que o HTML e JS contêm os seletores e modais solicitados pelo usuário."""
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    index_html = os.path.join(repo_root, "dashboard", "static", "index.html")
    fleet_js = os.path.join(repo_root, "dashboard", "static", "js", "fleet_ops.js")

    with open(index_html, "r", encoding="utf-8") as f:
        html = f.read()

    with open(fleet_js, "r", encoding="utf-8") as f:
        js = f.read()

    # HTML
    assert 'id="modalHostConfig"' in html
    assert 'id="selectHostConfigPraca"' in html
    assert 'id="selectHostConfigCS"' in html
    assert 'id="selectHostConfigMachine"' in html
    assert 'openSelectedHostConfigModal()' in html
    assert 'AVISO OPERACIONAL' in html

    # JS
    assert "function openHostConfigModal" in js
    assert "function saveHostConfig" in js
    assert "function populateHostConfigSelectors" in js
    assert "isCS01" in js, "Validação de CS01 deve existir para blindar CS02 e CS03 da chave de detecção"
    # Super Modal Tabs & Functions
    assert "btnTabHostMuxes" in html
    assert "btnTabHostChannels" in html
    assert "btnTabHostAppConfig" in html
    assert "btnTabHostProfiles" in html
    assert "btnTabHostLogRotate" in html
    assert "btnTabHostPreview" in html
    assert "applyEmuProfileToAll" in js
    assert "renderHostConfigMuxesTable" in js
    assert "renderHostProfilesList" in js
    assert "saveSelectedProfileXml" in js


def test_super_modal_atria_muxes_channels_and_app_options():
    """Valida o inventário rico de Muxes, Canais, Application Options e WMProfiles no Super Modal."""
    from fastapi.testclient import TestClient
    from app import app
    from auth import create_session

    client = TestClient(app)
    token = create_session("admin_test", "admin")
    headers = {"Authorization": f"Bearer {token}"}

    test_host = "BRMG-UDI-DT01"
    resp = client.get(f"/api/fleet/host-config/{test_host}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Muxes
    assert "muxes" in data
    assert isinstance(data["muxes"], list)
    assert len(data["muxes"]) > 0
    m0 = data["muxes"][0]
    assert "mux_id" in m0
    assert "network_type" in m0
    assert "frequency" in m0
    assert "video_decoding_mode" in m0

    # Canais ricos
    c0 = data["channels"][0]
    assert "preferred_decoder" in c0
    assert "mp4_profile" in c0
    assert "mp3_profile" in c0
    assert "emu_profile_name" in c0
    assert c0["emu_profile_name"] == "EMU MediaDNA 1min"
    assert "video_caption_pattern" in c0
    assert "jpg_frames_config" in c0

    # Application Options
    assert "application_options" in data
    app_opt = data["application_options"]
    assert app_opt["autodetection_port"] == 1234
    assert app_opt["bin_match_threshold"] == 68
    assert "ConfigXml.xml" in app_opt["mediadna_config_xml"]
    assert "tracking" in app_opt["match_export_dir"]
    assert app_opt["enabled_features"]["EMU"] is True
    assert app_opt["enabled_features"]["MP4"] is True

    # WMProfiles Catalog
    assert "wmprofiles" in data
    assert isinstance(data["wmprofiles"], list)
    assert any(p["name"] == "EMU MediaDNA 1min" for p in data["wmprofiles"])
    assert any(p["name"] == "EMU MDNA" for p in data["wmprofiles"])

    # Teste POST com Muxes e Application Options
    payload = {
        "muxes": [
            {
                "mux_id": m0["mux_id"],
                "name": m0["name"],
                "network_type": "Terrestrial",
                "frequency": 557000,
                "bandwidth": 6,
                "video_decoding_mode": "Usar a configuração LAV global"
            }
        ],
        "channels": [
            {
                "name": c0["name"],
                "emu_is_recording": True,
                "emu_profile_name": "EMU MediaDNA 1min",
                "mp4_is_recording": True,
                "mp3_is_recording": True,
                "preferred_decoder": "Microsoft",
                "video_caption_height": 12,
                "video_caption_pattern": "UBE - REC(DT) - %d/%m/%Y %H:%M:%S"
            }
        ],
        "application_options": {
            "autodetection_port": 1234,
            "bin_match_threshold": 68,
            "max_emu_validations": 3
        },
        "wmprofiles": [
            {
                "filename": "EMU_EMU MediaDNA 1min.xml",
                "name": "EMU MediaDNA 1min",
                "xml_content": "<profile><target_duration_sec>60</target_duration_sec></profile>"
            }
        ],
        "reason": "Auditoria de Super Modal Atria"
    }

    resp_post = client.post(f"/api/fleet/host-config/{test_host}", json=payload, headers=headers)
    assert resp_post.status_code == 200
    res_data = resp_post.json()
    assert res_data["success"] is True
    script = res_data["script_preview"]
    assert "Multiplexes.xml" in script
    assert "EMU MediaDNA 1min" in script
    assert "ListeningPort" in script
    assert "BinMatchThreshold" in script
    assert "WMProfiles" in script


def test_uberlandia_emu_profile_hardening_scenario():
    """
    Testa o cenário forense de Uberlândia onde o perfil anterior era 'EMU MDNA':
    O snippet gerado substitui de forma infalível o perfil legado para 'EMU MediaDNA 1min'
    mesmo que a migração não esteja ativada no update do Atria.
    """
    script_atria = build_service_raw_script(
        service_name="Atria Capture",
        target_version="2.0.0.2",
        migrate_to_fastmatching=False
    )
    # A blindagem de perfil EMU DEVE estar presente incondicionalmente no Atria Capture
    assert "EMU_HARDENING" in script_atria
    assert "EMU MediaDNA 1min" in script_atria
    assert "Multiplexes.xml" in script_atria
    assert "Start_Atria_Interactive" in script_atria
    # Valida ordem: blindagem antes de iniciar Atria
    assert script_atria.find("EMU MediaDNA 1min") < script_atria.find("Start_Atria_Interactive")
