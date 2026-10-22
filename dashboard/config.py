import os
import sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
LOGS_DIR = ROOT_DIR / "logs"

DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Configurações de Rede e Servidor
PORT = 8092
HOST = "0.0.0.0"
DOMAIN_NAME = "localhost:8092"
LOCAL_IP = "192.168.15.17"

# Credenciais Padrão do Administrador
DEFAULT_ADMIN_USER = "suportesmme"
DEFAULT_ADMIN_PASS = "CSp@ss2020"

# Chave JWT / Sessão
SECRET_KEY = "DNA_FLEET_MONITOR_CS_SECRET_KEY_2026_ADGBL"

# SharePoint Graph API Credentials
RAW_SPN_SECRET = "ENC:pmGCK1dfa+FaAQAtlvRow3fpazdGco1b5BlFcuBrkhvGnneyKLXk93FsMzUJZWE6Hcy2YtNVIgn+70DsqWJP8g=="
TENANT_ID = "b2767241-fab5-454b-8b62-f6324650e316"
CLIENT_ID = "0a8faad1-6f41-4b6f-ac0d-d18399b4e9dc"
SITE_ID = "adgbl.sharepoint.com,a3e49747-9bb6-4c93-9930-dda26c8d1050,34c8fe55-2cfe-4efc-8ce0-2958fd775ee0"
LIST_SERVICES_ID = "2e2afc16-dfd6-4277-a16c-cd78bdd2e769"
LIST_CHANNELS_ID = "b0ffcdd7-a0e7-4eb0-a5e8-e2142776b8eb"


def decrypt_spn_secret() -> str:
    """Decodifica o segredo SPN criptografado em AES."""
    try:
        raw_b64 = RAW_SPN_SECRET[4:]
        raw_bytes = base64.b64decode(raw_b64)
        key = "DNA_MONITOR_FLEET_SEC_2026_ADGBL".encode("utf-8")
        iv = raw_bytes[:16]
        cipher_bytes = raw_bytes[16:]
        
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(cipher_bytes) + decryptor.finalize()
        
        # Remove PKCS7 padding
        pad_len = decrypted[-1]
        return decrypted[:-pad_len].decode("utf-8")
    except Exception:
        # Fallback simples em caso de falha de decriptação
        return ""


CLIENT_SECRET = decrypt_spn_secret()
