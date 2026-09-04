#!/usr/bin/env python3
"""Serve public/ with caching off, so a rebuild shows up on reload."""
import http.server
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "public"
PORT = int(os.environ.get("PORT", "8479"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"http://localhost:{PORT}/  serving {ROOT}")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
