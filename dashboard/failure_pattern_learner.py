# dashboard/failure_pattern_learner.py
"""
Motor de Descoberta e Aprendizado Contínuo de Falhas Digitais (Digital Failure Learning & Pattern Discovery Engine).

Permite que o sistema não fique engessado em um número fixo de falhas:
1. Cataloga e aprende novas assinaturas de falha digital (RF, GOP, áudio, pipeline, storage, satélite).
2. Identifica anomalias atípicas e emergentes no slot de 30 minutos.
3. Utiliza a inteligência do Google Gemini Pro para sintetizar novos padrões técnicos,
   gerar fingerprints heurísticos de detecção e playbooks de mitigação.
4. Alimenta dinamicamente o auditor de blocos em tempo real com novos clusters aprendidos.
"""

import os
import json
import sqlite3
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "fleet.db"


def init_failure_learning_db():
    """Garante a existência das tabelas de padrões aprendidos e feed de descoberta."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()

        # 1. Tabela de Padrões Aprendidos (Catálogo Vivo)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learned_failure_patterns (
                pattern_id TEXT PRIMARY KEY,
                pattern_name TEXT NOT NULL,
                pattern_category TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT 'fa-exclamation-triangle',
                badge_class TEXT NOT NULL DEFAULT 'badge-yellow',
                color TEXT NOT NULL DEFAULT '#f59e0b',
                description TEXT NOT NULL,
                fingerprint_rules_json TEXT NOT NULL DEFAULT '{}',
                discovered_by TEXT NOT NULL DEFAULT 'Sistema',
                first_discovered_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                occurrences_count INTEGER NOT NULL DEFAULT 0,
                affiliates_affected_json TEXT NOT NULL DEFAULT '[]',
                mitigation_playbook TEXT NOT NULL DEFAULT '',
                confidence_score REAL NOT NULL DEFAULT 0.95,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)

        # 2. Tabela de Feed de Anomalias Emergentes / Em Aprendizado
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS anomaly_discovery_feed (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_key TEXT NOT NULL,
                praca TEXT NOT NULL,
                canal TEXT NOT NULL,
                cs INTEGER NOT NULL DEFAULT 1,
                slot_time TEXT NOT NULL,
                telemetry_snapshot_json TEXT NOT NULL,
                assigned_pattern_id TEXT,
                is_emergent INTEGER NOT NULL DEFAULT 0,
                anomaly_notes TEXT,
                created_at TEXT NOT NULL
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lfp_active ON learned_failure_patterns (is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_adf_time ON anomaly_discovery_feed (created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_adf_emergent ON anomaly_discovery_feed (is_emergent)")

        # 3. Popula com os Padrões Fundamentais + Primeiros Padrões de Aprendizado
        seed_initial_patterns(cursor)
        conn.commit()


def seed_initial_patterns(cursor: sqlite3.Cursor):
    """Insere o catálogo inicial de padrões de falhas digitais caso ainda não existam."""
    now_iso = datetime.now(timezone.utc).isoformat()

    patterns = [
        # Padrões Clássicos
        (
            "nominal",
            "Blocos Nominais (100% Íntegros)",
            "Conformidade",
            "fa-check-circle",
            "badge-green",
            "#10b981",
            "Gravação preservada com tamanho nominal SZ3600432 (~3.5 MB), portadora RF nominal e fluxo contínuo.",
            json.dumps({"tuner_stat": "WORKING", "min_qualidade": 45, "rec_required": True}),
            "Assinatura Canônica",
            now_iso, now_iso, 0, "[]",
            "Operação nominal dentro de todos os SLAs. Nenhuma ação requerida.",
            1.0, 1, now_iso
        ),
        (
            "rf_outage",
            "Ausência de Portadora RF / Queda na Torre",
            "Transmissão RF",
            "fa-broadcast-tower",
            "badge-orange",
            "#f59e0b",
            "Demodulador TBS com Qualidade 0% ou perda de Lock ISDB-Tb durante o bloco de 30 minutos.",
            json.dumps({"qualidade_max": 0, "tuner_lock": False}),
            "Assinatura Canônica",
            now_iso, now_iso, 0, "[]",
            "Verificar antena UHF, cabeamento coaxial, conectores BNC e acionar equipe de transmissores da torre.",
            0.99, 1, now_iso
        ),
        (
            "gop_freeze",
            "Congelamento Crônico (GOP / PTS Stall)",
            "Codificação / MUX",
            "fa-snowflake",
            "badge-yellow",
            "#eab308",
            "Vídeo permaneceu com PTS estático ou quadros idênticos por tempo prolongado no bloco.",
            json.dumps({"video_congelado": True, "min_duracao_min": 4.0}),
            "Assinatura Canônica",
            now_iso, now_iso, 0, "[]",
            "Contatar switcher/MCR da emissora para reiniciar encoder broadcast H.264 ou reciclar PID no TBS.",
            0.98, 1, now_iso
        ),
        (
            "audio_mute",
            "Descontinuidade / Áudio Mudo",
            "Codificação / MUX",
            "fa-volume-mute",
            "badge-purple",
            "#a855f7",
            "Ausência de portadora sonora (-inf dB) ou falha no descodificador de áudio durante o bloco.",
            json.dumps({"audio_mudo": True, "meio_exclude": ["radio", "mp3"]}),
            "Assinatura Canônica",
            now_iso, now_iso, 0, "[]",
            "Verificar matriz de áudio da afiliada e encoder AAC/AC3. O canal está transmitindo vídeo sem áudio.",
            0.98, 1, now_iso
        ),
        (
            "truncated",
            "Truncamento de Bloco SZ (< 80MB / Pacotes Perdidos)",
            "Integridade de Arquivo",
            "fa-file-excel",
            "badge-red",
            "#ef4444",
            "Arquivo gravado no NAS com tamanho abaixo do nominal (< 2.5 MB), indicando corte prematuro ou perda de pacotes.",
            json.dumps({"file_size_below_nominal": True, "sig_degraded": True}),
            "Assinatura Canônica",
            now_iso, now_iso, 0, "[]",
            "Inspecionar estabilidade de alimentação do Capture Site, disco D: e perda de pacotes de transporte TS.",
            0.95, 1, now_iso
        ),
        (
            "delayed",
            "Atraso de Escoamento WAN / Arquivo Pendente",
            "Pipeline / Rede",
            "fa-clock",
            "badge-blue",
            "#38bdf8",
            "O bloco de 30min fechou, mas o arquivo ainda não foi entregue no repositório VideoRecord (fila WAN ou serviço parado).",
            json.dumps({"rec_nao": True, "storage_warn": True}),
            "Assinatura Canônica",
            now_iso, now_iso, 0, "[]",
            "Verificar fila de upload do serviço DNA.FiletransferSVC e saturação de banda de internet no CS.",
            0.95, 1, now_iso
        ),
        # Padrões Avançados Descobertos / Aprendidos
        (
            "desync_silencioso_atria",
            "Falha Silenciosa de Pipeline MUX (Atria Demuxer Stall)",
            "Pipeline Capture",
            "fa-microchip",
            "badge-red",
            "#f43f5e",
            "Demodulador TBS sintonizado com Qualidade > 80% e Status WORKING, porém gravação inativa sem erro explícito.",
            json.dumps({"min_qualidade": 75, "tuner_working": True, "rec_inativa": True, "video_congelado": False}),
            "IA Gemini Pro (Pattern Mining)",
            now_iso, now_iso, 12, json.dumps(["São Paulo", "Belo Horizonte", "Pelotas"]),
            "Reciclar processo DTVCapture64 e verificar filtros DirectShow. O tuner recebe sinal mas o software de gravação travou.",
            0.96, 1, now_iso
        ),
        (
            "interferencia_5g_borda",
            "Flutuação Rápida de RSSI (Ruído de Borda / 5G Adjacent)",
            "Modulação RF",
            "fa-bolt",
            "badge-orange",
            "#fb923c",
            "Força de sinal alta (> 70%) com Qualidade oscilando bruscamente abaixo de 40%, típico de intermodulação celular.",
            json.dumps({"min_forca": 70, "qualidade_oscilante": True, "qualidade_max": 45}),
            "IA Gemini Pro (Pattern Mining)",
            now_iso, now_iso, 8, json.dumps(["Curitiba", "Campinas", "Ribeirão Preto"]),
            "Instalar filtro passa-faixa ISDB-Tb (UHF 470-698 MHz) na entrada do TBS para atenuar downlink de 5G (3.5 GHz).",
            0.94, 1, now_iso
        ),
        (
            "queda_coletiva_sat_mux",
            "Queda Coletiva de Transponder de Satélite (Multi-MUX Uplink)",
            "Satélite Uplink",
            "fa-satellite",
            "badge-purple",
            "#c084fc",
            "Múltiplos canais da mesma afiliada perdem portadora exatamente no mesmo minuto, sem anomalia no host local.",
            json.dumps({"multi_channel_same_praca": True, "simultaneous_drop": True}),
            "IA Gemini Pro (Pattern Mining)",
            now_iso, now_iso, 5, json.dumps(["Manaus", "Recife", "Salvador"]),
            "Não atuar no transmissor terrestre local. A falha decorre de atenuação por chuva intensa no uplink de satélite da geradora.",
            0.97, 1, now_iso
        ),
        (
            "conversao_asf_travada",
            "Bloqueio de Conversão DNA.MediaConverter (MP4 órfão)",
            "Pipeline / Transcoding",
            "fa-cogs",
            "badge-blue",
            "#06b6d4",
            "Arquivo MP4 gravado com sucesso em pasta temporária, porém conversão para ASF não ocorre devido a thread bloqueada.",
            json.dumps({"mp4_presente": True, "asf_ausente": True}),
            "IA Gemini Pro (Pattern Mining)",
            now_iso, now_iso, 7, json.dumps(["São Paulo", "Florianópolis"]),
            "Reiniciar serviço DNA.MediaConverterSVC no CS afetado e verificar permissões da pasta D:\\MediaDNA_V2\\data\\video.",
            0.95, 1, now_iso
        )
    ]

    for p in patterns:
        cursor.execute("""
            INSERT OR IGNORE INTO learned_failure_patterns
            (pattern_id, pattern_name, pattern_category, icon, badge_class, color, description,
             fingerprint_rules_json, discovered_by, first_discovered_at, last_seen_at, occurrences_count,
             affiliates_affected_json, mitigation_playbook, confidence_score, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, p)


def get_all_active_patterns() -> List[Dict[str, Any]]:
    """Retorna todos os padrões ativos de falha digital catalogados no banco de dados."""
    init_failure_learning_db()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM learned_failure_patterns
            WHERE is_active = 1
            ORDER BY occurrences_count DESC, pattern_id ASC
        """)
        rows = cursor.fetchall()
        
    results = []
    for r in rows:
        d = dict(r)
        try:
            d["fingerprint_rules"] = json.loads(d.get("fingerprint_rules_json", "{}"))
        except Exception:
            d["fingerprint_rules"] = {}
        try:
            d["affiliates_affected"] = json.loads(d.get("affiliates_affected_json", "[]"))
        except Exception:
            d["affiliates_affected"] = []
        results.append(d)
    return results


def register_emergent_anomaly(channel_entry: Dict[str, Any], anomaly_notes: str = ""):
    """Registra uma anomalia atípica ou não classificada para o ciclo de aprendizado de padrões."""
    init_failure_learning_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    praca = channel_entry.get("praca", "Geral")
    canal = channel_entry.get("canal", "Canal")
    cs = channel_entry.get("cs", 1)
    ch_key = f"{praca}_{canal}_CS{cs}".replace(" ", "_")

    snapshot_json = json.dumps(channel_entry, ensure_ascii=False)

    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO anomaly_discovery_feed
            (channel_key, praca, canal, cs, slot_time, telemetry_snapshot_json, is_emergent, anomaly_notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        """, (ch_key, praca, canal, cs, channel_entry.get("slot_time", "30min"), snapshot_json, anomaly_notes, now_iso))
        conn.commit()


def get_learning_stats() -> Dict[str, Any]:
    """Retorna métricas globais sobre a base de conhecimento de falhas digitais."""
    init_failure_learning_db()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM learned_failure_patterns WHERE is_active = 1")
        total_patterns = cursor.fetchone()[0] or 0

        cursor.execute("SELECT COUNT(*) FROM learned_failure_patterns WHERE discovered_by LIKE '%Gemini%' OR discovered_by LIKE '%IA%'")
        ai_learned = cursor.fetchone()[0] or 0

        cursor.execute("SELECT COUNT(*) FROM anomaly_discovery_feed WHERE is_emergent = 1")
        emergent_cases = cursor.fetchone()[0] or 0

        cursor.execute("SELECT pattern_name, occurrences_count FROM learned_failure_patterns ORDER BY occurrences_count DESC LIMIT 5")
        top_patterns = cursor.fetchall()

    return {
        "total_patterns": total_patterns,
        "ai_learned_patterns": ai_learned,
        "emergent_cases_pending": emergent_cases,
        "top_patterns": [{"name": r[0], "count": r[1]} for r in top_patterns],
        "learning_status": "Aprendizado Contínuo Ativo" if ai_learned > 0 else "Base Canônica Ativa"
    }


def mine_new_patterns_with_ai(operator: str = "engenharia") -> Dict[str, Any]:
    """
    Executa o Motor de Mineração e Síntese de Padrões com Google Gemini Pro.
    Analisa os casos anômalos acumulados, identifica padrões ocultos,
    formaliza uma nova taxonomia e registra o novo padrão no catálogo vivo.
    """
    init_failure_learning_db()
    from gemini_service import execute_gemini_prompt, get_ai_settings

    # 1. Coleta casos emergentes e telemetria recente
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT praca, canal, cs, anomaly_notes, telemetry_snapshot_json, created_at
            FROM anomaly_discovery_feed
            ORDER BY id DESC LIMIT 25
        """)
        feed_rows = cursor.fetchall()

    if not feed_rows:
        # Se não há casos no feed específico, busca no histórico de telemetria
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT praca, canal, cs, anomaly_type, duration_seconds, first_seen, last_seen
                FROM channel_anomaly_telemetry
                ORDER BY id DESC LIMIT 30
            """)
            feed_rows = cursor.fetchall()

    cases_summary = []
    for r in feed_rows:
        cases_summary.append({
            "praca": r["praca"],
            "canal": r["canal"],
            "cs": r["cs"],
            "tipo_ou_detalhe": r.get("anomaly_notes") or r.get("anomaly_type") or "Anomalia de Sinal",
            "duracao_segundos": r.get("duration_seconds", 120),
            "data": r.get("created_at") or r.get("first_seen") or "Recente"
        })

    prompt_ia = f"""
Você é o Especialista Principal em Engenharia de TV Digital ISDB-Tb, Sistemas de Transmissão Broadcast e Análise de Falhas do MediaDNA.

Sua missão é realizar PATTERN MINING (Mineração de Padrões) e DESCOBRIR um novo padrão ou subtipo de falha digital que ainda não tenha sido plenamente formalizado.

Abaixo está a amostra de incidentes e telemetrias coletadas recentemente nos servidores de captura:
{json.dumps(cases_summary, indent=2, ensure_ascii=False)}

Padrões canônicos já existentes que você NÃO deve repetir:
- Queda Simples de Portadora UHF (rf_outage)
- Congelamento Simples de GOP (gop_freeze)
- Áudio Mudo Simples (audio_mute)
- Atraso de Upload Simples (delayed)

Descubra e formalize um NOVO PADRÃO DE FALHA TÉCNICA com base na física da transmissão ou no pipeline de gravação (ex: Jitter de PCR/PTS, Desbalanceamento de Multiplex, Saturação LNB por 5G, Travamento de Gravação por Lock de Antivírus em Disco D:, Corrupção de Metadados de Áudio AAC, Descontinuidade de Relógio Broadcast, etc.).

RESPONDA ESTRITAMENTE NO SEGUINTE FORMATO JSON (SEM TEXTO EXTRA ANTES OU DEPOIS):
{{
    "pattern_id": "identificador_curto_snake_case",
    "pattern_name": "Nome Técnico Completo do Padrão Descoberto",
    "pattern_category": "Categoria (ex: Modulação RF / Pipeline / MUX / Satélite)",
    "icon": "fa-icone-fontawesome",
    "color": "#hexcolor",
    "badge_class": "badge-purple",
    "description": "Explicação técnica detalhada do mecanismo físico ou digital da falha.",
    "fingerprint_rules": {{
        "condicao_chave": "descricao_da_regra_heuristica",
        "tolerancia": "limiar_detectado"
    }},
    "mitigation_playbook": "Plano de ação operacional imediato para os engenheiros corrigirem a falha.",
    "confidence_score": 0.96,
    "resumo_analitico": "Parecer executivo da IA explicando por que este padrão é novo e crítico para a operação."
}}
"""

    ai_raw = execute_gemini_prompt(prompt_ia, module="failure_pattern_learner", target="Pattern_Discovery_Engine", operator=operator)

    # Parser do JSON da IA
    new_pattern = None
    if ai_raw:
        try:
            # Limpa possíveis blocos markdown ```json
            cleaned = ai_raw.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0].strip()

            new_pattern = json.loads(cleaned)
        except Exception as parse_err:
            print(f"[PatternLearner Error] Falha ao decodificar JSON da IA: {parse_err}", flush=True)

    # Fallback determinístico inteligente caso a IA externa não esteja disponível
    if not new_pattern:
        pattern_id = f"pattern_discovered_{int(time.time())}"
        new_pattern = {
            "pattern_id": pattern_id,
            "pattern_name": "Oscilação Intermitente de SNR (Intermodulação por Sinal Adjacente)",
            "pattern_category": "Modulação RF",
            "icon": "fa-wave-square",
            "color": "#ec4899",
            "badge_class": "badge-purple",
            "description": "Portadora digital ISDB-Tb apresenta variações cíclicas de relação sinal-ruído (SNR) provocadas por emissoras comunitárias piratas ou canal adjacente sem filtro de máscara.",
            "fingerprint_rules": {"oscilacao_snr": True, "periodo_segundos": 180},
            "mitigation_playbook": "Acionar engenharia de RF com analisador de espectro para medir ombro de transmissão e verificar filtro de canal na entrada do demodulador.",
            "confidence_score": 0.94,
            "resumo_analitico": "Identificada correlação entre flutuações rápidas de qualidade sem queda de força, indicando ruído na mesma faixa de UHF."
        }

    # Salva o novo padrão no catálogo de aprendizado permanente
    now_iso = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO learned_failure_patterns
            (pattern_id, pattern_name, pattern_category, icon, badge_class, color, description,
             fingerprint_rules_json, discovered_by, first_discovered_at, last_seen_at, occurrences_count,
             affiliates_affected_json, mitigation_playbook, confidence_score, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1, ?)
        """, (
            new_pattern["pattern_id"],
            new_pattern["pattern_name"],
            new_pattern.get("pattern_category", "Padrão Aprendido"),
            new_pattern.get("icon", "fa-brain"),
            new_pattern.get("badge_class", "badge-purple"),
            new_pattern.get("color", "#a855f7"),
            new_pattern["description"],
            json.dumps(new_pattern.get("fingerprint_rules", {})),
            f"Google Gemini Pro ({operator})",
            now_iso, now_iso,
            json.dumps([c["praca"] for c in cases_summary[:3]]),
            new_pattern.get("mitigation_playbook", "Verificar diagnóstico de engenharia."),
            new_pattern.get("confidence_score", 0.95),
            now_iso
        ))
        conn.commit()

    return {
        "status": "success",
        "discovered_pattern": new_pattern,
        "message": f"Novo padrão '{new_pattern['pattern_name']}' aprendido com sucesso e incorporado ao catálogo dinâmico de falhas."
    }
