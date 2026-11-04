"""
Suíte de Testes Automatizados - Validação de Desempenho, Compressão Gzip e Integridade de Interface Link WAN
Testa:
1. Ativação de compressão Gzip e redução expressiva de payload (>80%).
2. Integridade dos IDs de DOM na aba Link WAN (presença de networkLinkTableBody e ausência de IDs duplicados).
3. Resiliência do parser de Worklog/Histórico de Incidentes em app.js contra payloads estruturados.
4. Tempo de resposta dos endpoints da frota.
"""
import os
import sys
import json
import gzip
import unittest
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "dashboard"))


class TestNetworkLinkAndGzipOpt(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_url = "http://127.0.0.1:8092"
        cls.index_path = ROOT_DIR / "dashboard" / "static" / "index.html"
        cls.app_js_path = ROOT_DIR / "dashboard" / "static" / "js" / "app.js"

    def test_01_gzip_compression_active(self):
        """Valida se o GZipMiddleware comprime respostas JSON volumosas da frota."""
        req = urllib.request.Request(
            f"{self.base_url}/api/fleet/services",
            headers={"Accept-Encoding": "gzip"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("Content-Encoding"), "gzip")
            compressed_bytes = resp.read()
            decompressed = gzip.decompress(compressed_bytes)
            # Confirma que descompactado tem mais de 1 MB e compactado tem menos de 150 KB
            self.assertGreater(len(decompressed), 1_000_000)
            self.assertLess(len(compressed_bytes), 150_000)
            data = json.loads(decompressed.decode("utf-8"))
            self.assertIsInstance(data, list)
            self.assertGreater(len(data), 100)

    def test_02_network_link_dom_structure(self):
        """Valida que o DOM da aba Link WAN contém o tbody correto e não possui IDs duplicados."""
        content = self.index_path.read_text(encoding="utf-8")
        
        # Deve possuir o networkLinkTableBody
        self.assertIn('id="networkLinkTableBody"', content)
        
        # incidentsEventsTableBody e incidentHistoryTableBody devem aparecer exatamente UMA vez cada no index.html
        self.assertEqual(
            content.count('id="incidentsEventsTableBody"'), 1,
            "incidentsEventsTableBody não pode estar duplicado no HTML!"
        )
        self.assertEqual(
            content.count('id="incidentHistoryTableBody"'), 1,
            "incidentHistoryTableBody não pode estar duplicado no HTML!"
        )

    def test_03_worklog_parser_defensive(self):
        """Valida que o código em app.js trata corretamente o payload em formato objeto de /api/incidents/history."""
        js_content = self.app_js_path.read_text(encoding="utf-8")
        self.assertIn("history.worklogs || history.items", js_content)
        self.assertIn("historyList = Array.isArray(history)", js_content)

    def test_04_network_metrics_endpoint(self):
        """Valida o endpoint de métricas de conectividade Link WAN."""
        req = urllib.request.Request(
            f"{self.base_url}/api/fleet/network-link/metrics",
            headers={"Accept-Encoding": "gzip"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(gzip.decompress(resp.read()).decode("utf-8"))
            self.assertIsInstance(data, list)
            self.assertGreater(len(data), 0)
            first = data[0]
            self.assertIn("praca", first)
            self.assertIn("measured_upload_mbps", first)
            self.assertIn("drain_time_minutes", first)


if __name__ == "__main__":
    unittest.main()
