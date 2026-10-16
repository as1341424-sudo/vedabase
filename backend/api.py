import sqlite3
import os
from typing import List, Dict, Any, Optional
from backend.database.connection import get_connection
from backend.database.style_engine import get_style_map, warm_style_cache
from backend.database.reader_engine import (
    get_text_chunk, navigate_to_recid, get_chapter_texts, get_record_by_recid
)
from backend.database.search_engine import search, search_suggest, get_popup_text


class VedabaseApi:
    """
    All methods in this class are exposed to JavaScript via window.pywebview.api.
    Every method must return JSON-serializable data.
    """

    def ping(self) -> str:
        return 'pong'

    # ─── Navigation Tree ───────────────────────────────────────────────

    def get_root_nodes(self) -> List[Dict]:
        """Return top-level content tree nodes (parent=0)."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT title, record, record_end, parent, level, "
            "simpletitle, subtext, node_children, node_code, node_type, next_sibling "
            "FROM contents WHERE parent=0 ORDER BY record ASC"
        )
        return [dict(r) for r in cur.fetchall()]

    def get_children(self, parent_record: int) -> List[Dict]:
        """Return child nodes for a given parent record."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT title, record, record_end, parent, level, "
            "simpletitle, subtext, node_children, node_code, node_type, next_sibling "
            "FROM contents WHERE parent=? ORDER BY record ASC",
            (parent_record,)
        )
        return [dict(r) for r in cur.fetchall()]

    def get_node_by_record(self, record: int) -> Optional[Dict]:
        """Get a single contents node by its record value."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT title, record, record_end, parent, level, "
            "simpletitle, subtext, node_children, node_code, node_type, next_sibling "
            "FROM contents WHERE record=? LIMIT 1",
            (record,)
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def get_breadcrumb(self, record: int) -> List[Dict]:
        """Return the ancestor chain for a given record (for breadcrumb display)."""
        conn = get_connection()
        cur = conn.cursor()
        breadcrumb = []
        current = record
        visited = set()
        while current and current not in visited:
            visited.add(current)
            cur.execute(
                "SELECT title, record, parent, level FROM contents WHERE record=? LIMIT 1",
                (current,)
            )
            row = cur.fetchone()
            if not row:
                break
            breadcrumb.insert(0, dict(row))
            current = row['parent']
        return breadcrumb

    # ─── Document Viewer ───────────────────────────────────────────────

    def get_text_chunk(self, start_recid: int, direction: str = 'forward', count: int = 40) -> List[Dict]:
        """Virtualized scroll: fetch a chunk of text records."""
        return get_text_chunk(start_recid, direction, min(count, 80))

    def navigate_to_recid(self, recid: int) -> Dict:
        """Navigate to a specific recid and return surrounding context."""
        return navigate_to_recid(recid)

    def get_record(self, recid: int) -> Optional[Dict]:
        """Get a single text record."""
        return get_record_by_recid(recid)

    # ─── Chapter Filter View ───────────────────────────────────────────

    def get_chapter_texts(self, chapter_start: int, chapter_end: int,
                          style_filters: Optional[List[str]] = None) -> List[Dict]:
        """Fetch chapter texts, optionally filtered by style types."""
        return get_chapter_texts(chapter_start, chapter_end, style_filters)

    def get_adjacent_chapter(self, current_record: int, direction: str = 'next') -> Optional[Dict]:
        """Navigate to next or previous chapter-level content node."""
        conn = get_connection()
        cur = conn.cursor()

        # Find current chapter node
        cur.execute(
            "SELECT record, parent, next_sibling, level FROM contents "
            "WHERE record <= ? ORDER BY record DESC LIMIT 1",
            (current_record,)
        )
        current_node = cur.fetchone()
        if not current_node:
            return None

        if direction == 'next':
            next_rec = current_node['next_sibling']
            if next_rec:
                cur.execute(
                    "SELECT title, record, record_end, parent, level, "
                    "simpletitle, node_children FROM contents WHERE record=? LIMIT 1",
                    (next_rec,)
                )
                row = cur.fetchone()
                return dict(row) if row else None
        else:
            # Previous: find sibling with next_sibling = current record
            cur.execute(
                "SELECT title, record, record_end, parent, level, "
                "simpletitle, node_children FROM contents "
                "WHERE next_sibling=? AND parent=? LIMIT 1",
                (current_node['record'], current_node['parent'])
            )
            row = cur.fetchone()
            return dict(row) if row else None

        return None

    # ─── Search ────────────────────────────────────────────────────────

    def search(self, query: str, scope_recids: Optional[List[int]] = None,
               page: int = 0) -> Dict:
        """FTS5 search with diacritic flattening."""
        return search(query, scope_recids, page)

    def search_suggest(self, partial: str) -> List[str]:
        """Real-time autocomplete suggestions."""
        return search_suggest(partial)

    def get_popup(self, title: str) -> Optional[Dict]:
        """Fetch popup glossary entry."""
        return get_popup_text(title)

    # ─── Metadata & Config ─────────────────────────────────────────────

    def get_docinfo(self) -> Dict:
        """Return database metadata."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT name, valuex FROM docinfo")
        return {row['name']: row['valuex'] for row in cur.fetchall()}

    def get_style_map(self) -> Dict:
        """Return all compiled CSS style maps."""
        return get_style_map()

    def get_levels(self) -> List[Dict]:
        """Return all hierarchy levels."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT level, id, original FROM levels ORDER BY id")
        return [dict(r) for r in cur.fetchall()]

    def get_groups(self) -> List[Dict]:
        """Return all groups."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT groupid, groupname FROM groups ORDER BY groupid")
        return [dict(r) for r in cur.fetchall()]

    def get_group_records(self, groupid: int) -> List[int]:
        """Return all recids in a group."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT recid FROM groups_detail WHERE groupid=? ORDER BY recid",
            (groupid,)
        )
        return [r['recid'] for r in cur.fetchall()]

    def get_jumplink(self, title: str) -> Optional[int]:
        """Resolve a jumplink title to a recid."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT recid FROM jumplinks WHERE title=? COLLATE NOCASE LIMIT 1",
            (title,)
        )
        row = cur.fetchone()
        return row['recid'] if row else None

    def get_all_books(self) -> List[Dict]:
        """Return all top-level book entries for quick access."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT title, record, record_end, node_children, level "
            "FROM contents WHERE level=3 ORDER BY record ASC"
        )
        return [dict(r) for r in cur.fetchall()]

    def get_stats(self) -> Dict:
        """Return database statistics. Missing tables return 0."""
        conn = get_connection()
        cur = conn.cursor()
        stats = {}
        for table in ['texts', 'contents', 'dict_words', 'jumplinks', 'popup', 'groups']:
            try:
                cur.execute(f"SELECT COUNT(*) as cnt FROM {table}")
                stats[table] = cur.fetchone()['cnt']
            except Exception:
                stats[table] = 0
        return stats

    def search_jumplinks(self, query: str, limit: int = 20) -> List[Dict]:
        """Search jumplinks by title."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT title, recid FROM jumplinks WHERE title LIKE ? LIMIT ?",
            (f'%{query}%', limit)
        )
        return [dict(r) for r in cur.fetchall()]

    def get_playlists(self) -> List[Dict]:
        """Return all playlists. Returns empty list if table doesn't exist."""
        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute("SELECT id, parent, title FROM playlists ORDER BY id")
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []

    def get_textviews(self, limit: int = 50) -> List[Dict]:
        """Return textviews (saved text collections). Returns empty list if table doesn't exist."""
        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute("SELECT id, parent, title FROM textviews ORDER BY id LIMIT ?", (limit,))
            return [dict(r) for r in cur.fetchall()]
        except Exception:
            return []

    def find_node_for_recid(self, recid: int) -> Optional[Dict]:
        """Find the deepest contents node that contains a given recid."""
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT title, record, record_end, parent, level, simpletitle "
            "FROM contents WHERE record<=? AND record_end>=? "
            "ORDER BY level DESC LIMIT 1",
            (recid, recid)
        )
        row = cur.fetchone()
        return dict(row) if row else None
