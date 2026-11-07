import threading
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "dashboard"))

import sharepoint_sync

def test_cache_lock_is_reentrant():
    """Valida que _cache_lock é um RLock reentrante para prevenir deadlocks no get_cached_data()."""
    assert isinstance(sharepoint_sync._cache_lock, type(threading.RLock())), (
        "_cache_lock deve ser um threading.RLock() para suportar reentrância e prevenir deadlocks!"
    )

def test_get_cached_data_does_not_deadlock_when_recalculating():
    """Valida que get_cached_data() responde sem travar mesmo quando aciona sanitize_and_recalculate_cache()."""
    # Executa em thread com timeout para garantir ausência de deadlock
    result = []
    def worker():
        d = sharepoint_sync.get_cached_data()
        result.append(d)

    t = threading.Thread(target=worker)
    t.start()
    t.join(timeout=3.0)
    assert not t.is_alive(), "get_cached_data() travou em deadlock por bloqueio não-reentrante!"
    assert len(result) == 1
    assert "services" in result[0]
