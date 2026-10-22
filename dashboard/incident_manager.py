import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional
from config import DATA_DIR

DB_PATH = DATA_DIR / "fleet.db"


def register_incident_action(
    incident_key: str,
    host: str,
    target_name: str,
    incident_type: str,
    operator_username: str,
    operator_name: str,
    action_taken: str,
    resolution_status: str = "em_analise"
) -> int:
    """Registra uma ação manual realizada pelo operador em um incidente."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO incident_worklog (
                incident_key, host, target_name, incident_type,
                operator_username, operator_name, action_taken,
                resolution_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            incident_key, host, target_name, incident_type,
            operator_username, operator_name, action_taken, resolution_status
        ))
        conn.commit()
        return cursor.lastrowid


def get_incident_history(incident_key: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Recupera histórico de ações de incidentes."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        if incident_key:
            cursor.execute("""
                SELECT * FROM incident_worklog 
                WHERE incident_key = ? 
                ORDER BY id DESC LIMIT ?
            """, (incident_key, limit))
        else:
            cursor.execute("""
                SELECT * FROM incident_worklog 
                ORDER BY id DESC LIMIT ?
            """, (limit,))
            
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
