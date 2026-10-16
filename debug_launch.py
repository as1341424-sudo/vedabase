import sys
import os
import traceback

# Force stdout to be visible
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

print("=== VedaBase Debug Launcher ===", flush=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
print(f"Base dir: {BASE_DIR}", flush=True)

# 1. Check DB
DATA_DIR = os.path.join(BASE_DIR, 'data')
DB_PATH = os.path.join(DATA_DIR, 'folio.db')
SRC_DB  = r'C:\Users\anura\Downloads\folio.db'

os.makedirs(DATA_DIR, exist_ok=True)

if not os.path.exists(DB_PATH):
    if os.path.exists(SRC_DB):
        print(f"Copying DB from {SRC_DB} ...", flush=True)
        import shutil
        shutil.copy2(SRC_DB, DB_PATH)
        print("DB copied OK", flush=True)
    else:
        print(f"ERROR: DB not found at {SRC_DB}", flush=True)
        sys.exit(1)
else:
    print(f"DB exists: {DB_PATH} ({os.path.getsize(DB_PATH)//1024//1024} MB)", flush=True)

# 2. Check frontend
frontend = os.path.join(BASE_DIR, 'frontend', 'src', 'index.html')
print(f"Frontend: {frontend} exists={os.path.exists(frontend)}", flush=True)

# 3. Import backend
try:
    from backend.database.connection import set_db_path
    from backend.api import VedabaseApi
    set_db_path(DB_PATH)
    api = VedabaseApi()
    print("Backend OK", flush=True)
except Exception as e:
    print(f"Backend ERROR: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# 4. Check webview
try:
    import webview
    print(f"PyWebView version: {webview.__version__}", flush=True)
except ImportError as e:
    print(f"PyWebView not installed: {e}", flush=True)
    sys.exit(1)

# 5. Launch
print("Launching PyWebView window...", flush=True)
try:
    window = webview.create_window(
        title='Bhaktivedanta VedaBase 2019',
        url=f'file:///{frontend.replace(os.sep, "/")}',
        js_api=api,
        width=1440,
        height=900,
        min_size=(1024, 600),
        background_color='#080B14',
        text_select=True,
    )
    print(f"Window created: {window}", flush=True)
    print("Starting webview event loop...", flush=True)
    webview.start(debug=True, private_mode=False)
    print("Window closed normally.", flush=True)
except Exception as e:
    print(f"PyWebView ERROR: {e}", flush=True)
    traceback.print_exc()
