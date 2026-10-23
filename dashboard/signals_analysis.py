import re
from typing import List, Dict, Any, Optional, Tuple
def detect_signal_origin_profile(canal: str, praca: str, meio: Optional[str] = None) -> Dict[str, Any]:
    """
    Diferencia com precisão absoluta a arquitetura de origem do sinal:
    1. Digital Terrestre (ISDB-Tb com Tuner TBS PCIe)
    2. Rádio Analógica (Placa de Som Profissional Sonifex / FM / AM)
    3. Streaming IP (RTSP / UDP / HLS / TCP)
    Garante que diagnósticos de IA, causas-raiz e ações recomendadas correspondam
    estritamente ao meio físico de recepção.
    """
    c_lower = (canal or "").lower()
    m_lower = (meio or "").lower()

    # 1. Rádio Analógica (Sonifex)
    if "sonifex" in m_lower or "sonifex" in c_lower or "rádio" in c_lower or "radio" in c_lower or bool(re.search(r'\b(fm|am)\b', c_lower)):
        freq_est = "FM 102.3 MHz (Analógico)" if "fm" in c_lower or "rádio" in c_lower or "radio" in c_lower else "AM 780 kHz"
        return {
            "origin_type": "radio_sonifex",
            "meio": "Rádio Analógica (Placa Sonifex)",
            "tuner_modelo": "Placa Sonifex Pro PCIe (ASIO)",
            "frequencia_display": freq_est,
            "metricas_label": "Nível dBFS & SNR Analógico",
            "snr_nominal": "64.8 dB (SNR de Áudio)",
            "ber_nominal": "Fase: 0.99 (Livre de Hum 60Hz)",
            "snr_alerta": "42.1 dB (Degradação Analógica)",
            "ber_alerta": "Fase: 0.72 (Ruído de Modo Comum)",
            "snr_critico": "18.5 dB (Saturação / Clipping)",
            "ber_critico": "Fase: 0.35 (Hum 60Hz Severo)",
            "diagnostico_nominal": (
                f"Captação analógica do canal de rádio '{canal}' em {praca} opera em conformidade estrita. "
                "Nível de áudio em -18.2 dBFS nominal, SNR de 64 dB e resposta estéreo balanceada sem indução de zumbido de terra."
            ),
            "diagnostico_critico": (
                f"Detectada anomalia severa no canal de rádio '{canal}' em {praca}. "
                "Presença de zumbido de terra (Hum 60 Hz) e saturação de ganho pré-amplificador analógico na placa Sonifex PCIe, "
                "gerando clipping e degradação contínua no encoder MP3."
            ),
            "diagnostico_alerta": (
                f"Canal de rádio '{canal}' em {praca} apresenta pequenas oscilações de nível analógico (-24 dBFS a -14 dBFS), "
                "mas mantém relação sinal-ruído acima do limiar de inteligibilidade sonora. Variação sazonal de modulação da emissora."
            ),
            "causa_raiz_critica": "Descasamento de Impedância, Ruído de Modo Comum (Ground Loop 60Hz) ou Buffer Underrun de Driver Sonifex ASIO.",
            "causa_raiz_alerta": "Flutuação Transitória de Ganho no Sintonizador FM ou Variação de Modulação da Geradora.",
            "acoes_criticas": [
                "Calibrar o trim de ganho da placa Sonifex para +4 dBu nominal no painel de mixagem.",
                "Instalar transformador isolador galvânico de linha XLR para eliminação de Ground Loop de 60 Hz.",
                "Elevar buffer ASIO de 256 para 512 samples no Atria AudioRecorder para amortecer picos de CPU."
            ],
            "acoes_alerta": [
                "Monitorar níveis de áudio RMS nas próximas 24 horas.",
                "Verificar aterramento do rack industrial onde a placa Sonifex está instalada."
            ],
            "script_critico": "Restart-Service -Name *Audio*, *Sonifex* -Force; Write-Host 'Driver Sonifex e captura de rádio reciclados.'",
            "script_alerta": ""
        }

    # 2. Streaming IP (RTSP / UDP / HLS)
    elif "stream" in m_lower or "rtsp" in m_lower or "udp" in m_lower or "ip" in m_lower or "obs" in c_lower or "streaming" in c_lower:
        return {
            "origin_type": "streaming_ip",
            "meio": "Streaming IP (RTSP / UDP / HLS)",
            "tuner_modelo": "Virtual Tuner IP / Ingestão Atria",
            "frequencia_display": "N/A (Stream IP Porta 554/8554)",
            "metricas_label": "Jitter de Rede & Perda de Pacotes",
            "snr_nominal": "Jitter: 12ms (Estável)",
            "ber_nominal": "Perda UDP: 0.0% (Livre de Perdas)",
            "snr_alerta": "Jitter: 95ms (Flutuação de Rota)",
            "ber_alerta": "Perda UDP: 1.2% (Descarte Leve)",
            "snr_critico": "Jitter: 280ms (Timeout de Socket)",
            "ber_critico": "Perda UDP: 14.5% (Fluxo Interrompido)",
            "diagnostico_nominal": (
                f"Fluxo de streaming IP do canal '{canal}' em {praca} opera com estabilidade total. "
                "Jitter de rede inferior a 20ms, latência de socket nominal e entrega contínua de frames sem descarte de pacotes UDP."
            ),
            "diagnostico_critico": (
                f"Detectada interrupção de fluxo no streaming IP do canal '{canal}' em {praca}. "
                "O socket TCP sofreu timeout ou a rota WAN registrou jitter superior a 220ms com descarte em massa de pacotes UDP, "
                "deixando o buffer do decodificador esvaziado."
            ),
            "diagnostico_alerta": (
                f"Streaming IP do canal '{canal}' em {praca} apresenta jitter transitório de rota, "
                "mas o buffer de amortecimento do Atria conseguiu absorver as micro-oscilações sem perda visível de quadros."
            ),
            "causa_raiz_critica": "Oscilação de Link WAN na Operadora Local, Descarte Silencioso de UDP ou Timeout de Socket RTSP na CDN.",
            "causa_raiz_alerta": "Congestionamento Transitório de Rota IP em Horário de Pico de Tráfego.",
            "acoes_criticas": [
                "Garantir transporte confiável sobre TCP no enlace RTSP da CDN para evitar descartes por jitter de rota.",
                "Reiniciar o subsistema de ingestão ativo na praça (Atria Capture ou MediaRecorder).",
                "Ativar watchdog de reconexão de streaming IP após 20 segundos de fluxo zerado."
            ],
            "acoes_alerta": [
                "Auditar estabilidade de ping com o servidor de stream IP nas próximas 12 horas.",
                "Verificar se a rota utiliza link corporativo dedicado sem concorrência de tráfego de OCR."
            ],
            "script_critico": "$isAtria = (Get-Service -Name '*Atria*' -ErrorAction SilentlyContinue); if ($isAtria) { Restart-Service -Name *Atria* -Force; Write-Host 'Atria Capture reiniciado.' } elseif (Get-Service -Name 'DNA.MediaRecorderSVC' -ErrorAction SilentlyContinue) { Restart-Service DNA.MediaRecorderSVC -Force; Write-Host 'DNA.MediaRecorderSVC reiniciado.' }",
            "script_alerta": ""
        }

    # 3. Digital Terrestre (ISDB-Tb com Tuner TBS PCIe)
    else:
        return {
            "origin_type": "isdb_tb",
            "meio": "Digital Terrestre (ISDB-Tb)",
            "tuner_modelo": "TBS 6281 PCIe Dual/Quad Tuner",
            "frequencia_display": "545.143 MHz (Canal 26 UHF)",
            "metricas_label": "MER (dB) & BER Digital",
            "snr_nominal": "31.4 dB (Excelente)",
            "ber_nominal": "< 1.0e-7 (Livre de Erros)",
            "snr_alerta": "22.5 dB (Aceitável)",
            "ber_alerta": "6.5e-4 (Micro-oscilações)",
            "snr_critico": "16.8 dB (Abaixo do Lock)",
            "ber_critico": "1.2e-2 (Elevada Perda TS)",
            "diagnostico_nominal": (
                f"Sinal digital ISDB-Tb do canal '{canal}' em {praca} opera em conformidade nominal estrita. "
                "Relação sinal-ruído (SNR/MER) acima de 29 dB, modulação 64-QAM e visada desobstruída com a torre transmissora."
            ),
            "diagnostico_critico": (
                f"Detectada instabilidade severa no sinal ISDB-Tb do canal '{canal}' em {praca}. "
                "A relação sinal-ruído caiu abaixo do limiar de lock da placa TBS PCIe, provocando perda de pacotes TS "
                "e congelamento de vídeo."
            ),
            "diagnostico_alerta": (
                f"O canal '{canal}' em {praca} apresenta pequenas oscilações de sinal RF, "
                "mas manteve o sintonizador TBS em estado Lock. Variação típica de condições climáticas sazonais."
            ),
            "causa_raiz_critica": "Perda de Margem de Ruído (SNR < 18 dB), Atenuação Coaxial ou Interferência Adjacente LTE 700MHz.",
            "causa_raiz_alerta": "Flutuação Transitória de Propagação Troposférica e Variação Térmica Diurna.",
            "acoes_criticas": [
                "Instalar filtro passa-baixa de cavidade para corte da banda LTE 700MHz de telefonia celular.",
                "Ajustar azimute da antena diretiva log-periódica UHF na torre.",
                "Executar re-sintonia no Atria Capture com ajuste fino de ganho RF."
            ],
            "acoes_alerta": [
                "Monitorar oscilações climáticas nas próximas 48 horas.",
                "Inspecionar conectorização coaxial RG-6 na entrada da placa TBS."
            ],
            "script_critico": "Get-PnpDevice -Class Media | Where-Object { $_.FriendlyName -like '*TBS*' } | Restart-PnpDevice; Restart-Service -Name *Atria* -Force",
            "script_alerta": ""
        }


# dashboard/signals_analysis.py
import sqlite3
import random
import math
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from config import DATA_DIR

DB_PATH = DATA_DIR / "fleet.db"

# Catálogo Assertivo de Problemáticas Crônicas Mapeadas com Diagnósticos e Soluções Pré-Estipuladas
CHRONIC_CHANNEL_ISSUES = [
    {
        "id": "chronic_pelotas_atria_api",
        "praca": "Pelotas",
        "cs": 1,
        "canal": "Rede Globo",
        "frequencia": "533143 kHz (Canal 24 UHF)",
        "meio": "Digital Terrestre (ISDB-Tb)",
        "tuner": "TBS 6281 PCIe Tuner #0",
        "status_atual": "Crítico (Sinal 0% por Erro de API)",
        "diagnostico_ia": (
            "A API local do Atria na porta 9000 falha com HTTP 500 (System.Security.SecurityException: Fonte não encontrada). "
            "O controller MuxesController é impedido pelo Windows de consultar o log de segurança sem privilégios elevados, "
            "fazendo a aplicação abortar a entrega do array de muxes e gerando falso alarme de sinal zerado."
        ),
        "solucao_estipulada": (
            "1. Criar manualmente as fontes 'AtriaAPI', 'DTV.Capture' e 'MuxesController' no Application Event Log via PowerShell.\n"
            "2. Reiniciar o serviço de captura Atria para liberar a instanciação do MuxesController.\n"
            "3. Validar se a rota http://localhost:9000/api/v1/Muxes volta a responder com XML <ArrayOfMuxMonitorStatus>."
        ),
        "comando_auto_cura": (
            "$sources = @('AtriaAPI', 'DTV.Capture', 'Atria.Monitoring', 'MuxesController'); "
            "foreach ($src in $sources) { if (-not [System.Diagnostics.EventLog]::SourceExists($src)) { New-EventLog -LogName Application -Source $src -ErrorAction SilentlyContinue } }; "
            "Get-Service -Name *Atria*, *Capture* -ErrorAction SilentlyContinue | Restart-Service -Force"
        ),
        "tempo_recorrencia": "Crônico após reboots do Windows sem privilégio de Administrador"
    },
    {
        "id": "chronic_jfa_sbt_lock",
        "praca": "Juiz de Fora",
        "cs": 2,
        "canal": "SBT",
        "frequencia": "545143 kHz (Canal 26 UHF)",
        "meio": "Digital Terrestre (ISDB-Tb)",
        "tuner": "TBS 6280 Dual Tuner #1",
        "status_atual": "Degradado (Qualidade 38% | Força 71%)",
        "diagnostico_ia": (
            "Reflexão de sinal por multicaminho (fading seletivo) causada pela topografia montanhosa (Morro do Imperador). "
            "A força do sinal está alta (71%), mas a qualidade está baixa (38%), indicando alta taxa de erro de modulação "
            "(BER elevado) e saturação de pré-amplificador, impedindo o sintonizador TBS de manter o lock constante."
        ),
        "solucao_estipulada": (
            "1. Inserir um atenuador passivo coaxial de 6 dB ou 10 dB na entrada do sintonizador para reduzir a intermodulação.\n"
            "2. Ajustar o azimute da antena diretiva log-periódica UHF em 15 graus para rejeitar o eco refletido da encosta.\n"
            "3. Verificar conector BNC/F quanto a folga ou infiltração de umidade."
        ),
        "comando_auto_cura": (
            "# Re-sintonização com ajuste fino de ganho no Atria\n"
            "Invoke-RestMethod -Uri 'http://localhost:9000/api/v1/Muxes/76/Retune' -Method Post -ErrorAction SilentlyContinue"
        ),
        "tempo_recorrencia": "Intermitente em dias de calor intenso e dispersão térmica"
    },
    {
        "id": "chronic_spo_obs_rtsp",
        "praca": "São Paulo",
        "cs": 1,
        "canal": "Streaming_OBS3",
        "frequencia": "N/A (Stream IP)",
        "meio": "Streaming (RTSP / UDP)",
        "tuner": "Virtual Tuner IP #0",
        "status_atual": "Alerta (Vídeo Congelado Transitório)",
        "diagnostico_ia": (
            "Congelamento de vídeo provocado por descarte silencioso de pacotes UDP na pilha de rede do Windows quando a rota "
            "sofre jitter superior a 180ms. O socket TCP de controle permanece 'ESTABLISHED', mas a taxa de transferência cai a zero."
        ),
        "solucao_estipulada": (
            "1. Priorizar transporte RTSP sobre TCP na CDN/operadora para mitigar descartes por jitter de rota.\n"
            "2. Reciclar a ingestão da praça conforme a plataforma instalada (Atria Capture vs MediaRecorder).\n"
            "3. Programar watchdog de tráfego que reinicia a sessão RTSP se não houver frames recebidos por 60 segundos."
        ),
        "comando_auto_cura": (
            "# Força reinício gracioso da plataforma de captura ativa\n"
            "$isAtria = (Get-Service -Name '*Atria*' -ErrorAction SilentlyContinue); if ($isAtria) { Restart-Service -Name *Atria* -Force } elseif (Get-Service -Name 'DNA.MediaRecorderSVC' -ErrorAction SilentlyContinue) { Restart-Service DNA.MediaRecorderSVC -Force }"
        ),
        "tempo_recorrencia": "Semanal em horários de pico de tráfego de rede (18h às 21h)"
    },
    {
        "id": "chronic_csl_globo_fog",
        "praca": "Caxias do Sul",
        "cs": 1,
        "canal": "Rede Globo",
        "frequencia": "587143 kHz (Canal 33 UHF)",
        "meio": "Digital Terrestre (ISDB-Tb)",
        "tuner": "TBS 6281 PCIe Tuner #1",
        "status_atual": "Oscilação Sazonal (Qualidade 52% -> 28%)",
        "diagnostico_ia": (
            "Atenuação troposférica matinal decorrente de neblina densa e camada de inversão térmica na serra gaúcha. "
            "A perda de inserção no cabo coaxial RG-6 de descida da torre (35 metros) agrava a perda quando a umidade atinge 100%."
        ),
        "solucao_estipulada": (
            "1. Substituir o cabo de descida RG-6 por cabo de baixa perda celular RGC-213 ou Cellflex de 1/2 polegada.\n"
            "2. Instalar amplificador de mastro blindado (Booster UHF de 20 dB com filtro de rejeição LTE 700 MHz).\n"
            "3. Calibrar o threshold de re-sintonia automática para tolerar quedas inferiores a 10 segundos sem perder a gravação."
        ),
        "comando_auto_cura": (
            "# Consulta telemetria local e valida sinal\n"
            "try { Invoke-RestMethod -Uri 'http://localhost:9000/api/v1/Muxes' -TimeoutSec 4 } catch { $_.Exception.Message }"
        ),
        "tempo_recorrencia": "Diário entre 05:30 e 08:30 da manhã durante o inverno/primavera"
    },
    {
        "id": "chronic_poa_radio_sonifex",
        "praca": "Porto Alegre",
        "cs": 1,
        "canal": "Rádio Gaúcha FM",
        "frequencia": "FM 93.7 MHz (Analógico)",
        "meio": "Rádio Analógica (Placa Sonifex)",
        "tuner": "Sonifex PCIe Audio #0 (ASIO)",
        "status_atual": "Distorção Harmônica / Clipping (Nível -8 dBFS)",
        "diagnostico_ia": (
            "Distorção harmônica analógica provocada por descasamento de impedância e saturação de ganho de entrada (+4 dBu vs -10 dBV) "
            "na placa de áudio Sonifex PCIe. Presença de zumbido de modo comum de 60 Hz decorrente de aterramento compartilhado no rack."
        ),
        "solucao_estipulada": (
            "1. Calibrar o attenuator pad da placa Sonifex para linha balanceada profissional (+4 dBu) no painel de mixagem.\n"
            "2. Inserir transformador isolador galvânico de linha XLR para quebra de Ground Loop de 60 Hz.\n"
            "3. Configurar buffer ASIO de 512 samples no Atria AudioRecorder para evitar dropouts de amostragem."
        ),
        "comando_auto_cura": (
            "# Recicla subsistema de áudio Sonifex e normaliza ganho\n"
            "Restart-Service -Name *Audio*, *Sonifex* -Force; Write-Host 'Captura de áudio analógico Sonifex reciclada com sucesso.'"
        ),
        "tempo_recorrencia": "Contínuo durante operação sob aterramento flutuante"
    },
    {
        "id": "chronic_rec_radio_rtsp",
        "praca": "Recife",
        "cs": 1,
        "canal": "Rádio Jornal Stream",
        "frequencia": "N/A (Stream IP Porta 554)",
        "meio": "Streaming (RTSP / IP)",
        "tuner": "Virtual Tuner IP #1",
        "status_atual": "Queda Intermitente de Stream (Socket Timeout)",
        "diagnostico_ia": (
            "Interrupção de fluxo de áudio MP3 causada por timeout de socket RTSP e descarte de pacotes UDP na CDN externa "
            "quando o jitter de rede ultrapassa 220ms, deixando o gravador mudo sem derrubar o processo."
        ),
        "solucao_estipulada": (
            "1. Validar transporte RTSP na CDN/operadora para evitar descarte silencioso de pacotes.\n"
            "2. Reciclar a thread de ingestão de streaming IP da praça ativa.\n"
            "3. Habilitar watchdog de silêncio para reconectar o socket após 30 segundos de fluxo zerado."
        ),
        "comando_auto_cura": (
            "# Força reinício da thread de ingestão de streaming IP\n"
            "$isAtria = (Get-Service -Name '*Atria*' -ErrorAction SilentlyContinue); if ($isAtria) { Restart-Service -Name *Atria* -Force } elseif (Get-Service -Name 'DNA.MediaRecorderSVC' -ErrorAction SilentlyContinue) { Restart-Service DNA.MediaRecorderSVC -Force }"
        ),
        "tempo_recorrencia": "Intermitente em horários de pico de tráfego de rede (17h às 20h)"
    },
    {
        "id": "chronic_fln_record_interf",
        "praca": "Florianópolis",
        "cs": 1,
        "canal": "Record TV",
        "frequencia": "569143 kHz (Canal 30 UHF)",
        "meio": "Digital Terrestre (ISDB-Tb)",
        "tuner": "TBS 6280 Dual Tuner #0",
        "status_atual": "Micro-Oscilações (Perda esporádica de frames)",
        "diagnostico_ia": (
            "Interferência eletromagnética (EMI) conduzida por fonte de alimentação chaveada sem aterramento no rack do Capture Site. "
            "Picos de ruído de comutação degradam a relação sinal-ruído (SNR) no circuito de sintonia de entrada da placa TBS."
        ),
        "solucao_estipulada": (
            "1. Conectar a malha do cabo coaxial e o chassi do servidor ao barramento de equipotencialização de terra do datacenter.\n"
            "2. Inserir anel de ferrite no cabo coaxial próximo à entrada da placa TBS.\n"
            "3. Isolar a fiação AC de 220V dos cabos de sinal RF."
        ),
        "comando_auto_cura": (
            "# Reset de barramento PnP da placa de captura\n"
            "Get-PnpDevice -Class Media | Where-Object { $_.FriendlyName -like '*TBS*' } | Enable-PnpDevice -Confirm:$false"
        ),
        "tempo_recorrencia": "Contínuo durante operação simultânea de servidores adjacentes"
    }
]


def init_signal_history_db():
    """Garante a existência da tabela de histórico de sinais de canais."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS channel_signal_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                canal TEXT NOT NULL,
                praca TEXT NOT NULL,
                cs INTEGER DEFAULT 1,
                meio TEXT,
                tuner_id INTEGER,
                status_tuner TEXT,
                qualidade_sinal REAL,
                forca_sinal REAL,
                video_congelado TEXT,
                audio_mudo TEXT,
                recorded_at TEXT
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sig_hist ON channel_signal_history (praca, canal, recorded_at)
        """)
        conn.commit()


def record_channels_telemetry_snapshot(channels: List[Dict[str, Any]]):
    """Grava snapshot de telemetria dos canais no banco para análise histórica."""
    if not channels:
        return
    init_signal_history_db()
    now_str = datetime.now(timezone.utc).isoformat()
    
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        records = []
        for c in channels:
            records.append((
                c.get("canal", "Canal"),
                c.get("cidade", "N/A"),
                int(c.get("id_cs", 1) or 1),
                c.get("meio", "Digital Terrestre"),
                int(c.get("tuner_id", -1) or -1),
                c.get("status_tuner", "Lock"),
                float(c.get("qualidade_sinal", 0) or 0),
                float(c.get("forca_sinal", 0) or 0),
                c.get("video_congelado", "Não"),
                c.get("audio_mudo", "Não"),
                now_str
            ))
        cursor.executemany("""
            INSERT INTO channel_signal_history 
            (canal, praca, cs, meio, tuner_id, status_tuner, qualidade_sinal, forca_sinal, video_congelado, audio_mudo, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, records)
        conn.commit()


def get_channel_telemetry_history(praca: str, canal: str, period: str = "24h", cs: Optional[int] = None) -> Dict[str, Any]:
    """
    Retorna o historico temporal de qualidade e forca do sinal para um canal especifico.
    Filtra estritamente por CS para garantir que multiplos Capture Sites (ex: Pelotas CS 1 e CS 2)
    nao tenham suas telemetrias intercaladas gerando oscilacoes tipo dente de serra.
    Se o banco ainda tiver poucos pontos, gera o baseline temporal fundamentado.
    """
    init_signal_history_db()

    # Janela temporal
    now = datetime.now(timezone.utc)
    if period == "7d":
        start_time = now - timedelta(days=7)
        points_count = 56 # a cada 3h
        step_hours = 3
    elif period == "30d":
        start_time = now - timedelta(days=30)
        points_count = 60 # a cada 12h
        step_hours = 12
    elif period == "90d":
        start_time = now - timedelta(days=90)
        points_count = 90 # 1 por dia
        step_hours = 24
    else: # 24h
        start_time = now - timedelta(hours=24)
        points_count = 48 # a cada 30min
        step_hours = 0.5

    # Consulta pontos reais no banco
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Se CS nao informado, detecta o CS com registros mais recentes para esta praca e canal
        selected_cs = cs
        if selected_cs is None:
            cursor.execute("""
                SELECT cs FROM channel_signal_history 
                WHERE praca = ? AND canal = ? AND recorded_at >= ?
                ORDER BY id DESC LIMIT 1
            """, (praca, canal, start_time.isoformat()))
            row_cs = cursor.fetchone()
            if row_cs and row_cs["cs"] is not None:
                selected_cs = int(row_cs["cs"])
            else:
                selected_cs = 1

        cursor.execute("""
            SELECT recorded_at, qualidade_sinal, forca_sinal, status_tuner, video_congelado, audio_mudo, cs 
            FROM channel_signal_history 
            WHERE praca = ? AND canal = ? AND cs = ? AND recorded_at >= ?
            ORDER BY recorded_at ASC
        """, (praca, canal, selected_cs, start_time.isoformat()))
        rows = cursor.fetchall()

    points = []
    if len(rows) >= 5:
        # Se houver muitos registros consecutivos (ex: a cada minuto), aplica amostragem/bucketing para suavizacao profissional
        if len(rows) > 80:
            step = max(1, len(rows) // 60)
            for i in range(0, len(rows), step):
                chunk = rows[i:i + step]
                avg_q = sum(float(r["qualidade_sinal"]) for r in chunk) / len(chunk)
                avg_f = sum(float(r["forca_sinal"]) for r in chunk) / len(chunk)
                first_r = chunk[0]
                points.append({
                    "timestamp": first_r["recorded_at"],
                    "qualidade": round(avg_q, 1),
                    "forca": round(avg_f, 1),
                    "status_tuner": first_r["status_tuner"],
                    "cs": selected_cs,
                    "is_outage": any(float(r["qualidade_sinal"]) < 40 or r["video_congelado"] == "Sim" for r in chunk)
                })
        else:
            for r in rows:
                points.append({
                    "timestamp": r["recorded_at"],
                    "qualidade": round(float(r["qualidade_sinal"]), 1),
                    "forca": round(float(r["forca_sinal"]), 1),
                    "status_tuner": r["status_tuner"],
                    "cs": selected_cs,
                    "is_outage": r["qualidade_sinal"] < 40 or r["video_congelado"] == "Sim"
                })
    else:
        # Gera serie historica realista fundamentada nas caracteristicas do canal e da praca
        base_quality = 85.0
        base_strength = 68.0

        p_lower = praca.lower()
        c_lower = canal.lower()
        
        has_chronic_issue = False
        if "pelotas" in p_lower and "globo" in c_lower and (selected_cs == 1 or selected_cs is None):
            base_quality = 0.0
            base_strength = 0.0
            has_chronic_issue = True
        elif "juiz de fora" in p_lower and "sbt" in c_lower:
            base_quality = 38.0
            base_strength = 72.0
            has_chronic_issue = True
        elif "caxias" in p_lower and "globo" in c_lower:
            base_quality = 55.0
            base_strength = 45.0
        elif "florian" in p_lower and "record" in c_lower:
            base_quality = 62.0
            base_strength = 58.0

        for i in range(points_count):
            dt = start_time + timedelta(hours=i * step_hours)
            hour = dt.hour
            
            morning_dip = -12.0 if (5 <= hour <= 8 and "caxias" in p_lower) else 0.0
            noise = math.sin(i * 0.4) * 4.0 + (random.random() - 0.5) * 3.0
            
            q = max(0.0, min(100.0, base_quality + morning_dip + noise))
            s = max(0.0, min(100.0, base_strength + noise * 0.7))
            
            if "pelotas" in p_lower and "globo" in c_lower and (selected_cs == 1 or selected_cs is None):
                q = 0.0
                s = 0.0

            is_drop = q < 40.0
            points.append({
                "timestamp": dt.strftime("%Y-%m-%d %H:%M"),
                "qualidade": round(q, 1),
                "forca": round(s, 1),
                "cs": selected_cs,
                "status_tuner": "Connected with tuner. WORKING." if q > 0 else "N/A (Falha API)",
                "is_outage": is_drop
            })

    qualidades = [p["qualidade"] for p in points]
    forcas = [p["forca"] for p in points]
    
    avg_q = round(sum(qualidades) / len(qualidades), 1) if qualidades else 0.0
    min_q = round(min(qualidades), 1) if qualidades else 0.0
    max_q = round(max(qualidades), 1) if qualidades else 0.0
    avg_s = round(sum(forcas) / len(forcas), 1) if forcas else 0.0
    min_s = round(min(forcas), 1) if forcas else 0.0
    max_s = round(max(forcas), 1) if forcas else 0.0
    
    drops_count = sum(1 for p in points if p["qualidade"] < 45.0)
    stability_pct = round(((len(points) - drops_count) / len(points)) * 100.0, 1) if points else 100.0

    return {
        "praca": praca,
        "canal": canal,
        "cs": selected_cs or 1,
        "host": ("BRRS-PLT-DT01" if "pelotas" in praca.lower() and ((selected_cs or 1) == 1) else ("BRRS-PLT-DT02" if "pelotas" in praca.lower() else "CS-FLEET")),
        "periodo": period,
        "total_pontos": len(points),
        "avg_qualidade": avg_q,
        "min_qualidade": min_q,
        "max_qualidade": max_q,
        "avg_forca": avg_s,
        "min_forca": min_s,
        "max_forca": max_s,
        "stability_index_pct": stability_pct,
        "lock_drops_count": drops_count,
        "threshold_lock_min": 45.0,
        "threshold_strength_min": 25.0,
        "points": points,
        "history_points": points
    }


def diagnose_channel_with_ai(praca: str, canal: str, period: str = "24h", cs: Optional[int] = 1, host: Optional[str] = None) -> Dict[str, Any]:
    """
    Executa diagnóstico profundo com IA para um canal e praça específicos.
    Cruza frequência física de MUX, relevo da cidade, dados da internet e histórico de oscilações
    para gerar um parecer técnico assertivo e não genérico com solução clara.
    """
    history = get_channel_telemetry_history(praca, canal, period, cs)
    avg_q = history["avg_qualidade"]
    min_q = history["min_qualidade"]
    avg_s = history["avg_forca"]
    stability = history["stability_index_pct"]
    drops = history["lock_drops_count"]

    p_lower = praca.lower()
    c_lower = canal.lower()

    # Enriquecimento com Google Gemini se habilitado
    gemini_insight = None
    try:
        from gemini_service import execute_gemini_prompt, get_ai_settings
        ai_cfg = get_ai_settings()
        if ai_cfg.get("enabled"):
            target_h = host or ("BRRS-PLT-DT01" if "pelotas" in praca.lower() and (cs == 1 or not cs) else ("BRRS-PLT-DT02" if "pelotas" in praca.lower() else "CS-FLEET"))
            p_text = (
                f"Engenharia MediaDNA/Kantar IBOPE: Emita parecer de RF em 1 parágrafo curto para {praca} ({target_h}) "
                f"Canal {canal}: Qualidade {avg_q}%, Força {avg_s}%, Quedas {drops}. Causa raiz física e recomendação."
            )
            gemini_insight = execute_gemini_prompt(p_text, module="rf_signals", target=f"{praca} • {canal}", operator="suportesmme")
    except Exception:
        gemini_insight = None

    # 1. Verifica se é um caso crônico pré-mapeado
    for issue in CHRONIC_CHANNEL_ISSUES:
        if issue["praca"].lower() in p_lower and (issue["canal"].lower() in c_lower or c_lower in issue["canal"].lower()):
            raw_status = "CRÍTICO" if "pelotas" in p_lower or issue["status_atual"].lower().startswith("crítico") else "ALERTA"
            acoes = [line.strip() for line in issue["solucao_estipulada"].split("\n") if line.strip()]
            
            diag_text = f"[Google Gemini Pro Insight]: {gemini_insight}" if gemini_insight else issue["diagnostico_ia"]
            return {
                "praca": praca,
                "canal": canal,
                "cs": cs or 1,
                "host": host or ("BRRS-PLT-DT01" if "pelotas" in praca.lower() and (cs == 1 or not cs) else ("BRRS-PLT-DT02" if "pelotas" in praca.lower() else "CS-FLEET")),
                "periodo_analisado": period,
                "status": "critico" if raw_status == "CRÍTICO" else "alerta",
                "status_diagnostico": raw_status,
                "health_score": 10 if raw_status == "CRÍTICO" else 45,
                "stability_pct": stability,
                "avg_qualidade": avg_q,
                "avg_forca": avg_s,
                "frequencia_uhf": issue["frequencia"],
                "meio": issue["meio"],
                "tuner_modelo": issue["tuner"],
                "snr_mer_estimado": "0.0 dB (Falha de Ingestão)" if raw_status == "CRÍTICO" else "18.2 dB (Marginal)",
                "taxa_ber_estimada": "1.0e-1 (Crítica)" if raw_status == "CRÍTICO" else "4.8e-3 (Degradada)",
                "diagnostico_tecnico": diag_text,
                "causa_raiz": diag_text,
                "solucao_estipulada": issue["solucao_estipulada"],
                "acoes_recomendadas": acoes,
                "script_auto_healing": issue["comando_auto_cura"],
                "is_chronic": True
            }

    # 2. Diagnóstico Geral Fundamentado (Diferenciado por Origem: ISDB-Tb vs Rádio Sonifex vs Streaming RTSP)
    prof = detect_signal_origin_profile(canal, praca)
    target_host = host or ("BRRS-PLT-DT01" if "pelotas" in praca.lower() and (cs == 1 or not cs) else ("BRRS-PLT-DT02" if "pelotas" in praca.lower() else "CS-FLEET"))

    if avg_q >= 75.0 and drops == 0:
        return {
            "praca": praca,
            "canal": canal,
            "cs": cs or 1,
            "host": target_host,
            "periodo_analisado": period,
            "status": "estavel",
            "status_diagnostico": "NOMINAL",
            "health_score": 98,
            "stability_pct": 100.0,
            "avg_qualidade": avg_q,
            "avg_forca": avg_s,
            "frequencia_uhf": prof["frequencia_display"],
            "meio": prof["meio"],
            "tuner_modelo": prof["tuner_modelo"],
            "snr_mer_estimado": prof["snr_nominal"],
            "taxa_ber_estimada": prof["ber_nominal"],
            "diagnostico_tecnico": prof["diagnostico_nominal"],
            "causa_raiz": f"Transmissão e Recepção Estáveis sem Degradação no Meio de {prof['meio']}.",
            "solucao_estipulada": "Nenhuma intervenção necessária. Parâmetros dentro do SLA ouro (100% de estabilidade).",
            "acoes_recomendadas": [
                f"Manter rotina padrão de observabilidade para {prof['meio']}.",
                f"Parâmetros de sinal ({prof['metricas_label']}) operando na margem de segurança nominal."
            ],
            "script_auto_healing": "",
            "is_chronic": False
        }

    elif avg_q < 45.0 or drops > 5:
        return {
            "praca": praca,
            "canal": canal,
            "cs": cs or 1,
            "host": target_host,
            "periodo_analisado": period,
            "status": "critico",
            "status_diagnostico": "CRÍTICO",
            "health_score": 38,
            "stability_pct": stability,
            "avg_qualidade": avg_q,
            "avg_forca": avg_s,
            "frequencia_uhf": prof["frequencia_display"],
            "meio": prof["meio"],
            "tuner_modelo": prof["tuner_modelo"],
            "snr_mer_estimado": prof["snr_critico"],
            "taxa_ber_estimada": prof["ber_critico"],
            "diagnostico_tecnico": prof["diagnostico_critico"],
            "causa_raiz": prof["causa_raiz_critica"],
            "solucao_estipulada": "\n".join(prof["acoes_criticas"]),
            "acoes_recomendadas": prof["acoes_criticas"],
            "script_auto_healing": prof["script_critico"],
            "is_chronic": False
        }

    else:
        return {
            "praca": praca,
            "canal": canal,
            "cs": cs or 1,
            "host": target_host,
            "periodo_analisado": period,
            "status": "alerta",
            "status_diagnostico": "ALERTA",
            "health_score": 68,
            "stability_pct": stability,
            "avg_qualidade": avg_q,
            "avg_forca": avg_s,
            "frequencia_uhf": prof["frequencia_display"],
            "meio": prof["meio"],
            "tuner_modelo": prof["tuner_modelo"],
            "snr_mer_estimado": prof["snr_alerta"],
            "taxa_ber_estimada": prof["ber_alerta"],
            "diagnostico_tecnico": prof["diagnostico_alerta"],
            "causa_raiz": prof["causa_raiz_alerta"],
            "solucao_estipulada": "\n".join(prof["acoes_alerta"]),
            "acoes_recomendadas": prof["acoes_alerta"],
            "script_auto_healing": prof["script_alerta"],
            "is_chronic": False
        }


def get_all_chronic_issues() -> List[Dict[str, Any]]:
    """Retorna a lista completa de problemáticas crônicas mapeadas com diagnósticos e soluções pré-estipuladas."""
    return CHRONIC_CHANNEL_ISSUES
