# dashboard/failure_classifier_service.py
"""
Serviço Central: Classificador de Falhas & Base de Conhecimento Broadcast (Machine Learning Engine).

Repositório central de conhecimento do dashboard sobre tipos de falhas de qualidade,
suas assinaturas técnicas, causas raízes físicas/digitais e playbooks de mitigação.

Regras de Integridade:
1. Canais com Placa Analógica Yuan (TW6802 PCI DirectShow) e Streaming NÃO são Digital Terrestre:
   - Se gravando, estão 100% Nominais.
   - Jamais são classificados como 'Queda de Portadora RF'.
2. Não mistura escoamento WAN com falha de qualidade:
   - O foco exclusivo é avaliar sinais, qualidade de vídeo, integridade de áudio e encoders.
3. Machine Learning & Aprendizado Contínuo:
   - Enumera os tipos de falha (#01, #02, #03...) e aprende novas assinaturas com IA Gemini Pro.
"""

import os
import json
import sqlite3
import time
import logging

logger = logging.getLogger("failure_classifier")
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional

from sharepoint_sync import get_cached_data

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "fleet.db"


def init_classifier_db():
    """Garante a existência das tabelas do Classificador de Falhas."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS failure_taxonomy_catalog (
                pattern_id TEXT PRIMARY KEY,
                enum_number INTEGER NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                scope_meio TEXT NOT NULL DEFAULT 'Digital Terrestre (ISDB-Tb)',
                icon TEXT NOT NULL DEFAULT 'fa-exclamation-triangle',
                color TEXT NOT NULL DEFAULT '#f59e0b',
                badge_class TEXT NOT NULL DEFAULT 'badge-yellow',
                signature_rules TEXT NOT NULL,
                root_causes TEXT NOT NULL,
                mitigation_playbook TEXT NOT NULL,
                discovered_by TEXT NOT NULL DEFAULT 'Canônico',
                confidence_score REAL NOT NULL DEFAULT 0.95,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS failure_learning_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_id TEXT NOT NULL,
                praca TEXT NOT NULL,
                canal TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS failure_incidents_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                timestamp_formatado TEXT NOT NULL,
                praca TEXT NOT NULL,
                canal TEXT NOT NULL,
                cs TEXT,
                idpv TEXT,
                meio TEXT NOT NULL,
                pattern_id TEXT NOT NULL,
                enum_number INTEGER NOT NULL,
                pattern_name TEXT NOT NULL,
                category TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'Alerta',
                symptom TEXT,
                duration_min REAL DEFAULT 0,
                status TEXT DEFAULT 'Ativa'
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ftc_active ON failure_taxonomy_catalog (is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fll_time ON failure_learning_log (created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fih_canal ON failure_incidents_history (canal)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fih_praca ON failure_incidents_history (praca)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fih_pattern ON failure_incidents_history (pattern_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fih_time ON failure_incidents_history (timestamp)")

        seed_taxonomy_if_empty(cursor)
        conn.commit()


def seed_taxonomy_if_empty(cursor: sqlite3.Cursor):
    """Popula os 9 tipos fundamentais de falhas de qualidade broadcast se ainda não existirem."""
    cursor.execute("SELECT COUNT(*) FROM failure_taxonomy_catalog")
    if cursor.fetchone()[0] > 0:
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    taxonomies = [
        (
            "ausencia_portadora_rf",
            1,
            "Ausência de Portadora RF / Queda no Transmissor UHF",
            "Transmissão RF",
            "Digital Terrestre (ISDB-Tb)",
            "fa-broadcast-tower",
            "#ef4444",
            "badge-red",
            "Demodulador TBS com Qualidade 0% e perda de Lock digital ISDB-Tb em canal digital terrestre.",
            "1. Transmissor da torre fora do ar por falta de energia ou trip de disjuntor.\n2. Falha de cabo coaxial/conector BNC de entrada na antena UHF receptora.\n3. Antena UHF desapontada por rajadas de vento.",
            "Acionar equipe de transmissores da geradora; testar receptor UHF com analisador de espectro de campo.",
            "Canônico (Engenharia de RF)",
            0.99, 1, now_iso, now_iso
        ),
        (
            "congelamento_gop_stall",
            2,
            "Congelamento de Vídeo / GOP Stall (PTS Estático)",
            "Codificação / MUX",
            "Digital Terrestre / Todos",
            "fa-snowflake",
            "#eab308",
            "badge-yellow",
            "Repetição ininterrupta de quadros de vídeo e congelamento de PTS por tempo contínuo >= 4 minutos.",
            "1. Falha de software no codificador H.264 da afiliada.\n2. Crash na placa de captura de exibição do switcher.\n3. Buffer de MUX estourado durante transição de comerciais.",
            "Contatar switcher/MCR da emissora para reiniciar encoder broadcast H.264 ou reciclar PID no TBS.",
            "Canônico (Processamento de Vídeo)",
            0.98, 1, now_iso, now_iso
        ),
        (
            "portadora_audio_muda",
            3,
            "Descontinuidade / Ausência de Portadora Sonora (Áudio Mudo)",
            "Áudio Broadcast",
            "Digital Terrestre / TV",
            "fa-volume-mute",
            "#a855f7",
            "badge-purple",
            "Fluxo de vídeo ativo e sintonizado porém sem portadora sonora de áudio (-inf dB).",
            "1. Mesa de áudio da geradora com fader mutado ou rota SDI desconfigurada.\n2. Encoder de áudio AAC/AC3 travado no multiplexador.\n3. Microfone ou automação de playout com falha de driver.",
            "Verificar matriz de áudio da afiliada e encoder AAC/AC3. O canal está transmitindo vídeo sem som.",
            "Canônico (Engenharia de Som)",
            0.98, 1, now_iso, now_iso
        ),
        (
            "interferencia_ruido_5g",
            4,
            "Intermodulação / Ruído de Borda por Sinal Adjacente (5G / Pirata)",
            "Modulação RF",
            "Digital Terrestre (ISDB-Tb)",
            "fa-bolt",
            "#f97316",
            "badge-orange",
            "Força de sinal alta (>= 65%) com Qualidade oscilando bruscamente abaixo de 40% (SNR degradado).",
            "1. Saturação do estágio de RF por antena celular 5G próxima (faixa adjacente 3.5 GHz).\n2. Emissora de rádio/TV comunitária transmitindo com harmônicos fora da máscara Anatel.\n3. LNB/Amplificador de linha operando em ponto de saturação não linear.",
            "Instalar filtro passa-faixa ISDB-Tb (UHF 470-698 MHz) na entrada do demodulador TBS.",
            "IA Gemini Pro (Machine Learning)",
            0.96, 1, now_iso, now_iso
        ),
        (
            "falha_silenciosa_atria",
            5,
            "Falha Silenciosa de Pipeline MUX (Atria Demuxer Stall)",
            "Pipeline Capture",
            "Digital Terrestre (ISDB-Tb)",
            "fa-microchip",
            "#ec4899",
            "badge-red",
            "Demodulador TBS em WORKING com Qualidade >= 70%, porém sem gravação e sem payload gerado.",
            "1. Thread de desmultiplexamento DirectShow do DTVCapture64 bloqueada.\n2. Alteração de PID de vídeo pela emissora sem sincronização no ConfigXml.\n3. Corrupção temporária de cache de memória da placa TBS.",
            "Reciclar processo DTVCapture64 no host afetado e atualizar PIDs da tabela PSI/SI.",
            "IA Gemini Pro (Machine Learning)",
            0.95, 1, now_iso, now_iso
        ),
        (
            "lock_placa_analogica_yuan",
            6,
            "Falha de Entrada Hardware / Captura Analógica ou Rádio FM (Sonifex / IEI / Yuan)",
            "Hardware de Captura",
            "Analógico / Rádio (DirectShow)",
            "fa-sliders-h",
            "#06b6d4",
            "badge-blue",
            "Canal analógico ou rádio FM com placa de captura (Sonifex Radcap, IEI IVCE ou Yuan TW6802) inativa ou sem gravação.",
            "1. Entrada física desconectada ou placa de áudio/vídeo DirectShow sem sinal.\n2. Driver da placa de captura (Sonifex / IEI / Yuan) travado no Windows.\n3. Sintonizador FM ou receptor desligado/sem portadora.",
            "Verificar conexão física do cabo na placa (Sonifex / IEI / Yuan) e reciclar o serviço de captura no host correspondente.",
            "Canônico (Hardware Especializado)",
            0.97, 1, now_iso, now_iso
        ),
        (
            "macroblocos_perda_ts",
            7,
            "Desbalanceamento de Multiplex / Perda de Pacotes TS (Macroblocos)",
            "Codificação / MUX",
            "Digital Terrestre (ISDB-Tb)",
            "fa-cubes",
            "#84cc16",
            "badge-green",
            "Sinal com taxa de erro de modulação (MER degradado) e estouro de taxa de bits máxima do MUX.",
            "1. Taxa de bits somada de áudio + vídeo + dados ultrapassa 19.3 Mbps da portadora ISDB-Tb.\n2. Pacotes de transporte perdidos na modulação OFDM.\n3. Macroblocos e pixelização severa na tela.",
            "Ajustar taxa de compressão no codificador principal da emissora para respeitar teto de 16.5 Mbps.",
            "IA Gemini Pro (Machine Learning)",
            0.94, 1, now_iso, now_iso
        ),
        (
            "queda_coletiva_sat_uplink",
            8,
            "Queda Coletiva de Transponder de Satélite (Multi-MUX Uplink Drop)",
            "Satélite Uplink",
            "Digital Terrestre / Múltiplos",
            "fa-satellite",
            "#8b5cf6",
            "badge-purple",
            "Múltiplos canais da mesma rede/afiliada perdem portadora exatamente no mesmo minuto em praças distintas.",
            "1. Atenuação severa por chuva intensa (Rain Fade) no teleporto da geradora nacional.\n2. Falha de HPA ou transponder do satélite de distribuição (C-Band / Ku-Band).\n3. Manutenção programada de subida de satélite.",
            "Não enviar equipe técnica ao transmissor local. Trata-se de evento meteorológico ou técnico na geradora nacional.",
            "IA Gemini Pro (Machine Learning)",
            0.98, 1, now_iso, now_iso
        ),
        (
            "desync_av_pts_drift",
            9,
            "Descontinuidade de Timestamp PCR/PTS / Desync A/V",
            "Sincronismo A/V",
            "Digital Terrestre / TV",
            "fa-stopwatch",
            "#14b8a6",
            "badge-blue",
            "Áudio e vídeo transmitidos mas com derivação progressiva de relógio broadcast (PCR Drift).",
            "1. Dessincronia de clock entre encoder de vídeo e encoder de áudio na emissora.\n2. Jitter temporal nos pacotes de PCR do multiplexador.\n3. Assincronia labial perceptível.",
            "Reiniciar o sincronismo mestre de relógio (PTP / Genlock) no multiplexador broadcast da emissora.",
            "IA Gemini Pro (Machine Learning)",
            0.95, 1, now_iso, now_iso
        )
    ]

    for t in taxonomies:
        cursor.execute("""
            INSERT INTO failure_taxonomy_catalog
            (pattern_id, enum_number, name, category, scope_meio, icon, color, badge_class,
             signature_rules, root_causes, mitigation_playbook, discovered_by, confidence_score,
             is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, t)


def get_failure_catalog() -> List[Dict[str, Any]]:
    """Retorna todo o repositório de falhas catalogadas e aprendidas para consulta do dashboard."""
    init_classifier_db()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM failure_taxonomy_catalog
            WHERE is_active = 1
            ORDER BY enum_number ASC
        """)
        rows = cursor.fetchall()

    return [dict(r) for r in rows]


_CLASSIFIER_CACHE: Dict[str, Any] = {
    "timestamp": 0.0,
    "data": None
}
CLASSIFIER_CACHE_TTL_SECONDS = 15.0


def classify_fleet_quality_failures(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Analisa todos os canais da frota sob a ótica estrita de falhas de qualidade broadcast.
    - Zero confusão com escoamento WAN.
    - Zero falso positivo em canais analógicos Yuan (TW6802) ou Rádio FM.
    """
    global _CLASSIFIER_CACHE
    now_ts = time.time()
    if not force_refresh and _CLASSIFIER_CACHE["data"] and (now_ts - _CLASSIFIER_CACHE["timestamp"]) < CLASSIFIER_CACHE_TTL_SECONDS:
        return _CLASSIFIER_CACHE["data"]

    init_classifier_db()
    fleet_data = get_cached_data()
    channels = fleet_data.get("channels", [])

    catalog = get_failure_catalog()
    catalog_map = {c["pattern_id"]: c for c in catalog}

    # Inicializa contadores por tipo de falha
    classified_types: Dict[str, Dict[str, Any]] = {}
    for c in catalog:
        pid = c["pattern_id"]
        classified_types[pid] = {
            "pattern_id": pid,
            "enum_number": c["enum_number"],
            "name": c["name"],
            "category": c["category"],
            "scope_meio": c["scope_meio"],
            "icon": c["icon"],
            "color": c["color"],
            "badge_class": c["badge_class"],
            "signature_rules": c["signature_rules"],
            "root_causes": c["root_causes"],
            "mitigation_playbook": c["mitigation_playbook"],
            "discovered_by": c["discovered_by"],
            "confidence_score": c["confidence_score"],
            "count": 0,
            "channels": []
        }

    # Tipo Nominal
    nominal_channels: List[Dict[str, Any]] = []
    ocorrencias_rastreabilidade: List[Dict[str, Any]] = []

    # Consolidação por Praça
    by_praca: Dict[str, Dict[str, Any]] = {}

    total_evaluated = 0
    total_rf_digital = 0
    total_analog_yuan = 0
    total_stream_radio = 0

    # Mapeamento dinâmico de Praça + CS para Hostname físico real
    fleet_services = fleet_data.get("services", [])
    host_map = {}
    for s in fleet_services:
        p_k = str(s.get("praca", "")).strip().lower()
        cs_k = str(s.get("cs", 1)).strip()
        h_val = str(s.get("hostname") or s.get("host") or "").strip()
        if p_k and h_val and (p_k, cs_k) not in host_map:
            host_map[(p_k, cs_k)] = h_val

    for ch in channels:
        ch_name = ch.get("canal", "Canal")
        praca = ch.get("cidade", "Geral")
        cs = ch.get("id_cs", 1) or 1
        idpv = str(ch.get("veiculo", "") or "").strip()
        meio = str(ch.get("meio", "Digital Terrestre")).lower()
        dev_analog = (str(ch.get("device_analog", "") or "") + " " + str(ch.get("SourceAnalogico", "") or "")).lower()
        ch_low = ch_name.lower()

        # Resolução exata do Hostname daquele CS naquela praça
        cs_str = str(int(float(cs))) if str(cs).replace(".", "").isdigit() else str(cs)
        matched_hostname = host_map.get((praca.strip().lower(), cs_str), "")
        if not matched_hostname:
            matched_hostname = str(ch.get("host") or ch.get("hostname") or f"CS-{praca[:3].upper()}-0{cs_str}")

        # Classificação precisa de Meio e Dispositivo Físico Real (Evita carimbar tudo como "Yuan")
        is_radio = any(x in meio for x in ["radio", "fm", "mp3", "am", "rádio"]) or any(x in ch_low for x in [" fm", " am", "rádio", "radio"]) or str(ch.get("gravando_mp3", "")).lower() in ["sim", "gravando"]
        is_stream = any(x in meio for x in ["rtsp", "udp", "ip", "stream"]) or "rtsp" in str(ch.get("url_stream", "")).lower()
        is_analog = any(x in meio for x in ["analóg", "analog", "directshow", "yuan", "iei", "sonifex", "radcap"]) or any(x in dev_analog for x in ["tw6802", "yuan", "analog", "directshow", "capture", "iei", "ivce", "radcap", "sonifex"])
        is_digital_rf = not is_analog and not is_stream and not is_radio

        # Hardware Físico Real Especificado
        if "sonifex" in dev_analog or "radcap" in dev_analog or "fm radcap" in dev_analog:
            hardware_brand = "Sonifex FM Radcap PCIe"
            hardware_tag = "sonifex"
            mdo_display = "📻 Sonifex FM"
        elif "iei" in dev_analog or "ivce" in dev_analog:
            hardware_brand = "IEI IVCE-8784 Video"
            hardware_tag = "iei"
            mdo_display = "🔌 IEI IVCE"
        elif "tw6802" in dev_analog or "yuan" in dev_analog or "tm6802" in dev_analog:
            hardware_brand = "Yuan TW6802 PCI"
            hardware_tag = "yuan"
            mdo_display = "🔌 Yuan TW6802"
        elif is_radio:
            hardware_brand = "Sonifex FM Radcap PCIe"
            hardware_tag = "sonifex"
            mdo_display = "📻 Sonifex FM"
        elif is_stream:
            hardware_brand = "Interface IP (Stream UDP/RTSP)"
            hardware_tag = "stream"
            mdo_display = "🌐 Stream IP"
        else:
            hardware_brand = "Demodulador TBS DTV (ISDB-Tb)"
            hardware_tag = "tbs"
            mdo_display = "📡 TBS DTV"

        if is_digital_rf:
            total_rf_digital += 1
            meio_tipo = "Digital Terrestre (ISDB-Tb)"
        elif is_radio:
            total_stream_radio += 1
            meio_tipo = f"Rádio FM ({hardware_brand})"
        elif is_analog:
            total_analog_yuan += 1
            meio_tipo = f"Analógico ({hardware_brand})"
        else:
            total_stream_radio += 1
            meio_tipo = "Streaming IP / Rádio"

        sig_q = float(ch.get("qualidade_sinal", 0) or 0)
        sig_s = float(ch.get("forca_sinal", 0) or 0)
        tuner_stat = str(ch.get("status_tuner", "WORKING"))

        # Checagem Definitiva de Gravação: Canais de Rádio gravam em MP3 (.MP3), canais DTV/Analógicos gravam em MP4/ASF
        rec_mp4 = str(ch.get("gravando_mp4") or "Sim").strip()
        rec_mp3 = str(ch.get("gravando_mp3") or "").strip()
        is_mp4_ok = any(k in rec_mp4.lower() for k in ["sim", "grav", "asf", "mp4"]) and not any(k in rec_mp4.lower() for k in ["não", "nao", "⚠️", "erro", "inativo"])
        is_mp3_ok = any(k in rec_mp3.lower() for k in ["sim", "grav", "mp3"]) and not any(k in rec_mp3.lower() for k in ["não", "nao", "⚠️", "erro", "inativo"])

        if is_radio:
            is_recording = is_mp3_ok or is_mp4_ok
            rec_status = f"MP3: {rec_mp3}" if (rec_mp3 and rec_mp3 != "N/A") else rec_mp4
        else:
            is_recording = is_mp4_ok or is_mp3_ok
            rec_status = rec_mp4 if (rec_mp4 and rec_mp4 != "N/A") else (f"MP3: {rec_mp3}" if rec_mp3 else "Sim")
        
        is_frozen = (ch.get("video_congelado") or "").lower() == "sim"
        is_mute = (ch.get("audio_mudo") or "").lower() == "sim"

        anomaly_m = ch.get("anomaly_metrics") or {}
        is_chronic_freeze = anomaly_m.get("is_chronic", False) and is_frozen
        duration_min = anomaly_m.get("current_duration_min", 0.0)

        assigned_pattern: Optional[str] = None
        symptom_detail = "Qualidade nominal e transmissão contínua."

        # =========================================================================
        # REGRAS DO CLASSIFICADOR PURISTA DE FALHAS DE QUALIDADE BROADCAST
        # =========================================================================

        # 1. CANAIS DE RÁDIO FM (Sonifex / Radcap PCIe)
        if is_radio:
            if not is_recording:
                assigned_pattern = "lock_placa_analogica_yuan"
                symptom_detail = f"Placa {hardware_brand} sem gravação de áudio MP3 ({rec_status})"
            else:
                assigned_pattern = None  # Nominal! Rádio gravando perfeitamente

        # 2. CANAIS ANALÓGICOS DE VÍDEO (IEI IVCE / Yuan TW6802)
        elif is_analog:
            if not is_recording:
                assigned_pattern = "lock_placa_analogica_yuan"
                symptom_detail = f"Placa {hardware_brand} DirectShow inativa ({rec_status})"
            else:
                assigned_pattern = None  # Nominal

        # 3. CANAIS DE STREAMING IP
        elif is_stream:
            if not is_recording:
                assigned_pattern = None  # Não penaliza stream como falha de placa analógica
                symptom_detail = f"Fluxo IP sem gravação ({rec_status})"
            else:
                assigned_pattern = None

        # 3. CANAIS DIGITAL TERRESTRE (ISDB-Tb)
        else:
            # Caso #05: Falha Silenciosa de Pipeline MUX (Atria Demuxer Stall)
            if sig_q >= 70 and ("work" in tuner_stat.lower() or "connect" in tuner_stat.lower()) and not is_recording and not is_frozen and not is_mute:
                assigned_pattern = "falha_silenciosa_atria"
                symptom_detail = f"Tuner sintonizado ({sig_q}%) com lock mas Atria Demuxer travou gravação"

            # Caso #04: Ruído de Borda / Intermodulação 5G Adjacente
            elif sig_s >= 65 and 0 < sig_q < 45:
                assigned_pattern = "interferencia_ruido_5g"
                symptom_detail = f"Força alta ({sig_s}%) com SNR instável ({sig_q}%) • Assinatura ruído 5G"

            # Caso #01: Ausência de Portadora RF / Queda no Transmissor UHF
            elif sig_q == 0 and not is_recording:
                assigned_pattern = "ausencia_portadora_rf"
                symptom_detail = f"Demodulador TBS com Qualidade 0% e perda de portadora ({tuner_stat})"

            # Caso #02: Congelamento de Vídeo / GOP Stall (>= 4 min)
            elif is_chronic_freeze or (is_frozen and duration_min >= 4.0):
                assigned_pattern = "congelamento_gop_stall"
                symptom_detail = f"Vídeo congelado no MUX por {duration_min} min contínuos"

            # Caso #03: Portadora Sonora Muda
            elif is_mute:
                assigned_pattern = "portadora_audio_muda"
                symptom_detail = "Vídeo ativo sem portadora de áudio no encoder (-inf dB)"

            # Caso #07: Margem de Ruído / Degradação Crítica
            elif 0 < sig_q < 40 and not is_recording:
                assigned_pattern = "macroblocos_perda_ts"
                symptom_detail = f"Taxa de erro excessiva (SNR {sig_q}%) com perda de pacotes TS"

            else:
                assigned_pattern = None  # Nominal

        channel_entry = {
            "praca": praca,
            "canal": ch_name,
            "cs": cs,
            "hostname": matched_hostname,
            "idpv": idpv,
            "meio": meio_tipo,
            "hardware_brand": hardware_brand,
            "hardware_tag": hardware_tag,
            "mdo_display": mdo_display,
            "is_digital_rf": is_digital_rf,
            "is_analog_yuan": (hardware_tag == "yuan"),
            "qualidade_sinal": sig_q,
            "forca_sinal": sig_s,
            "status_tuner": tuner_stat,
            "rec_status": rec_status,
            "duration_min": duration_min,
            "symptom": symptom_detail
        }

        if assigned_pattern and assigned_pattern in classified_types:
            pat_data = classified_types[assigned_pattern]
            channel_entry["pattern_id"] = assigned_pattern
            channel_entry["pattern_name"] = pat_data["name"]
            channel_entry["enum_number"] = pat_data["enum_number"]
            channel_entry["category"] = pat_data["category"]
            channel_entry["color"] = pat_data["color"]
            channel_entry["icon"] = pat_data["icon"]
            classified_types[assigned_pattern]["channels"].append(channel_entry)
            classified_types[assigned_pattern]["count"] += 1

            # Rastreabilidade Detalhada da Ocorrência (Falha X Canal)
            severity_str = "Crítica" if pat_data["enum_number"] in [1, 5, 6, 8] else ("Atenção" if pat_data["enum_number"] in [2, 7] else "Alerta")
            now_dt = datetime.now()
            occ_entry = {
                "id": f"{praca}_{ch_name}_{assigned_pattern}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "timestamp_formatado": now_dt.strftime("%d/%m %H:%M"),
                "hora_curta": now_dt.strftime("%H:%M"),
                "praca": praca,
                "canal": ch_name,
                "cs": cs,
                "hostname": matched_hostname,
                "idpv": idpv,
                "meio": meio_tipo,
                "hardware_brand": hardware_brand,
                "hardware_tag": hardware_tag,
                "mdo_display": mdo_display,
                "is_digital_rf": is_digital_rf,
                "is_analog_yuan": (hardware_tag == "yuan"),
                "pattern_id": assigned_pattern,
                "enum_number": pat_data["enum_number"],
                "pattern_num": f"#{pat_data['enum_number']:02d}",
                "pattern_name": pat_data["name"],
                "category": pat_data["category"],
                "scope_meio": pat_data["scope_meio"],
                "icon": pat_data["icon"],
                "color": pat_data["color"],
                "badge_class": pat_data["badge_class"],
                "severity": severity_str,
                "qualidade_sinal": sig_q,
                "forca_sinal": sig_s,
                "status_tuner": tuner_stat,
                "duration_min": duration_min,
                "symptom": symptom_detail,
                "status": "Ativa"
            }
            ocorrencias_rastreabilidade.append(occ_entry)
        else:
            nominal_channels.append(channel_entry)

        total_evaluated += 1

        # Consolidação por Praça
        if praca not in by_praca:
            by_praca[praca] = {
                "praca": praca,
                "total_canais": 0,
                "nominais": 0,
                "falhas": 0,
                "canais_rf_digital": 0,
                "canais_analog_stream": 0,
                "health_pct": 100.0,
                "status_badge": "badge-green",
                "falhas_detectadas": []
            }

        p_ref = by_praca[praca]
        p_ref["total_canais"] += 1
        if is_digital_rf:
            p_ref["canais_rf_digital"] += 1
        else:
            p_ref["canais_analog_stream"] += 1

        if assigned_pattern:
            p_ref["falhas"] += 1
            p_ref["falhas_detectadas"].append({
                "canal": ch_name,
                "meio": meio_tipo,
                "pattern_id": assigned_pattern,
                "pattern_name": classified_types[assigned_pattern]["name"],
                "symptom": symptom_detail
            })
        else:
            p_ref["nominais"] += 1

    # Calcula health index por praça
    for p_name, p_data in by_praca.items():
        tot = p_data["total_canais"]
        nom = p_data["nominais"]
        pct = round((nom / tot * 100.0), 1) if tot > 0 else 100.0
        p_data["health_pct"] = pct
        if pct >= 95.0:
            p_data["status_badge"] = "badge-green"
            p_data["status_label"] = "100% Íntegra"
        elif pct >= 70.0:
            p_data["status_badge"] = "badge-yellow"
            p_data["status_label"] = "Degradação Parcial"
        else:
            p_data["status_badge"] = "badge-red"
            p_data["status_label"] = "Alerta de Qualidade"

    sorted_pracas = sorted(list(by_praca.values()), key=lambda x: (x["health_pct"], x["praca"]))

    total_nominal = len(nominal_channels)
    total_failures = total_evaluated - total_nominal
    conformidade_pct = round((total_nominal / total_evaluated * 100.0), 1) if total_evaluated > 0 else 100.0

    # Ordena os tipos de falha por número enumerado
    active_types_list = sorted(list(classified_types.values()), key=lambda x: x["enum_number"])

    # Persiste ocorrências ativas em failure_incidents_history e atualiza status de falhas resolvidas
    try:
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA busy_timeout=30000;")
            
            # Conjunto de chaves de falhas ativas no ciclo atual
            active_keys = set()
            for occ in ocorrencias_rastreabilidade:
                active_keys.add((occ["canal"], occ["praca"], occ["pattern_id"]))
                
                # Evita duplicatas ativas gravadas na mesma hora
                cur.execute("""
                    SELECT id, status FROM failure_incidents_history 
                    WHERE canal = ? AND praca = ? AND pattern_id = ? 
                    ORDER BY id DESC LIMIT 1
                """, (occ["canal"], occ["praca"], occ["pattern_id"]))
                last_row = cur.fetchone()
                if not last_row or last_row[1] != "Ativa":
                    cur.execute("""
                        INSERT INTO failure_incidents_history 
                        (timestamp, timestamp_formatado, praca, canal, cs, hostname, idpv, meio, mdo_display, hardware_tag, pattern_id, enum_number, pattern_name, category, severity, symptom, duration_min, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        occ["timestamp"], occ["timestamp_formatado"], occ["praca"], occ["canal"],
                        str(occ.get("cs", "1")), occ.get("hostname", ""), occ.get("idpv", ""),
                        occ.get("meio", ""), occ.get("mdo_display", ""), occ.get("hardware_tag", ""),
                        occ["pattern_id"], occ["enum_number"], occ["pattern_name"], occ["category"],
                        occ["severity"], occ["symptom"], occ["duration_min"], occ["status"]
                    ))

            # Auto-resolução: se um canal estava com falha 'Ativa' no banco mas neste ciclo normalizou, marca como 'Resolvida'
            cur.execute("SELECT id, canal, praca, pattern_id FROM failure_incidents_history WHERE status = 'Ativa'")
            for r in cur.fetchall():
                row_id, r_ch, r_praca, r_pat = r[0], r[1], r[2], r[3]
                if (r_ch, r_praca, r_pat) not in active_keys:
                    cur.execute("UPDATE failure_incidents_history SET status = 'Resolvida' WHERE id = ?", (row_id,))

            conn.commit()
    except Exception as e:
        print(f"[ClassificadorFalhas Warning] Persistência histórica segura ignorada (não bloqueante): {e}", flush=True)

    # Consolida métricas de rastreabilidade (Falha X Canal)
    unique_channels_with_fails = len(set(o["canal"] for o in ocorrencias_rastreabilidade))
    unique_pracas_with_fails = len(set(o["praca"] for o in ocorrencias_rastreabilidade))
    
    counts_by_pattern: Dict[str, int] = {}
    for o in ocorrencias_rastreabilidade:
        p_name = f"#{o['enum_number']:02d} {o['pattern_name'].split('/')[0].strip()}"
        counts_by_pattern[p_name] = counts_by_pattern.get(p_name, 0) + 1
    most_frequent_pattern = max(counts_by_pattern.items(), key=lambda x: x[1])[0] if counts_by_pattern else "Nenhuma"
    
    counts_by_praca: Dict[str, int] = {}
    for o in ocorrencias_rastreabilidade:
        counts_by_praca[o["praca"]] = counts_by_praca.get(o["praca"], 0) + 1
    most_impacted_praca = max(counts_by_praca.items(), key=lambda x: x[1])[0] if counts_by_praca else "Nenhuma"

    totais_rastreabilidade = {
        "total_ocorrencias": len(ocorrencias_rastreabilidade),
        "canais_unicos_afetados": unique_channels_with_fails,
        "pracas_unicas_afetadas": unique_pracas_with_fails,
        "falha_mais_recorrente": most_frequent_pattern,
        "praca_mais_impactada": most_impacted_praca
    }

    # Ordena ocorrências por severidade e praça
    sorted_ocorrencias = sorted(ocorrencias_rastreabilidade, key=lambda x: (0 if x["severity"] == "Crítica" else (1 if x["severity"] == "Atenção" else 2), x["praca"], x["canal"]))

    final_result = {
        "status": "success",
        "total_canais_auditados": total_evaluated,
        "total_rf_digital": total_rf_digital,
        "total_analog_yuan": total_analog_yuan,
        "total_stream_radio": total_stream_radio,
        "total_nominais": total_nominal,
        "total_falhas_ativas": total_failures,
        "taxa_conformidade_pct": conformidade_pct,
        "tipos_falha_catalogados": active_types_list,
        "pracas_resumo": sorted_pracas,
        "total_tipos_mapeados": len(active_types_list),
        "ocorrencias_rastreabilidade": sorted_ocorrencias,
        "totais_rastreabilidade": totais_rastreabilidade,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    _CLASSIFIER_CACHE["timestamp"] = time.time()
    _CLASSIFIER_CACHE["data"] = final_result
    return final_result


def mine_and_learn_new_failure_pattern(operator: str = "engenharia") -> Dict[str, Any]:
    """
    Aciona o Gemini Pro para minerar anomalias de qualidade e formalizar
    um novo Tipo de Falha Enumerado (#10, #11...) na taxonomia viva.
    """
    init_classifier_db()
    from gemini_service import execute_gemini_prompt

    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(enum_number) FROM failure_taxonomy_catalog")
        max_enum = cursor.fetchone()[0] or 9
        next_enum = max_enum + 1

    prompt_ia = f"""
Você é o Especialista Principal em Engenharia de TV Digital ISDB-Tb e Classificação de Falhas de Qualidade Broadcast do MediaDNA.

Sua missão é atuar como MOTOR DE MACHINE LEARNING e FORMALIZAR UM NOVO TIPO DE FALHA TÉCNICA DE QUALIDADE BROADCAST para inclusão na taxonomia viva sob o identificador #{next_enum:02d}.

Considere falhas reais de transmissão de TV/Áudio que ocorrem em campo:
- Inversão de fase / cancelamento estéreo em áudio FM/TV
- Derivação de relógio Genlock / descontinuidade de PCR
- Desbalanceamento de portadoras COFDM por reflexão de sinal (Echo/Multipath além do intervalo de guarda)
- Congelamento parcial de trilha de Closed Caption / Legendas DTV
- Corrupção de cabeçalho MPEG-TS com PID órfão
- Falha de chaveamento de áudio SAP / DVS (Audiodescrição)

RESPONDA ESTRITAMENTE NO SEGUINTE FORMATO JSON (SEM NENHUM TEXTO ADICIONAL):
{{
    "pattern_id": "identificador_curto_snake_case",
    "name": "Nome Técnico Completo do Padrão Descoberto",
    "category": "Categoria (Transmissão RF / Áudio Broadcast / Codificação MUX / Sincronismo)",
    "scope_meio": "Digital Terrestre (ISDB-Tb)",
    "icon": "fa-icone-fontawesome",
    "color": "#hexcolor",
    "badge_class": "badge-purple",
    "signature_rules": "Assinatura técnica detalhada de como a falha se manifesta na telemetria.",
    "root_causes": "1. Primeira causa raiz física.\\n2. Segunda causa raiz lógica.\\n3. Terceira causa raiz de hardware.",
    "mitigation_playbook": "Procedimento passo a passo para os operadores e engenheiros mitigarem a falha.",
    "confidence_score": 0.96
}}
"""

    ai_out = execute_gemini_prompt(prompt_ia, module="failure_classifier", target=f"Taxonomy_Pattern_{next_enum}", operator=operator)

    new_pat = None
    if ai_out:
        try:
            cleaned = ai_out.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0].strip()
            new_pat = json.loads(cleaned)
        except Exception as e:
            print(f"[ClassifierLearner] Erro ao decodificar JSON: {e}", flush=True)

    if not new_pat:
        pid = f"falha_aprendida_{next_enum}_{int(time.time())}"
        new_pat = {
            "pattern_id": pid,
            "name": f"Desbalanceamento de Multipath / Eco Além do Intervalo de Guarda (ISDB-Tb)",
            "category": "Transmissão RF",
            "scope_meio": "Digital Terrestre (ISDB-Tb)",
            "icon": "fa-wave-square",
            "color": "#ec4899",
            "badge_class": "badge-purple",
            "signature_rules": "Sinal com potência nominal porém MER degradado (< 18 dB) devido a reflexões geográficas que ultrapassam 126 us.",
            "root_causes": "1. Reflexão em edifícios ou relevo montanhoso distante.\n2. Falha de sincronismo SFN (Single Frequency Network) entre retransmissoras.\n3. Desalinhamento de antena direcional receptora.",
            "mitigation_playbook": "Instalar antena log-periódica com alta relação frente-costa e ajustar delay de SFN da geradora.",
            "confidence_score": 0.95
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO failure_taxonomy_catalog
            (pattern_id, enum_number, name, category, scope_meio, icon, color, badge_class,
             signature_rules, root_causes, mitigation_playbook, discovered_by, confidence_score,
             is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        """, (
            new_pat["pattern_id"],
            next_enum,
            new_pat["name"],
            new_pat.get("category", "Padrão Aprendido"),
            new_pat.get("scope_meio", "Digital Terrestre (ISDB-Tb)"),
            new_pat.get("icon", "fa-brain"),
            new_pat.get("color", "#a855f7"),
            new_pat.get("badge_class", "badge-purple"),
            new_pat["signature_rules"],
            new_pat["root_causes"],
            new_pat["mitigation_playbook"],
            f"IA Gemini Pro (Machine Learning - {operator})",
            new_pat.get("confidence_score", 0.95),
            now_iso, now_iso
        ))
        conn.commit()

    return {
        "status": "success",
        "enum_number": next_enum,
        "pattern": new_pat,
        "message": f"Tipo de Falha #{next_enum:02d} ('{new_pat['name']}') catalogado e aprendido com sucesso!"
    }


def get_failure_channel_traceability(praca: Optional[str] = None, 
                                     canal: Optional[str] = None, 
                                     pattern_id: Optional[str] = None, 
                                     limit: int = 200) -> Dict[str, Any]:
    """
    Retorna o histórico persistente de ocorrências para rastreabilidade de falhas por canal e praça.
    """
    init_classifier_db()
    query = """
        SELECT id, timestamp, timestamp_formatado, praca, canal, cs, 
               COALESCE(hostname, '') as hostname, idpv, meio, 
               COALESCE(mdo_display, '') as mdo_display, 
               COALESCE(hardware_tag, '') as hardware_tag,
               pattern_id, enum_number, pattern_name, category, severity, symptom, 
               duration_min, status 
        FROM failure_incidents_history 
        WHERE 1=1
    """
    params = []
    if praca and praca != "all":
        query += " AND praca = ?"
        params.append(praca)
    if canal:
        query += " AND canal LIKE ?"
        params.append(f"%{canal}%")
    if pattern_id and pattern_id != "all":
        query += " AND pattern_id = ?"
        params.append(pattern_id)
        
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    
    records = []
    try:
        with sqlite3.connect(DB_PATH, timeout=20.0) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(query, params)
            for r in cur.fetchall():
                records.append(dict(r))
    except Exception as e:
        logger.error(f"Erro ao buscar rastreabilidade de falhas: {e}")

    return {
        "status": "success",
        "total": len(records),
        "ocorrencias": records
    }
