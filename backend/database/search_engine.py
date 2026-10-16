import sqlite3
import re
from typing import List, Dict, Any, Optional
from backend.database.connection import get_connection
from backend.utils.diacritics import flatten, normalize_query
from backend.utils.folio_parser import parse_to_html
from backend.database.style_engine import warm_style_cache, get_css_for_record, get_class_names

RESULT_PAGE_SIZE = 30
SNIPPET_LEN = 220


def _highlight_snippet(text: str, query: str, max_len: int = SNIPPET_LEN) -> str:
    """Extract and highlight a snippet from text around the query term."""
    flat_text = flatten(text).lower()
    flat_q = normalize_query(query)
    idx = flat_text.find(flat_q)
    if idx == -1:
        snippet = text[:max_len]
    else:
        start = max(0, idx - 60)
        end = min(len(text), idx + len(flat_q) + 160)
        snippet = ('…' if start > 0 else '') + text[start:end] + ('…' if end < len(text) else '')

    import html
    snippet_html = html.escape(snippet)
    if flat_q:
        pattern = re.compile(re.escape(flat_q), re.IGNORECASE)
        flat_snip = flatten(snippet).lower()

        result_parts = []
        last = 0
        for m in pattern.finditer(flat_snip):
            result_parts.append(snippet_html[last:m.start()])
            result_parts.append(f'<mark>{snippet_html[m.start():m.end()]}</mark>')
            last = m.end()
        result_parts.append(snippet_html[last:])
        snippet_html = ''.join(result_parts)

    return snippet_html


def _get_location(cur, recid: int) -> str:
    """Find the nearest enclosing book/chapter title for a record."""
    try:
        cur.execute(
            "SELECT title FROM contents WHERE record <= ? AND record_end >= ? "
            "ORDER BY (record_end - record) ASC LIMIT 1",
            (recid, recid)
        )
        row = cur.fetchone()
        return row['title'] if row else ''
    except Exception:
        return ''


def search(
    query: str,
    scope_recids: Optional[List[int]] = None,
    page: int = 0
) -> Dict[str, Any]:
    """
    Full-text search using FTS5 with diacritic flattening fallback.
    Returns paginated results with snippets and location context.
    """
    warm_style_cache()
    conn = get_connection()
    cur = conn.cursor()

    if not query or len(query.strip()) < 2:
        return {'results': [], 'total': 0, 'page': page, 'has_more': False}

    offset = page * RESULT_PAGE_SIZE
    results = []
    total = 0

    # Clean query for FTS5 (escape special chars)
    fts_query = query.strip().replace('"', '""')

    try:
        if scope_recids:
            min_r = min(scope_recids)
            max_r = max(scope_recids)
            count_sql = (
                "SELECT COUNT(*) FROM texts_fts "
                "JOIN texts ON texts.recid = texts_fts.rowid "
                "WHERE texts_fts MATCH ? AND texts.recid BETWEEN ? AND ?"
            )
            cur.execute(count_sql, (fts_query, min_r, max_r))
            total = cur.fetchone()[0]

            sql = (
                "SELECT texts.recid, texts.plain, texts.levelname, texts.stylename "
                "FROM texts_fts "
                "JOIN texts ON texts.recid = texts_fts.rowid "
                "WHERE texts_fts MATCH ? AND texts.recid BETWEEN ? AND ? "
                "ORDER BY texts.recid ASC LIMIT ? OFFSET ?"
            )
            cur.execute(sql, (fts_query, min_r, max_r, RESULT_PAGE_SIZE, offset))
        else:
            count_sql = "SELECT COUNT(*) FROM texts_fts WHERE texts_fts MATCH ?"
            cur.execute(count_sql, (fts_query,))
            total = cur.fetchone()[0]

            sql = (
                "SELECT texts.recid, texts.plain, texts.levelname, texts.stylename "
                "FROM texts_fts "
                "JOIN texts ON texts.recid = texts_fts.rowid "
                "WHERE texts_fts MATCH ? "
                "ORDER BY texts.recid ASC LIMIT ? OFFSET ?"
            )
            cur.execute(sql, (fts_query, RESULT_PAGE_SIZE, offset))

        rows = cur.fetchall()
        for row in rows:
            results.append({
                'recid':     row['recid'],
                'snippet':   _highlight_snippet(row['plain'] or '', query),
                'levelname': row['levelname'] or '',
                'stylename': row['stylename'] or '',
                'location':  _get_location(cur, row['recid']),
                'css':       get_css_for_record(row['levelname'] or '', row['stylename'] or ''),
                'classes':   get_class_names(row['levelname'] or '', row['stylename'] or ''),
            })

    except sqlite3.OperationalError:
        # FTS5 query error — fallback to LIKE with flattened text
        flat_q = f'%{normalize_query(query)}%'
        try:
            cur.execute(
                "SELECT dw.id, dw.word, dm.recid FROM dict_words dw "
                "JOIN dict_means dm ON dm.wordid=dw.id "
                "WHERE dw.simple LIKE ? LIMIT ? OFFSET ?",
                (flat_q, RESULT_PAGE_SIZE, offset)
            )
            word_rows = cur.fetchall()
            for wr in word_rows:
                rec = cur.execute(
                    "SELECT plain, recid, levelname, stylename FROM texts WHERE recid=?",
                    (wr['recid'],)
                ).fetchone()
                if rec:
                    results.append({
                        'recid':     rec['recid'],
                        'snippet':   _highlight_snippet(rec['plain'] or '', query),
                        'levelname': rec['levelname'] or '',
                        'stylename': rec['stylename'] or '',
                        'location':  _get_location(cur, rec['recid']),
                        'css':       get_css_for_record(rec['levelname'] or '', rec['stylename'] or ''),
                        'classes':   get_class_names(rec['levelname'] or '', rec['stylename'] or ''),
                    })
            total = len(results)
        except Exception:
            pass

    return {
        'results':  results,
        'total':    total,
        'page':     page,
        'has_more': (offset + RESULT_PAGE_SIZE) < total
    }


def search_suggest(partial: str, limit: int = 12) -> List[str]:
    """Get autocomplete suggestions from the words/dict_words tables."""
    if not partial or len(partial) < 2:
        return []
    conn = get_connection()
    cur = conn.cursor()
    flat = normalize_query(partial)
    suggestions = set()

    try:
        cur.execute(
            "SELECT word FROM dict_words WHERE simple LIKE ? LIMIT ?",
            (f'{flat}%', limit)
        )
        for row in cur.fetchall():
            suggestions.add(row['word'])

        cur.execute(
            "SELECT word FROM words WHERE word LIKE ? LIMIT ?",
            (f'{partial}%', limit)
        )
        for row in cur.fetchall():
            suggestions.add(row['word'])
    except Exception:
        pass

    return sorted(list(suggestions))[:limit]


def get_popup_text(title: str) -> Optional[Dict]:
    """Fetch popup glossary entry by title."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT title, class, plain FROM popup WHERE title=? COLLATE NOCASE LIMIT 1",
        (title,)
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        'title': row['title'],
        'class': row['class'],
        'html':  parse_to_html(row['plain'] or ''),
    }
