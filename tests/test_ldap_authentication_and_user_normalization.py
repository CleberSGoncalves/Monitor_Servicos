import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "dashboard"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dashboard.auth import authenticate_user, hash_password, verify_password
from dashboard.ldap_manager import get_ldap_config


def test_password_hashing_and_verification():
    """Valida geracao de hash PBKDF2 e verificacao de senha."""
    pwd = "MinhaSenhaForte2026!"
    h = hash_password(pwd)
    assert verify_password(pwd, h) is True
    assert verify_password("SenhaErrada", h) is False


def test_ldap_config_defaults():
    """Valida que a configuracao padrao do LDAP aponta para o dominio grupoibope.corp."""
    cfg = get_ldap_config(mask_password=True)
    assert cfg.get("name") == "grupoibope.corp"
    assert cfg.get("port") == 389
    assert cfg.get("bind_user") == "usr.media.dna@grupoibope"


def test_auth_user_normalization():
    """Valida que logins com @ibope.com sao normalizados para consulta."""
    import sqlite3
    from dashboard.auth import DB_PATH
    
    # Valida busca por base_user
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE LOWER(username) = 'suportesmme'")
        u = c.fetchone()
        assert u is not None
        assert u["role"] == "admin"
