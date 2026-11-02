"""Run with python -m vottle {fetch,build,dev}."""

import argparse
import json
import os
import shutil
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .api import Unavailable, fetch, source_url
from .pricing import MADRID, ROOT, normalize


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def acquire(day, fixture_dir=None):
    datasets = []
    for offset in (0, 1):
        target = day + timedelta(days=offset)
        try:
            payload = (
                json.loads((fixture_dir / f"{target}.json").read_text())
                if fixture_dir
                else fetch(target)
            )
            dataset = normalize(payload, target)
            dataset.update(
                status="available",
                source_url=source_url(target),
                retrieved_at=datetime.now(timezone.utc).isoformat(),
                demo=bool(fixture_dir),
            )
            for warning in dataset["warnings"]:
                print(
                    f"vottle: warning: {target}: {warning['code']} in "
                    f"{len(warning['hours'])} hours; preserving official totals and "
                    "aggregate regulated prices; unverified split omitted",
                    file=sys.stderr,
                )
            datasets.append(dataset)
        except (Unavailable, FileNotFoundError):
            if offset == 0:
                raise ValueError(f"Today's official data is unavailable: {target}") from None
            datasets.append(
                {"date": str(target), "status": "not_published", "demo": bool(fixture_dir)}
            )
    # One atomic bundle prevents partial updates after any failed validation.
    write_json(
        ROOT / "data/prices.json",
        {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "days": datasets,
        },
    )


def build():
    bundle = json.loads((ROOT / "data/prices.json").read_text())
    if bundle.get("schema_version") != 1 or not bundle.get("days"):
        raise ValueError("Missing validated prices; run just fetch first")
    output = ROOT / "dist"
    assets = Path(os.environ.get("CHARTJS_ASSETS", ""))
    if not (assets / "chart.umd.js").is_file():
        raise ValueError("Chart.js assets unavailable; run inside nix develop")
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(ROOT / "web", output)
    for name in ("chart.umd.js", "CHART-LICENSE.md"):
        shutil.copy2(assets / name, output / "assets" / name)
    write_json(output / "data/prices.json", bundle)
    (output / ".nojekyll").touch()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("fetch", "build", "dev"))
    parser.add_argument("--date", type=date.fromisoformat)
    parser.add_argument("--fixtures", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "fetch":
            acquire(args.date or datetime.now(MADRID).date(), args.fixtures)
        elif args.command == "build":
            build()
        else:
            from .dev import serve

            serve()
    except (ValueError, KeyError, TypeError, RuntimeError, OSError) as exc:
        print(f"vottle: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
