# dashboard/feature_flags.py
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from config import DATA_DIR

DB_PATH = DATA_DIR / "fleet.db"

DEFAULT_FLAGS = [
    {
        "scope_type": "global",
        "scope_value": "*",
        "flag_key": "enable_jpeg_snapshots",
        "name": "Coleta e Envio de JPEGs (Mosaico Visual)",
        "description": "Ativa o envio leve de frames JPEG (320x240) dos canais a cada 10-30s para o Mosaico.",
        "is_enabled": 1
    },
    {
        "scope_type": "global",
        "scope_value": "*",
        "flag_key": "enable_mp4_audit",
        "name": "Auditoria Analítica de Amostras MP4 (ATRIA)",
        "description": "Permite inspeção local de arquivos gravados na pasta video_bkp\\registered.",
        "is_enabled": 1
    },
    {
        "scope_type": "global",
        "scope_value": "*",
        "flag_key": "enable_moov_atom_check",
        "name": "Inspeção de Integridade de Container Moov Atom",
        "description": "Valida se os arquivos MP4 são fechados sem corrupção de cabeçalho.",
        "is_enabled": 1
    },
    {
        "scope_type": "global",
        "scope_value": "*",
        "flag_key": "enable_frozen_detection",
        "name": "Detecção de Vídeo Congelado via Frame Hash",
        "description": "Compara perceptual hash (pHash) de JPEGs consecutivos para alertar travamentos.",
        "is_enabled": 1
    }
]


def init_feature_flags_db():
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS fleet_feature_flags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_type TEXT NOT NULL, -- global, country, region, city, channel
                scope_value TEXT NOT NULL, -- *, Brasil, Sul, Pelotas, Rede Globo
                flag_key TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                is_enabled INTEGER DEFAULT 1,
                updated_at TEXT,
                updated_by TEXT,
                UNIQUE(scope_type, scope_value, flag_key)
            )
        """)

        # Popula flags globais padrão se ainda não existirem
        now_str = datetime.now(timezone.utc).isoformat()
        for f in DEFAULT_FLAGS:
            cursor.execute("""
                INSERT OR IGNORE INTO fleet_feature_flags 
                (scope_type, scope_value, flag_key, name, description, is_enabled, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'system')
            """, (f["scope_type"], f["scope_value"], f["flag_key"], f["name"], f["description"], f["is_enabled"], now_str))
        conn.commit()


def get_all_feature_flags() -> List[Dict[str, Any]]:
    init_feature_flags_db()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM fleet_feature_flags ORDER BY scope_type, scope_value, name")
        return [dict(r) for r in cursor.fetchall()]


def set_feature_flag(scope_type: str, scope_value: str, flag_key: str, is_enabled: bool, updated_by: str = "operador") -> bool:
    init_feature_flags_db()
    now_str = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        # Busca nome e descrição padrão
        cursor.execute("SELECT name, description FROM fleet_feature_flags WHERE flag_key = ? LIMIT 1", (flag_key,))
        row = cursor.fetchone()
        name = row[0] if row else flag_key
        desc = row[1] if row else "Flag de controle operacional"

        cursor.execute("""
            INSERT INTO fleet_feature_flags (scope_type, scope_value, flag_key, name, description, is_enabled, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope_type, scope_value, flag_key) DO UPDATE SET
                is_enabled = excluded.is_enabled,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
        """, (scope_type, scope_value, flag_key, name, desc, 1 if is_enabled else 0, now_str, updated_by))
        conn.commit()
        return True


def is_feature_enabled(flag_key: str, city: Optional[str] = None, channel: Optional[str] = None) -> bool:
    init_feature_flags_db()
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        # 1. Verifica flag específica para o canal
        if channel:
            cursor.execute("SELECT is_enabled FROM fleet_feature_flags WHERE flag_key = ? AND scope_type = 'channel' AND scope_value = ?", (flag_key, channel))
            res = cursor.fetchone()
            if res is not None:
                return bool(res[0])

        # 2. Verifica flag para a cidade
        if city:
            cursor.execute("SELECT is_enabled FROM fleet_feature_flags WHERE flag_key = ? AND scope_type = 'city' AND scope_value = ?", (flag_key, city))
            res = cursor.fetchone()
            if res is not None:
                return bool(res[0])

        # 3. Fallback para flag global
        cursor.execute("SELECT is_enabled FROM fleet_feature_flags WHERE flag_key = ? AND scope_type = 'global'", (flag_key,))
        res = cursor.fetchone()
        if res is not None:
            return bool(res[0])

        return True
