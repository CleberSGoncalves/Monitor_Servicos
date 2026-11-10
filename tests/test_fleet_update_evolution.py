import sys
import os
import pytest

# Ensure dashboard directory is in path
dashboard_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dashboard"))
if dashboard_dir not in sys.path:
    sys.path.insert(0, dashboard_dir)

from fleet_actions import get_fleet_update_evolution

def test_fleet_update_evolution_structure_and_metrics():
    res = get_fleet_update_evolution(target_version="1.0.20.0")
    
    assert isinstance(res, dict)
    assert res["target_version"] == "1.0.20.0"
    assert "total_hosts" in res
    assert "updated_count" in res
    assert "updated_pct" in res
    assert "online_count" in res
    assert "active_adoption_pct" in res
    assert "pending_online_count" in res
    assert "offline_count" in res
    assert "versions_breakdown" in res
    assert "pending_online_hosts" in res
    assert "pending_online_csv" in res
    assert "hosts_detail" in res
    
    total = res["total_hosts"]
    assert total > 0, "Deveria haver hosts monitorados na frota"
    
    # Mathematical consistency
    assert res["updated_count"] + res["pending_online_count"] + res["offline_count"] == total
    assert 0.0 <= res["updated_pct"] <= 100.0
    assert 0.0 <= res["active_adoption_pct"] <= 100.0
    
    # Check breakdown
    assert "1.0.20.0" in res["versions_breakdown"]
    assert res["versions_breakdown"]["1.0.20.0"] == res["updated_count"]
    
    # Check pending CSV format (COMPUTER-01PR70 excluded from GV field dispatch list)
    if res["pending_online_count"] > 0:
        assert isinstance(res["pending_online_csv"], str)
        # 12 field machines (or 13 if test machine included)
        assert len(res["pending_online_hosts"]) in (res["pending_online_count"], res["pending_online_count"] - 1)
        for h in res["pending_online_hosts"]:
            assert h in res["pending_online_csv"]
            
    # Check hosts detail category assignment
    for h in res["hosts_detail"]:
        assert h["category"] in ("updated", "pending_online", "offline")
        if h["category"] == "updated":
            assert h["versao_instalada"] == "1.0.20.0"
        elif h["category"] == "pending_online":
            assert h["versao_instalada"] != "1.0.20.0"
            assert h["is_online_today"] is True
        elif h["category"] == "offline":
            assert h["versao_instalada"] != "1.0.20.0"
            assert h["is_online_today"] is False


def test_fleet_update_evolution_custom_target():
    res = get_fleet_update_evolution(target_version="1.0.18.0")
    assert res["target_version"] == "1.0.18.0"
    assert res["updated_count"] == res["versions_breakdown"].get("1.0.18.0", 0)
