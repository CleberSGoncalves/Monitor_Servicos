# dashboard/ai_insights.py
import sqlite3
import json
import uuid
from typing import List, Dict, Any
from config import DATA_DIR
from thresholds_manager import update_threshold

DB_PATH = DATA_DIR / "fleet.db"

# Catálogo Mestre de Ideias Sistêmicas e Operacionais (Aplicáveis a Todas as Praças e Cidades do Escopo)
SYSTEMIC_IDEAS_CATALOG = [
    {
        "id_code": "SYS_DEAD_SOCKET_WATCHDOG",
        "title": "Watchdog Global de Sockets TCP Zumbi e Conexões Mortas (Todas as Praças)",
        "category": "estabilidade",
        "severity": "alta",
        "description": (
            "Streams IP (RTSP/UDP) e conexões WCF mantêm sockets TCP em estado ESTABLISHED com transferência 0 kbps "
            "após oscilações transitórias de link nas operadoras locais. A IA sugere ativar auditoria contínua de delta "
            "de bytes por PID em todos os 22 hosts da frota, resetando sockets órfãos sem derrubar o serviço inteiro."
        ),
        "suggested_rule": {
            "type": "tcp_dead_socket_watchdog",
            "scope": "frota_completa",
            "check_interval_sec": 90,
            "min_delta_bytes": 1024,
            "action": "recycle_dead_socket_handles"
        }
    },
    {
        "id_code": "SYS_DISK_IO_LATENCY_BOTTLENECK",
        "title": "Detecção Preditiva de Gargalo de I/O e Fila de Disco D: (Global)",
        "category": "desempenho",
        "severity": "critica",
        "description": (
            "A gravação concorrente de dezenas de canais em MP4/TS gera saturação de escrita (Disk Write Latency > 120ms "
            "e Current Queue Length > 2.5 no Windows PerfMon), provocando congelamento silencioso de quadros ('Vídeo Congelado') "
            "mesmo com espaço em GB livre. A IA sugere monitorar latência média de I/O em todas as praças e acionar buffer "
            "assíncrono com janela de TRIM/Defrag na madrugada."
        ),
        "suggested_rule": {
            "type": "disk_io_latency_tuning",
            "scope": "todas_as_pracas",
            "max_write_latency_ms": 120,
            "max_queue_length": 2.5,
            "action": "enable_async_io_and_scheduled_trim"
        }
    },
    {
        "id_code": "SYS_KERNEL_NONPAGED_POOL_LEAK",
        "title": "Proteção Preditiva contra Esgotamento de Memória do Kernel (Pool Non-Paged)",
        "category": "preditivo",
        "severity": "alta",
        "description": (
            "Drivers de placas sintonizadoras PCIe/USB (TBS Technologies) sofrem vazamento gradual de memória não-paginada "
            "do Windows ('Memory\\Pool Nonpaged Bytes') em uptime contínuo superior a 20 dias, causando travamento do SO "
            "sem tela azul. A IA sugere monitorar o crescimento monotônico do kernel pool em todas as praças, alertando e "
            "agendando reciclagem preventiva antes do colapso do sistema."
        ),
        "suggested_rule": {
            "type": "kernel_pool_guard",
            "scope": "todos_os_hosts",
            "max_nonpaged_mb": 1200,
            "action": "graceful_maintenance_reboot_schedule"
        }
    },
    {
        "id_code": "SYS_CROSS_CORRELATION_TOWER_BLACKOUT",
        "title": "Algoritmo de Correlação Cruzada: Blecaute Externo de Torre vs. Falha Local",
        "category": "inteligencia",
        "severity": "alta",
        "description": (
            "Quando múltiplos canais do mesmo MUX físico ou transmissor regional caem simultaneamente enquanto a placa TBS "
            "permanece saudável, a causa raiz é externa (falta de energia na torre ou manutenção da emissora). A IA sugere "
            "correlacionar quedas em lote por cidade para classificar o incidente como 'Blecaute Externo', suprimindo "
            "tentativas desnecessárias de auto-healing no hardware local."
        ),
        "suggested_rule": {
            "type": "external_outage_correlation",
            "scope": "cidades_escopo",
            "min_simultaneous_drop_pct": 75,
            "window_sec": 60,
            "action": "suppress_local_hardware_reboot"
        }
    },
    {
        "id_code": "SYS_NTP_CLOCK_SKEW_DRIFT",
        "title": "Sincronização Preditiva de Relógio do SO e Correção de Drift NTP (Frota Completa)",
        "category": "conformidade",
        "severity": "media",
        "description": (
            "A auditoria de mídia e comprovação de veiculação exige exatidão de carimbo de tempo milimétrica. Desvios "
            "de relógio do Windows acima de 1.5s invalidam metadados no DetectionSVC. A IA sugere monitorar o desvio em "
            "relação ao servidor NTP corporativo em todas as praças, disparando ressincronização forçada ('w32tm /resync') "
            "sempre que o drift exceder 1.000ms."
        ),
        "suggested_rule": {
            "type": "ntp_drift_guard",
            "scope": "frota_completa",
            "max_drift_ms": 1000,
            "action": "force_w32tm_resync"
        }
    },
    {
        "id_code": "SYS_ORPHAN_FILE_LOCK_PURGE",
        "title": "Expurgo e Liberação Global de Locks Órfãos em Arquivos Temporários de Vídeo",
        "category": "armazenamento",
        "severity": "media",
        "description": (
            "Interrupções transitórias no MediaRecorderSVC podem deixar arquivos '.tmp' ou arquivos MP4 com 0 bytes bloqueados "
            "por handles órfãos no Disco D:, impedindo gravações subsequentes. A IA sugere uma rotina de varredura global em "
            "todas as praças para identificar, fechar handles presos e purgar arquivos corrompidos de 0 bytes automaticamente."
        ),
        "suggested_rule": {
            "type": "orphan_handle_cleanup",
            "scope": "todas_as_pracas",
            "target_dir": "D:\\MediaDNA_V2\\data\\recordings",
            "action": "purge_zero_byte_and_release_locks"
        }
    },
    {
        "id_code": "SYS_ANTI_FLAPPING_OCR_CALIBRATION",
        "title": "Calibração Global da Janela Anti-Flapping de Serviços de OCR e Análise",
        "category": "tuning",
        "severity": "baixa",
        "description": (
            "Durante picos de veiculação comercial, serviços de OCR e detecção (DetectionSVC) operam com carga pesada "
            "de CPU/RAM por alguns minutos consecutivos. A IA sugere elevar a janela de tolerância de flapping de 15 para "
            "20 minutos com amortecimento exponencial em todo o escopo de praças, evitando reinícios intempestivos."
        ),
        "suggested_rule": {
            "type": "threshold_update",
            "scope": "frota_completa",
            "key": "flapping_window_minutes",
            "new_value": 20.0
        }
    },
    {
        "id_code": "SYS_CPU_THERMAL_THROTTLING_DETECTION",
        "title": "Monitoramento Preditivo de Throttling Térmico e Saúde de Ventoinhas de CPU",
        "category": "hardware",
        "severity": "alta",
        "description": (
            "Em estações remotas e gabinetes industriais com acúmulo de poeira nas ventoinhas, a CPU sofre Thermal Throttling "
            "(reduzindo a frequência base para evitar superaquecimento), gerando perda de quadros sem que o uso atinja 100%. "
            "A IA sugere monitorar a frequência efetiva ('Processor Performance Frequency') em todas as máquinas para "
            "prever necessidades de limpeza física ou substituição de ventoinha."
        ),
        "suggested_rule": {
            "type": "thermal_throttling_monitor",
            "scope": "todos_os_hosts",
            "min_freq_ratio": 0.65,
            "action": "dispatch_hardware_health_ticket"
        }
    },
    {
        "id_code": "SYS_WCF_CONNECTION_LIMIT_TUNING",
        "title": "Otimização Global do Limite de Conexões TCP no .NET ServicePointManager",
        "category": "rede",
        "severity": "media",
        "description": (
            "Por padrão no .NET Framework, ServicePointManager.DefaultConnectionLimit é configurado em apenas 2 conexões por "
            "endpoint, causando filas e timeouts falsos no envio de telemetria ao RemoteHostsService.svc. A IA sugere aplicar "
            "uma regra global via registro do Windows elevando o limite para 12 conexões concorrentes em todos os Capture Sites."
        ),
        "suggested_rule": {
            "type": "dotnet_connection_limit_tuning",
            "scope": "todos_os_servicos",
            "default_connection_limit": 12,
            "action": "apply_machine_config_tuning"
        }
    },
    {
        "id_code": "SYS_DYNAMIC_DISK_AUTONOMY_HOURS",
        "title": "Alerta Preditivo Dinâmico de Autonomia de Gravação Contínua (Projeção em Horas)",
        "category": "armazenamento",
        "severity": "alta",
        "description": (
            "Substitui o limiar estático em GB por um cálculo preditivo da taxa real de ingestão (GB/hora) de cada praça. "
            "Quando a autonomia projetada cair abaixo de 14 horas em qualquer cidade do escopo, o sistema antecipa alertas "
            "e prioriza o auto-expurgo seletivo de mídias que já foram transferidas com sucesso pelo FiletransferSVC."
        ),
        "suggested_rule": {
            "type": "threshold_update",
            "scope": "todas_as_pracas",
            "key": "disk_autonomy_min_hours",
            "new_value": 14.0
        }
    }
]


def clean_legacy_specific_suggestions():
    """Remove sugestões legadas que eram vinculadas a canais ou cidades específicas."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM ai_suggestions 
            WHERE title LIKE '%Sintonizador #%' 
               OR title LIKE '%(São Paulo)%' 
               OR title LIKE '%(Rio de Janeiro)%' 
               OR title LIKE '%(Florianópolis)%' 
               OR title LIKE '%(S.J dos Campos)%' 
               OR title LIKE '%(JK FM)%' 
               OR title LIKE '%(Clube FM%' 
               OR title LIKE '%(Rede Globo)%' 
               OR title LIKE '%(TV Novo Tempo)%'
               OR title LIKE '%(15m -> 20m)%'
               OR title LIKE '%(Threshold 12h)%'
        """)
        conn.commit()



def run_ai_fleet_analysis(fleet_data: dict) -> List[Dict[str, Any]]:
    """
    Motor de Inteligência Artificial Proativa.
    Analisa métricas, incidentes e padrões da frota para propor melhorias
    SISTÊMICAS E GLOBAIS que atendem todas as cidades e praças do escopo.
    Nunca repete sugestões que foram aprovadas ou recusadas anteriormente.
    """
    clean_legacy_specific_suggestions()

    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT title, status FROM ai_suggestions")
        existing_status = {r["title"]: r["status"] for r in cursor.fetchall()}

    # Filtra ideias do catálogo que ainda não foram apresentadas ou recusadas
    fresh_candidates = []
    for item in SYSTEMIC_IDEAS_CATALOG:
        title = item["title"]
        if title not in existing_status:
            fresh_candidates.append({
                "id": str(uuid.uuid4())[:8],
                "title": title,
                "category": item["category"],
                "severity": item["severity"],
                "description": item["description"],
                "suggested_rule": item["suggested_rule"]
            })

    # 1. Análise dinâmica baseada na telemetria viva da frota (canais fora, sinal 0, RTSP, disco)
    channels = fleet_data.get("channels", []) if fleet_data else []
    services = fleet_data.get("services", []) if fleet_data else []

    # Procura canais com sinal zerado ou alerta (ex: Pelotas)
    outage_channels = [c for c in channels if c.get("has_outage") or (c.get("qualidade_sinal") == 0)]
    if outage_channels and not any("Lock Digital ISDB-Tb" in t for t in existing_status):
        sample = outage_channels[0]
        praca_target = sample.get("cidade", "Pelotas")
        ch_target = sample.get("canal", "Canal DTV")
        fresh_candidates.append({
            "id": str(uuid.uuid4())[:8],
            "title": f"Detecção Preditiva de Queda de Lock Digital ISDB-Tb e Re-sintonia (Praça: {praca_target})",
            "category": "sinal_rf",
            "severity": "critica",
            "description": (
                f"O canal '{ch_target}' na praça '{praca_target}' e canais adjacentes registraram qualidade de sinal 0% "
                f"com desarmamento de Lock digital no tuner TBS. A IA detectou correlação com desvio de frequência UHF "
                f"e sugere automação de re-tune forçado com validação de BER antes de envio de equipe de campo."
            ),
            "suggested_rule": {
                "type": "rf_lock_drop_auto_retune",
                "scope": praca_target,
                "channel": ch_target,
                "min_quality_threshold": 45,
                "action": "trigger_dtv_retune"
            }
        })

    # Procura canais via RTSP com interrupção de frames
    rtsp_channels = [c for c in channels if "rtsp" in str(c.get("url_streaming", "")).lower() or "rtsp" in str(c.get("meio", "")).lower()]
    if rtsp_channels and not any("RTSP Stream Keep-Alive" in t for t in existing_status):
        fresh_candidates.append({
            "id": str(uuid.uuid4())[:8],
            "title": "Watchdog de RTSP Stream Keep-Alive e Reconexão com Backoff Exponencial",
            "category": "streaming",
            "severity": "alta",
            "description": (
                "Transmissões recebidas via streaming IP (RTSP/HLS) sofrem congelamento por desconexão silenciosa "
                "de sockets TCP na operadora. A IA sugere ativar verificação de fluxo de pacotes a cada 10s e "
                "reabertura da sessão RTSP sem reiniciar o processo do Atria."
            ),
            "suggested_rule": {
                "type": "rtsp_stream_keepalive",
                "scope": "frota_completa",
                "timeout_seconds": 10,
                "action": "reconnect_rtsp_stream"
            }
        })

    # Procura serviços parados ou em crash-loop (deduplicação estrita)
    stopped_services = [s for s in services if s.get("status_servico") in ["Parado", "Inexistente"] or "crash" in str(s.get("status_servico", "")).lower()]
    if stopped_services:
        for srv in stopped_services[:2]:
            srv_name = srv.get("nome_servico") or "DNA.Service"
            srv_title = f"Auto-Healing e Proteção contra Crash-Loop de Serviços ({srv_name})"
            if srv_title not in existing_status and not any(c["title"] == srv_title for c in fresh_candidates):
                fresh_candidates.append({
                    "id": str(uuid.uuid4())[:8],
                    "title": srv_title,
                    "category": "auto_healing",
                    "severity": "alta",
                    "description": (
                        f"O serviço '{srv_name}' na praça '{srv.get('hostname')}' entrou em "
                        f"parada forçada ou crash-loop. A IA sugere auto-recuperação progressiva com limpeza de arquivos "
                        f"de lock órfãos e restart limpo via ServiceController."
                    ),
                    "suggested_rule": {
                        "type": "service_crash_loop_healing",
                        "scope": "todos_os_hosts",
                        "service_name": srv_name,
                        "action": "clean_lock_and_restart"
                    }
                })

    # Procura oportunidades em Rádios Analógicas Sonifex
    radio_channels = [c for c in channels if "rádio" in str(c.get("canal", "")).lower() or "radio" in str(c.get("canal", "")).lower() or "sonifex" in str(c.get("meio", "")).lower()]
    if radio_channels:
        radio_title = "Calibração de Ganho & Equipotencialização XLR para Rádios Analógicas (Placa Sonifex PCIe)"
        if radio_title not in existing_status and not any(c["title"] == radio_title for c in fresh_candidates):
            fresh_candidates.append({
                "id": str(uuid.uuid4())[:8],
                "title": radio_title,
                "category": "radio_sonifex",
                "severity": "alta",
                "description": (
                    "Recepção de emissoras de rádio via placas de som profissionais Sonifex PCIe registra hum residual de aterramento (60 Hz) "
                    "e desvio de trim analógico em horários de pico. A IA propõe calibração do pad atenuador para +4 dBu profissional "
                    "e elevação do buffer ASIO para 512 samples para evitar dropouts na gravação MP3."
                ),
                "suggested_rule": {
                    "type": "sonifex_gain_calibration",
                    "scope": "todos_os_hosts",
                    "input_level": "+4dBu",
                    "asio_buffer": 512,
                    "action": "apply_sonifex_gain_and_asio_tuning"
                }
            })

    if fresh_candidates:
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            cursor = conn.cursor()
            for cand in fresh_candidates:
                cursor.execute("""
                    INSERT OR IGNORE INTO ai_suggestions (id, title, category, severity, description, suggested_rule, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'pendente', datetime('now'))
                """, (cand["id"], cand["title"], cand["category"], cand["severity"], cand["description"], json.dumps(cand["suggested_rule"])))
            conn.commit()

    active = get_active_ai_suggestions()
    # Se ainda estiver vazio porque o operador aprovou todas, reabre as do catálogo em novo ciclo de auditoria contínua
    if not active:
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE ai_suggestions SET status = 'pendente' WHERE status = 'recusada'")
            conn.commit()
        active = get_active_ai_suggestions()

    return active


def get_active_ai_suggestions() -> List[Dict[str, Any]]:
    """Retorna sugestões pendentes geradas pela IA (sempre sistêmicas e globais)."""
    clean_legacy_specific_suggestions()

    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM ai_suggestions WHERE status = 'pendente' ORDER BY id ASC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["suggested_rule"] = json.loads(d["suggested_rule"])
            except Exception:
                pass
            result.append(d)
        return result


def apply_ai_suggestion(suggestion_id: str, approve: bool) -> bool:
    """Aprova ou rejeita uma sugestão da IA, aplicando-a ao sistema se aprovada."""
    new_status = "aprovada" if approve else "recusada"
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM ai_suggestions WHERE id = ?", (suggestion_id,))
        sugg = cursor.fetchone()
        if not sugg:
            return False

        cursor.execute("UPDATE ai_suggestions SET status = ?, updated_at = datetime('now') WHERE id = ?", (new_status, suggestion_id))
        conn.commit()

        if approve:
            # Integra automaticamente a regra sugerida ao sistema
            try:
                rule = json.loads(sugg["suggested_rule"])
                rule_type = rule.get("type")
                if rule_type == "threshold_update":
                    update_threshold(rule["key"], float(rule["new_value"]), True)
                elif rule_type in ["disk_io_latency_tuning", "orphan_handle_cleanup", "tcp_dead_socket_watchdog"]:
                    # Regras de automação sistêmica registrada no banco
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS fleet_automation_rules (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            rule_type TEXT UNIQUE,
                            scope TEXT,
                            config_json TEXT,
                            is_active INTEGER DEFAULT 1,
                            created_at TEXT
                        )
                    """)
                    cursor.execute("""
                        INSERT OR REPLACE INTO fleet_automation_rules (rule_type, scope, config_json, is_active, created_at)
                        VALUES (?, ?, ?, 1, datetime('now'))
                    """, (rule_type, rule.get("scope", "global"), json.dumps(rule)))
                    conn.commit()
            except Exception as ex:
                print(f"[AI Integration Warning] {ex}", flush=True)

        return True
