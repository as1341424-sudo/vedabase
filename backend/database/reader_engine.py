import sqlite3
from typing import List, Dict, Any, Optional
from backend.database.connection import get_connection
from backend.database.style_engine import get_css_for_record, get_class_names, warm_style_cache
from backend.utils.folio_parser import parse_to_html

CHUNK_SIZE = 40  # Records per page for virtualized scroll

def _row_to_dict(row) -> Dict[str, Any]:
    """Convert a texts row to a frontend-ready dict."""
    plain = row['plain'] or ''
    levelname = row['levelname'] or ''
    stylename = row['stylename'] or ''
    return {
        'recid': row['recid'],
        'showid': row['showid'],
        'levelname': levelname,
        'stylename': stylename,
        'html': parse_to_html(plain),
        'plain': plain,
        'css': get_css_for_record(levelname, stylename),
        'classes': get_class_names(levelname, stylename),
    }

def get_text_chunk(start_recid: int, direction: str = 'forward', count: int = CHUNK_SIZE) -> List[Dict]:
    """
    Fetch a chunk of text records.
    direction='forward': fetch records with recid >= start_recid
    direction='backward': fetch records with recid < start_recid (reversed)
    """
    warm_style_cache()
    conn = get_connection()
    cur = conn.cursor()

    if direction == 'forward':
        cur.execute(
            "SELECT plain, recid, showid, levelname, stylename FROM texts "
            "WHERE recid >= ? ORDER BY recid ASC LIMIT ?",
            (start_recid, count)
        )
    else:
        cur.execute(
            "SELECT plain, recid, showid, levelname, stylename FROM texts "
            "WHERE recid < ? ORDER BY recid DESC LIMIT ?",
            (start_recid, count)
        )
        rows = list(cur.fetchall())
        return [_row_to_dict(r) for r in reversed(rows)]

    return [_row_to_dict(r) for r in cur.fetchall()]

def navigate_to_recid(recid: int, context: int = CHUNK_SIZE) -> Dict:
    """Navigate to a specific recid and return surrounding records."""
    warm_style_cache()
    conn = get_connection()
    cur = conn.cursor()

    half = context // 2
    cur.execute(
        "SELECT plain, recid, showid, levelname, stylename FROM texts "
        "WHERE recid >= ? ORDER BY recid ASC LIMIT ?",
        (max(1, recid - half), context)
    )
    rows = cur.fetchall()
    records = [_row_to_dict(r) for r in rows]

    # Find the actual target index
    target_idx = 0
    for i, rec in enumerate(records):
        if rec['recid'] >= recid:
            target_idx = i
            break

    return {
        'records': records,
        'target_recid': recid,
        'target_idx': target_idx,
    }

def get_chapter_texts(chapter_start: int, chapter_end: int, style_filters: Optional[List[str]] = None) -> List[Dict]:
    """Fetch all texts in a chapter, optionally filtered by stylename."""
    warm_style_cache()
    conn = get_connection()
    cur = conn.cursor()

    if style_filters:
        placeholders = ','.join('?' * len(style_filters))
        query = (
            f"SELECT plain, recid, showid, levelname, stylename FROM texts "
            f"WHERE recid BETWEEN ? AND ? AND stylename IN ({placeholders}) "
            f"ORDER BY recid ASC"
        )
        cur.execute(query, (chapter_start, chapter_end, *style_filters))
    else:
        cur.execute(
            "SELECT plain, recid, showid, levelname, stylename FROM texts "
            "WHERE recid BETWEEN ? AND ? ORDER BY recid ASC",
            (chapter_start, chapter_end)
        )

    return [_row_to_dict(r) for r in cur.fetchall()]

def get_record_by_recid(recid: int) -> Optional[Dict]:
    """Fetch a single record by recid."""
    warm_style_cache()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT plain, recid, showid, levelname, stylename FROM texts WHERE recid=?",
        (recid,)
    )
    row = cur.fetchone()
    return _row_to_dict(row) if row else None
