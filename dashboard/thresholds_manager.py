import sqlite3
from typing import List, Dict, Any
from config import DATA_DIR

DB_PATH = DATA_DIR / "fleet.db"

DEFAULT_THRESHOLDS = [
    {
        "key": "cpu_max_percent",
        "name": "Uso Máximo de CPU",
        "category": "sistema",
        "value": 85.0,
        "unit": "%",
        "is_enabled": 1,
        "description": "Alerta amarelo se o processador ultrapassar este limite contínuo."
    },
    {
        "key": "ram_max_percent",
        "name": "Uso Máximo de RAM",
        "category": "sistema",
        "value": 90.0,
        "unit": "%",
        "is_enabled": 1,
        "description": "Alerta se a memória da máquina ou serviço ultrapassar 90%."
    },
    {
        "key": "disk_d_min_gb",
        "name": "Espaço Livre Mínimo no Disco D:",
        "category": "armazenamento",
        "value": 10.0,
        "unit": "GB",
        "is_enabled": 1,
        "description": "Alerta de esgotamento de unidade de gravação se estiver abaixo deste valor."
    },
    {
        "key": "downtime_min_alert_minutes",
        "name": "Tempo Mínimo de Queda para Alarme",
        "category": "canais",
        "value": 3.0,
        "unit": "min",
        "is_enabled": 1,
        "description": "Tempo contínuo que o canal precisa estar congelado ou mudo para disparar incidente."
    },
    {
        "key": "rf_signal_quality_min",
        "name": "Qualidade Mínima de Sinal RF",
        "category": "canais",
        "value": 45.0,
        "unit": "%",
        "is_enabled": 1,
        "description": "Sinal considerado degradado se a qualidade média ficar abaixo deste limiar."
    },
    {
        "key": "rf_signal_strength_min",
        "name": "Força Mínima de Sinal RF",
        "category": "canais",
        "value": 40.0,
        "unit": "%",
        "is_enabled": 1,
        "description": "Limiar mínimo para sintonizadores e multiplexes DTV."
    },
    {
        "key": "disk_autonomy_min_hours",
        "name": "Autonomia Mínima de Gravação MP4",
        "category": "armazenamento",
        "value": 8.0,
        "unit": "horas",
        "is_enabled": 1,
        "description": "Tempo preditivo mínimo restante de gravação contínua antes de lotar o disco."
    },
    {
        "key": "flapping_max_restarts",
        "name": "Limite de Reinícios (Anti-Flapping)",
        "category": "servicos",
        "value": 3.0,
        "unit": "restarts",
        "is_enabled": 1,
        "description": "Número máximo de quedas em 15 minutos antes de bloquear AutoRestart."
    }
]


def init_thresholds():
    """Popula os limiares padrão se ainda não existirem."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alert_thresholds (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT NOT NULL,
                is_enabled INTEGER DEFAULT 1,
                description TEXT
            )
        """)
        for t in DEFAULT_THRESHOLDS:
            cursor.execute("""
                INSERT OR IGNORE INTO alert_thresholds (key, name, category, value, unit, is_enabled, description)
                VALUES (:key, :name, :category, :value, :unit, :is_enabled, :description)
            """, t)
        conn.commit()


def get_all_thresholds() -> List[Dict[str, Any]]:
    """Retorna todos os limiares configurados."""
    init_thresholds()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM alert_thresholds ORDER BY category, name")
        return [dict(r) for r in cursor.fetchall()]


def update_threshold(key: str, value: float, is_enabled: bool) -> bool:
    """Atualiza o valor e ativação de um limiar."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE alert_thresholds 
            SET value = ?, is_enabled = ?
            WHERE key = ?
        """, (value, 1 if is_enabled else 0, key))
        conn.commit()
        return cursor.rowcount > 0


def update_thresholds_batch(items: List[Dict[str, Any]]) -> bool:
    """Atualiza múltiplos limiares em uma única transação atômica."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        for item in items:
            key = item.get("key")
            val = float(item.get("value", 0.0))
            is_en = 1 if item.get("is_enabled", True) else 0
            cursor.execute("""
                UPDATE alert_thresholds 
                SET value = ?, is_enabled = ?
                WHERE key = ?
            """, (val, is_en, key))
        conn.commit()
        return True


def reset_thresholds_to_defaults() -> bool:
    """Restaura todos os limiares para os valores de fábrica (DEFAULT_THRESHOLDS)."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        for t in DEFAULT_THRESHOLDS:
            cursor.execute("""
                UPDATE alert_thresholds 
                SET value = ?, is_enabled = ?, description = ?
                WHERE key = ?
            """, (t["value"], t["is_enabled"], t["description"], t["key"]))
        conn.commit()
        return True


def add_or_register_threshold(key: str, name: str, category: str, value: float, unit: str, is_enabled: bool = True, description: str = "") -> bool:
    """Cadastra ou atualiza um novo limiar de monitoramento no banco (usado pela homologação de IA)."""
    init_thresholds()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO alert_thresholds (key, name, category, value, unit, is_enabled, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                name = excluded.name,
                category = excluded.category,
                value = excluded.value,
                unit = excluded.unit,
                is_enabled = excluded.is_enabled,
                description = excluded.description
        """, (key, name, category, value, unit, 1 if is_enabled else 0, description))
        conn.commit()
        return True


def get_active_threshold_breaches(services: list = None, channels: list = None) -> list:
    """
    Avalia a telemetria atual de serviços e canais contra os limiares ativos.
    Retorna a lista de violações ativas com criticidade, delta e procedimentos de ação.
    """
    thresholds = {t["key"]: t for t in get_all_thresholds() if t.get("is_enabled", 1)}
    breaches = []
    
    if not services:
        services = []
    if not channels:
        channels = []

    # 1. Limiar de Disco D: Mínimo
    disk_thresh = thresholds.get("disk_d_min_gb")
    if disk_thresh:
        limit_gb = float(disk_thresh["value"])
        for s in services:
            raw_d = str(s.get("disco_d_livre", "")).replace("GB", "").strip()
            try:
                val = float(raw_d)
                if val < limit_gb:
                    breaches.append({
                        "id": f"disk_{s.get('hostname')}_{s.get('cs', 1)}",
                        "severity": "critico" if val < (limit_gb * 0.5) else "alerta",
                        "category": "armazenamento",
                        "metric": "Espaço Livre no Disco D:",
                        "target": f"{s.get('praca')} (CS {s.get('cs', 1)})",
                        "hostname": s.get("hostname"),
                        "current_value": f"{val:.1f} GB",
                        "threshold_value": f"{limit_gb:.1f} GB",
                        "delta": f"-{(limit_gb - val):.1f} GB",
                        "description": f"O volume D:\\ de gravações está com apenas {val:.1f} GB livres, abaixo do limite operacional de {limit_gb:.1f} GB.",
                        "recommended_action": "Disparar expurgo de buffers antigos ou executar limpeza de logs em Remote Commands."
                    })
            except Exception:
                pass

    # 2. Limiar de Qualidade e Força RF de Canais
    rf_q_thresh = thresholds.get("rf_signal_quality_min")
    rf_s_thresh = thresholds.get("rf_signal_strength_min")
    for c in channels:
        q_val = c.get("qualidade_sinal")
        s_val = c.get("forca_sinal")
        ch_name = c.get("canal", "Canal")
        praca = c.get("cidade", "Praça")
        
        if rf_q_thresh and q_val is not None:
            min_q = float(rf_q_thresh["value"])
            if q_val < min_q and not c.get("has_outage"):
                breaches.append({
                    "id": f"rf_q_{praca}_{ch_name}",
                    "severity": "alerta",
                    "category": "sinal_rf",
                    "metric": "Qualidade de Sinal RF Degradada",
                    "target": f"{ch_name} ({praca})",
                    "hostname": praca,
                    "current_value": f"{q_val}%",
                    "threshold_value": f"{min_q:.0f}%",
                    "delta": f"-{(min_q - q_val):.0f}%",
                    "description": f"Qualidade RF de {q_val}% está abaixo do limiar estipulado de {min_q:.0f}%, indicando risco de perda de frames e macroblocos.",
                    "recommended_action": "Verificar apontamento de antena, conectores coaxiais ou reiniciar sintonizador TBS."
                })
                
        if rf_s_thresh and s_val is not None:
            min_s = float(rf_s_thresh["value"])
            if s_val < min_s and not c.get("has_outage"):
                breaches.append({
                    "id": f"rf_s_{praca}_{ch_name}",
                    "severity": "alerta",
                    "category": "sinal_rf",
                    "metric": "Força de Sinal RF Insuficiente",
                    "target": f"{ch_name} ({praca})",
                    "hostname": praca,
                    "current_value": f"{s_val}%",
                    "threshold_value": f"{min_s:.0f}%",
                    "delta": f"-{(min_s - s_val):.0f}%",
                    "description": f"A potência da portadora DTV está em {s_val}%, abaixo do patamar mínimo de {min_s:.0f}%.",
                    "recommended_action": "Checar ganho do amplificador predial de antena ou consultar emissora transmissora."
                })

    # 3. Limiar de Autonomia Preditiva de Gravação MP4
    autonomy_thresh = thresholds.get("disk_autonomy_min_hours")
    if autonomy_thresh:
        min_hours = float(autonomy_thresh["value"])
        for s in services:
            raw_d = str(s.get("disco_d_livre", "")).replace("GB", "").strip()
            try:
                val = float(raw_d)
                # Estimativa média: 1.2 GB por hora por canal em 1080i H.264
                autonomy_est = (val / 1.2)
                if autonomy_est < min_hours:
                    breaches.append({
                        "id": f"autonomy_{s.get('hostname')}",
                        "severity": "critico" if autonomy_est < 4.0 else "alerta",
                        "category": "gravacao",
                        "metric": "Autonomia Crítica de Gravação MP4",
                        "target": f"{s.get('praca')} (CS {s.get('cs', 1)})",
                        "hostname": s.get("hostname"),
                        "current_value": f"{autonomy_est:.1f} h",
                        "threshold_value": f"{min_hours:.1f} h",
                        "delta": f"-{(min_hours - autonomy_est):.1f} h",
                        "description": f"Autonomia preditiva de gravação estimada em apenas {autonomy_est:.1f} horas contínuas antes do esgotamento do disco.",
                        "recommended_action": "Ativar retenção inteligente ou acionar expurgo do diretório registered."
                    })
            except Exception:
                pass

    return breaches


init_thresholds()
