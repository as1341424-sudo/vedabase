/**
 * api_bridge.js — Unified API bridge for PyWebView desktop + HTTP fallback.
 *
 * Fixed race condition: we now poll until a known method (ping) is callable,
 * not just until window.pywebview.api exists (the object can appear before
 * all methods are injected by PyWebView).
 */

'use strict';

const API = (() => {
  let _mode  = 'pending';   // 'pywebview' | 'http' | 'pending'
  let _ready = false;
  const _queue = [];

  // ── Resolve bridge ───────────────────────────────────────────────────────────
  function _resolve(mode) {
    if (_ready) return;
    _ready = true;
    _mode  = mode;
    console.log(`[API] Bridge ready — mode: ${mode}`);
    _queue.forEach(fn => fn());
    _queue.length = 0;
    if (typeof App !== 'undefined') App.init();
  }

  // ── Helper: check that pywebview API methods are actually callable ───────────
  function _apiMethodsReady() {
    try {
      return (
        window.pywebview &&
        window.pywebview.api &&
        typeof window.pywebview.api.get_docinfo === 'function'
      );
    } catch (e) {
      return false;
    }
  }

  // ── Poll until API methods are injected (not just api object present) ────────
  let _pollCount = 0;
  const _poll = setInterval(() => {
    _pollCount++;

    if (_apiMethodsReady()) {
      clearInterval(_poll);
      console.log('[API] pywebview methods confirmed ready.');
      _resolve('pywebview');
      return;
    }

    // After 10 seconds still no usable pywebview → HTTP fallback
    if (_pollCount >= 100) {
      clearInterval(_poll);
      console.warn('[API] pywebview not ready after 10s — switching to HTTP mode');
      _resolve('http');
    }
  }, 100);

  // pywebviewready event fires when PyWebView has finished injecting the bridge
  window.addEventListener('pywebviewready', () => {
    console.log('[API] pywebviewready event received');
    // Don't resolve immediately — still wait for the method poll to confirm
    // methods are callable (sometimes pywebviewready fires slightly early)
  });

  // ── Public interface ─────────────────────────────────────────────────────────
  return {
    get mode() { return _mode; },
    get ready() { return _ready; },

    /** Call a backend method. Waits for bridge to be ready first. */
    async call(method, ...args) {
      // Wait until bridge is resolved
      if (!_ready) {
        await new Promise(r => _queue.push(r));
      }

      if (_mode === 'pywebview') {
        // Retry up to 5 times if the method isn't callable yet
        // (edge case: some methods load slightly after others)
        for (let attempt = 0; attempt < 5; attempt++) {
          const fn = window.pywebview.api[method];
          if (typeof fn === 'function') {
            try {
              return await fn(...args);
            } catch (e) {
              console.error(`[API pywebview] ${method}(attempt ${attempt+1}) failed:`, e);
              throw e;
            }
          }
          // Method not ready yet — wait 200ms and retry
          console.warn(`[API] method '${method}' not ready yet, retrying (attempt ${attempt+1})…`);
          await new Promise(r => setTimeout(r, 200));
        }
        throw new Error(`[API] Method '${method}' not available in pywebview after 5 attempts`);

      } else {
        // HTTP fallback mode
        const names = _ARG_NAMES[method] || [];
        const body  = {};
        args.forEach((v, i) => { body[names[i] || `arg${i}`] = v; });
        try {
          const res = await fetch(`/api/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          return res.json();
        } catch (e) {
          console.error(`[API http] ${method} failed:`, e);
          throw e;
        }
      }
    },

    // Internal: allow external code to force-resolve (not typically needed)
    _markReady(mode) { _resolve(mode); },
  };
})();

// Argument name map for HTTP POST body (positional args → named keys)
const _ARG_NAMES = {
  get_root_nodes:       [],
  get_children:         ['parent_record'],
  get_node_by_record:   ['record'],
  get_breadcrumb:       ['record'],
  get_text_chunk:       ['start_recid', 'direction', 'count'],
  navigate_to_recid:    ['recid'],
  get_record:           ['recid'],
  get_chapter_texts:    ['chapter_start', 'chapter_end', 'style_filters'],
  get_adjacent_chapter: ['current_record', 'direction'],
  search:               ['query', 'scope_recids', 'page'],
  search_suggest:       ['partial'],
  get_popup:            ['title'],
  get_docinfo:          [],
  get_style_map:        [],
  get_levels:           [],
  get_groups:           [],
  get_group_records:    ['groupid'],
  get_jumplink:         ['title'],
  get_all_books:        [],
  get_stats:            [],
  search_jumplinks:     ['query', 'limit'],
  get_playlists:        [],
  get_textviews:        ['limit'],
  find_node_for_recid:  ['recid'],
  ping:                 [],
};
