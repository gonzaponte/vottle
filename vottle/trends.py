"""Compact PVPC daily summaries and disposable backfill cache."""

import json
import math
import sys
import time
from datetime import date, datetime, timedelta, timezone

from .api import Unavailable, source_url
from .pricing import hours, validated_hours

ERRORS = (Unavailable, ValueError, KeyError, TypeError, RuntimeError, OSError)


def summarize(payload, day, demo=False):
    values = [total for _, _, total in validated_hours(payload, day)]
    return {
        "date": str(day),
        "status": "available",
        "min": float(min(values)),
        "mean": float(sum(values) / len(values)),
        "max": float(max(values)),
        "intervals": len(values),
        "source_url": source_url(day),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "demo": demo,
    }


def valid_cached(row, demo=False):
    try:
        day = date.fromisoformat(row["date"])
        values = [row[key] for key in ("min", "mean", "max")]
        stamp = datetime.fromisoformat(row["retrieved_at"])
        return (
            row["status"] == "available"
            and row["demo"] is demo
            and row["source_url"] == source_url(day)
            and stamp.utcoffset() is not None
            and type(row["intervals"]) is int
            and row["intervals"] == len(hours(day))
            and all(type(v) in (int, float) and math.isfinite(v) for v in values)
            and values[0] <= values[1] <= values[2]
        )
    except (ValueError, KeyError, TypeError):
        return False


def collect_trends(day, known, fetcher, cache_path, fixture_dir=None, clock=time.monotonic):
    cache = {}
    if fixture_dir is None:
        try:
            saved = json.loads(cache_path.read_text())
            if saved.get("version") == 1:
                for row in saved.get("days", []):
                    if isinstance(row, dict) and valid_cached(row):
                        cache[row["date"]] = row
        except (OSError, ValueError, TypeError, AttributeError):
            pass
    if fixture_dir:
        try:
            for row in json.loads((fixture_dir / "trends.json").read_text()):
                if isinstance(row, dict) and valid_cached(row, demo=True):
                    cache[row["date"]] = row
        except (OSError, ValueError, TypeError):
            pass
    started = clock()
    results = []
    for offset in range(90):
        target = day - timedelta(days=offset)
        cached = cache.get(str(target))
        row = cached
        # Revalidate the recent week; old summaries need fetching only on a cache miss.
        if str(target) in known or offset <= 7 or cached is None:
            try:
                if str(target) in known:
                    payload = known[str(target)]
                elif fixture_dir:
                    payload = json.loads((fixture_dir / f"{target}.json").read_text())
                elif clock() - started < 120:
                    payload = fetcher(target)
                else:
                    raise Unavailable("Historical backfill budget reached")
                row = summarize(payload, target, demo=bool(fixture_dir))
            except ERRORS:
                pass  # Retain a validated cached row, with its original retrieval timestamp.
        results.append(
            row or {"date": str(target), "status": "unavailable", "demo": bool(fixture_dir)}
        )
    results.reverse()
    if fixture_dir is None:
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache_path.with_suffix(".tmp")
            temporary.write_text(
                json.dumps(
                    {"version": 1, "days": [r for r in results if r["status"] == "available"]}
                )
                + "\n"
            )
            temporary.replace(cache_path)
        except OSError as exc:
            print(f"vottle: warning: cannot save disposable trends cache: {exc}", file=sys.stderr)
    return results
