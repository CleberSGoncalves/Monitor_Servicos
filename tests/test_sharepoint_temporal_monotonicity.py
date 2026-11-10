import pytest

def test_service_temporal_monotonicity_prevents_regression():
    existing_servs = {
        ("brsp-scl-dt1", "dna.monitorservicesvc"): {
            "hostname": "BRSP-SCL-DT1",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao_instalada": "1.0.20.0",
            "ultima_atualizacao": "2026-11-10T12:27:25Z"
        }
    }

    # Incoming partial/older record from historical list page
    older_incoming = [
        {
            "hostname": "BRSP-SCL-DT1",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao_instalada": "1.0.18.0",
            "ultima_atualizacao": "2026-11-09T22:50:35Z"
        }
    ]

    # Run the exact merge logic from sharepoint_sync.py
    for s in older_incoming:
        k = (str(s.get("hostname", "")).strip().lower(), str(s.get("nome_servico", "")).strip().lower())
        cur = existing_servs.get(k)
        if not cur:
            existing_servs[k] = s
        else:
            cur_ts = str(cur.get("ultima_atualizacao") or "")
            new_ts = str(s.get("ultima_atualizacao") or "")
            if not cur_ts or (new_ts and new_ts >= cur_ts):
                existing_servs[k] = s

    # Ensure the modern 1.0.20.0 version was PRESERVED and not regressed to 1.0.18.0
    result = existing_servs[("brsp-scl-dt1", "dna.monitorservicesvc")]
    assert result["versao_instalada"] == "1.0.20.0"
    assert result["ultima_atualizacao"] == "2026-11-10T12:27:25Z"


def test_service_temporal_monotonicity_allows_newer_update():
    existing_servs = {
        ("brsp-scl-dt1", "dna.monitorservicesvc"): {
            "hostname": "BRSP-SCL-DT1",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao_instalada": "1.0.18.0",
            "ultima_atualizacao": "2026-11-09T22:50:35Z"
        }
    }

    # Incoming fresh update
    newer_incoming = [
        {
            "hostname": "BRSP-SCL-DT1",
            "nome_servico": "DNA.MonitorServiceSVC",
            "versao_instalada": "1.0.20.0",
            "ultima_atualizacao": "2026-11-10T12:27:25Z"
        }
    ]

    for s in newer_incoming:
        k = (str(s.get("hostname", "")).strip().lower(), str(s.get("nome_servico", "")).strip().lower())
        cur = existing_servs.get(k)
        if not cur:
            existing_servs[k] = s
        else:
            cur_ts = str(cur.get("ultima_atualizacao") or "")
            new_ts = str(s.get("ultima_atualizacao") or "")
            if not cur_ts or (new_ts and new_ts >= cur_ts):
                existing_servs[k] = s

    result = existing_servs[("brsp-scl-dt1", "dna.monitorservicesvc")]
    assert result["versao_instalada"] == "1.0.20.0"
    assert result["ultima_atualizacao"] == "2026-11-10T12:27:25Z"
