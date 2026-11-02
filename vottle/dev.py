"""Local static server with automatic source rebuild and browser refresh."""

import functools
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from .__main__ import build
from .pricing import ROOT


def serve():
    build()

    def watch():
        previous = None
        while True:
            state = tuple(
                (str(p), p.stat().st_mtime_ns) for p in (ROOT / "web").rglob("*") if p.is_file()
            )
            if previous is not None and state != previous:
                build()
            previous = state
            time.sleep(1)

    threading.Thread(target=watch, daemon=True).start()
    server = ThreadingHTTPServer(
        ("127.0.0.1", 8000),
        functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT / "dist")),
    )
    print("vottle: http://127.0.0.1:8000 (source changes rebuild automatically)", flush=True)
    server.serve_forever()
