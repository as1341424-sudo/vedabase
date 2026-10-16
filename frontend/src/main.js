/**
 * Bhaktivedanta VedaBase — Main Application Controller
 * Fixes applied:
 *  - sidebar-resize ID mismatch (sb-resize vs sidebar-resize)
 *  - stat-books / ws-dict IDs that don't exist in HTML
 *  - SearchPanel.open() called with query arg it doesn't accept
 *  - SidebarTree.filter() method didn't exist
 *  - ChapterFilter.init() wired to wrong selectors
 *  - welcome div needs display-flex not just hidden class toggle
 *  - loading-screen fade-out needs pointer-events:none handled via CSS
 */

'use strict';

const State = {
  currentRecid:   null,
  currentView:    'doc',
  sidebarVisible: true,
  searchOpen:     false,
  checkedNodes:   new Set(),
  history:        [],
  historyIdx:     -1,
  styleMap:       {},
  docinfo:        {},
  stats:          {},
};

// ── App Controller ───────────────────────────────────────────────────────────
const App = {

  async init() {
    this.updateLoadingMsg('Loading metadata…');
    try {
      const [docinfo, stats] = await Promise.all([
        API.call('get_docinfo'),
        API.call('get_stats'),
      ]);
      State.docinfo = docinfo;
      State.stats   = stats;

      this.updateLoadingMsg('Loading style system…');
      State.styleMap = await API.call('get_style_map');

      this.updateLoadingMsg('Initializing navigation tree…');
      await SidebarTree.init();

      this.updateStats(stats);
      this.loadWelcomeQuote();

      this.updateLoadingMsg('Ready!');
      this.setStatus('Database loaded · ' + (docinfo.TT || 'VedaBase'), true);

      setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        if (ls) ls.classList.add('fade-out');
        const app = document.getElementById('app');
        if (app) app.style.opacity = '1';
      }, 700);

    } catch (e) {
      this.updateLoadingMsg('Error: ' + (e.message || e));
      console.error('[App] Init failed:', e);
    }

    this.registerHotkeys();
    this.setupSidebarResize();
    Zoom.init();
  },

  updateLoadingMsg(msg) {
    const el = document.getElementById('loading-msg');
    if (el) el.textContent = msg;
  },

  updateStats(stats) {
    const fmt = n => (n != null) ? Number(n).toLocaleString() : '–';
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };
    set('stat-texts',   stats.texts);
    set('ws-texts',     stats.texts);
    set('ws-contents',  stats.contents);
    set('ws-popup',     stats.popup);
  },

  async loadWelcomeQuote() {
    const QUOTES = [
      'Hare Kṛṣṇa Hare Kṛṣṇa, Kṛṣṇa Kṛṣṇa Hare Hare, Hare Rāma Hare Rāma, Rāma Rāma Hare Hare.',
      'The living entity carries his conceptions of life from one body to another as the air carries aromas. — Bg. 15.8',
      'One who is not in transcendental consciousness can have neither a controlled mind nor steady intelligence, without which there is no possibility of peace. — Bg. 2.66',
      'By rendering devotional service unto the Personality of Godhead, one immediately acquires causeless knowledge and detachment from the world. — ŚB 1.2.7',
      'Abandon all varieties of religion and just surrender unto Me. I shall deliver you from all sinful reactions. Do not fear. — Bg. 18.66',
      'One who knows the transcendental nature of My appearance and activities does not, upon leaving the body, take his birth again in this material world, but attains My eternal abode. — Bg. 4.9',
    ];
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    const el = document.getElementById('welcome-quote');
    if (el) el.textContent = q;
  },

  setStatus(msg, active = true) {
    const el = document.getElementById('status-msg');
    if (el) el.textContent = msg;
    const dot = document.getElementById('status-dot');
    if (dot) dot.classList.toggle('off', !active);
  },

  setRecidStatus(recid) {
    State.currentRecid = recid;
    const el = document.getElementById('status-recid');
    if (el) el.textContent = recid ? `rec: ${recid}` : '';
  },

  switchView(view) {
    State.currentView = view;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${view}`);
    if (panel) panel.classList.add('active');
    document.querySelectorAll('.hdr-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(`tab-${view}`);
    if (tab) tab.classList.add('active');
  },

  focusSidebar() {
    if (!State.sidebarVisible) this.toggleSidebar();
    document.getElementById('sidebar-filter-input')?.focus();
  },

  toggleSidebar() {
    State.sidebarVisible = !State.sidebarVisible;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', !State.sidebarVisible);
    document.getElementById('app')?.classList.toggle('sb-hidden', !State.sidebarVisible);
  },

  openSearch(initialQuery) {
    SearchPanel.open();
    if (initialQuery) {
      const input = document.getElementById('search-input');
      if (input) {
        input.value = initialQuery;
        // Trigger search
        input.dispatchEvent(new Event('input'));
      }
    }
  },

  async navigateToRecid(recid, pushHistory = true) {
    if (!recid) return;

    this.switchView('doc');

    // Hide welcome, show doc viewer
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.style.display = 'none';
    const docViewer = document.getElementById('doc-viewer');
    if (docViewer) docViewer.classList.remove('hidden');

    this.setRecidStatus(recid);
    this.setStatus(`Loading record ${recid}…`);

    if (pushHistory) {
      State.history = State.history.slice(0, State.historyIdx + 1);
      State.history.push(recid);
      State.historyIdx = State.history.length - 1;
    }

    await DocViewer.loadAt(recid);

    // Update breadcrumb
    try {
      const node = await API.call('find_node_for_recid', recid);
      if (node) {
        const crumb = await API.call('get_breadcrumb', node.record);
        this.updateBreadcrumb(crumb);
      }
    } catch (e) { /* breadcrumb is non-critical */ }

    this.setStatus(`Record ${recid} · F2 to search · Alt+← to go back`);
  },

  updateBreadcrumb(items) {
    const el = document.getElementById('breadcrumb');
    if (!el || !items) return;
    el.innerHTML = '';
    items.forEach((item, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'bc-sep';
        sep.textContent = '›';
        el.appendChild(sep);
      }
      const span = document.createElement('span');
      span.className = 'bc-item';
      span.textContent = item.simpletitle || item.title || '';
      span.title = item.title || '';
      span.onclick = () => App.navigateToRecid(item.record);
      el.appendChild(span);
    });
  },

  registerHotkeys() {
    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Function keys (always active)
      if (e.key === 'F2')  { e.preventDefault(); this.openSearch(); }
      if (e.key === 'F3')  { e.preventDefault(); HitNav.prev(); }         // Previous search hit
      if (e.key === 'F4')  { e.preventDefault(); HitNav.next(); }         // Next search hit
      if (e.key === 'F5')  { e.preventDefault(); this.historyBack(); }   // Go back in history
      if (e.key === 'F6')  { e.preventDefault(); this.historyForward(); } // Go forward in history
      if (e.key === 'F7')  { e.preventDefault(); this.focusSidebar(); }  // Browse / sidebar
      if (e.key === 'F8')  { e.preventDefault(); this.switchView('chapter'); } // Chapter filter
      if (e.key === 'Escape') {
        if (JLModal.isOpen()) { JLModal.close(); return; }
        SearchPanel.close();
        Notes.close();
        document.getElementById('hl-picker')?.classList.remove('open');
      }
      // Backspace closes / goes back in the jump-link modal
      if (e.key === 'Backspace' && JLModal.isOpen() && !inInput) {
        e.preventDefault();
        JLModal.back();
      }

      // Alt+arrows for history
      if (e.altKey && e.key === 'ArrowLeft')  { this.historyBack(); }
      if (e.altKey && e.key === 'ArrowRight') { this.historyForward(); }

      // Ctrl shortcuts (skip when typing in inputs except allowed combos)
      if (e.ctrlKey) {
        if (e.key === 'm' || e.key === 'M') { e.preventDefault(); Bookmarks.prompt(); }
        if (e.key === 'n' || e.key === 'N') { if (!inInput) { e.preventDefault(); Notes.open(); } }
        if (e.key === 'h' || e.key === 'H') { if (!inInput) { e.preventDefault(); Highlighter.trigger(); } }
        if (e.key === '=' || e.key === '+') { e.preventDefault(); Zoom.in(); }
        if (e.key === '-') { e.preventDefault(); Zoom.out(); }
        if (e.key === '0') { e.preventDefault(); Zoom.reset(); }
      }
    });
  },

  historyBack() {
    if (State.historyIdx > 0) {
      State.historyIdx--;
      this.navigateToRecid(State.history[State.historyIdx], false);
    }
  },

  historyForward() {
    if (State.historyIdx < State.history.length - 1) {
      State.historyIdx++;
      this.navigateToRecid(State.history[State.historyIdx], false);
    }
  },

  setupSidebarResize() {
    // ID in HTML is 'sb-resize' not 'sidebar-resize'
    const resizer = document.getElementById('sb-resize');
    const sidebar = document.getElementById('sidebar');
    if (!resizer || !sidebar) return;

    let dragging = false, startX = 0, startW = 0;

    resizer.addEventListener('mousedown', e => {
      dragging = true;
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const newW = Math.max(160, Math.min(560, startW + (e.clientX - startX)));
      document.documentElement.style.setProperty('--sidebar-w', newW + 'px');
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'ok' ? '🪷' : '⚠️'}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Text Block Renderer ───────────────────────────────────────────────────────
function renderTextBlock(record) {
  const div = document.createElement('div');
  // Use classes from backend (space-separated list of CSS class names)
  div.className = record.classes || 'text-block';
  div.dataset.recid = record.recid;

  // ── Anchor badge: visible on hover, lets user copy a #recid link / jump ──
  const anchor = document.createElement('span');
  anchor.className = 'verse-anchor-badge';
  anchor.textContent = '#';
  anchor.title = `Record ${record.recid}${record.showid ? ' · ' + record.showid : ''} — click to copy anchor`;
  anchor.setAttribute('aria-label', 'Anchor');
  anchor.addEventListener('click', e => {
    e.stopPropagation();
    // Highlight this block
    div.classList.add('anchor-highlight');
    setTimeout(() => div.classList.remove('anchor-highlight'), 2000);
    // Copy anchor URL / record id to clipboard
    const text = `${window.location.href.split('#')[0]}#rec${record.recid}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    showToast(`Anchor #${record.recid} copied`, 'ok');
  });
  div.appendChild(anchor);

  // Append HTML content without clobbering the anchor badge already in the DOM
  const contentSpan = document.createElement('span');
  contentSpan.innerHTML = record.html || '';
  div.appendChild(contentSpan);


  // ── Apply persisted highlights and note icons ──────────────────────────────
  try { Highlighter.applyToBlock(div, record.recid); } catch(e) {}
  try { Notes.applyIcon(record.recid, div); }           catch(e) {}

  // ── Double-click any block → jump (re-navigate) to that record ──
  div.addEventListener('dblclick', e => {
    if (e.target.classList.contains('verse-anchor-badge')) return;
    if (e.target.classList.contains('folio-jumplink') ||
        e.target.classList.contains('folio-popup-ref') ||
        e.target.classList.contains('folio-querylink') ||
        e.target.classList.contains('folio-weblink')) return;
    App.navigateToRecid(record.recid);
  });

  // ── Jump links: open in full-screen modal reader ──
  div.querySelectorAll('.folio-jumplink').forEach(link => {
    link.addEventListener('click', async e => {
      e.stopPropagation();
      const target = link.dataset.jl;
      if (!target) return;
      link.classList.add('jl-loading');
      try {
        const recid = await API.call('get_jumplink', target);
        if (recid) {
          JLModal.open(recid, target);
        } else {
          const results = await API.call('search_jumplinks', target, 1);
          if (results && results.length > 0) {
            JLModal.open(results[0].recid, target);
          } else {
            showToast(`No target found for: "${target}"`, 'err');
          }
        }
      } catch (err) {
        console.warn('[JL]', err);
        showToast('Jump link failed', 'err');
      } finally {
        link.classList.remove('jl-loading');
      }
    });
  });

  // ── Popup refs → glossary popup ──
  div.querySelectorAll('.folio-popup-ref').forEach(ref => {
    ref.addEventListener('click', async e => {
      e.stopPropagation();
      const key = ref.dataset.px;
      if (!key) return;
      try {
        const popup = await API.call('get_popup', key);
        if (popup) showPopup(key, popup.html || popup.plain || '', e.clientX, e.clientY);
      } catch (err) { /* silent */ }
    });
  });

  // ── Query links → open search ──
  div.querySelectorAll('.folio-querylink').forEach(q => {
    q.addEventListener('click', e => {
      e.stopPropagation();
      const query = q.dataset.ql;
      if (query) App.openSearch(query);
    });
  });

  // ── Web links → open externally (use link.href, not dataset.url) ──
  div.querySelectorAll('.folio-weblink').forEach(link => {
    link.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      const url = link.href;  // href is set directly by folio_parser.py
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  });

  return div;
}

// ── Jump-Link Full-Screen Modal ──────────────────────────────────────────────
const JLModal = {
  _history: [],  // stack of {recid, title} for back-navigation within modal

  async open(recid, title) {
    // Push to internal history for back-navigation
    this._history.push({ recid, title: title || `Record ${recid}` });
    await this._load(recid, title);
    document.getElementById('jl-modal')?.classList.add('open');
    // Scroll modal body to top
    const body = document.getElementById('jl-modal-body');
    if (body) body.scrollTop = 0;
    // Prevent main page scroll while modal is open
    document.body.style.overflow = 'hidden';
  },

  async _load(recid, title) {
    const content = document.getElementById('jl-modal-content');
    const titleEl = document.getElementById('jl-modal-title');
    if (!content) return;

    // Update header title
    if (titleEl) titleEl.textContent = title || `Record ${recid}`;

    // Show loading state
    content.innerHTML = `
      <div class="jl-loading-state">
        <div class="spinner"></div>
        <div>Loading linked scripture…</div>
      </div>`;

    try {
      const result = await API.call('navigate_to_recid', recid);
      if (!result || !result.records || result.records.length === 0) {
        content.innerHTML = `<div class="empty"><div class="icon">📭</div><div>No content found for this link.</div></div>`;
        return;
      }

      content.innerHTML = '';
      const frag = document.createDocumentFragment();
      result.records.forEach(rec => {
        const block = renderTextBlock(rec);
        // Re-wire jumplinks INSIDE modal to navigate within modal (not main view)
        block.querySelectorAll('.folio-jumplink').forEach(jl => {
          // Clone to remove old listener, then add modal-aware one
          const newJl = jl.cloneNode(true);
          jl.replaceWith(newJl);
          newJl.addEventListener('click', async e => {
            e.stopPropagation();
            const t = newJl.dataset.jl;
            if (!t) return;
            newJl.classList.add('jl-loading');
            try {
              const rid = await API.call('get_jumplink', t);
              if (rid) { this.open(rid, t); }
              else {
                const rs = await API.call('search_jumplinks', t, 1);
                if (rs && rs.length > 0) this.open(rs[0].recid, t);
                else showToast(`No target for: "${t}"`, 'err');
              }
            } catch(ex) { showToast('Link failed', 'err'); }
            finally { newJl.classList.remove('jl-loading'); }
          });
        });
        frag.appendChild(block);
      });
      content.appendChild(frag);

      // Scroll to the target record
      requestAnimationFrame(() => {
        const targetEl = content.querySelector(`[data-recid="${recid}"]`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.style.transition = 'background .5s ease';
          targetEl.style.background = 'rgba(255,140,0,.12)';
          setTimeout(() => { targetEl.style.background = ''; }, 1400);
        }
      });
    } catch (e) {
      console.error('[JLModal] load failed:', e);
      content.innerHTML = `<div class="empty"><div class="icon">⚠️</div><div>Failed to load linked content.</div></div>`;
    }
  },

  back() {
    // Pop current from history
    this._history.pop();
    if (this._history.length === 0) {
      // No history left — close the modal
      this.close();
    } else {
      // Go to previous entry
      const prev = this._history[this._history.length - 1];
      this._load(prev.recid, prev.title);
    }
  },

  close() {
    document.getElementById('jl-modal')?.classList.remove('open');
    document.body.style.overflow = '';
    this._history = [];
    // Clear content to free memory
    const content = document.getElementById('jl-modal-content');
    if (content) content.innerHTML = '';
    const titleEl = document.getElementById('jl-modal-title');
    if (titleEl) titleEl.textContent = '';
  },

  isOpen() {
    return document.getElementById('jl-modal')?.classList.contains('open') || false;
  },
};

// ── Popup ─────────────────────────────────────────────────────────────────────
function showPopup(title, html, x, y) {
  const overlay = document.getElementById('popup-overlay');
  const titleEl = document.getElementById('popup-title');
  const bodyEl  = document.getElementById('popup-body');
  if (!overlay) return;
  if (titleEl) titleEl.textContent = title;
  if (bodyEl)  bodyEl.innerHTML = html;
  const w = 420, h = 300;
  overlay.style.left = Math.min(x, (window.innerWidth  - w - 16)) + 'px';
  overlay.style.top  = Math.min(y, (window.innerHeight - h - 40)) + 'px';
  overlay.classList.add('open');
  const close = ev => {
    if (!overlay.contains(ev.target)) {
      overlay.classList.remove('open');
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 120);
}

// ── DOM Wiring ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Sidebar controls
  document.getElementById('sidebar-toggle')
    ?.addEventListener('click', () => App.toggleSidebar());
  document.getElementById('sidebar-expand-all')
    ?.addEventListener('click', () => SidebarTree.expandAll());
  document.getElementById('sidebar-collapse-all')
    ?.addEventListener('click', () => SidebarTree.collapseAll());

  // Header search bar → open panel on click/focus
  const hdrSearch = document.getElementById('header-search-input');
  if (hdrSearch) {
    hdrSearch.addEventListener('focus', () => { hdrSearch.blur(); SearchPanel.open(); });
    hdrSearch.addEventListener('click', () => SearchPanel.open());
  }

  // Sidebar filter input → live filter tree
  const sbFilter = document.getElementById('sidebar-filter-input');
  if (sbFilter) {
    sbFilter.addEventListener('input', e => SidebarTree.filterTree(e.target.value));
  }

  // Chapter filter checkboxes
  const chBoxes = document.querySelectorAll('.ch-checks input[type="checkbox"]');
  chBoxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const label = cb.closest('.ch-check');
      if (cb.checked) {
        ChapterFilter.activeFilters.add(cb.value);
        label?.classList.add('checked');
      } else {
        ChapterFilter.activeFilters.delete(cb.value);
        label?.classList.remove('checked');
      }
      if (ChapterFilter.currentNode) ChapterFilter.loadChapter(ChapterFilter.currentNode);
    });
  });

  // ── Jump-to-Record input (F5) ────────────────────────────────────────────
  function doJumpToRecord() {
    const input = document.getElementById('jump-recid-input');
    if (!input) return;
    const val = parseInt(input.value, 10);
    if (!val || val < 1) {
      input.classList.add('jump-input-err');
      setTimeout(() => input.classList.remove('jump-input-err'), 800);
      return;
    }
    input.value = '';
    input.blur();
    App.navigateToRecid(val);
  }

  const jumpInput = document.getElementById('jump-recid-input');
  if (jumpInput) {
    jumpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); doJumpToRecord(); }
      if (e.key === 'Escape') { jumpInput.value = ''; jumpInput.blur(); }
    });
  }
  document.getElementById('jump-recid-btn')
    ?.addEventListener('click', doJumpToRecord);

  // ── Jump-Link Modal: header buttons ─────────────────────────────────────
  document.getElementById('jl-back-btn')
    ?.addEventListener('click', () => JLModal.back());
  document.getElementById('jl-close-btn')
    ?.addEventListener('click', () => JLModal.close());
});
