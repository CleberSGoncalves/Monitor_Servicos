import sqlite3
import hashlib
import hmac
import secrets
import json
import time
from typing import Optional, Dict, Any, List
from config import DATA_DIR, DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS, SECRET_KEY

DB_PATH = DATA_DIR / "fleet.db"


def init_db():
    """Inicializa as tabelas do banco de dados local SQLite."""
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=10000;")
        cursor = conn.cursor()
        
        # Tabela de Usuários
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                email TEXT,
                role TEXT NOT NULL DEFAULT 'operator', -- admin, operator, viewer
                auth_type TEXT NOT NULL DEFAULT 'local', -- local, ldap
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                last_login TEXT
            )
        """)
        
        # Tabela de Configurações de Limiares (Thresholds)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alert_thresholds (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT NOT NULL,
                is_enabled INTEGER NOT NULL DEFAULT 1,
                description TEXT
            )
        """)
        
        # Tabela de Registro de Ações Manuais e Incidentes (Worklog)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS incident_worklog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_key TEXT NOT NULL,
                host TEXT NOT NULL,
                target_name TEXT NOT NULL, -- Servico ou Canal
                incident_type TEXT NOT NULL, -- servico_parado, canal_fora, crash_loop, disco_cheio, etc.
                operator_username TEXT NOT NULL,
                operator_name TEXT NOT NULL,
                action_taken TEXT NOT NULL, -- Descrição da ação manual
                resolution_status TEXT NOT NULL DEFAULT 'em_analise', -- em_analise, resolvido, escalado
                created_at TEXT NOT NULL
            )
        """)
        
        # Tabela de Sugestões da Inteligência Artificial
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_suggestions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL, -- preditivo, anomalia, otimizacao, tuning
                severity TEXT NOT NULL, -- baixa, media, alta, critica
                description TEXT NOT NULL,
                suggested_rule JSON NOT NULL,
                status TEXT NOT NULL DEFAULT 'pendente', -- pendente, aprovada, recusada
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)

        # Tabela de Sessões Ativas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                role TEXT NOT NULL,
                expires_at REAL NOT NULL
            )
        """)

        # Migração automática de perfis legado para RBAC justo (admin, n2, n1)
        cursor.execute("UPDATE users SET role = 'n2' WHERE role = 'operator'")
        cursor.execute("UPDATE users SET role = 'n1' WHERE role = 'viewer'")

        conn.commit()
        
        # Cria usuário admin padrão se não existir
        cursor.execute("SELECT id FROM users WHERE username = ?", (DEFAULT_ADMIN_USER,))
        if not cursor.fetchone():
            pass_hash = hash_password(DEFAULT_ADMIN_PASS)
            cursor.execute("""
                INSERT INTO users (username, password_hash, full_name, email, role, auth_type, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
            """, (DEFAULT_ADMIN_USER, pass_hash, "Suporte CS Master", "suporte@kinomuse.com.br", "admin", "local"))
            conn.commit()


def hash_password(password: str) -> str:
    """Gera hash PBKDF2 com Salt aleatório."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}:{dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Valida a senha contra o hash armazenado."""
    try:
        salt, dk_hex = stored_hash.split(":")
        dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Autentica o usuário localmente ou via LDAP corporativo."""
    clean_user = username.strip().lower()
    
    # 1. Tenta autenticação local
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(username) = ? AND is_active = 1", (clean_user,))
        user = cursor.fetchone()
        
        if user:
            if user["auth_type"] == "local":
                if verify_password(password, user["password_hash"]):
                    cursor.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user["id"],))
                    conn.commit()
                    return dict(user)
            elif user["auth_type"] == "ldap":
                # Autentica via LDAP do domínio
                if authenticate_ldap(clean_user, password):
                    cursor.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user["id"],))
                    conn.commit()
                    return dict(user)

    # 2. Se não existir no banco local, tenta autenticar diretamente no LDAP corporativo
    ldap_info = authenticate_ldap(clean_user, password)
    if ldap_info:
        # Auto-provisiona usuário LDAP como operador ativo no primeiro login
        with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO users (username, password_hash, full_name, email, role, auth_type, is_active, created_at, last_login)
                VALUES (?, 'LDAP_AUTH', ?, ?, 'operator', 'ldap', 1, datetime('now'), datetime('now'))
            """, (clean_user, ldap_info.get("full_name", clean_user), ldap_info.get("email", f"{clean_user}@empresa.com.br")))
            conn.commit()
            
            cursor.execute("SELECT * FROM users WHERE username = ?", (clean_user,))
            conn.row_factory = sqlite3.Row
            return dict(cursor.fetchone())

    return None


def authenticate_ldap(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Autentica o operador contra o Active Directory corporativo usando as configuracoes salvas."""
    try:
        from ldap_manager import authenticate_ldap_user
        return authenticate_ldap_user(username, password)
    except Exception:
        return None


def search_ldap_users(query: str) -> List[Dict[str, str]]:
    """Busca usuarios no Active Directory corporativo (grupoibope.corp) ou permite pre-cadastro assistido."""
    try:
        from ldap_manager import search_ldap_directory
        return search_ldap_directory(query)
    except Exception as e:
        q_clean = query.strip().lower()
        return [{
            "username": q_clean,
            "full_name": q_clean.replace(".", " ").title(),
            "email": f"{q_clean}@ibope.com",
            "department": "Domínio grupoibope.corp"
        }]


def create_session(username: str, role: str) -> str:
    """Cria um token de sessão seguro com validade de 24 horas."""
    token = secrets.token_urlsafe(32)
    expires_at = time.time() + (24 * 3600)
    
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=10000;")
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
        cursor.execute("INSERT INTO sessions (token, username, role, expires_at) VALUES (?, ?, ?, ?)",
                       (token, username, role, expires_at))
        conn.commit()
    return token


def validate_session(token: str) -> Optional[Dict[str, Any]]:
    """Valida o token da sessão e recupera os dados atualizados do usuário."""
    if not token:
        return None
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.token, s.username, COALESCE(u.role, s.role) AS role, s.expires_at,
                   u.full_name, u.email, u.auth_type, u.is_active
            FROM sessions s
            LEFT JOIN users u ON LOWER(u.username) = LOWER(s.username)
            WHERE s.token = ? AND s.expires_at > ?
        """, (token, time.time()))
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        if res.get("is_active") == 0:
            return None
        if not res.get("full_name"):
            res["full_name"] = res["username"]
        return res


def update_user_role(user_id: int, new_role: str, is_active: Optional[bool] = None) -> bool:
    """Atualiza o perfil de acesso (admin, n2, n1) e status do usuário."""
    if new_role not in ["admin", "n2", "n1"]:
        return False
    with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
        cursor = conn.cursor()
        if is_active is not None:
            cursor.execute("UPDATE users SET role = ?, is_active = ? WHERE id = ?", (new_role, 1 if is_active else 0, user_id))
        else:
            cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
        
        cursor.execute("""
            UPDATE sessions SET role = ?
            WHERE LOWER(username) = (SELECT LOWER(username) FROM users WHERE id = ?)
        """, (new_role, user_id))
        conn.commit()
        return cursor.rowcount > 0


def get_rbac_roles_matrix() -> List[Dict[str, Any]]:
    """Retorna a matriz oficial de permissões dos perfis de acesso."""
    return [
        {
            "role": "admin",
            "name": "Administrador",
            "badge": "badge-red",
            "description": "Controle total e irrestrito da ferramenta, segurança e governança de frota.",
            "can_view_dashboard": True,
            "can_treat_incidents": True,
            "can_execute_remote_commands": True,
            "can_access_configs": True,
            "can_update_system": True,
            "can_manage_users": True,
            "can_calibrate_thresholds": True
        },
        {
            "role": "n2",
            "name": "Perfil N2 (Operador Avançado / Sênior)",
            "badge": "badge-purple",
            "description": "Atuação técnica ativa, remediação de falhas e disparo de correções nos Capture Sites.",
            "can_view_dashboard": True,
            "can_treat_incidents": True,
            "can_execute_remote_commands": True,
            "can_access_configs": False,
            "can_update_system": False,
            "can_manage_users": False,
            "can_calibrate_thresholds": False
        },
        {
            "role": "n1",
            "name": "Perfil N1 (Operador de Monitoração / Triagem)",
            "badge": "badge-blue",
            "description": "Observabilidade contínua de telemetria, mosaico visual, RF e notas de acompanhamento.",
            "can_view_dashboard": True,
            "can_treat_incidents": True,
            "can_execute_remote_commands": False,
            "can_access_configs": False,
            "can_update_system": False,
            "can_manage_users": False,
            "can_calibrate_thresholds": False
        }
    ]


init_db()
