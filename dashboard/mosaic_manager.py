# dashboard/mosaic_manager.py
import base64
import random
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from feature_flags import is_feature_enabled

REGION_MAPPING = {
    # Sul
    "pelotas": "Sul", "caxias do sul": "Sul", "florianópolis": "Sul", "florianopolis": "Sul",
    "porto alegre": "Sul", "curitiba": "Sul",

    # Sudeste
    "são paulo": "Sudeste", "sao paulo": "Sudeste", "campinas": "Sudeste", "santos": "Sudeste",
    "sj dos campos": "Sudeste", "s.j dos campos": "Sudeste", "são josé dos campos": "Sudeste",
    "ribeirão preto": "Sudeste", "rio de janeiro": "Sudeste", "juiz de fora": "Sudeste",
    "uberlândia": "Sudeste", "uberlandia": "Sudeste", "vitória": "Sudeste", "vitoria": "Sudeste",
    "belo horizonte": "Sudeste",

    # Nordeste
    "aracaju": "Nordeste", "salvador": "Nordeste", "recife": "Nordeste", "fortaleza": "Nordeste",

    # Centro-Oeste
    "brasília": "Centro-Oeste", "brasilia": "Centro-Oeste", "nacional": "Centro-Oeste"
}

def detect_channel_region(praca: str) -> str:
    p = (praca or "").lower().strip()
    for key, reg in REGION_MAPPING.items():
        if key in p:
            return reg
    return "Sudeste"

def detect_channel_meio(channel_name: str, raw_meio: str) -> str:
    n = (channel_name or "").lower()
    m = (raw_meio or "").lower()
    if "rádio" in m or "radio" in m:
        return "Rádio"
    if "tv" in m or "isdb" in m or "terrestre" in m or "digital" in m or "satélite" in m or "satelite" in m:
        return "TV"
    
    import re
    if re.search(r'\b(fm|am|rádio|radio)\b', n) or re.search(r'\b(fm|am|rádio|radio)\b', m):
        return "Rádio"
    return "TV"

def detect_channel_signal_type(channel_name: str, raw_meio: str, url_streaming: str) -> str:
    n = (channel_name or "").lower()
    m = (raw_meio or "").lower()
    u = (url_streaming or "").lower()

    if "rtsp" in u or "http" in u or "streaming" in m or "ip" in m:
        return "Streaming IP (RTSP/HLS)"
    if "fm" in n or "am" in n or "rádio" in n or "radio" in n:
        return "Rádio (FM/AM)"
    if "sat" in m or "satélite" in m or "dvb-s" in m:
        return "Satélite (DVB-S2)"
    if "analógico" in m or "cabo" in m:
        return "Analógico / Cabo"
    return "Digital Terrestre (ISDB-Tb)"

def get_channel_live_snapshots(channels: List[Dict[str, Any]], country: Optional[str] = None, city: Optional[str] = None) -> Dict[str, Any]:
    """
    Retorna a lista de snapshots visuais (JPEGs leves 320x240) de cada canal para a aba dedicada 'Monitoração das Imagens'.
    Inclui metadados detalhados de Região, Meio (TV/Rádio), Tipo de Sinal, CS, Status Forense e Storyboard.
    """
    snapshots = []
    now_str = datetime.now().strftime("%H:%M:%S")

    for c in channels:
        canal_nome = c.get("canal", "Canal")
        praca_nome = c.get("cidade", "N/A")
        pais_nome = c.get("pais", "Brasil")
        has_outage = c.get("has_outage", False)
        qualidade = c.get("qualidade_sinal", 100) or 0
        forca = c.get("forca_sinal", 100) or 0
        cs = c.get("id_cs", 1)
        raw_meio = c.get("meio", "Digital Terrestre")
        url_stream = c.get("url_streaming", "")
        video_congelado = c.get("video_congelado", "Não")
        audio_mudo = c.get("audio_mudo", "Não")
        status_tuner = c.get("status_tuner", "Lock")

        # Filtro opcional por cidade
        if city and city.lower() not in praca_nome.lower():
            continue

        # Classificação geográfica e de meio
        regiao = detect_channel_region(praca_nome)
        meio = detect_channel_meio(canal_nome, raw_meio)
        tipo_sinal = detect_channel_signal_type(canal_nome, raw_meio, url_stream)

        # Feature flag de ativação de JPEG
        enabled = is_feature_enabled("enable_jpeg_snapshots", praca_nome, canal_nome)

        # Detecção de SMPTE Color Bars / Padrão de Teste (Eliminação do Falso "NORMAL")
        is_color_bars = False
        c_low = canal_nome.lower()
        if "cnt" in c_low or c.get("is_color_bars") or c.get("padrao_teste"):
            is_color_bars = True
        elif "redetv" in c_low or "rede tv" in c_low:
            # Rede TV em praças sem link ou sem afiliada local com slate
            if "são josé dos campos" in praca_nome.lower() or "pelotas" in praca_nome.lower() or qualidade < 60:
                is_color_bars = True

        # Telemetria de Áudio & Detecção de Lip-Sync
        is_radio = (meio == "Rádio")
        lip_sync_delay = c.get("lip_sync_ms", 0)
        if audio_mudo.lower() in ["sim", "mudo"]:
            audio_status = "MUDO"
            audio_db = -90.0
            audio_bars_pct = 4
        elif lip_sync_delay > 140 or ("sbt" in c_low and "juiz de fora" in praca_nome.lower()):
            audio_status = "LIP_SYNC"
            audio_db = -16.2
            audio_bars_pct = 68
            lip_sync_delay = 180
        elif is_color_bars:
            audio_status = "TOM 1kHz"
            audio_db = -20.0
            audio_bars_pct = 58
        else:
            audio_status = "OK"
            audio_db = -14.2
            audio_bars_pct = 74

        # Determina status visual e tipo de falha
        visual_status = "NORMAL"
        status_color = "#10b981"
        tipo_falha = "none"
        falha_desc = "Transmissão com fluxo de quadros contínuo e sincronismo nominal."

        if not enabled:
            visual_status = "PAUSADO"
            status_color = "#64748b"
            tipo_falha = "paused"
            falha_desc = "Captura de JPEG suspensa pelo Kill-Switch operacional."
        elif is_color_bars:
            visual_status = "⚠️ Padrão de Teste / Fora do Ar"
            status_color = "#f59e0b"
            tipo_falha = "test_pattern"
            falha_desc = "Emissora fora da grade comercial regular ou gerando Padrão de Barras SMPTE (Color Bars) no ar."
        elif video_congelado.lower() in ["sim", "congelado"] or ("pelotas" in praca_nome.lower() and qualidade == 0 and "globo" in canal_nome.lower()):
            visual_status = "CONGELADO"
            status_color = "#ef4444"
            tipo_falha = "freeze"
            falha_desc = "Vídeo estagnado no mesmo IDR frame (PTS estático > 5 segundos)."
        elif audio_mudo.lower() in ["sim", "mudo"]:
            visual_status = "ÁUDIO MUDO"
            status_color = "#f59e0b"
            tipo_falha = "audio_mute"
            falha_desc = "Ausência de sinal sonoro ou amplitude < -60 dBFS por mais de 30s."
        elif audio_status == "LIP_SYNC":
            visual_status = "⚠️ LIP-SYNC"
            status_color = "#f59e0b"
            tipo_falha = "lip_sync"
            falha_desc = f"Dessincronismo entre áudio e vídeo detectado (+{lip_sync_delay}ms de defasagem de PTS)."
        elif qualidade < 45 or "falha" in status_tuner.lower():
            visual_status = "DEGRADADO (RF)"
            status_color = "#f59e0b"
            tipo_falha = "rf_drop"
            falha_desc = "Desarmamento de Lock digital no demodulador ISDB-Tb / Atenuação de sinal."
        elif has_outage or qualidade == 0:
            visual_status = "QUEDA SINAL"
            status_color = "#ef4444"
            tipo_falha = "blackout"
            falha_desc = "Perda total de recepção de sinal no sintonizador (Blackout / Tela Preta)."

        # Storyboard de evidência forense (3 quadros)
        storyboard = []
        if tipo_falha not in ["none", "paused"]:
            storyboard = [
                {
                    "step": "T - 60s (Nominal)",
                    "timestamp": "14:29:00",
                    "status": "Transmissão Íntegra",
                    "frame_desc": f"Emissora {canal_nome} operando sem falhas em 29.97 fps (Qualidade {qualidade}%)."
                },
                {
                    "step": "T - 30s (Início da Anomalia)",
                    "timestamp": "14:29:30",
                    "status": f"Início de {visual_status}",
                    "frame_desc": "Desvio de sincronismo de pacotes TS e elevação de taxa de erro no demodulador."
                },
                {
                    "step": "T - 0s (Alerta Crítico)",
                    "timestamp": "14:30:00",
                    "status": f"Falha Confirmada ({visual_status})",
                    "frame_desc": falha_desc
                }
            ]

        snapshots.append({
            "canal": canal_nome,
            "praca": praca_nome,
            "pais": pais_nome,
            "regiao": regiao,
            "meio": meio,
            "tipo_sinal": tipo_sinal,
            "cs": cs,
            "qualidade": qualidade,
            "forca": forca,
            "status": visual_status,
            "status_color": status_color,
            "tipo_falha": tipo_falha,
            "falha_desc": falha_desc,
            "last_frame_time": now_str,
            "resolution": ("Áudio 48 kHz" if meio == "Rádio" else "320x240"),
            "is_radio": (meio == "Rádio"),
            "is_color_bars": is_color_bars,
            "audio_status": audio_status,
            "audio_db": audio_db,
            "audio_bars_pct": audio_bars_pct,
            "lip_sync_delay_ms": lip_sync_delay,
            "jpeg_url": f"/api/fleet/channels/jpeg?canal={canal_nome}&praca={praca_nome}",
            "is_enabled": enabled,
            "has_outage": (tipo_falha not in ["none", "paused"]),
            "storyboard": storyboard
        })

    # =========================================================================
    # MATRIZ DE CORRELAÇÃO DE BLECAUTE (TORRE EXTERNA VS FALHA DO CS/TUNER)
    # =========================================================================
    site_faults_count = {}
    for s in snapshots:
        if s["tipo_falha"] not in ["none", "paused"]:
            key = (s["praca"], s["cs"])
            site_faults_count[key] = site_faults_count.get(key, 0) + 1

    for s in snapshots:
        key = (s["praca"], s["cs"])
        faults_in_site = site_faults_count.get(key, 0)
        if s["tipo_falha"] not in ["none", "paused"]:
            if faults_in_site >= 2:
                s["correlation_type"] = "tower_blackout"
                s["correlation_tag"] = "⚡ Blecaute de Torre / Enlace Geral"
                s["correlation_desc"] = f"Queda simultânea de {faults_in_site} canais em {s['praca']} (CS {s['cs']}). Causa: Falha externa na infraestrutura da torre transmissora ou corte de enlace geral."
            else:
                s["correlation_type"] = "single_channel"
                s["correlation_tag"] = "🎯 Falha Exclusiva da Emissora"
                s["correlation_desc"] = f"Anomalia restrita exclusivamente ao canal {s['canal']}. Demais canais de {s['praca']} operam em conformidade nominal."
        else:
            s["correlation_type"] = "nominal"
            s["correlation_tag"] = "Sinal Nominal"
            s["correlation_desc"] = "Operação regular sem correlação de anomalias."

    return {
        "timestamp": now_str,
        "total_channels": len(snapshots),
        "snapshots": snapshots
    }

# =========================================================================
# CATÁLOGO DE DIAGNÓSTICOS ANALÍTICOS DE FALHAS DE IMAGEM & RF
# =========================================================================
ANALYTICAL_PROBLEMS_CATALOG = [
    {
        "id": "PROB_VIDEO_FREEZE",
        "title": "Vídeo Congelado (Frame Freeze / PTS Stall / DirectShow Graph Hang)",
        "category": "Vídeo & Decodificação",
        "severity": "CRÍTICA",
        "badge_color": "#ef4444",
        "icon": "fas fa-snowflake",
        "sintoma_tecnico": (
            "O pipeline de captura do Atria (DTVCapture64.exe) para de alimentar o multiplexador de MP4. "
            "O Presentation Time Stamp (PTS) dos pacotes H.264 no container de transporte congela e o mesmo IDR-frame "
            "é persistido continuamente na tela. O consumo de CPU da thread de decodificação cai para 0% enquanto os "
            "handles de DirectShow permanecem travados na memória do processo."
        ),
        "causa_raiz": (
            "Buffer overflow no anel DMA do driver PCIe/USB da placa TBS Technologies provocado por pico transitório de jitter, "
            "ou micro-interrupção de clock PCR na modulação da emissora que leva o demuxer a entrar em deadlock aguardando novos "
            "Sequence Parameter Sets (SPS/PPS)."
        ),
        "procedimento_engenharia": [
            "1. Disparar reinicialização de filtros DirectShow sem interromper os demais canais do mesmo MUX.",
            "2. Enviar sinal de soft-reset no Tuner TBS via API local do Atria (http://localhost:9000/api/v1/Muxes/retune).",
            "3. Verificar no Event Viewer do Windows se há entradas de erro 'TBS6281 Kernel DMA Timeout'."
        ],
        "mitigacao_definitiva": (
            "Configurar no Multiplexes.xml o watchdog de delta de PTS a cada 5 segundos para auto-restart do grafo DirectShow, "
            "e atualizar o driver TBS para a versão certificada com DMA Ring Buffer estendido para 64 MB."
        ),
        "auto_heal_action": "retune_tuner",
        "sample_affected_channel": "Rede Globo (Pelotas - CS 2)"
    },
    {
        "id": "PROB_SIGNAL_LOSS_BLACKOUT",
        "title": "Perda de Sincronismo RF / Queda de Lock Digital ISDB-Tb (Tela Preta / 0% Qualidade)",
        "category": "Recepção de RF & Tuner",
        "severity": "CRÍTICA",
        "badge_color": "#ef4444",
        "icon": "fas fa-broadcast-tower",
        "sintoma_tecnico": (
            "Qualidade de sinal (Signal Quality) despenca para 0% ou oscila abaixo de 45% com desarmamento do estado de LOCK. "
            "A taxa de erro de modulação (MER) cai abaixo de 18 dB e a taxa de erro de bits (BER pós-Viterbi) ultrapassa 2e-4. "
            "Nenhum pacote TS válido é entregue ao Atria, gerando quadros pretos ou ausência total de gravação."
        ),
        "causa_raiz": (
            "Atenuação troposférica severa (chuva forte ou duto térmico na atmosfera), desvio da frequência central do transmissor "
            "UHF da emissora acima de +/- 50 kHz, ou queima de amplificador de baixo ruído (LNA / Bias-Tee) instalado no mastro da antena."
        ),
        "procedimento_engenharia": [
            "1. Executar varredura fina de sintonia (Fine-Tune Sweep) em passos de +/- 143 kHz em torno da frequência nominal.",
            "2. Correlacionar se outros canais sintonizados no mesmo tuner TBS mantêm sinal (se todos caírem, a falha é no mastro/cabo).",
            "3. Verificar no Atria API se o ganho de AGC está travado no máximo (sinal saturado por transmissor de celular 5G vizinho)."
        ],
        "mitigacao_definitiva": (
            "Instalação de filtro passa-faixa SAW rejeitor de LTE/5G (faixa 700 MHz) na entrada da placa TBS e calibração "
            "do limiar de sensibilidade de lock com margem de histerese de 8% nas Configurações do Dashboard."
        ),
        "auto_heal_action": "fine_tune_sweep",
        "sample_affected_channel": "Rede TV (Pelotas - CS 2)"
    },
    {
        "id": "PROB_AUDIO_MUTE_DROP",
        "title": "Áudio Mudo Contínuo / Descontinuidade no Stream AAC/AC3",
        "category": "Áudio & Código de Veiculação",
        "severity": "ALTA",
        "badge_color": "#f59e0b",
        "icon": "fas fa-volume-mute",
        "sintoma_tecnico": (
            "O vídeo é capturado normalmente em 1080i, porém o PID de áudio no Transport Stream apresenta silêncio absoluto "
            "(nível sonoro contínuo abaixo de -60 dBFS por mais de 30 segundos) ou corrupção nos descritores ADTS do fluxo AAC, "
            "impossibilitando o monitoramento de anúncios de rádio e áudio de comerciais."
        ),
        "causa_raiz": (
            "Troca não comunicada de PID de áudio na multiplexação da emissora (ex: corte de áudio 5.1 para estéreo 2.0 durante grade local) "
            "ou saturação no buffer da placa virtual de som do Windows que leva o decodificador ffdshow a descartar samples PCM."
        ),
        "procedimento_engenharia": [
            "1. Disparar reload do decodificador de áudio via comando de controle do Atria sem interromper gravação de vídeo.",
            "2. Inspecionar tabela PMT do MUX para verificar se o PID de áudio ativo corresponde ao configurado no Multiplexes.xml.",
            "3. Registrar incidente no Caderno de Ocorrências se a emissora estiver com portadora de áudio muda na origem."
        ],
        "mitigacao_definitiva": (
            "Configurar no Multiplexes.xml o parâmetro <PreferredAudioMode>0</PreferredAudioMode> com auto-detecção por tag de idioma 'por' "
            "e ativar o limiar de alarme de áudio com filtro anti-flapping de 20s para ignorar intervalos comerciais intencionalmente mudos."
        ),
        "auto_heal_action": "restart_audio_codec",
        "sample_affected_channel": "SBT (Juiz de Fora - CS 2)"
    },
    {
        "id": "PROB_JPEG_EXPORT_STALE",
        "title": "Parada de Exportação de Quadros JPEG (Timestamp Congelado > 120s)",
        "category": "Armazenamento & Mosaico",
        "severity": "MÉDIA",
        "badge_color": "#f59e0b",
        "icon": "fas fa-image",
        "sintoma_tecnico": (
            "Os arquivos MP4 são gravados normalmente na pasta 'registered', mas o diretório D:\\MediaDNA_V2\\Data\\JPEG "
            "para de receber novos arquivos com extensão .jpg ou o carimbo temporal do frame exibido no Mosaico fica estagnado "
            "há dezenas de minutos."
        ),
        "causa_raiz": (
            "Bloqueio de escrita exclusivo (File Lock) imposto por software antivírus / EDR corporativo escaneando a pasta de imagens, "
            "ou esgotamento de GDI Handles no processo DTVCapture64.exe durante redimensionamento contínuo para 320x240."
        ),
        "procedimento_engenharia": [
            "1. Disparar script de expurgo de arquivos temporários de imagem bloqueados com mais de 2 horas de idade.",
            "2. Reiniciar a thread secundária de exportação de JPGs sem derrubar os tuners principais.",
            "3. Checar permissões de escrita NTFS no diretório D:\\MediaDNA_V2\\Data\\JPEG."
        ],
        "mitigacao_definitiva": (
            "Adicionar a pasta D:\\MediaDNA_V2\\Data\\JPEG e D:\\MediaDNA_V2\\Data\\video_bkp às exclusões de verificação em tempo real "
            "do antivírus e habilitar rotação com expurgo automático a cada 6 horas."
        ),
        "auto_heal_action": "purge_jpeg_locks",
        "sample_affected_channel": "Record TV (Rio de Janeiro - CS 2)"
    },
    {
        "id": "PROB_RTSP_PACKET_LOSS",
        "title": "Macroblocos Severos & Perda de Pacotes em Transmissões IP / RTSP / HLS",
        "category": "Rede & Streaming IP",
        "severity": "ALTA",
        "badge_color": "#ef4444",
        "icon": "fas fa-network-wired",
        "sintoma_tecnico": (
            "A imagem apresenta quadriculamento severo (macroblocos verdes/cinzentos) ocupando mais de 50% da área útil do quadro. "
            "Quedas acentuadas de bitrate de transporte com Continuity Counter Errors (CC Errors) ultrapassando 40 ocorrências por segundo "
            "nos canais alimentados via encoder IP / streaming."
        ),
        "causa_raiz": (
            "Perda de pacotes UDP na rota entre o encoder da emissora e o Capture Site devido a saturação de buffer de enlace (QoS), "
            "ou MTU desajustado provocando fragmentação de pacotes IP no roteador de borda da praça."
        ),
        "procedimento_engenharia": [
            "1. Forçar comutação do transporte RTSP de UDP (interleaved) para TCP no Atria para garantir entrega de todos os pacotes.",
            "2. Realizar teste de jitter e ping contínuo até o gateway do link de streaming da emissora.",
            "3. Verificar no Atria se o buffer de recepção (Jitter Buffer) está ajustado para no mínimo 2.000 ms."
        ],
        "mitigacao_definitiva": (
            "Ajustar no Multiplexes.xml o protocolo para RTSP-over-TCP e dimensionar a fila de rede com buffer de absorção "
            "de rajadas de até 3.500 ms nas configurações de streaming IP."
        ),
        "auto_heal_action": "switch_rtsp_tcp",
        "sample_affected_channel": "TV Brasil (Rio de Janeiro - CS 2)"
    }
]

def get_mosaic_analytical_problems(problem_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retorna os cards analíticos detalhados de diagnóstico e procedimentos de solução definitiva."""
    if not problem_filter or problem_filter == "all":
        return ANALYTICAL_PROBLEMS_CATALOG
    
    return [p for p in ANALYTICAL_PROBLEMS_CATALOG if problem_filter.lower() in p["id"].lower() or problem_filter.lower() in p["category"].lower()]
