"""Decimal prices, annual rates and tariff periods (mainland civil time)."""

import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")
ROOT = Path(__file__).resolve().parent.parent


def number(value):
    text = str(value).strip()
    if re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+,\d+", text):
        text = text.replace(".", "")
    if not re.fullmatch(r"-?\d+(?:[.,]\d+)?", text):
        raise ValueError(f"Invalid decimal: {value!r}")
    try:
        result = Decimal(text.replace(",", "."))
    except InvalidOperation as exc:
        raise ValueError("Invalid number") from exc
    if not result.is_finite():
        raise ValueError("Nonfinite number")
    return result


def tariff(day):
    rates = json.loads((ROOT / "config/tariffs.json").read_text())
    entry = rates.get(str(day.year))
    if not entry or not entry["valid_from"] <= day.isoformat() <= entry["valid_until"]:
        raise ValueError(f"No verified regulated tariffs for {day}")
    return entry


def period(moment, rates):
    if moment.weekday() >= 5 or moment.strftime("%m-%d") in rates["valley_holidays"]:
        return "valle"
    hour = moment.hour
    if hour < 8:
        return "valle"
    return "punta" if 10 <= hour < 14 or 18 <= hour < 22 else "llano"


def hours(day):
    start = datetime.combine(day, datetime.min.time(), MADRID).astimezone(timezone.utc)
    end = datetime.combine(day + timedelta(days=1), datetime.min.time(), MADRID).astimezone(
        timezone.utc
    )
    result = []
    while start < end:
        result.append(start.astimezone(MADRID))
        start += timedelta(hours=1)
    return result


def normalize(payload, day):
    rates = tariff(day)
    rows = payload.get("PVPC") if isinstance(payload, dict) else None
    instants = hours(day)
    if not isinstance(rows, list) or len(rows) != len(instants):
        raise ValueError(f"Expected {len(instants)} hourly PVPC rows for {day}")
    if any(not isinstance(row, dict) for row in rows):
        raise ValueError("Each PVPC row must be an object")
    # Archive 70 also uses ordinal slots 00-01 through 24-25 on autumn DST days.
    ordinal = len(rows) == 25 and [r.get("Hora") for r in rows] == [
        f"{i:02}-{i + 1:02}" for i in range(25)
    ]
    normalized = []
    mismatched_hours = []
    for index, (row, instant) in enumerate(zip(rows, instants, strict=True)):
        if day != datetime.strptime(row["Dia"], "%d/%m/%Y").date():
            raise ValueError("Source date differs from requested date")
        # Validate the complete ordinal sequence or individual civil-hour labels.
        label = row["Hora"]
        match = re.fullmatch(r"(\d{2})(?:[ABab])?-(\d{2})(?:[ABab])?", label)
        expected_hour = index if ordinal else instant.hour
        if not match or int(match[1]) != expected_hour or int(match[2]) != expected_hour + 1:
            raise ValueError(f"Unexpected source hour {label!r} at {instant}")
        total, published = number(row["PCB"]) / 1000, number(row["TEUPCB"]) / 1000
        name = period(instant, rates)
        access = number(rates["periods"][name]["peajes"])
        charges = number(rates["periods"][name]["cargos"])
        regulated = access + charges
        # Archive 70 rounds EUR/MWh to two decimals, i.e. 0.000005 EUR/kWh.
        calendar_name, calendar_regulated = name, regulated
        if abs(published - regulated) > Decimal("0.000005"):
            known_amounts = [
                number(rate["peajes"]) + number(rate["cargos"])
                for rate in rates["periods"].values()
            ]
            if not any(abs(published - amount) <= Decimal("0.000005") for amount in known_amounts):
                raise ValueError(f"Unknown regulated term at {instant}: {published}")
            # Preserve official aggregate prices without asserting an unverified split/calendar.
            mismatched_hours.append(instant.isoformat())
            name, access, charges, regulated = None, None, None, published
        normalized.append(
            {
                "start": instant.isoformat(),
                "end": (instant.astimezone(timezone.utc) + timedelta(hours=1)).isoformat(),
                "label": instant.strftime("%H:%M %Z"),
                "source_hour": label,
                "period": name,
                "calendar_period": calendar_name,
                "calendar_regulated": float(calendar_regulated),
                "total": float(total),
                "peajes": float(access) if access is not None else None,
                "cargos": float(charges) if charges is not None else None,
                "regulated": float(regulated),
                "remaining": float(total - regulated),
                "source_regulated": float(published),
            }
        )
    return {
        "date": day.isoformat(),
        "timezone": "Europe/Madrid",
        "unit": "EUR/kWh",
        "region": "Península (PCB)",
        "tariff_sources": rates["sources"],
        "warnings": (
            [{"code": "regulated_calendar_mismatch", "hours": mismatched_hours}]
            if mismatched_hours
            else []
        ),
        "hours": normalized,
    }
