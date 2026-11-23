import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import Mock

from test_pipeline import fixture

from vottle.api import Unavailable
from vottle.trends import collect_trends, summarize, valid_cached


class Trends(unittest.TestCase):
    def test_stats_dst_and_year_without_tariffs(self):
        for day, count in [(date(2026, 3, 29), 23), (date(2026, 10, 25), 25)]:
            payload = fixture(day)
            for index, row in enumerate(payload["PVPC"]):
                row["PCB"] = str(index - 10)
            summary = summarize(payload, day)
            self.assertEqual(summary["intervals"], count)
            self.assertEqual(summary["min"], -0.01)
            self.assertAlmostEqual(summary["mean"], ((count - 1) / 2 - 10) / 1000)
            payload["PVPC"].pop()
            with self.assertRaises(ValueError):
                summarize(payload, day)
        payload = fixture(date(2026, 1, 2))
        for row in payload["PVPC"]:
            row["Dia"] = "02/01/2025"
        self.assertEqual(summarize(payload, date(2025, 1, 2))["intervals"], 24)

    def test_cache_and_budget(self):
        day = date(2026, 11, 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cache.json"
            fetch = Mock(side_effect=lambda target: fixture(target))
            rows = collect_trends(day, {}, fetch, path)
            self.assertEqual(len(rows), 90)
            self.assertEqual(fetch.call_count, 90)
            self.assertTrue(all(valid_cached(row) for row in rows))
            fetch.reset_mock()
            again = collect_trends(day, {}, fetch, path)
            self.assertEqual(fetch.call_count, 8)
            self.assertEqual(again[0]["retrieved_at"], rows[0]["retrieved_at"])
            fetch.side_effect = Unavailable()
            fallback = collect_trends(day, {}, fetch, path)
            self.assertEqual(fallback, again)
            path.write_text("broken")
            empty = collect_trends(day, {}, fetch, path, clock=Mock(side_effect=[0] + [121] * 90))
            self.assertTrue(all(row["status"] == "unavailable" for row in empty))
            self.assertEqual(
                fetch.call_count, 16
            )  # No requests were started after the budget expired.

    def test_cache_validation_and_demo_isolation(self):
        day = date(2026, 11, 1)
        row = summarize(fixture(day), day)
        for key, value in [
            ("mean", float("nan")),
            ("intervals", 23),
            ("source_url", "https://example.com"),
            ("retrieved_at", "bad"),
            ("max", -0.99),
        ]:
            bad = dict(row)
            bad[key] = value
            self.assertFalse(valid_cached(bad))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "production.json"
            path.write_text("untouched")
            (root / f"{day}.json").write_text(json.dumps(fixture(day)))
            fetch = Mock()
            results = collect_trends(day, {}, fetch, path, fixture_dir=root)
            self.assertEqual(sum(r["status"] == "available" for r in results), 1)
            self.assertTrue(results[-1]["demo"])
            fetch.assert_not_called()
            self.assertEqual(path.read_text(), "untouched")

    def test_known_payloads_and_refresh(self):
        day = date(2026, 11, 1)
        with tempfile.TemporaryDirectory() as directory:
            fetch = Mock(side_effect=Unavailable())
            known = {
                str(day - timedelta(days=i)): fixture(day - timedelta(days=i)) for i in range(8)
            }
            rows = collect_trends(day, known, fetch, Path(directory) / "cache.json")
            self.assertEqual(fetch.call_count, 82)
            self.assertEqual(sum(r["status"] == "available" for r in rows), 8)
