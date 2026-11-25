import pytest
import sqlite3
from dashboard.rollback_manager import (
    init_rollback_journal_db,
    record_action_for_rollback,
    get_rollback_journal,
    preview_rollback,
    execute_rollback,
    generate_rollback_script,
    ACTION_TYPES
)

def test_init_db():
    init_rollback_journal_db()
    # Verifica se pode consultar sem erro
    entries = get_rollback_journal(limit=10)
    assert isinstance(entries, list)

def test_generate_rollback_scripts():
    # 1. FastMatching migration rollback
    script_fm = generate_rollback_script("fastmatching_migration", {}, "CASCAVEL-SMME-215-CS1")
    assert "Fast Matching Service" in script_fm
    assert "DNA.DetectionSVC" in script_fm
    assert "EMU MDNA" in script_fm

    # 2. Atria update rollback
    script_atria = generate_rollback_script("atria_update", {"versao_instalada": "2.0.0.1"}, "CASCAVEL-SMME-215-CS1")
    assert "2.0.0.1" in script_atria
    assert "Stop-Process" in script_atria

    # 3. EMU profile rollback
    script_emu = generate_rollback_script("emu_profile_change", {"emu_profile_anterior": "EMU MDNA"}, "CASCAVEL-SMME-215-CS1")
    assert "EMU MDNA" in script_emu
    assert "WMProfiles" in script_emu

def test_record_and_preview_action():
    act_id = "test_act_12345"
    record_action_for_rollback(
        action_id=act_id,
        action_type="fastmatching_migration",
        hostname="CASCAVEL-SMME-215-CS1",
        praca="Cascavel",
        operator="Cleber Teste",
        snapshot_before={"versao_instalada": "2.0.0.2", "stack": "legacy"},
        action_payload={"enable_fastmatching": True}
    )

    prev = preview_rollback(act_id)
    assert prev["success"] is True
    assert prev["action_id"] == act_id
    assert prev["hostname"] == "CASCAVEL-SMME-215-CS1"
    assert prev["status"] == "PENDING"
    assert "Fast Matching Service" in prev["rollback_script"]

def test_execute_rollback_lifecycle():
    act_id = "test_act_lifecycle_99"
    record_action_for_rollback(
        action_id=act_id,
        action_type="emu_profile_change",
        hostname="CACOAL-SMME-301-CS1",
        praca="Cacoal",
        operator="Operador NOC",
        snapshot_before={"emu_profile_anterior": "EMU MediaDNA 1min"}
    )

    # Executa rollback
    res = execute_rollback(act_id, operator="Auditor NOC")
    assert res["success"] is True
    assert res["action_id"] == act_id

    # Segunda tentativa deve acusar que já foi revertida
    res2 = execute_rollback(act_id, operator="Auditor NOC")
    assert res2["success"] is False
    assert "já foi revertida" in res2["error"]

    # Consulta no journal
    entries = get_rollback_journal(hostname="CACOAL-SMME-301-CS1")
    matched = [e for e in entries if e["action_id"] == act_id]
    assert len(matched) == 1
    assert matched[0]["rollback_status"] == "ROLLED_BACK"
    assert matched[0]["rolled_back_by"] == "Auditor NOC"
