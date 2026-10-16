import sqlite3
import threading
from typing import Dict, Optional
from backend.database.connection import get_connection

_STYLE_CSS_CACHE: Dict[str, Dict[str, str]] = {}
_STYLE_ID_CACHE: Dict[str, int] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_BUILT = False

# Properties that map 1:1 from DB to CSS
_PASSTHROUGH_PROPS = {
    'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'text-align', 'font-weight', 'font-style', 'font-size', 'line-height',
    'color', 'background-color',
    'border-width', 'border-style', 'border-color',
    'border-left-width', 'border-left-style', 'border-left-color',
    'border-right-width', 'border-right-style', 'border-right-color',
    'border-top-width', 'border-top-style', 'border-top-color',
    'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
    'text-indent', 'letter-spacing', 'text-decoration',
}

def _pt_to_rem(value: str) -> str:
    """Convert pt values to rem for scalable layout."""
    if value and value.endswith('pt'):
        try:
            pt = float(value[:-2])
            # 12pt = 1rem baseline
            return f'{pt/12:.3f}rem'
        except ValueError:
            pass
    return value

def _process_prop(name: str, value: str) -> Optional[tuple]:
    """Process a style property name/value into a CSS declaration."""
    if name not in _PASSTHROUGH_PROPS:
        return None
    # Convert pt to rem for scalable display
    if name in ('margin-top', 'margin-bottom', 'margin-left', 'margin-right',
                'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
                'padding', 'text-indent', 'border-width',
                'border-left-width', 'border-right-width',
                'border-top-width', 'border-bottom-width'):
        value = _pt_to_rem(value)
    # Clamp excessive margins for readability
    return (name, value)

def warm_style_cache():
    """Pre-load all styles into memory at startup (thread-safe, runs once)."""
    global _STYLE_CSS_CACHE, _STYLE_ID_CACHE, _CACHE_BUILT
    # Fast-path: already built (no lock needed for read)
    if _CACHE_BUILT:
        return
    with _CACHE_LOCK:
        # Re-check inside lock to avoid double-build
        if _CACHE_BUILT:
            return
        conn = get_connection()
        cur = conn.cursor()

        # Cache style name → id
        cur.execute("SELECT name, id FROM styles")
        id_cache: Dict[str, int] = {}
        for row in cur.fetchall():
            id_cache[row['name']] = row['id']

        # Cache styleid → {prop: value}
        cur.execute("SELECT styleid, name, valuex FROM styles_detail")
        raw: Dict[int, Dict[str, str]] = {}
        for row in cur.fetchall():
            sid = row['styleid']
            if sid not in raw:
                raw[sid] = {}
            result = _process_prop(row['name'], row['valuex'])
            if result:
                raw[sid][result[0]] = result[1]

        # Map style name → css dict and commit to globals atomically
        css_cache: Dict[str, Dict[str, str]] = {}
        for name, sid in id_cache.items():
            css_cache[name] = raw.get(sid, {})

        _STYLE_ID_CACHE = id_cache
        _STYLE_CSS_CACHE = css_cache
        _CACHE_BUILT = True

def get_style_map() -> Dict[str, Dict[str, str]]:
    """Return the full style map as a JSON-serializable dict."""
    if not _STYLE_CSS_CACHE:
        warm_style_cache()
    return _STYLE_CSS_CACHE

def get_css_for_record(levelname: str, stylename: str) -> str:
    """Compile CSS string for a text record using cascaded level + style."""
    if not _STYLE_CSS_CACHE:
        warm_style_cache()

    props = {}
    # Apply level styles first
    if levelname and levelname in _STYLE_CSS_CACHE:
        props.update(_STYLE_CSS_CACHE[levelname])
    # Apply style overrides on top
    if stylename and stylename in _STYLE_CSS_CACHE:
        props.update(_STYLE_CSS_CACHE[stylename])

    return '; '.join(f'{k}:{v}' for k, v in props.items())

def get_class_names(levelname: str, stylename: str) -> str:
    """Return CSS class names for the record for frontend use."""
    classes = ['text-block']
    if levelname:
        classes.append(f'level-{levelname.lower().replace("_", "-")}')
    if stylename:
        classes.append(f'style-{stylename.lower().replace("_", "-")}')
    return ' '.join(classes)
