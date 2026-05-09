import unittest
from pathlib import Path
import json

from services.search_client import _dedupe_and_filter


class SearchClientNormalizationTests(unittest.TestCase):
    def test_dedupes_and_blocks_domains(self) -> None:
        fixture_path = Path(__file__).resolve().parent / "fixtures" / "search_response.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        raw_results = fixture["results"]

        normalized = _dedupe_and_filter(
            raw_results,
            {"dictionary.com"},
            ("/dictionary/",),
            (".pdf",),
            limit=10,
        )

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]["title"], "Court blocks Trump administration action")
        self.assertEqual(normalized[0]["engine"], "bing")


if __name__ == "__main__":
    unittest.main()
