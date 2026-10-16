#!/usr/bin/env python3
"""
Bhaktivedanta VedaBase — Browser-based Launcher
Serves the app on localhost and opens it in your default browser.
No PyWebView dependency required.
"""
import os
import sys
import shutil
import threading
import webbrowser
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(BASE_DIR, 'data')
DB_PATH   = os.path.join(DATA_DIR, 'folio.db')
SOURCE_DB = r'C:\Users\anura\Downloads\folio.db'
PORT      = 7777

# ── Bootstrap DB ──────────────────────────────────────────────────────────────
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(DB_PATH):
    if os.path.exists(SOURCE_DB):
        print(f"[VedaBase] Copying database from {SOURCE_DB} ...")
        shutil.copy2(SOURCE_DB, DB_PATH)
        print("[VedaBase] Database ready.")
    else:
        print(f"[VedaBase] ERROR: Database not found at {SOURCE_DB}")
        sys.exit(1)
else:
    size_mb = os.path.getsize(DB_PATH) // 1024 // 1024
    print(f"[VedaBase] Database: {DB_PATH} ({size_mb} MB)")

# ── Bootstrap backend ─────────────────────────────────────────────────────────
sys.path.insert(0, BASE_DIR)
from backend.database.connection import set_db_path
from backend.api import VedabaseApi

set_db_path(DB_PATH)
api = VedabaseApi()
print("[VedaBase] Backend API initialized.")

# Pre-warm style cache in background
def warm():
    from backend.database.style_engine import warm_style_cache
    warm_style_cache()
    print("[VedaBase] Style cache warmed.")
threading.Thread(target=warm, daemon=True).start()

# ── HTTP Request Handler ───────────────────────────────────────────────────────
class VedabaseHandler(SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # Suppress request logs for cleanliness

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # API calls: /api/<method>?args=...
        if path.startswith('/api/'):
            self.handle_api_get(path, parsed.query)
            return

        # Static files — serve from frontend/src/
        if path == '/' or path == '/index.html':
            self.serve_file(os.path.join(BASE_DIR, 'frontend', 'src', 'index.html'), 'text/html')
            return

        # CSS / JS / other assets
        rel = path.lstrip('/')
        # Map to frontend/src/
        local = os.path.join(BASE_DIR, 'frontend', 'src', rel)
        if os.path.isfile(local):
            mime = self.guess_mime(local)
            self.serve_file(local, mime)
        else:
            self.send_error(404, f'Not found: {path}')

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/'):
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b'{}'
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            self.handle_api_post(path, data)
        else:
            self.send_error(405)

    def handle_api_get(self, path, query):
        method = path[5:]  # Strip '/api/'
        params = {k: v[0] if len(v)==1 else v for k, v in parse_qs(query).items()}
        self.call_api(method, params)

    def handle_api_post(self, path, data):
        method = path[5:]
        self.call_api(method, data)

    def call_api(self, method, params):
        try:
            fn = getattr(api, method, None)
            if fn is None:
                self.json_response({'error': f'Unknown method: {method}'}, 404)
                return
            # Convert numeric strings to int where needed
            converted = {}
            for k, v in params.items():
                if isinstance(v, str):
                    try: converted[k] = int(v)
                    except ValueError:
                        try: converted[k] = float(v)
                        except ValueError: converted[k] = v
                else:
                    converted[k] = v
            result = fn(**converted)
            self.json_response(result)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.json_response({'error': str(e)}, 500)

    def json_response(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, path, mime='text/plain'):
        try:
            with open(path, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime + ('; charset=utf-8' if 'text' in mime or 'javascript' in mime else ''))
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_error(404, f'File not found: {path}')

    def guess_mime(self, path):
        ext = os.path.splitext(path)[1].lower()
        return {
            '.html': 'text/html',
            '.css':  'text/css',
            '.js':   'application/javascript',
            '.json': 'application/json',
            '.png':  'image/png',
            '.jpg':  'image/jpeg',
            '.svg':  'image/svg+xml',
            '.woff2':'font/woff2',
            '.ico':  'image/x-icon',
        }.get(ext, 'text/plain')


# ── Launch ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), VedabaseHandler)
    url = f'http://127.0.0.1:{PORT}/'

    print(f"\n{'='*55}")
    print(f"  ** Bhaktivedanta VedaBase **")
    print(f"  Opening at: {url}")
    print(f"  Press Ctrl+C to stop")
    print(f"{'='*55}\n")


    # Open browser after short delay
    def open_browser():
        time.sleep(1.2)
        webbrowser.open(url)
    threading.Thread(target=open_browser, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[VedaBase] Server stopped.")
