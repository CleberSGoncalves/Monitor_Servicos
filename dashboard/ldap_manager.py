# dashboard/ldap_manager.py
# Gerenciamento de Integração com Active Directory / LDAP Corporativo

import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger("LDAPManager")

DATA_DIR = Path(__file__).resolve().parent / "data"
LDAP_CONFIG_FILE = DATA_DIR / "ldap_config.json"

DEFAULT_LDAP_CONFIG = {
    "name": "grupoibope.corp",
    "server": "10.1.0.1",
    "port": 389,
    "use_ssl": False,
    "bind_user": "usr.media.dna@grupoibope",
    "bind_password": "",
    "base_dn": "OU=Users Accounts,OU=KIM Users,DC=grupoibope,DC=corp",
    "search_filter": "(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=*{q}*)(cn=*{q}*)(displayName=*{q}*)(mail=*{q}*)))",
    "timeout_sec": 5,
    "user_attr": "sAMAccountName",
    "first_name_attr": "givenName",
    "last_name_attr": "sn",
    "email_attr": "mail",
    "auto_create_users": True,
    "is_active": True
}


def get_ldap_config(mask_password: bool = True) -> Dict[str, Any]:
    """Retorna a configuração atual do LDAP, inicializando com os padrões se não existir."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    cfg = dict(DEFAULT_LDAP_CONFIG)
    
    if LDAP_CONFIG_FILE.exists():
        try:
            with open(LDAP_CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                cfg.update(saved)
        except Exception as e:
            logger.warning(f"Erro ao ler ldap_config.json: {e}")
    else:
        try:
            with open(LDAP_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    result = dict(cfg)
    if mask_password and result.get("bind_password"):
        result["bind_password"] = "********"
    return result


def save_ldap_config(new_config: Dict[str, Any]) -> bool:
    """Salva as configurações do servidor LDAP."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    current = dict(DEFAULT_LDAP_CONFIG)
    if LDAP_CONFIG_FILE.exists():
        try:
            with open(LDAP_CONFIG_FILE, "r", encoding="utf-8") as f:
                current.update(json.load(f))
        except Exception:
            pass
    
    # Se a senha veio mascarada, preserva a senha anterior
    if new_config.get("bind_password") == "********":
        new_config["bind_password"] = current.get("bind_password", "")
        
    current.update(new_config)
    try:
        with open(LDAP_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar ldap_config.json: {e}")
        return False


def test_ldap_connection(test_cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Testa a conectividade física e o Bind com o servidor Active Directory."""
    cfg = get_ldap_config(mask_password=False)
    if test_cfg:
        if test_cfg.get("bind_password") == "********":
            test_cfg["bind_password"] = cfg.get("bind_password", "")
        cfg.update(test_cfg)

    server_host = cfg.get("server", "10.1.0.1")
    port = int(cfg.get("port", 389))
    use_ssl = bool(cfg.get("use_ssl", False))
    timeout = int(cfg.get("timeout_sec", 5))
    bind_user = cfg.get("bind_user", "")
    bind_password = cfg.get("bind_password", "")

    try:
        import ldap3
    except ImportError:
        return {
            "success": False,
            "error": "Biblioteca 'ldap3' não instalada no ambiente Python. Execute: pip install ldap3"
        }

    try:
        server = ldap3.Server(
            server_host,
            port=port,
            use_ssl=use_ssl,
            get_info=ldap3.ALL,
            connect_timeout=timeout
        )

        if bind_user and bind_password:
            conn = ldap3.Connection(
                server,
                user=bind_user,
                password=bind_password,
                auto_bind=True,
                receive_timeout=timeout
            )
            if conn.bound:
                return {
                    "success": True,
                    "message": f"Conexão com {cfg.get('name', 'grupoibope.corp')} ({server_host}:{port}) e autenticação de Bind realizadas com sucesso!"
                }
            else:
                return {
                    "success": False,
                    "error": f"Falha de autenticação do Bind User '{bind_user}'. Verifique a senha da conta de serviço."
                }
        else:
            conn = ldap3.Connection(server, connect_timeout=timeout)
            if conn.open():
                return {
                    "success": True,
                    "message": f"Servidor {server_host}:{port} acessível na rede! (Aviso: Bind User ou Senha não preenchidos)"
                }
            else:
                return {
                    "success": False,
                    "error": f"Porta {port} no servidor {server_host} não respondeu."
                }

    except Exception as e:
        err_msg = str(e)
        if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
            err_msg = f"Tempo limite esgotado ({timeout}s) ao tentar conectar em {server_host}:{port}. O host está fora da VPN ou a rota 10.1.0.1 está inacessível."
        return {
            "success": False,
            "error": f"Erro de conexão LDAP: {err_msg}"
        }


def search_ldap_directory(query: str) -> List[Dict[str, str]]:
    """
    Busca usuários no Active Directory corporativo.
    Se o servidor 10.1.0.1 estiver acessível, executa consulta LDAP em tempo real.
    Se estiver fora da VPN/contingência, permite cadastrar o usuário pesquisado diretamente.
    """
    q = query.strip()
    if not q:
        return []

    cfg = get_ldap_config(mask_password=False)
    results = []

    # 1. Tenta consulta real via ldap3
    try:
        import ldap3
        server = ldap3.Server(
            cfg.get("server", "10.1.0.1"),
            port=int(cfg.get("port", 389)),
            use_ssl=bool(cfg.get("use_ssl", False)),
            connect_timeout=int(cfg.get("timeout_sec", 4))
        )
        
        bind_user = cfg.get("bind_user", "usr.media.dna@grupoibope")
        bind_pwd = cfg.get("bind_password", "")
        
        conn = ldap3.Connection(
            server,
            user=bind_user,
            password=bind_pwd,
            auto_bind=True,
            receive_timeout=4
        )

        if conn.bound:
            base_dn = cfg.get("base_dn", "OU=Users Accounts,OU=KIM Users,DC=grupoibope,DC=corp")
            user_attr = cfg.get("user_attr", "sAMAccountName")
            first_attr = cfg.get("first_name_attr", "givenName")
            last_attr = cfg.get("last_name_attr", "sn")
            email_attr = cfg.get("email_attr", "mail")

            search_filter = f"(&(objectCategory=person)(objectClass=user)(|({user_attr}=*{q}*)(cn=*{q}*)(displayName=*{q}*)({email_attr}=*{q}*)))"
            
            conn.search(
                search_base=base_dn,
                search_filter=search_filter,
                attributes=[user_attr, first_attr, last_attr, email_attr, "displayName", "department"],
                size_limit=15
            )

            for entry in conn.entries:
                uname = str(entry[user_attr].value if user_attr in entry else "")
                first = str(entry[first_attr].value if first_attr in entry else "")
                last = str(entry[last_attr].value if last_attr in entry else "")
                full_name = f"{first} {last}".strip() or str(entry.displayName.value if "displayName" in entry else uname)
                mail = str(entry[email_attr].value if email_attr in entry else f"{uname}@grupoibope.com")
                dept = str(entry.department.value if "department" in entry else "IBOPE Media")

                if uname:
                    results.append({
                        "username": uname,
                        "full_name": full_name,
                        "email": mail,
                        "department": dept
                    })

            if results:
                return results

    except Exception as e:
        logger.info(f"[LDAP] Conexão direta com 10.1.0.1 indisponível ou fora da VPN ({e}). Usando modo assistido.")

    # 2. Modo assistido: Se a consulta não retornou resultados ou o servidor não respondeu,
    # permite adicionar o usuário pesquisado (ex: cleber.goncalves) com metadados do domínio grupoibope
    q_lower = q.lower()
    
    # Usuários pré-mapeados do domínio IBOPE
    known_domain_users = [
        {"username": "cleber.goncalves", "full_name": "Cleber Gonçalves", "email": "cleber.goncalves@ibope.com", "department": "Engenharia & Monitoração MediaDNA"},
        {"username": "carlos.silva", "full_name": "Carlos Silva", "email": "carlos.silva@ibope.com", "department": "NOC Transmissão CS"},
        {"username": "mariana.costa", "full_name": "Mariana Costa", "email": "mariana.costa@ibope.com", "department": "Operações Praças"},
        {"username": "rodrigo.santos", "full_name": "Rodrigo Santos", "email": "rodrigo.santos@ibope.com", "department": "Infraestrutura TI"}
    ]

    for u in known_domain_users:
        if q_lower in u["username"] or q_lower in u["full_name"].lower() or q_lower in u["email"].lower():
            results.append(u)

    # Se ainda assim não encontrou e o usuário digitou um username válido, oferece adicionar diretamente
    if not results and len(q) >= 3:
        clean_user = q_lower.replace(" ", ".")
        name_parts = clean_user.split(".")
        full_name = " ".join(p.capitalize() for p in name_parts)
        results.append({
            "username": clean_user,
            "full_name": full_name,
            "email": f"{clean_user}@ibope.com",
            "department": "Domínio grupoibope.corp"
        })

    return results


def authenticate_ldap_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Autentica o operador contra o servidor Active Directory."""
    if not username or not password:
        return None

    cfg = get_ldap_config(mask_password=False)
    server_host = cfg.get("server", "10.1.0.1")
    port = int(cfg.get("port", 389))
    use_ssl = bool(cfg.get("use_ssl", False))
    timeout = int(cfg.get("timeout_sec", 4))

    clean_user = username.strip()
    user_principal = f"{clean_user}@grupoibope.corp" if "@" not in clean_user else clean_user

    try:
        import ldap3
        server = ldap3.Server(
            server_host,
            port=port,
            use_ssl=use_ssl,
            get_info=ldap3.ALL,
            connect_timeout=timeout
        )

        conn = ldap3.Connection(
            server,
            user=user_principal,
            password=password,
            auto_bind=True,
            receive_timeout=timeout
        )

        if conn.bound:
            # Busca nome e email
            full_name = clean_user.title()
            email = f"{clean_user}@ibope.com"
            try:
                base_dn = cfg.get("base_dn", "OU=Users Accounts,OU=KIM Users,DC=grupoibope,DC=corp")
                user_attr = cfg.get("user_attr", "sAMAccountName")
                conn.search(base_dn, f"({user_attr}={clean_user})", attributes=["displayName", "mail", "givenName", "sn"])
                if conn.entries:
                    e = conn.entries[0]
                    first = str(e.givenName.value if "givenName" in e else "")
                    last = str(e.sn.value if "sn" in e else "")
                    full_name = f"{first} {last}".strip() or str(e.displayName.value if "displayName" in e else full_name)
                    if "mail" in e and e.mail.value:
                        email = str(e.mail.value)
            except Exception:
                pass

            return {
                "username": clean_user,
                "full_name": full_name,
                "email": email,
                "auth_type": "ldap"
            }
    except Exception as e:
        logger.warning(f"[LDAP Auth] Tentativa de bind falhou para {clean_user}: {e}")

    return None
