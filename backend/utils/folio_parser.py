"""
folio_parser.py — Complete Folio-format inline tag → HTML converter.
Handles ALL 22 tag types found in VedaBase folio.db:
  BD, IT, UN, SC, FC, BC, CS, PS, PT, FT,
  CR, LF, EL, TB, NP, HD,
  WW, JL, QL, PX, OB, IN, JU, LS, SD, SP
"""
import re
import html as _html
from typing import List, Tuple, Optional


# ── Tag scanner (state-machine, handles quoted strings) ───────────────────────

def _scan_tags(text: str) -> List[Tuple[int, int, str]]:
    """Return list of (start, end, raw_tag) for every Folio tag in text."""
    results: List[Tuple[int, int, str]] = []
    i, n = 0, len(text)
    while i < n:
        if text[i] != '<':
            i += 1
            continue
        j = i + 1
        if j >= n:
            i += 1
            continue
        # Closing tags: </CS>, </XX>
        if text[j] == '/' and j + 1 < n and text[j + 1].isupper():
            k = j + 1
            while k < n and text[k] != '>':
                k += 1
            if k < n:
                results.append((i, k + 1, text[i:k + 1]))
                i = k + 1
            else:
                i += 1
            continue
        # Opening tags must begin with uppercase
        if not text[j].isupper():
            i += 1
            continue
        # Scan forward tracking quoted strings to find real >
        k, in_q, found = j + 1, False, False
        while k < n:
            c = text[k]
            if c == '"':
                in_q = not in_q
            elif c == '>' and not in_q:
                results.append((i, k + 1, text[i:k + 1]))
                i = k + 1
                found = True
                break
            elif c == '\n' and not in_q:
                break
            k += 1
        if not found:
            i += 1
    return results


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cmd(inner: str) -> str:
    """Extract uppercase command from tag interior: 'FC:r,g,b' → 'FC', 'BD+' → 'BD'"""
    return re.split(r'[:\+\-]', inner)[0].upper()


def _quoted(inner: str) -> List[str]:
    return re.findall(r'"([^"]*)"', inner)


def _parse_rgb(s: str) -> Optional[str]:
    m = re.search(r'(\d+),(\d+),(\d+)', s)
    return f'#{int(m.group(1)):02x}{int(m.group(2)):02x}{int(m.group(3)):02x}' if m else None


def _open(bold, italic, sc, ul, color) -> str:
    out = []
    if bold:   out.append('<strong>')
    if italic: out.append('<em>')
    if sc:     out.append('<span class="folio-sc">')
    if ul:     out.append('<u>')
    if color:  out.append(f'<span style="color:{color}">')
    return ''.join(out)


def _close(bold, italic, sc, ul, color) -> str:
    out = []
    if color:  out.append('</span>')
    if ul:     out.append('</u>')
    if sc:     out.append('</span>')
    if italic: out.append('</em>')
    if bold:   out.append('</strong>')
    return ''.join(out)


# ── Main converter ─────────────────────────────────────────────────────────────

def parse_to_html(raw: str) -> str:
    """Convert Folio tagged text → clean semantic HTML."""
    if not raw:
        return ''

    tags = _scan_tags(raw)

    bold = italic = sc = ul = False
    color: Optional[str] = None
    open_links = 0   # count of unclosed link spans

    parts: List[str] = []
    pos = 0

    def flush(segment: str):
        if segment:
            parts.append(_html.escape(segment).replace('\n', '<br>'))

    def snapshot_close():
        c = _close(bold, italic, sc, ul, color)
        if c: parts.append(c)

    def snapshot_open():
        o = _open(bold, italic, sc, ul, color)
        if o: parts.append(o)

    for start, end, raw_tag in tags:
        segment = raw[pos:start]
        if segment:
            snapshot_close()
            flush(segment)
            snapshot_open()
        pos = end

        inner = raw_tag[1:-1]  # strip angle brackets

        # ── Closing tags ─────────────────────────────────────────────────────
        if inner.startswith('/'):
            snapshot_close()
            italic = bold = sc = ul = False
            color = None
            if open_links > 0:
                parts.append('</span>')
                open_links -= 1
            snapshot_open()
            continue

        c = _cmd(inner)

        # ── Bold ─────────────────────────────────────────────────────────────
        if c == 'BD':
            snapshot_close()
            bold = '+' in inner  # <BD+>=on, <BD->=off, <BD>=off
            snapshot_open()

        # ── Italic ───────────────────────────────────────────────────────────
        elif c == 'IT':
            snapshot_close()
            italic = '+' in inner
            snapshot_open()

        # ── Underline ────────────────────────────────────────────────────────
        elif c == 'UN':
            snapshot_close()
            ul = not ('-' in inner or inner.upper() == 'UN')
            snapshot_open()

        # ── Small caps ───────────────────────────────────────────────────────
        elif c == 'SC':
            snapshot_close()
            sc = '+' in inner
            snapshot_open()

        # ── Font color ───────────────────────────────────────────────────────
        elif c == 'FC':
            snapshot_close()
            rest = inner[3:] if inner.upper().startswith('FC:') else ''
            color = _parse_rgb(rest) if rest else None
            snapshot_open()

        # ── Character style ──────────────────────────────────────────────────
        elif c == 'CS':
            qs = _quoted(inner)
            if qs:
                sname = qs[0].lower()
                snapshot_close()
                italic = 'italic' in sname
                bold   = 'bold'   in sname
                sc     = 'small'  in sname or 'caps' in sname
                ul     = 'under'  in sname
                snapshot_open()

        # ── Carriage return / line feed ──────────────────────────────────────
        elif c in ('CR', 'LF'):
            parts.append('<br>')

        # ── End-of-element (paragraph break) ─────────────────────────────────
        elif c == 'EL':
            parts.append('<br>')

        # ── New page ─────────────────────────────────────────────────────────
        elif c == 'NP':
            parts.append('<hr class="folio-hr">')

        # ── Tab ──────────────────────────────────────────────────────────────
        elif c == 'TB':
            parts.append('\u00a0\u00a0\u00a0\u00a0')

        # ── Web link: WW:Web,"url" ────────────────────────────────────────────
        elif c == 'WW':
            qs = _quoted(inner)
            url_candidates = [q for q in qs if q.startswith('http')]
            if not url_candidates and len(qs) >= 2:
                url_candidates = [qs[1]]
            if url_candidates:
                url = _html.escape(url_candidates[0])
                snapshot_close()
                parts.append(f'<a href="{url}" class="folio-weblink" target="_blank" rel="noopener">')
                open_links += 1
                snapshot_open()

        # ── Internal jump link: JL:Jump,"target" ─────────────────────────────
        elif c == 'JL':
            qs = _quoted(inner)
            target = qs[-1] if qs else ''
            if target:
                snapshot_close()
                parts.append(f'<span class="folio-jumplink" data-jl="{_html.escape(target)}">')
                open_links += 1
                snapshot_open()

        # ── Query link: QL:Query,"text" ───────────────────────────────────────
        elif c == 'QL':
            qs = _quoted(inner)
            q = qs[-1] if qs else ''
            if q:
                snapshot_close()
                parts.append(f'<span class="folio-querylink" data-ql="{_html.escape(q)}">')
                open_links += 1
                snapshot_open()

        # ── Popup reference: PX:"Popup","key" ────────────────────────────────
        elif c == 'PX':
            qs = _quoted(inner)
            key = qs[-1] if qs else ''
            if key:
                snapshot_close()
                parts.append(f'<span class="folio-popup-ref" data-px="{_html.escape(key)}">')
                open_links += 1
                snapshot_open()

        # ── Everything else: STRIP ────────────────────────────────────────────
        # BC (background color), PT (point size), PS (paragraph style),
        # IN (indent), JU (justify), LS (line spacing), SD (shadow),
        # OB (object/image), FT (font), HD (hard return?), SP (spacing)
        # → Silently discarded; CSS handles all presentation

    # Flush remaining text
    remaining = raw[pos:]
    if remaining:
        snapshot_close()
        flush(remaining)
        snapshot_open()
    snapshot_close()

    # Close any links that were never explicitly closed
    parts.extend(['</span>'] * open_links)

    result = ''.join(parts)

    # Cleanup: remove empty formatting elements
    result = re.sub(r'<(strong|em|u)></\1>', '', result)
    result = re.sub(r'<span[^>]*></span>', '', result)
    # Collapse excessive line breaks
    result = re.sub(r'(<br>\s*){4,}', '<br><br>', result)

    return result


def strip_tags(raw: str) -> str:
    """Strip ALL Folio tags → plain text (for search indexing)."""
    if not raw:
        return ''
    tags = _scan_tags(raw)
    parts, pos = [], 0
    for start, end, _ in tags:
        if raw[pos:start]:
            parts.append(raw[pos:start])
        pos = end
    parts.append(raw[pos:])
    return re.sub(r'\s+', ' ', ''.join(parts)).strip()
