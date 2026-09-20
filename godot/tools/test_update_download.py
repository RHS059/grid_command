"""Exercise the real Godot downloader against deterministic loopback failures.

Run: python tools/test_update_download.py --godot PATH_TO_GODOT
No GitHub requests, installed patches, or game sessions are touched.
"""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from collections import defaultdict

PAYLOAD = bytes(range(256)) * 4096
DIGEST = hashlib.sha256(PAYLOAD).hexdigest()
REQUESTS = defaultdict(list)
VALIDATORS = defaultdict(list)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        route = self.path.strip("/")
        header = self.headers.get("Range", "")
        REQUESTS[route].append((header, time.monotonic()))
        VALIDATORS[route].append(self.headers.get("If-Range", ""))
        attempt = len(REQUESTS[route])
        if route == "redirect":
            self.send_response(302)
            self.send_header("Location", "/redirect_target")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        offset = int(header.removeprefix("bytes=").split("-")[0]) if header else 0
        if route == "retry" and attempt < 3:
            self.send_response(503)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if route == "ignore":
            offset = 0
        if route == "range416" and offset:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{len(PAYLOAD)}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = PAYLOAD[offset:]
        if route == "corrupt":
            body = b"X" * len(body)
        self.send_response(206 if offset else 200)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", '"fixture-v2"' if route == "changed" and attempt > 1 else '"fixture-v1"')
        if offset:
            start = offset + 1 if route == "bad_range" else offset
            self.send_header("Content-Range", f"bytes {start}-{len(PAYLOAD)-1}/{len(PAYLOAD)}")
        self.end_headers()
        if route in ("interrupted", "ignore", "range416", "bad_range", "changed", "redirect_target") and attempt == 1:
            self.wfile.write(body[:131072])
            self.wfile.flush()
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        if route == "persist" and attempt <= 3:
            self.wfile.write(body[:65536])
            self.wfile.flush()
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot", required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1]
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="grid-update-test-") as temporary:
            folder = Path(temporary)
            (folder / "scripts").mkdir()
            shutil.copy2(project / "scripts/update_service.gd", folder / "scripts/update_service.gd")
            shutil.copy2(project / "tests/update_download_smoke.gd", folder / "test.gd")
            (folder / "project.godot").write_text('[application]\nconfig/name="Grid Update Download Test"\nconfig/version="0.0.0"\n', encoding="utf-8")
            environment = os.environ.copy()
            environment.update(APPDATA=str(folder), XDG_DATA_HOME=str(folder))
            result = subprocess.run([args.godot, "--headless", "--path", str(folder), "--script", "res://test.gd", "--", "--smoke-test", f"http://127.0.0.1:{server.server_port}", DIGEST, str(len(PAYLOAD))], timeout=120, capture_output=True, text=True, env=environment)
            print(result.stdout)
            print(result.stderr)
            assert result.returncode == 0, f"Godot tests failed: {result.returncode}"
            assert "SCRIPT ERROR" not in result.stderr, "Godot reported a script error"
            assert "GRID_UPDATE_DOWNLOAD_SMOKE: 0 failures" in result.stdout, "Godot test completion marker missing"
        for route in ("interrupted", "persist", "ignore", "range416", "bad_range"):
            assert any(header for header, _ in REQUESTS[route][1:]), f"{route}: no resumed Range request"
            assert VALIDATORS[route][1] == '"fixture-v1"', f"{route}: saved ETag was not sent in If-Range"
        assert [header for header, _ in REQUESTS["changed"]] == ["", "bytes=131072-", ""], "Changed ETag must discard stale range and restart fresh"
        assert [header for header, _ in REQUESTS["redirect"]] == ["", "bytes=131072-"], "Redirect request must retain Range"
        assert [header for header, _ in REQUESTS["redirect_target"]] == ["", "bytes=131072-"], "Redirect target must retain Range"
        assert VALIDATORS["redirect_target"][1] == '"fixture-v1"', "Redirect target must retain If-Range"
        assert [header for header, _ in REQUESTS["identity"]] == [""], "Stale metadata must not resume an unrelated payload"
        assert len(REQUESTS["cached"]) == 1, "Verified cached file was downloaded again"
        retries = REQUESTS["retry"]
        assert len(retries) == 3, f"Unexpected retry count: {retries}"
        assert retries[1][1] - retries[0][1] >= 0.9, "First retry lacked backoff"
        assert retries[2][1] - retries[1][1] >= 1.9, "Second retry lacked backoff"
        print("GRID_UPDATE_HTTP_TEST_OK: resume, retained bytes, ignored Range, checksum, cache, backoff")
        print(json.dumps({key: [header for header, _ in values] for key, values in REQUESTS.items()}, indent=2))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
