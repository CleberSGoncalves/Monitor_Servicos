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


init_thresholds()
