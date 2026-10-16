#!/usr/bin/env python3
"""
Bhaktivedanta VedaBase — Desktop Application Entry Point
Uses PyWebView to create a native desktop window (no browser needed).
"""
import os
import sys
import shutil
import threading
import traceback

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(BASE_DIR, 'data')
DB_PATH   = os.path.join(DATA_DIR, 'folio.db')
FRONTEND  = os.path.join(BASE_DIR, 'frontend', 'src', 'index.html')

SOURCE_CANDIDATES = [
    r'C:\Users\anura\Downloads\folio.db',
    os.path.join(BASE_DIR, 'folio.db'),
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def log(msg):
    try:
        print(f'[VedaBase] {msg}', flush=True)
    except UnicodeEncodeError:
        print(f'[VedaBase] {msg.encode("ascii","replace").decode()}', flush=True)

def ensure_database():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DB_PATH):
        for src in SOURCE_CANDIDATES:
            if os.path.exists(src):
                log(f'Copying database from {src} ...')
                shutil.copy2(src, DB_PATH)
                log('Database ready.')
                return
        log('WARNING: folio.db not found. App will have no data.')
    else:
        mb = os.path.getsize(DB_PATH) // 1024 // 1024
        log(f'Database: {DB_PATH} ({mb} MB)')

def warm_caches():
    try:
        from backend.database.style_engine import warm_style_cache
        warm_style_cache()
        log('Style cache ready.')
    except Exception as e:
        log(f'Cache warm error: {e}')

# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Change to BASE_DIR so all relative imports and paths work correctly
    os.chdir(BASE_DIR)
    sys.path.insert(0, BASE_DIR)

    # 1. Database
    ensure_database()

    # 2. Backend
    try:
        from backend.database.connection import set_db_path
        from backend.api import VedabaseApi
        set_db_path(DB_PATH)
        api = VedabaseApi()
        log('Backend API ready.')
    except Exception as e:
        log(f'Backend failed to load: {e}')
        traceback.print_exc()
        sys.exit(1)

    # 3. Warm caches in background (non-blocking)
    threading.Thread(target=warm_caches, daemon=True).start()

    # 4. Verify frontend
    if not os.path.exists(FRONTEND):
        log(f'ERROR: Frontend not found at {FRONTEND}')
        sys.exit(1)

    # 5. Import PyWebView
    try:
        import webview
    except ImportError:
        log('PyWebView not installed. Run: pip install pywebview')
        sys.exit(1)

    # 6. Create window
    # PyWebView WinForms/Chromium serves files from cwd (BASE_DIR) via HTTP.
    # Use a relative URL so the built-in server can serve it correctly.
    log('Creating desktop window...')
    window = webview.create_window(
        title='Bhaktivedanta VedaBase 2019',
        url='frontend/src/index.html',
        js_api=api,
        width=1280,
        height=800,
        min_size=(900, 600),
        background_color='#FFFDF5',
        text_select=True,
        confirm_close=False,
    )

    def on_window_shown():
        """Called after PyWebView starts — bring window to front."""
        import time
        time.sleep(0.5)
        try:
            window.bring_to_front()
        except Exception:
            pass
        log('Window shown.')

    log('Launching window...')
    webview.start(
        func=on_window_shown,
        debug=False,
        private_mode=True,   # always load fresh HTML/JS (no Chromium disk cache)
    )
    log('Window closed. Goodbye.')
