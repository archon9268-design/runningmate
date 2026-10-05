"""런닝메이트 로컬 서버. pythonw(콘솔 없음)로 실행해도 동작하도록 로그를 끈다."""
import functools
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".png": "image/png",
    }

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
