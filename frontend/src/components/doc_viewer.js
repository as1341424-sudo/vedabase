/**
 * DocViewer — Virtualized Infinite Scroll Document Viewer (F4)
 * Efficiently renders 1.6M+ text records using IntersectionObserver.
 */

'use strict';

const DocViewer = {
  loading: false,
  topRecid: null,
  bottomRecid: null,
  MAX_DOM_RECORDS: 300,  // Max records in DOM before culling
  CHUNK: 40,
  observer: null,
  debounceTimer: null,

  init() {
    this.setupObserver();
  },

  setupObserver() {
    const options = { root: null, rootMargin: '200px', threshold: 0 };

    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (entry.target.id === 'scroll-bottom-sentinel') {
          this.loadMore('forward');
        } else if (entry.target.id === 'scroll-top-sentinel') {
          this.loadMore('backward');
        }
      });
    }, options);

    const topSentinel = document.getElementById('scroll-top-sentinel');
    const bottomSentinel = document.getElementById('scroll-bottom-sentinel');
    if (topSentinel) this.observer.observe(topSentinel);
    if (bottomSentinel) this.observer.observe(bottomSentinel);
  },

  async loadAt(recid) {
    if (this.loading) return;
    this.loading = true;
    this.showSpinner('bottom', true);

    try {
      const result = await API.call('navigate_to_recid', recid);
      if (!result || !result.records) return;

      const content = document.getElementById('doc-content');
      content.innerHTML = '';

      const frag = document.createDocumentFragment();
      result.records.forEach(rec => frag.appendChild(renderTextBlock(rec)));
      content.appendChild(frag);

      if (result.records.length > 0) {
        this.topRecid = result.records[0].recid;
        this.bottomRecid = result.records[result.records.length - 1].recid;
      }

      // Scroll to target record
      const targetEl = content.querySelector(`[data-recid="${recid}"]`);
      if (targetEl) {
        setTimeout(() => {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.style.transition = 'background 0.5s ease';
          targetEl.style.background = 'rgba(255,140,0,0.12)';
          setTimeout(() => { targetEl.style.background = ''; }, 1200);
        }, 100);
      }
    } catch (e) {
      console.error('[DocViewer] loadAt failed:', e);
      App.setStatus('Error loading record', false);
    } finally {
      this.loading = false;
      this.showSpinner('bottom', false);
    }
  },

  async loadMore(direction) {
    if (this.loading) return;
    // Guard: require valid anchor recids before attempting load
    if (direction === 'forward' && (this.bottomRecid == null)) return;
    if (direction === 'backward' && (this.topRecid == null)) return;

    const startId = direction === 'forward' ? (this.bottomRecid + 1) : this.topRecid;
    if (!startId) return;

    this.loading = true;
    this.showSpinner(direction === 'forward' ? 'bottom' : 'top', true);

    try {
      const records = await API.call('get_text_chunk', startId, direction, this.CHUNK);
      if (!records || records.length === 0) {
        this.loading = false;
        return;
      }

      const content = document.getElementById('doc-content');
      const viewer = document.getElementById('doc-viewer');
      const scrollTop = viewer.scrollTop;

      const frag = document.createDocumentFragment();
      records.forEach(rec => frag.appendChild(renderTextBlock(rec)));

      if (direction === 'forward') {
        content.appendChild(frag);
        this.bottomRecid = records[records.length - 1].recid;
      } else {
        // Prepend: save scroll position
        const oldHeight = content.scrollHeight;
        content.insertBefore(frag, content.firstChild);
        // Restore scroll position after DOM update
        requestAnimationFrame(() => {
          viewer.scrollTop = scrollTop + (content.scrollHeight - oldHeight);
        });
        this.topRecid = records[0].recid;
      }

      // Cull far-end records to prevent DOM bloat
      this.cullRecords(direction, content);

    } catch (e) {
      console.error('[DocViewer] loadMore failed:', e);
    } finally {
      this.loading = false;
      this.showSpinner(direction === 'forward' ? 'bottom' : 'top', false);
    }
  },

  cullRecords(direction, content) {
    const blocks = content.querySelectorAll('[data-recid]');
    if (blocks.length <= this.MAX_DOM_RECORDS) return;

    const toRemove = blocks.length - this.MAX_DOM_RECORDS;
    if (direction === 'forward') {
      // Remove from top
      for (let i = 0; i < toRemove; i++) {
        const recid = parseInt(blocks[i].dataset.recid);
        blocks[i].remove();
        if (i === toRemove - 1) this.topRecid = recid + 1;
      }
    } else {
      // Remove from bottom
      for (let i = 0; i < toRemove; i++) {
        const idx = blocks.length - 1 - i;
        const recid = parseInt(blocks[idx].dataset.recid);
        blocks[idx].remove();
        if (i === toRemove - 1) this.bottomRecid = recid - 1;
      }
    }
  },

  showSpinner(pos, show) {
    const spinnerId = pos === 'top' ? 'top-spinner' : 'bottom-spinner';
    const spinner = document.getElementById(spinnerId);
    if (spinner) spinner.classList.toggle('hidden', !show);
  },

  clear() {
    const content = document.getElementById('doc-content');
    if (content) content.innerHTML = '';
    this.topRecid = null;
    this.bottomRecid = null;
  }
};

// Initialize observer when DOM is ready
document.addEventListener('DOMContentLoaded', () => DocViewer.init());
