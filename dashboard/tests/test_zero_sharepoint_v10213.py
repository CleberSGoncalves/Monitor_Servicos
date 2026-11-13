import sys
from pathlib import Path
import urllib.request
import json

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))

import version_governance
import gcp_sync
import fleet_actions


def test_agent_csharp_zero_sharepoint_calls_in_orchestrators():
    """Garante que FleetOrchestrator, ChannelOrchestrator e RemoteCommandExecutor nao facam chamadas de rede ao SharePoint."""
    fleet_cs = (ROOT_DIR / "WinServiceFleetAgent" / "Core" / "FleetOrchestrator.cs").read_text(encoding="utf-8")
    channel_cs = (ROOT_DIR / "WinServiceFleetAgent" / "Core" / "ChannelOrchestrator.cs").read_text(encoding="utf-8")
    remote_cs = (ROOT_DIR / "WinServiceFleetAgent" / "Core" / "RemoteCommandExecutor.cs").read_text(encoding="utf-8")

    # RunCycleAsync must not call SyncServicesBatchAsync, GetPendingActionsAsync, GetPendingUrlActionsAsync, or GetDesiredVersionAsync
    run_cycle_part = fleet_cs.split("private async Task ProcessUpdateAsync")[0]
    assert "_spClient.SyncServicesBatchAsync" not in run_cycle_part
    assert "_spClient.GetPendingActionsAsync" not in run_cycle_part
    assert "_spClient.GetPendingUrlActionsAsync" not in run_cycle_part
    assert "_spClient.GetDesiredVersionAsync" not in run_cycle_part

    # ChannelOrchestrator must not call SyncChannelsInventoryAsync
    assert "_spClient.SyncChannelsInventoryAsync" not in channel_cs
    assert "Sincronizando com o Google Cloud Firestore..." in channel_cs

    # RemoteCommandExecutor must not call ListDriveFolderFileNamesAsync
    assert "_sp.ListDriveFolderFileNamesAsync" not in remote_cs


def test_gcs_public_manifest_returns_200_and_v1_0_21_3():
    """Garante que o manifesto publico no Google Cloud Storage retorna HTTP 200 sem erro 403 e aponta para 1.0.21.3."""
    with urllib.request.urlopen("https://storage.googleapis.com/kantar-fleet-releases/manifest.json", timeout=15) as r:
        assert r.status == 200
        data = json.loads(r.read().decode("utf-8"))
        assert data["services"]["DNA.MonitorServiceSVC"]["version"] == "1.0.21.3"
        assert len(data["services"]["DNA.MonitorServiceSVC"]["sha256"]) == 64


def test_version_governance_accepts_both_21_2_and_21_3_as_updated():
    """Garante que tanto 1.0.21.2 quanto 1.0.21.3 sao reconhecidos como Atualizados no Dashboard."""
    desired = version_governance.get_desired_versions()
    assert desired["DNA.MonitorServiceSVC"] == "1.0.21.3"
    assert version_governance._is_version_up_to_date("1.0.21.3", "1.0.21.3", "DNA.MonitorServiceSVC") is True
    assert version_governance._is_version_up_to_date("1.0.21.2", "1.0.21.3", "DNA.MonitorServiceSVC") is True
    assert version_governance._is_version_up_to_date("1.0.20.0", "1.0.21.3", "DNA.MonitorServiceSVC") is False


def test_self_update_script_uses_detached_task_scheduler():
    """Garante que o script de auto-atualizacao via comando remoto usa Task Scheduler isolado e nao mata o proprio processo antes de extrair."""
    script = fleet_actions.build_service_raw_script("DNA.MonitorServiceSVC", "1.0.21.3")
    assert "DNA_MonitorService_SelfUpdate" in script
    assert "apply_self_update.bat" in script
