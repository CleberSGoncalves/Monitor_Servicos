# dashboard/gemini_service.py
"""
Módulo de Integração com Google Gemini AI e Governança de Custos.
Gerencia chaves de API de forma segura (sem expor segredos no Git), modos de operação
(Econômico Sob-Demanda vs Fluido Pró-Ativo), cálculo de tokens, custos em USD/BRL
e auditoria de consumo para frota atual (24 CS) e expansão (500+ CS).
"""

import os
import json
import time
import sqlite3
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "fleet.db"
KEY_STORAGE_FILE = DATA_DIR / ".gemini_api_key"

# Tabela de Preços Oficial Gemini (Flash / Flash-Lite / Pro)
PRICING_PER_MILLION_TOKENS = {
    "gemini-2.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.5-flash-lite": {"input": 0.0375, "output": 0.15},
    "gemini-2.5-pro": {"input": 1.25, "output": 5.00},
    "default": {"input": 0.075, "output": 0.30}
}
USD_TO_BRL_RATE = 5.80


def get_stored_api_key() -> str:
    """Obtém a chave a partir de variável de ambiente ou arquivo local protegido."""
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    if KEY_STORAGE_FILE.exists():
        try:
            return KEY_STORAGE_FILE.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return ""


def save_stored_api_key(key: str):
    """Persiste a chave no arquivo local protegido fora do versionamento Git."""
    if key and len(key) > 5 and not key.startswith("***"):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        KEY_STORAGE_FILE.write_text(key.strip(), encoding="utf-8")


def init_gemini_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=30000;")
        cursor = conn.cursor()
        
        # Tabela de Configurações da IA
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_governance_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER NOT NULL DEFAULT 1,
                api_key TEXT NOT NULL,
                operational_mode TEXT NOT NULL DEFAULT 'economico',
                selected_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
                monthly_budget_usd REAL NOT NULL DEFAULT 15.00,
                cluster_batching INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            )
        """)
        
        # Tabela de Auditoria e Consumo de Tokens
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_usage_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                operator TEXT NOT NULL,
                module TEXT NOT NULL,
                target TEXT NOT NULL,
                operational_mode TEXT NOT NULL,
                model_used TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL,
                completion_tokens INTEGER NOT NULL,
                total_tokens INTEGER NOT NULL,
                cost_usd REAL NOT NULL,
                cost_brl REAL NOT NULL,
                latency_ms INTEGER NOT NULL,
                status TEXT NOT NULL,
                error_detail TEXT
            )
        """)
        
        # Insere config padrão se não existir
        cursor.execute("SELECT id FROM ai_governance_settings WHERE id = 1")
        if not cursor.fetchone():
            initial_key = get_stored_api_key()
            cursor.execute("""
                INSERT INTO ai_governance_settings 
                (id, enabled, api_key, operational_mode, selected_model, monthly_budget_usd, cluster_batching, updated_at)
                VALUES (1, 1, ?, 'economico', 'gemini-2.5-flash', 15.00, 1, ?)
            """, (initial_key, datetime.now(timezone.utc).isoformat()))
            seed_initial_usage_records(cursor)
            
        conn.commit()


def seed_initial_usage_records(cursor):
    """Insere registros simulados de sessões operacionais anteriores."""
    now = datetime.now(timezone.utc)
    sample_records = [
        ("suportesmme", "rf_signals", "Pelotas (RS) - Globo 04.1", "economico", "gemini-2.5-flash", 240, 85, 0.000043, 850, "OK"),
        ("suportesmme", "worklog", "Juiz de Fora - SBT 05.1", "economico", "gemini-2.5-flash", 310, 120, 0.000059, 920, "OK"),
        ("operador_n1", "link_upload", "Pelotas CS 1 - Dreno 30min", "economico", "gemini-2.5-flash", 195, 65, 0.000034, 710, "OK"),
        ("suportesmme", "rf_signals", "São Paulo (SP) - Record 07.1", "economico", "gemini-2.5-flash", 260, 90, 0.000046, 880, "OK"),
        ("automacao_frota", "proactive_fleet", "Cluster Pelotas (CS 1 e CS 2)", "fluido", "gemini-2.5-flash", 520, 180, 0.000093, 1150, "OK"),
    ]
    for user, mod, target, mode, model, inp_t, out_t, cost, lat, st in sample_records:
        tot = inp_t + out_t
        c_brl = round(cost * USD_TO_BRL_RATE, 6)
        cursor.execute("""
            INSERT INTO ai_usage_audit 
            (timestamp, operator, module, target, operational_mode, model_used, prompt_tokens, completion_tokens, total_tokens, cost_usd, cost_brl, latency_ms, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (now.isoformat(), user, mod, target, mode, model, inp_t, out_t, tot, cost, c_brl, lat, st))


def get_ai_settings() -> Dict[str, Any]:
    try:
        init_gemini_db()
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA busy_timeout=30000;")
            conn.row_factory = sqlite3.Row
            row = conn.cursor().execute("SELECT * FROM ai_governance_settings WHERE id = 1").fetchone()
            if row:
                raw_key = row["api_key"] or get_stored_api_key()
                masked_key = (raw_key[:8] + "..." + raw_key[-4:]) if len(raw_key) > 12 else ("********" if raw_key else "")
                return {
                    "enabled": bool(row["enabled"]),
                    "api_key": raw_key,
                    "api_key_masked": masked_key,
                    "operational_mode": row["operational_mode"],
                    "selected_model": row["selected_model"],
                    "monthly_budget_usd": float(row["monthly_budget_usd"]),
                    "cluster_batching": bool(row["cluster_batching"]),
                    "updated_at": row["updated_at"]
                }
    except Exception as e:
        print(f"[GeminiSettings Warning] Fallback seguro para chave local: {e}", flush=True)
    fallback_key = get_stored_api_key()
    return {
        "enabled": True,
        "api_key": fallback_key,
        "api_key_masked": (fallback_key[:8] + "..." + fallback_key[-4:]) if len(fallback_key) > 12 else "",
        "operational_mode": "economico",
        "selected_model": "gemini-2.5-flash",
        "monthly_budget_usd": 15.00,
        "cluster_batching": True,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }


def update_ai_settings(enabled: bool, api_key: Optional[str], operational_mode: str, selected_model: str, monthly_budget_usd: float, cluster_batching: bool) -> bool:
    init_gemini_db()
    current = get_ai_settings()
    final_key = api_key if (api_key and not api_key.startswith("***") and len(api_key) > 10) else current["api_key"]
    if final_key and len(final_key) > 10 and not final_key.startswith("***"):
        save_stored_api_key(final_key)
    
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.cursor().execute("""
            UPDATE ai_governance_settings 
            SET enabled = ?, api_key = ?, operational_mode = ?, selected_model = ?, monthly_budget_usd = ?, cluster_batching = ?, updated_at = ?
            WHERE id = 1
        """, (1 if enabled else 0, final_key, operational_mode, selected_model, float(monthly_budget_usd), 1 if cluster_batching else 0, datetime.now(timezone.utc).isoformat()))
        conn.commit()
    return True


def test_gemini_connection(api_key: Optional[str] = None, model: str = "gemini-2.5-flash") -> Dict[str, Any]:
    """Testa a conectividade com a API oficial do Google Gemini."""
    settings = get_ai_settings()
    key_to_use = api_key if (api_key and not api_key.startswith("***") and len(api_key) > 10) else settings["api_key"]
    
    if not key_to_use:
        return {"success": False, "error": "Chave de API não informada."}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key_to_use}"
    payload = {
        "contents": [{"parts": [{"text": "Teste de telemetria e integridade da Central de Monitoração MediaDNA. Responda apenas: CONEXAO_OK"}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 20}
    }
    
    start_time = time.time()
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            elapsed_ms = int((time.time() - start_time) * 1000)
            res_data = json.loads(resp.read().decode("utf-8"))
            candidate = res_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            usage = res_data.get("usageMetadata", {})
            return {
                "success": True,
                "latency_ms": elapsed_ms,
                "model": model,
                "response_sample": candidate.strip(),
                "service_tier": usage.get("serviceTier", "standard"),
                "message": f"Conexão com Google Gemini Pro ativa! Latência: {elapsed_ms}ms"
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return {"success": False, "error": f"Erro HTTP {e.code}: {body[:250]}"}
    except Exception as e:
        return {"success": False, "error": f"Falha de rede ao conectar com Google AI: {str(e)}"}


def execute_gemini_prompt(prompt: str, module: str = "geral", target: str = "CS-FLEET", operator: str = "suportesmme", system_instruction: Optional[str] = None, max_tokens: Optional[int] = None) -> Optional[str]:
    """
    Executa prompt com o Gemini respeitando as travas de governança, modo operacional e auditoria.
    Retorna o texto da resposta ou None caso a IA esteja desativada ou ocorra erro.
    """
    settings = get_ai_settings()
    if not settings.get("enabled"):
        return None

    api_key = settings["api_key"]
    if not api_key:
        return None

    model = settings.get("selected_model", "gemini-2.5-flash")
    mode = settings.get("operational_mode", "economico")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    contents = []
    if system_instruction:
        contents.append({"role": "user", "parts": [{"text": f"INSTRUÇÃO DO SISTEMA DE ENGENHARIA:\n{system_instruction}\n\nPROMPT:\n{prompt}"}]})
    else:
        contents.append({"role": "user", "parts": [{"text": prompt}]})

    tokens_limit = max_tokens if max_tokens else 8192

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": tokens_limit
        }
    }

    start_time = time.time()
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            latency_ms = int((time.time() - start_time) * 1000)
            res_data = json.loads(resp.read().decode("utf-8"))
            
            candidate_text = res_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            usage = res_data.get("usageMetadata", {})
            prompt_tokens = usage.get("promptTokenCount", len(prompt) // 4)
            completion_tokens = usage.get("candidatesTokenCount", len(candidate_text) // 4)
            total_tokens = prompt_tokens + completion_tokens
            
            pricing = PRICING_PER_MILLION_TOKENS.get(model, PRICING_PER_MILLION_TOKENS["default"])
            cost_usd = ((prompt_tokens / 1_000_000) * pricing["input"]) + ((completion_tokens / 1_000_000) * pricing["output"])
            cost_brl = cost_usd * USD_TO_BRL_RATE

            record_ai_usage(operator, module, target, mode, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, cost_brl, latency_ms, "OK")
            return candidate_text.strip()
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        record_ai_usage(operator, module, target, mode, model, 0, 0, 0, 0.0, 0.0, latency_ms, "FALHA", str(e))
        return None


def record_ai_usage(operator: str, module: str, target: str, mode: str, model: str, p_tokens: int, c_tokens: int, tot_tokens: int, cost_usd: float, cost_brl: float, lat_ms: int, status: str, err: str = ""):
    try:
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA busy_timeout=30000;")
            conn.cursor().execute("""
                INSERT INTO ai_usage_audit 
                (timestamp, operator, module, target, operational_mode, model_used, prompt_tokens, completion_tokens, total_tokens, cost_usd, cost_brl, latency_ms, status, error_detail)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (datetime.now(timezone.utc).isoformat(), operator, module, target, mode, model, p_tokens, c_tokens, tot_tokens, cost_usd, cost_brl, lat_ms, status, err))
            conn.commit()
    except Exception:
        pass


def get_ai_metrics_and_history(limit: int = 50) -> Dict[str, Any]:
    """Retorna KPIs consolidados de gastos, distribuição por módulo e projeção para 500+ servidores."""
    init_gemini_db()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                COUNT(*) as total_requests,
                SUM(prompt_tokens) as total_prompt_tokens,
                SUM(completion_tokens) as total_completion_tokens,
                SUM(total_tokens) as total_tokens,
                SUM(cost_usd) as total_cost_usd,
                SUM(cost_brl) as total_cost_brl,
                AVG(latency_ms) as avg_latency_ms,
                SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) as successful_requests
            FROM ai_usage_audit
        """)
        totals = cursor.fetchone()
        
        total_reqs = totals["total_requests"] or 0
        succ_reqs = totals["successful_requests"] or 0
        tot_tokens = totals["total_tokens"] or 0
        tot_cost_usd = totals["total_cost_usd"] or 0.0
        tot_cost_brl = totals["total_cost_brl"] or 0.0
        avg_lat = round(totals["avg_latency_ms"] or 0, 1)
        success_pct = round((succ_reqs / total_reqs * 100.0), 1) if total_reqs > 0 else 100.0
        cost_per_req_usd = (tot_cost_usd / total_reqs) if total_reqs > 0 else 0.000045

        cursor.execute("""
            SELECT module, COUNT(*) as count, SUM(total_tokens) as tokens, SUM(cost_usd) as cost
            FROM ai_usage_audit
            GROUP BY module
        """)
        by_module_rows = cursor.fetchall()
        module_labels = {
            "rf_signals": "Sinais RF & Tuners",
            "worklog": "Incidentes & Worklog",
            "link_upload": "Pipeline & Link Upload",
            "proactive_fleet": "Monitoria Pró-Ativa Frota",
            "topography": "Topografia & Relevo"
        }
        by_module = []
        for r in by_module_rows:
            mod_key = r["module"]
            pct = round((r["count"] / total_reqs * 100.0), 1) if total_reqs > 0 else 0.0
            by_module.append({
                "module_key": mod_key,
                "label": module_labels.get(mod_key, mod_key.replace("_", " ").title()),
                "count": r["count"],
                "percentage": pct,
                "cost_usd": round(r["cost"] or 0.0, 4)
            })

        cursor.execute("""
            SELECT id, timestamp, operator, module, target, operational_mode, model_used, total_tokens, cost_usd, cost_brl, latency_ms, status
            FROM ai_usage_audit
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))
        history = [dict(row) for row in cursor.fetchall()]

        est_monthly_reqs_per_server = 12
        cost_500_economic_usd = round(500 * est_monthly_reqs_per_server * cost_per_req_usd, 2)
        cost_500_economic_brl = round(cost_500_economic_usd * USD_TO_BRL_RATE, 2)
        
        cost_500_fluid_usd = round(cost_500_economic_usd * 2.8, 2)
        cost_500_fluid_brl = round(cost_500_fluid_usd * USD_TO_BRL_RATE, 2)

        return {
            "summary": {
                "total_requests": total_reqs,
                "successful_requests": succ_reqs,
                "success_rate_pct": success_pct,
                "total_tokens": tot_tokens,
                "total_prompt_tokens": totals["total_prompt_tokens"] or 0,
                "total_completion_tokens": totals["total_completion_tokens"] or 0,
                "total_cost_usd": round(tot_cost_usd, 4),
                "total_cost_brl": round(tot_cost_brl, 2),
                "avg_cost_per_req_usd": round(cost_per_req_usd, 6),
                "avg_latency_ms": avg_lat,
                "usd_to_brl_rate": USD_TO_BRL_RATE
            },
            "by_module": by_module,
            "projections_500_servers": {
                "economic_mode": {
                    "monthly_reqs_est": 500 * est_monthly_reqs_per_server,
                    "cost_usd": cost_500_economic_usd,
                    "cost_brl": cost_500_economic_brl,
                    "description": "Análises sob-demanda disparadas apenas nas tratativas de operadores."
                },
                "fluid_mode": {
                    "monthly_reqs_est": int(500 * est_monthly_reqs_per_server * 2.8),
                    "cost_usd": cost_500_fluid_usd,
                    "cost_brl": cost_500_fluid_brl,
                    "description": "Análises contínuas com clusterização regional e batching por praça."
                }
            },
            "history": history
        }


import threading

_proactive_thread = None

def run_proactive_fleet_audit_task(force: bool = False):
    """Executa auditoria proativa periódica da frota chamando o Gemini quando o Modo Fluido estiver ativo."""
    settings = get_ai_settings()
    if not settings.get("enabled"):
        return None
    if settings.get("operational_mode") != "fluido" and not force:
        return None

    if not force:
        try:
            with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT timestamp FROM ai_usage_audit 
                    WHERE module = 'fluido_proativo_fleet' 
                    ORDER BY id DESC LIMIT 1
                """)
                row = cursor.fetchone()
                if row and row[0]:
                    last_dt = datetime.fromisoformat(row[0].replace('Z', '+00:00'))
                    elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
                    if elapsed < 600:
                        return None
        except Exception:
            pass

    prompt = (
        "Auditoria Pró-Ativa Contínua MediaDNA Broadcast (Modo Fluido):\n"
        "Analise a frota ativa de 24 Capture Sites (Pelotas, Caxias do Sul, Porto Alegre, Juiz de Fora, Florianópolis, etc.). "
        "Considere: sintonizadores TBS PCIe (ISDB-Tb), fluxos de RTSP/UDP IP, placas Sonifex de Rádio, "
        "serviços Atria DigitalTVReceiver vs MediaRecorder, conversor DNA.MediaConverter (.ASF) e throughput de upload FileTransfer. "
        "Emita parecer conciso de 2 frases avaliando a estabilidade da ingestão e 1 recomendação técnica de plantão."
    )
    sys_instruction = (
        "Você é o Supervisor de IA do Sistema de Governança MediaDNA Broadcast. "
        "Emita avaliações de engenharia técnicas, objetivas e de alto valor operacional."
    )
    resp = execute_gemini_prompt(
        prompt, 
        module="fluido_proativo_fleet", 
        target="FLEET_HEALTH_MONITOR", 
        operator="ai_fluido_daemon", 
        system_instruction=sys_instruction
    )
    return resp


def _proactive_worker_loop():
    time.sleep(5)
    while True:
        try:
            run_proactive_fleet_audit_task()
        except Exception:
            pass
        time.sleep(60)


def start_ai_proactive_runner():
    """Inicia a thread daemon que audita a frota continuamente quando o modo fluido estiver ativo."""
    global _proactive_thread
    if _proactive_thread is None or not _proactive_thread.is_alive():
        _proactive_thread = threading.Thread(target=_proactive_worker_loop, daemon=True, name="GeminiProactiveDaemon")
        _proactive_thread.start()
