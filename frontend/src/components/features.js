/**
 * features.js — VedaBase 2003-style features
 *
 * Bookmarks   (Ctrl+M)  – pin & return to locations
 * Notes       (Ctrl+N)  – personal annotations per record
 * Highlighter (Ctrl+H)  – color-highlight selected text
 * Zoom        (Ctrl+scroll | Ctrl+= / Ctrl+-) – resize text
 * SearchHistory         – remember recent queries
 * HitNav      (F3/F4)   – navigate between search hits
 * copyWithReference()   – copy selection + citation
 */
'use strict';

// ── Utility ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
//  BOOKMARKS  (Ctrl+M)
// ══════════════════════════════════════════════════════════════════════════════
const Bookmarks = {
  KEY: 'vb_bookmarks',

  _get() { try { return JSON.parse(localStorage.getItem(this.KEY)||'[]'); } catch{ return []; } },
  _save(l){ localStorage.setItem(this.KEY, JSON.stringify(l)); },

  add(recid, title) {
    const list = this._get();
    if (list.find(b => b.recid === recid)) { showToast('Already bookmarked!','ok'); return; }
    list.unshift({ id: Date.now(), recid, title: title||`Record ${recid}`, ts: Date.now() });
    this._save(list);
    this.render();
    showToast('📌 Bookmarked!');
  },

  remove(id) { this._save(this._get().filter(b => b.id !== id)); this.render(); },

  prompt() {
    const r = State.currentRecid;
    if (!r) { showToast('Navigate to a record first','err'); return; }
    const bc = document.getElementById('breadcrumb')?.textContent?.replace(/›/g,'>').trim();
    const name = prompt('Bookmark name:', bc || `Record ${r}`);
    if (name === null) return;
    this.add(r, name || bc || `Record ${r}`);
    this.open();
  },

  open()   { document.getElementById('bookmarks-panel')?.classList.add('open');    this.render(); },
  close()  { document.getElementById('bookmarks-panel')?.classList.remove('open'); },
  toggle() { document.getElementById('bookmarks-panel')?.classList.contains('open') ? this.close() : this.open(); },

  render() {
    const el = document.getElementById('bm-list');
    if (!el) return;
    const list = this._get();
    if (!list.length) {
      el.innerHTML = '<div class="bm-empty">No bookmarks yet.<br><small><kbd>Ctrl+M</kbd> to bookmark current location.</small></div>';
      return;
    }
    el.innerHTML = list.map(b => `
      <div class="bm-item" onclick="App.navigateToRecid(${b.recid});Bookmarks.close()">
        <span class="bm-pin">📌</span>
        <div class="bm-info">
          <div class="bm-title">${escHtml(b.title)}</div>
          <div class="bm-meta">rec:${b.recid} &nbsp;·&nbsp; ${new Date(b.ts).toLocaleDateString()}</div>
        </div>
        <button class="bm-del" onclick="event.stopPropagation();Bookmarks.remove(${b.id})" title="Remove">✕</button>
      </div>
    `).join('');
  },

  clearAll() {
    if (confirm('Remove all bookmarks?')) { this._save([]); this.render(); }
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  NOTES  (Ctrl+N)
// ══════════════════════════════════════════════════════════════════════════════
const Notes = {
  KEY: 'vb_notes',
  _cur: null,

  _get() { try { return JSON.parse(localStorage.getItem(this.KEY)||'[]'); } catch{ return []; } },
  _save(l){ localStorage.setItem(this.KEY, JSON.stringify(l)); },

  forRecord(recid) { return this._get().filter(n => String(n.recid) === String(recid)); },

  // Called from renderTextBlock to add sticky-note icon
  applyIcon(recid, blockEl) {
    if (!this.forRecord(recid).length) return;
    if (blockEl.querySelector('.note-badge')) return;
    const badge = document.createElement('span');
    badge.className = 'note-badge';
    badge.textContent = '📝';
    badge.title = 'Notes on this record (Ctrl+N)';
    badge.onclick = e => { e.stopPropagation(); Notes.open(recid); };
    blockEl.style.position = 'relative';
    blockEl.appendChild(badge);
  },

  // Re-apply icons to all visible blocks
  applyAll() {
    const all = this._get();
    [...new Set(all.map(n=>n.recid))].forEach(recid => {
      const b = document.querySelector(`[data-recid="${recid}"]`);
      if (b) this.applyIcon(recid, b);
    });
  },

  open(recid) {
    this._cur = recid || State.currentRecid;
    if (!this._cur) { showToast('Navigate to a record first','err'); return; }
    const rl = document.getElementById('note-dialog-recid');
    if (rl) rl.textContent = `Record ${this._cur}`;
    const ta = document.getElementById('note-textarea');
    if (ta) ta.value = '';
    this._render();
    document.getElementById('notes-overlay')?.classList.add('open');
    ta?.focus();
  },

  close() { document.getElementById('notes-overlay')?.classList.remove('open'); },

  save() {
    const text = document.getElementById('note-textarea')?.value?.trim();
    if (!text) return;
    const list = this._get();
    list.unshift({ id: Date.now(), recid: this._cur, text, ts: Date.now() });
    this._save(list);
    document.getElementById('note-textarea').value = '';
    this._render();
    const block = document.querySelector(`[data-recid="${this._cur}"]`);
    if (block) this.applyIcon(this._cur, block);
    showToast('📝 Note saved!');
  },

  remove(id) { this._save(this._get().filter(n => n.id !== id)); this._render(); },

  _render() {
    const el = document.getElementById('note-list');
    if (!el) return;
    const list = this.forRecord(this._cur);
    if (!list.length) {
      el.innerHTML = '<div class="note-empty">No notes yet for this record.</div>';
      return;
    }
    el.innerHTML = list.map(n => `
      <div class="note-entry">
        <div class="note-text">${escHtml(n.text).replace(/\n/g,'<br>')}</div>
        <div class="note-footer">
          <span class="note-date">${new Date(n.ts).toLocaleString()}</span>
          <button class="note-del" onclick="Notes.remove(${n.id})">Remove</button>
        </div>
      </div>
    `).join('');
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  HIGHLIGHTER  (Ctrl+H)
// ══════════════════════════════════════════════════════════════════════════════
const Highlighter = {
  KEY: 'vb_highlights',
  COLORS: { yellow:'#FFE566', green:'#B8F0B0', blue:'#A8D8F0', pink:'#F5B8C4', orange:'#FFD4A0' },
  _pending: null,

  _get() { try { return JSON.parse(localStorage.getItem(this.KEY)||'[]'); } catch{ return []; } },
  _save(l){ localStorage.setItem(this.KEY, JSON.stringify(l)); },

  // Trigger on Ctrl+H
  trigger() {
    const sel = window.getSelection();
    const text = sel?.toString()?.trim();
    if (!text || text.length < 2) { showToast('Select text first, then Ctrl+H','err'); return; }

    // Find containing record block
    let node = sel.anchorNode;
    let recid = null;
    while (node) {
      if (node.nodeType === 1 && node.dataset?.recid) { recid = node.dataset.recid; break; }
      node = node.parentNode;
    }
    if (!recid) { showToast('Select text inside a scripture block','err'); return; }

    this._pending = { recid: parseInt(recid), text };
    this._showPicker(sel);
  },

  _showPicker(sel) {
    const picker = document.getElementById('hl-picker');
    if (!picker) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    picker.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 220)) + 'px';
    picker.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
    picker.classList.add('open');
  },

  apply(colorKey) {
    if (!this._pending) return;
    const { recid, text } = this._pending;
    const color = this.COLORS[colorKey] || null;

    // Remove old entry for same recid+text
    const list = this._get().filter(h => !(h.recid === recid && h.text === text));
    if (color) list.push({ id: Date.now(), recid, text, color, colorKey });
    this._save(list);

    const block = document.querySelector(`[data-recid="${recid}"]`);
    if (block) {
      // Re-render inner HTML to remove old marks, then apply fresh
      this.applyToBlock(block, recid);
    }

    document.getElementById('hl-picker')?.classList.remove('open');
    this._pending = null;
    window.getSelection()?.removeAllRanges();
    showToast(color ? '🖊️ Highlighted!' : 'Highlight removed');
  },

  applyToBlock(blockEl, recid) {
    const highlights = this._get().filter(h => String(h.recid) === String(recid));
    if (!highlights.length) return;

    highlights.forEach(h => {
      const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
        acceptNode: n => n.parentElement?.classList?.contains('hl-mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      });
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      nodes.forEach(textNode => {
        const idx = textNode.textContent.indexOf(h.text);
        if (idx < 0) return;
        const before = textNode.textContent.slice(0, idx);
        const after  = textNode.textContent.slice(idx + h.text.length);
        const mark = document.createElement('mark');
        mark.className = 'hl-mark';
        mark.style.background = h.color;
        mark.textContent = h.text;
        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(mark);
        if (after)  frag.appendChild(document.createTextNode(after));
        textNode.parentNode.replaceChild(frag, textNode);
      });
    });
  },

  applyAll() {
    const all = this._get();
    [...new Set(all.map(h=>h.recid))].forEach(recid => {
      const b = document.querySelector(`[data-recid="${recid}"]`);
      if (b) this.applyToBlock(b, recid);
    });
  },

  remove(recid, text) {
    this._save(this._get().filter(h => !(h.recid == recid && h.text === text)));
    const b = document.querySelector(`[data-recid="${recid}"]`);
    if (b) { /* would need full re-render; just show toast */ showToast('Highlight removed'); }
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  ZOOM  (Ctrl+scroll · Ctrl+= · Ctrl+-)
//  Uses document.body.style.zoom — natively supported by CEF (PyWebView)
// ══════════════════════════════════════════════════════════════════════════════
const Zoom = {
  KEY: 'vb_zoom',
  _lvl: 1.0,
  MIN: 0.6, MAX: 2.0, STEP: 0.1,

  init() {
    this._lvl = Math.min(this.MAX, Math.max(this.MIN,
      parseFloat(localStorage.getItem(this.KEY) || '1.0')));
    this._apply();

    // Ctrl+Scroll — ONLY when cursor is over the reading area
    document.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      const docViewer  = document.getElementById('doc-viewer');
      const chapterEl  = document.getElementById('chapter-content');
      const overDoc    = docViewer?.contains(e.target) || chapterEl?.contains(e.target);
      if (!overDoc) return;          // ignore Ctrl+scroll elsewhere
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) this.in(); else this.out();
    }, { passive: false, capture: true });
  },

  in()    { this._lvl = Math.min(this.MAX,  +(this._lvl + this.STEP).toFixed(1)); this._apply(); },
  out()   { this._lvl = Math.max(this.MIN,  +(this._lvl - this.STEP).toFixed(1)); this._apply(); },
  reset() { this._lvl = 1.0; this._apply(); },

  _apply() {
    const pct = this._lvl;

    // Only zoom the READING AREA — never the header/sidebar/statusbar/toolbar
    document.body.style.zoom = '';   // clear any old body-level zoom
    const dc = document.getElementById('doc-content');
    const cc = document.getElementById('chapter-content');
    if (dc) dc.style.zoom = pct;
    if (cc) cc.style.zoom = pct;

    const zl = document.getElementById('zoom-level');
    if (zl) zl.textContent = Math.round(pct * 100) + '%';
    localStorage.setItem(this.KEY, this._lvl);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  SEARCH HISTORY
// ══════════════════════════════════════════════════════════════════════════════
const SearchHistory = {
  KEY: 'vb_search_history',
  MAX: 30,

  get() { try { return JSON.parse(localStorage.getItem(this.KEY)||'[]'); } catch { return []; } },

  add(q) {
    if (!q?.trim()) return;
    const hist = this.get().filter(x => x !== q);
    hist.unshift(q);
    localStorage.setItem(this.KEY, JSON.stringify(hist.slice(0, this.MAX)));
  },

  render(container) {
    const hist = this.get();
    if (!hist.length) return;
    container.innerHTML = '<div class="suggest-label">🕐 Recent Searches</div>' +
      hist.slice(0, 10).map(q =>
        `<div class="suggest-item hist-item" data-q="${escHtml(q)}"><span class="hist-ico">🕐</span><span>${escHtml(q)}</span></div>`
      ).join('');
    container.querySelectorAll('.hist-item').forEach(item => {
      item.onclick = () => {
        const inp = document.getElementById('search-input');
        if (inp) { inp.value = item.dataset.q; inp.dispatchEvent(new Event('input')); inp.focus(); }
      };
    });
  },

  clear() {
    localStorage.removeItem(this.KEY);
    const c = document.getElementById('suggest-list');
    if (c) c.innerHTML = '';
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  HIT NAVIGATION  (F3 = prev · F4 = next)
// ══════════════════════════════════════════════════════════════════════════════
const HitNav = {
  _hits: [],
  _idx: -1,

  setHits(recids) {
    this._hits = Array.isArray(recids) ? recids : [];
    this._idx  = -1;
    this._updateUI();
  },

  next() {
    if (!this._hits.length) { showToast('No search active — press F2 to search','err'); return; }
    this._idx = (this._idx + 1) % this._hits.length;
    App.navigateToRecid(this._hits[this._idx]);
    this._updateUI();
  },

  prev() {
    if (!this._hits.length) { showToast('No search active — press F2 to search','err'); return; }
    this._idx = (this._idx - 1 + this._hits.length) % this._hits.length;
    App.navigateToRecid(this._hits[this._idx]);
    this._updateUI();
  },

  _updateUI() {
    const el = document.getElementById('hit-nav-info');
    if (!el) return;
    el.textContent = this._hits.length
      ? (this._idx >= 0 ? `${this._idx+1}/${this._hits.length} hits` : `${this._hits.length} hits`)
      : '';
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  COPY WITH REFERENCE
// ══════════════════════════════════════════════════════════════════════════════
function copyWithReference() {
  const sel  = window.getSelection();
  const text = sel?.toString()?.trim();
  if (!text) { showToast('Select some text first, then click Copy+Ref','err'); return; }

  const bc    = document.getElementById('breadcrumb')?.textContent?.replace(/›/g,'>').trim();
  const recid = State.currentRecid;
  const ref   = (bc ? `\n\n— ${bc}` : '') + (recid ? ` [Record ${recid}]` : '');
  const full  = text + ref;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(full).then(() => showToast('📋 Copied with reference!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = full;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('📋 Copied!');
  }
}
