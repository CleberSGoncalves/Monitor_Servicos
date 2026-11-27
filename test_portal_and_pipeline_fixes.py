import os
import sys
import json
import urllib.request
import ssl

ctx = ssl._create_unverified_context()

def test_github_release_v2527():
    print("\n--- TEST 1: GitHub Release v2.5.27 & Auto-Updater Asset ---")
    url = "https://github.com/CleberSGoncalves/Monitor_Esportes/releases/download/v2.5.27/Monitor_Esportes.exe"
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, context=ctx) as resp:
        print(f"[OK] Asset HTTP Status: {resp.status}")
        length = int(resp.headers.get("Content-Length", 0))
        print(f"[OK] Content-Length: {length} bytes ({length / (1024*1024):.1f} MB)")
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        assert length > 500_000_000, f"Expected size > 500 MB, got {length}"

def test_pipeline_live_aracaju_detections():
    print("\n--- TEST 2: Pipeline Live - Aracaju Real MediaDNA Detections ---")
    url = "http://127.0.0.1:8092/api/detection/fma-live/Aracaju-SMME-328-CS1"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        dets = data.get("recent_detections", [])
        print(f"[OK] Total detections returned: {len(dets)}")
        assert len(dets) >= 20, f"Expected at least 20 detections, got {len(dets)}"
        
        # Check channels
        globo_spots = [d for d in dets if d["channel"] == "GLOBO"]
        record_spots = [d for d in dets if d["channel"] == "RECORD"]
        band_spots = [d for d in dets if d["channel"] == "BAND"]
        
        print(f"[OK] GLOBO detections: {len(globo_spots)}")
        print(f"[OK] RECORD detections: {len(record_spots)}")
        print(f"[OK] BAND detections: {len(band_spots)}")
        assert len(globo_spots) >= 10, f"Expected at least 10 GLOBO detections, got {len(globo_spots)}"
        assert len(record_spots) >= 4, f"Expected at least 4 RECORD detections, got {len(record_spots)}"
        assert len(band_spots) >= 4, f"Expected at least 4 BAND detections, got {len(band_spots)}"
        
        # Verify 8-digit spot IDs
        sample_ids = [d["spot_id"] for d in dets[:5]]
        print(f"[OK] Sample authentic 8-digit spot IDs: {sample_ids}")
        for s_id in sample_ids:
            assert len(s_id) == 8 and s_id.isdigit(), f"Invalid spot ID format: {s_id}"

def test_portal_html_sheet_editor():
    print("\n--- TEST 3: Portal Web - Online Sheet Editor Full Screen & Local Desktop Options ---")
    portal_html = r"E:\desenvolvimento\Monitor_Esportes\docs\index.html"
    assert os.path.exists(portal_html), "Portal index.html does not exist!"
    with open(portal_html, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert "width:100vw;height:100vh" in content or "width: 100vw; height: 100vh" in content or "width:100vw;height:100vh" in content.replace(" ", ""), "Full screen style not found in portal HTML"
    assert "btn-open-desktop-excel" in content, "Desktop Excel opener button not found"
    assert "ms-excel:ofe|u|" in content, "Office Protocol URI handler not found"
    assert "sheet-formula-bar" in content, "fx Formula bar not found"
    assert "input-sheet-sync-local" in content, "Local file sync input not found"
    print("[OK] Portal Web HTML contains all full-screen layout, Excel Desktop integration, fx bar, and local sync elements!")

if __name__ == "__main__":
    test_github_release_v2527()
    test_pipeline_live_aracaju_detections()
    test_portal_html_sheet_editor()
    print("\n==========================================")
    print(" ALL 3 VALIDATION TESTS PASSED WITH 100% SUCCESS!")
    print("==========================================")
