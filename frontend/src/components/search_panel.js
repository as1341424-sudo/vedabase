/**
 * SearchPanel — Instant FTS5 Search Overlay (F2)
 * Clean, user-friendly design with filter tabs, suggestion chips,
 * location breadcrumbs, and keyboard navigation.
 */

'use strict';

const SearchPanel = {
  debounce: null,
  currentQuery: '',
  selectedIdx: -1,
  results: [],
  currentPage: 0,
  loading: false,
  activeFilter: '',   // '' | 'verse' | 'synonyms' | 'translation' | 'purport'

  open() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    State.searchOpen = true;
    setTimeout(() => {
      const input = document.getElementById('search-input');
      if (input) { input.focus(); input.select(); }
      // Show history chips if input empty
      const q = input?.value?.trim();
      if (!q) this._renderHistoryChips();
    }, 60);
    App.setStatus('Search open — type to search across 1.6M+ records');
  },

  close() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    State.searchOpen = false;
    App.setStatus('Ready');
  },

  init() {
    const input = document.getElementById('search-input');
    if (!input) return;

    // Typing — debounced search
    input.addEventListener('input', () => {
      const q = input.value.trim();
      this.currentQuery = q;
      this.currentPage  = 0;
      clearTimeout(this.debounce);

      if (q.length < 2) {
        this._showEmpty();
        this._renderHistoryChips();
        return;
      }
      // Show suggestion chips immediately while typing
      this.debounce = setTimeout(() => {
        this.runSearch(q);
        this.runSuggest(q);
      }, 200);
    });

    // Keyboard navigation
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this._moveSelection(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this._moveSelection(-1); }
      if (e.key === 'Enter')     { e.preventDefault(); this._selectCurrent(); }
      if (e.key === 'Escape')    { this.close(); }
    });

    // Filter tabs
    document.getElementById('search-filter-bar')?.addEventListener('click', e => {
      const btn = e.target.closest('.sf-btn');
      if (!btn) return;
      document.querySelectorAll('.sf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.activeFilter = btn.dataset.filter || '';
      if (this.currentQuery.length >= 2) this.runSearch(this.currentQuery);
    });
  },

  // ── Search ──────────────────────────────────────────────────────────

  async runSearch(query) {
    if (this.loading) return;
    this.loading = true;
    this._showLoading();

    try { SearchHistory.add(query); } catch(e) {}

    try {
      let scopeRecids = null;
      const scopeToggle = document.getElementById('search-scoped');
      if (scopeToggle?.checked && State.checkedNodes?.size > 0) {
        scopeRecids = await SidebarTree.getScopedRecids?.();
      }

      const result = await API.call('search', query, scopeRecids, this.currentPage);
      let results = result.results || [];

      // Client-side filter by type
      if (this.activeFilter) {
        results = results.filter(r => this._matchesFilter(r, this.activeFilter));
      }

      this.results    = results;
      this.selectedIdx = -1;
      this._renderResults({ ...result, results });

      // Feed recids to HitNav for F3/F4
      try { HitNav.setHits(this.results.map(r => r.recid)); } catch(e) {}

    } catch (e) {
      console.error('[SearchPanel] search failed:', e);
      this._showError();
    } finally {
      this.loading = false;
    }
  },

  _matchesFilter(rec, filter) {
    const lv = (rec.levelname || '').toLowerCase();
    const st = (rec.stylename || '').toLowerCase();
    switch (filter) {
      case 'verse':
        return lv.includes('verse') || st.includes('verse') || st.includes('iast');
      case 'synonyms':
        return st.includes('synonym') || st.includes('word-for-word') || st.includes('wfw');
      case 'translation':
        return st.includes('translation') || st.includes('translat');
      case 'purport':
        return st.includes('purport') || st.includes('pa_purport') || st.includes('pa-purport');
      default:
        return true;
    }
  },

  async runSuggest(partial) {
    try {
      const suggestions = await API.call('search_suggest', partial);
      this._renderSuggestionChips(suggestions);
    } catch(e) { /* ignore */ }
  },

  // ── Rendering ───────────────────────────────────────────────────────

  _renderResults(result) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!result.results || result.results.length === 0) {
      container.innerHTML = `
        <div class="search-no-results">
          No results for <strong>"${this._esc(this.currentQuery)}"</strong>
          <div style="margin-top:8px;font-size:var(--text-sm)">
            Try a simpler term, check spelling, or remove the filter.
          </div>
        </div>`;
      this._setCount('No results');
      return;
    }

    container.innerHTML = '';
    result.results.forEach((rec, idx) => {
      const item = document.createElement('div');
      item.className   = 'search-result';
      item.dataset.recid = rec.recid;
      item.dataset.idx   = idx;

      const badge    = this._getBadge(rec.levelname, rec.stylename);
      const location = rec.location ? `<span class="result-location">📍 ${this._esc(rec.location)}</span>` : '';

      item.innerHTML = `
        <div class="result-meta">
          <span class="result-badge ${badge.cls}">${badge.label}</span>
          ${location}
          <span class="result-recid">#${rec.recid}</span>
        </div>
        <div class="result-snippet">${rec.snippet || ''}</div>
      `;

      item.addEventListener('click', () => {
        this.close();
        App.navigateToRecid(rec.recid);
        try { SidebarTree.highlightForRecid?.(rec.recid); } catch(e) {}
      });
      item.addEventListener('mouseenter', () => {
        this.selectedIdx = idx;
        this._updateHighlight();
      });

      container.appendChild(item);
    });

    // Load more
    if (result.has_more) {
      const btn = document.createElement('button');
      btn.className   = 'load-more-btn';
      btn.textContent = `Load more results…`;
      btn.onclick = () => { this.currentPage++; this.runSearch(this.currentQuery); };
      container.appendChild(btn);
    }

    const total = result.total || result.results.length;
    this._setCount(`${total.toLocaleString()} result${total !== 1 ? 's' : ''} · page ${this.currentPage + 1}`);
  },

  _getBadge(levelname, stylename) {
    const lv = (levelname || '').toLowerCase();
    const st = (stylename  || '').toLowerCase();
    if (lv.includes('verse') || st.includes('verse') || st.includes('iast'))
      return { cls: 'badge-verse',   label: 'VERSE' };
    if (st.includes('synonym') || st.includes('word-for-word'))
      return { cls: 'badge-wfw',     label: 'SYNONYMS' };
    if (st.includes('translation'))
      return { cls: 'badge-trans',   label: 'TRANS' };
    if (st.includes('purport'))
      return { cls: 'badge-purport', label: 'PURPORT' };
    if (lv.includes('book') || lv.includes('canto') || lv.includes('chapter'))
      return { cls: 'badge-heading', label: 'HEADING' };
    return { cls: 'badge-text', label: 'TEXT' };
  },

  _renderSuggestionChips(words) {
    const list = document.getElementById('suggest-list');
    if (!list) return;
    list.innerHTML = '';
    if (!words || !words.length) return;

    words.forEach(word => {
      const chip = document.createElement('span');
      chip.className   = 'suggest-item';
      chip.textContent = word;
      chip.title       = `Search for "${word}"`;
      chip.addEventListener('click', () => {
        const input = document.getElementById('search-input');
        if (input) { input.value = word; input.focus(); }
        this.currentQuery = word;
        this.currentPage  = 0;
        this.runSearch(word);
      });
      list.appendChild(chip);
    });
  },

  _renderHistoryChips() {
    const list = document.getElementById('suggest-list');
    if (!list) return;
    try {
      const history = SearchHistory.get().slice(0, 10);
      list.innerHTML = '';
      history.forEach(term => {
        const chip = document.createElement('span');
        chip.className   = 'hist-item';
        chip.innerHTML   = `<span class="hist-ico">🕐</span>${this._esc(term)}`;
        chip.title       = `Repeat search: "${term}"`;
        chip.addEventListener('click', () => {
          const input = document.getElementById('search-input');
          if (input) { input.value = term; input.focus(); }
          this.currentQuery = term;
          this.currentPage  = 0;
          this.runSearch(term);
          this._renderSuggestionChips([]);
        });
        list.appendChild(chip);
      });
    } catch(e) {}
  },

  // ── State helpers ───────────────────────────────────────────────────

  _showEmpty() {
    const el = document.getElementById('search-results');
    if (el) el.innerHTML = `
      <div class="search-empty-state">
        <div class="ses-icon">🙏</div>
        <div class="ses-title">Search 1.6M+ records</div>
        <div class="ses-hint">
          Try: <em>Krishna</em> · <em>yoga</em> · <em>dharma</em> · <em>Bhagavad-gita</em>
        </div>
      </div>`;
    this._setCount('');
    this.results = [];
  },

  _showLoading() {
    const el = document.getElementById('search-results');
    if (el) el.innerHTML = `
      <div class="search-empty-state">
        <div class="spinner"></div>
        <div class="ses-title" style="font-size:var(--text-md)">Searching…</div>
      </div>`;
    this._setCount('Searching…');
  },

  _showError() {
    const el = document.getElementById('search-results');
    if (el) el.innerHTML = `
      <div class="search-no-results">
        Search error. Try rephrasing your query.
      </div>`;
    this._setCount('Error');
  },

  _setCount(msg) {
    const el = document.getElementById('search-count');
    if (el) el.textContent = msg;
  },

  _moveSelection(delta) {
    const items = document.querySelectorAll('.search-result');
    if (!items.length) return;
    this.selectedIdx = Math.max(0, Math.min(items.length - 1, this.selectedIdx + delta));
    this._updateHighlight();
    items[this.selectedIdx]?.scrollIntoView({ block: 'nearest' });
  },

  _updateHighlight() {
    document.querySelectorAll('.search-result').forEach((el, i) => {
      el.classList.toggle('sel', i === this.selectedIdx);
    });
  },

  _selectCurrent() {
    if (this.selectedIdx < 0 || this.selectedIdx >= this.results.length) return;
    const rec = this.results[this.selectedIdx];
    if (!rec) return;
    this.close();
    App.navigateToRecid(rec.recid);
  },

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
};

document.addEventListener('DOMContentLoaded', () => SearchPanel.init());
