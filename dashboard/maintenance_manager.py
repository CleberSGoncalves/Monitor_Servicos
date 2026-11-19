# dashboard/maintenance_manager.py
# =====================================================================
# Gerenciamento Centralizado de Janelas de Manutenção por Praça / Host
# Permite silenciar alertas e suspender telemetria de incidentes durante
# manutenções locais programadas ou tratativas de campo.
# =====================================================================

import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger("MaintenanceManager")

DATA_DIR = Path(__file__).resolve().parent / "data"
MAINTENANCE_FILE = DATA_DIR / "maintenance_windows.json"


def _ensure_data_dir():
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    if not MAINTENANCE_FILE.exists():
        try:
            with open(MAINTENANCE_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f, indent=2)
        except Exception as e:
            logger.warning(f"Erro ao inicializar maintenance_windows.json: {e}")


def _load_data() -> Dict[str, Any]:
    _ensure_data_dir()
    try:
        with open(MAINTENANCE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Erro ao ler maintenance_windows.json: {e}")
        return {}


def _save_data(data: Dict[str, Any]):
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(MAINTENANCE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Erro ao salvar maintenance_windows.json: {e}")


def normalize_praca_name(praca: str) -> str:
    if not praca:
        return ""
    import unicodedata
    p = praca.strip().lower()
    p = unicodedata.normalize('NFKD', p).encode('ASCII', 'ignore').decode('utf-8')
    return p


def set_praca_maintenance(
    praca: str,
    duration_minutes: int = 60,
    user: str = "operador",
    reason: str = "Manutenção local / Tratativa técnica"
) -> Dict[str, Any]:
    """
    Coloca uma praça em manutenção por uma duração em minutos.
    duration_minutes <= 0 indica manutenção por tempo indeterminado até remoção manual.
    """
    if not praca:
        return {"status": "error", "message": "Praça inválida"}

    norm_praca = normalize_praca_name(praca)
    data = _load_data()

    now = datetime.now()
    if duration_minutes > 0:
        expires_at = now + timedelta(minutes=duration_minutes)
        expires_at_iso = expires_at.isoformat()
    else:
        expires_at_iso = None

    record = {
        "praca_original": praca.strip(),
        "praca_norm": norm_praca,
        "started_at": now.isoformat(),
        "expires_at": expires_at_iso,
        "duration_minutes": duration_minutes,
        "user": user or "operador",
        "reason": reason or "Manutenção técnica em andamento",
        "active": True
    }

    data[norm_praca] = record
    _save_data(data)

    logger.info(f"Praça '{praca}' colocada em manutenção por {duration_minutes}m por {user}. Motivo: {reason}")
    return {"status": "success", "record": record}


def remove_praca_maintenance(praca: str) -> Dict[str, Any]:
    """Remove a janela de manutenção de uma praça."""
    if not praca:
        return {"status": "error", "message": "Praça inválida"}

    norm_praca = normalize_praca_name(praca)
    data = _load_data()

    if norm_praca in data:
        removed = data.pop(norm_praca)
        _save_data(data)
        logger.info(f"Praça '{praca}' liberada da manutenção.")
        return {"status": "success", "message": f"Praça '{praca}' liberada da manutenção.", "removed": removed}

    return {"status": "not_found", "message": f"Praça '{praca}' não estava em manutenção."}


def get_active_maintenance_pracas() -> List[Dict[str, Any]]:
    """
    Retorna lista de praças atualmente em manutenção válida,
    removendo automaticamente as janelas expiradas.
    """
    data = _load_data()
    now = datetime.now()
    active = []
    expired_keys = []

    for k, rec in data.items():
        expires_at_iso = rec.get("expires_at")
        if expires_at_iso:
            try:
                exp_dt = datetime.fromisoformat(expires_at_iso)
                if now > exp_dt:
                    expired_keys.append(k)
                    continue
                remaining_secs = int((exp_dt - now).total_seconds())
                rec["remaining_minutes"] = max(1, remaining_secs // 60)
            except Exception:
                rec["remaining_minutes"] = 0
        else:
            rec["remaining_minutes"] = None  # Indeterminado

        active.append(rec)

    if expired_keys:
        for ek in expired_keys:
            data.pop(ek, None)
        _save_data(data)

    return active


def is_praca_in_maintenance(praca: str) -> bool:
    """Verifica se uma determinada praça está em janela de manutenção ativa."""
    if not praca:
        return False
    active = get_active_maintenance_pracas()
    norm = normalize_praca_name(praca)
    for a in active:
        if a.get("praca_norm") == norm or norm in a.get("praca_norm", "") or a.get("praca_norm", "") in norm:
            return True
    return False
