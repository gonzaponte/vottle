import copy
import io
import json
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from vottle import api
from vottle.__main__ import acquire
from vottle.pricing import MADRID, hours, normalize, number, period, tariff


def fixture(day, negative=False):
    rates = tariff(day)
    rows = []
    for instant in hours(day):
        rate = rates["periods"][period(instant, rates)]
        regulated = (Decimal(rate["peajes"]) + Decimal(rate["cargos"])) * 1000
        rows.append(
            {
                "Dia": day.strftime("%d/%m/%Y"),
                "Hora": f"{instant.hour:02}-{instant.hour + 1:02}",
                "PCB": "-12,34" if negative else "123,45",
                "TEUPCB": str(round(regulated, 2)).replace(".", ","),
            }
        )
    return {"PVPC": rows}


class Prices(unittest.TestCase):
    def test_normal_and_dst(self):
        for day, count in [
            (date(2026, 2, 3), 24),
            (date(2026, 3, 29), 23),
            (date(2026, 10, 25), 25),
        ]:
            data = normalize(fixture(day), day)
            self.assertEqual(len(data["hours"]), count)
            self.assertEqual(len({h["start"] for h in data["hours"]}), count)
        repeated = [h for h in data["hours"] if h["label"].startswith("02:")]
        self.assertEqual(len(repeated), 2)
        self.assertNotEqual(repeated[0]["start"], repeated[1]["start"])

    def test_decimal_conversion_and_decomposition(self):
        self.assertEqual(number("-12,34"), Decimal("-12.34"))
        self.assertEqual(number("1.234,56"), Decimal("1234.56"))
        day = date(2026, 11, 2)
        row = normalize(fixture(day, True), day)["hours"][0]
        self.assertEqual(row["total"], -0.01234)
        self.assertAlmostEqual(row["total"], row["peajes"] + row["cargos"] + row["remaining"])
        self.assertNotIn("power", row)
        for value in ["NaN", "Infinity", "1,2,3", "", True]:
            with self.assertRaises(ValueError):
                number(value)

    def test_recorded_calendar_disagreement(self):
        payload = json.loads((Path(__file__).parent / "fixtures/esios-2026-11-02.json").read_text())
        data = normalize(payload, date(2026, 11, 2))
        self.assertEqual(len(data["hours"]), 24)
        self.assertEqual(len(data["warnings"]), 1)
        self.assertEqual(len(data["warnings"][0]["hours"]), 16)
        normal, mismatch = data["hours"][7:9]
        self.assertEqual(normal["period"], "valle")
        self.assertIsNotNone(normal["peajes"])
        self.assertEqual(mismatch["calendar_period"], "llano")
        self.assertAlmostEqual(mismatch["calendar_regulated"], 0.029267)
        for row in data["hours"][8:]:
            self.assertIsNone(row["period"])
            self.assertIsNone(row["peajes"])
            self.assertIsNone(row["cargos"])
            self.assertEqual(row["regulated"], row["source_regulated"])
            self.assertAlmostEqual(row["remaining"] + row["regulated"], row["total"])
        for raw, row in zip(payload["PVPC"], data["hours"], strict=True):
            self.assertEqual(row["total"], float(number(raw["PCB"]) / 1000))

    def test_calendar_disagreement_preserves_negative_prices(self):
        day = date(2026, 11, 2)
        payload = fixture(day, True)
        payload["PVPC"][10]["TEUPCB"] = "3,29"
        data = normalize(payload, day)
        self.assertEqual(len(data["warnings"][0]["hours"]), 1)
        self.assertEqual(data["hours"][10]["total"], -0.01234)
        self.assertAlmostEqual(data["hours"][10]["remaining"], -0.01563)
        self.assertEqual(normalize(fixture(day), day)["warnings"], [])

    def test_ordinal_autumn_hours(self):
        day = date(2026, 10, 25)
        payload = fixture(day)
        for index, row in enumerate(payload["PVPC"]):
            row["Hora"] = f"{index:02}-{index + 1:02}"
        data = normalize(payload, day)
        self.assertEqual(data["hours"][3]["label"], "02:00 CET")
        self.assertEqual(data["hours"][-1]["label"], "23:00 CET")
        payload["PVPC"][-1]["Hora"] = "23-24"
        with self.assertRaises(ValueError):
            normalize(payload, day)

    def test_periods(self):
        rates = tariff(date(2026, 1, 1))
        for day, hour, expected in [
            ("2026-11-02", 7, "valle"),
            ("2026-11-02", 8, "llano"),
            ("2026-11-02", 10, "punta"),
            ("2026-11-02", 14, "llano"),
            ("2026-11-02", 18, "punta"),
            ("2026-11-02", 22, "llano"),
            ("2026-01-06", 12, "valle"),
            ("2026-04-03", 12, "punta"),
            ("2026-10-12", 12, "valle"),
            ("2026-11-07", 12, "valle"),
            ("2026-11-02", 12, "punta"),
        ]:
            self.assertEqual(
                period(datetime.fromisoformat(f"{day}T{hour:02}:00").replace(tzinfo=MADRID), rates),
                expected,
            )

    def test_annual_boundaries(self):
        tariff(date(2026, 12, 31))
        for day in [date(2025, 12, 31), date(2027, 1, 1)]:
            with self.assertRaises(ValueError):
                tariff(day)

    def test_invalid_sources(self):
        day = date(2026, 11, 2)
        base = fixture(day)
        for field, value in [
            ("Dia", "01/11/2026"),
            ("Hora", "01-02"),
            ("PCB", "NaN"),
            ("TEUPCB", "99,99"),
        ]:
            data = copy.deepcopy(base)
            data["PVPC"][0][field] = value
            with self.assertRaises(ValueError):
                normalize(data, day)
        for data in [{}, [], {"PVPC": []}, {"PVPC": base["PVPC"][:-1]}]:
            with self.assertRaises(ValueError):
                normalize(data, day)
        del base["PVPC"][0]["PCB"]
        with self.assertRaises(KeyError):
            normalize(base, day)

    def test_http(self):
        for error in [
            TimeoutError("timeout"),
            URLError("offline"),
            HTTPError("url", 503, "error", {}, None),
        ]:
            with (
                self.subTest(error=error),
                patch("vottle.api.urlopen", side_effect=error) as opener,
            ):
                with self.assertRaises(RuntimeError):
                    api.fetch(date(2026, 11, 2), opener=opener, sleep=lambda _: None)
                self.assertEqual(opener.call_count, 3)
        for code in [404, 422]:
            with self.assertRaises(api.Unavailable):
                api.fetch(
                    date(2026, 11, 2),
                    opener=lambda *a, **kw: (_ for _ in ()).throw(
                        HTTPError("url", code, "absent", {}, None)
                    ),
                )
        with self.assertRaises(api.Unavailable):
            api.fetch(date(2026, 11, 2), opener=lambda *a, **kw: io.BytesIO(b'{"PVPC": []}'))
        with self.assertRaises(api.Unavailable):
            api.fetch(
                date(2026, 11, 3),
                opener=lambda *a, **kw: io.BytesIO(
                    b'{"message": "No values for specified archive"}'
                ),
            )
        with self.assertRaises(ValueError):
            api.fetch(date(2026, 11, 2), opener=lambda *a, **kw: io.BytesIO(b"broken"))

    def test_tomorrow_absent_and_atomic_failure(self):
        day = date(2026, 11, 2)
        with (
            patch("vottle.__main__.fetch", side_effect=[fixture(day), api.Unavailable()]),
            patch("vottle.__main__.write_json") as writer,
        ):
            acquire(day)
            self.assertEqual(writer.call_args.args[1]["days"][1]["status"], "not_published")
        with (
            patch("vottle.__main__.fetch", side_effect=[fixture(day), RuntimeError("offline")]),
            patch("vottle.__main__.write_json") as writer,
        ):
            with self.assertRaises(RuntimeError):
                acquire(day)
            writer.assert_not_called()

    def test_synthetic_fixture(self):
        path = Path(__file__).parent / "fixtures/2026-11-01.json"
        normalize(json.loads(path.read_text()), date(2026, 11, 1))


if __name__ == "__main__":
    unittest.main()
