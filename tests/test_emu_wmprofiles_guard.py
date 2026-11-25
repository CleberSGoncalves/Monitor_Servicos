"""
Valida a guarda WMProfiles: o perfil EMU so pode ser aplicado no Multiplexes.xml se existir
fisicamente o arquivo WMProfiles\\EMU_<perfil>.xml. Nomes canonicos:
  - FastMatching          -> 'EMU MediaDNA 1min'
  - Detection + Tracking  -> 'EMU MDNA'
Os testes E2E executam o PowerShell gerado de verdade sobre uma estrutura temporaria.
"""
import os
import sys
import shutil
import subprocess
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboard"))

from fleet_actions import (  # noqa: E402
    EMU_PROFILE_FASTMATCHING,
    EMU_PROFILE_LEGACY,
    normalize_stack_emu_profile,
    build_emu_profile_hardening_snippet,
    build_fastmatching_cleaner_migration_snippet,
    build_service_raw_script,
)

MUX_XML = """<?xml version="1.0" encoding="windows-1252"?>
<Multiplexes>
  <Programs><Name>GLOBO</Name><EMU_IsRecording>true</EMU_IsRecording><EMU_ProfileName>EMU MDNA</EMU_ProfileName></Programs>
  <Programs><Name>SBT</Name><EMU_IsRecording>true</EMU_IsRecording><EMU_ProfileName>EMU MDNA</EMU_ProfileName></Programs>
  <Programs><Name>SEM_EMU</Name><EMU_IsRecording>false</EMU_IsRecording></Programs>
</Multiplexes>
"""


def test_canonical_names_and_normalization():
    assert EMU_PROFILE_FASTMATCHING == "EMU MediaDNA 1min"
    assert EMU_PROFILE_LEGACY == "EMU MDNA"
    for v in ["emu_mdna_1min", "EMU MediaDNA 1min", "emu mediadna 1min", "EMU_EMU MediaDNA 1min"]:
        assert normalize_stack_emu_profile(v) == "EMU MediaDNA 1min"
    for v in ["emu_mdna", "EMU MDNA", "", None]:
        assert normalize_stack_emu_profile(v) == "EMU MDNA"


def test_no_invalid_slug_profiles_in_generated_scripts():
    for mig in (True, False):
        for svc in ("Atria Capture", "FastMatchingSvc"):
            s = build_service_raw_script(svc, "2.0.0.2", migrate_to_fastmatching=mig)
            assert "emu_mdna" not in s.lower().replace("emu mdna", "")
            assert "$emuProfileOk" in s
            assert "WMProfiles" in s
    fast = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=True)
    assert "EMU_' + $emuProfileName + '.xml" in fast
    assert "$emuProfileName = 'EMU MediaDNA 1min'" in fast
    leg = build_service_raw_script("Atria Capture", "2.0.0.2", migrate_to_fastmatching=False)
    assert "$emuProfileName = 'EMU MDNA'" in leg
    assert "<EMU_ProfileName>EMU MediaDNA 1min</EMU_ProfileName>" not in leg
    assert "<EMU_ProfileName>EMU MDNA</EMU_ProfileName>" in leg


def test_migration_is_gated_by_wmprofile_guard():
    snip = build_fastmatching_cleaner_migration_snippet()
    idx_guard = snip.find("if (-not $emuProfileOk)")
    idx_uninstall = snip.find("sc.exe delete DNA.DetectionSVC")
    assert 0 <= idx_guard < idx_uninstall, "Remocao do Detection precisa estar protegida pela guarda WMProfiles"
    assert "MIGRACAO_ABORTADA" in snip


def _has_powershell():
    return shutil.which("powershell.exe") is not None


def _run_ps(script: str) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8-sig") as f:
        f.write(script)
        path = f.name
    try:
        r = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", path],
            capture_output=True, text=True, timeout=90,
        )
        return (r.stdout or "") + (r.stderr or "")
    finally:
        os.remove(path)


def _make_env(tmp_path, profiles):
    target = tmp_path / "DTVCapture64"
    (target / "WMProfiles").mkdir(parents=True)
    (target / "Config").mkdir()
    for p in profiles:
        (target / "WMProfiles" / f"EMU_{p}.xml").write_text("<profile/>", encoding="utf-8")
    mux = target / "Config" / "Multiplexes.xml"
    mux.write_text(MUX_XML, encoding="cp1252")
    return target, mux


@pytest.mark.skipif(not _has_powershell(), reason="PowerShell indisponivel")
def test_e2e_profile_applied_when_present_in_wmprofiles(tmp_path):
    target, mux = _make_env(tmp_path, ["EMU MDNA", "EMU MediaDNA 1min", "Atria_15min"])
    out = _run_ps(build_emu_profile_hardening_snippet(str(target), target_profile="EMU MediaDNA 1min"))
    content = mux.read_text(encoding="cp1252")
    assert "[WMPROFILES] Perfil validado" in out, out
    assert content.count("<EMU_ProfileName>EMU MediaDNA 1min</EMU_ProfileName>") == 2
    assert "<EMU_ProfileName>EMU MDNA</EMU_ProfileName>" not in content
    # Canal sem EMU nao ganha tag nova
    assert content.count("EMU_ProfileName>") == 4


@pytest.mark.skipif(not _has_powershell(), reason="PowerShell indisponivel")
def test_e2e_profile_not_applied_when_missing_from_wmprofiles(tmp_path):
    # Pasta WMProfiles SEM o EMU MediaDNA 1min -> nada pode mudar
    target, mux = _make_env(tmp_path, ["EMU MDNA"])
    if any(os.path.exists(os.path.join(d, "EMU_EMU MediaDNA 1min.xml")) for d in (
        r"D:\MediaDNA_V2\Applications\DTVCapture64\WMProfiles", r"C:\DTV\DTVCapture\WMProfiles",
        r"C:\MediaDNA_V2\Applications\DTVCapture64\WMProfiles", r"D:\MediaDNA_V2\Applications\DTVCapture\WMProfiles")):
        pytest.skip("Maquina de teste possui WMProfiles real com o perfil")
    before = mux.read_text(encoding="cp1252")
    out = _run_ps(build_emu_profile_hardening_snippet(str(target), target_profile="EMU MediaDNA 1min"))
    assert "[ERRO_WMPROFILES]" in out, out
    assert "EMU MDNA" in out  # lista os disponiveis
    assert mux.read_text(encoding="cp1252") == before
    assert not os.path.exists(str(mux) + ".bak")
