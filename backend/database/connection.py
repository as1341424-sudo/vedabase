import sqlite3
import threading
import os

_local = threading.local()
_DB_PATH = None

def set_db_path(path: str):
    global _DB_PATH
    _DB_PATH = path

def get_connection() -> sqlite3.Connection:
    """Return a thread-local SQLite connection with performance pragmas.

    Each OS thread gets its own connection via threading.local, so
    check_same_thread=True is correct (SQLite will enforce it per-connection).
    """
    if not hasattr(_local, 'conn') or _local.conn is None:
        conn = sqlite3.connect(_DB_PATH, check_same_thread=True)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA cache_size=-65536")  # 64 MB cache
        conn.execute("PRAGMA mmap_size=268435456")  # 256 MB mmap
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=OFF")
        _local.conn = conn
    return _local.conn

def close_connection():
    if hasattr(_local, 'conn') and _local.conn:
        _local.conn.close()
        _local.conn = None
