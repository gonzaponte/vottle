"""Bounded, retrying ESIOS HTTP client; absence is distinct from failure."""

import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class Unavailable(Exception):
    """The requested official archive has not been published."""


def source_url(day):
    return f"https://api.esios.ree.es/archives/70/download_json?locale=es&date={day.isoformat()}"


def fetch(day, opener=urlopen, sleep=time.sleep):
    url = source_url(day)
    for attempt in range(3):
        try:
            request = Request(
                url, headers={"User-Agent": "vottle/1.0", "Accept": "application/json"}
            )
            with opener(request, timeout=20) as response:
                raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError("ESIOS response exceeds size limit")
            payload = json.loads(raw)
            if payload == {"PVPC": []}:
                raise Unavailable(str(day))
            return payload
        except HTTPError as exc:
            exc.close()
            if exc.code in (404, 422):
                raise Unavailable(str(day)) from exc
            if exc.code < 500 and exc.code != 429:
                raise RuntimeError(f"ESIOS HTTP {exc.code}: {url}") from exc
            error = exc
        except (URLError, TimeoutError, OSError) as exc:
            error = exc
        if attempt < 2:
            sleep(2**attempt)
    raise RuntimeError(f"ESIOS request failed after 3 attempts: {url}: {error}")
