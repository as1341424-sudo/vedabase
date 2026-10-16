/**
 * ChapterFilter — Component Isolation View
 * Filters chapter texts by component type (verse/word/translation/purport).
 */

'use strict';

const ChapterFilter = {
  currentNode: null,
  activeFilters: new Set(),

  // Map filter values to stylename patterns
  STYLE_MAP: {
    verse:       ['LE_Verse_Section', 'LE_Verse_Text', 'LE_Verse_Number'],
    word:        ['PA_Word_for_Word', 'PA_Word', 'PA_Wfw'],
    translation: ['PA_Translation', 'PA_After_Verse', 'PA_After_Verse_50'],
    purport:     ['PA_Purport', 'PA_Normal', 'PA_1Apara', 'PA_1B'],
    heading:     ['LE_Chapter', 'LE_Section', 'LE_Canto', 'LE_Book', 'LE_Writings', 'LE_Collection'],
  },

  init() {
    // Checkboxes are wired in main.js DOMContentLoaded
    // This init just ensures the filter state is ready
  },


  async loadChapter(node) {
    this.currentNode = node;
    App.switchView('chapter');

    const content = document.getElementById('chapter-content');
    if (!content) return;

    content.innerHTML = '<div class="empty"><div class="spinner"></div><div>Loading chapter…</div></div>';

    // Update chapter nav label
    const label = document.getElementById('chapter-nav-label');
    if (label) label.textContent = node.simpletitle || node.title || 'Chapter';

    // Build style filter list
    const styleFilters = this.buildStyleFilters();

    try {
      const records = await API.call(
        'get_chapter_texts',
        node.record,
        node.record_end,
        styleFilters.length > 0 ? styleFilters : null
      );

      content.innerHTML = '';

      if (!records || records.length === 0) {
        content.innerHTML = '<div class="empty"><div class="icon">📭</div><div>No content matches the selected filters. Try unchecking some filters.</div></div>';
        return;
      }

      const frag = document.createDocumentFragment();

      // Add sticky top nav
      frag.appendChild(this.buildNavBar(node, 'top'));
      frag.appendChild(this.buildDivider());

      records.forEach(rec => frag.appendChild(renderTextBlock(rec)));

      // Add bottom nav
      frag.appendChild(this.buildDivider());
      frag.appendChild(this.buildNavBar(node, 'bottom'));

      content.appendChild(frag);
      content.scrollTop = 0;
    } catch (e) {
      console.error('[ChapterFilter] load failed:', e);
      content.innerHTML = '<div class="empty"><div class="icon">⚠️</div><div>Failed to load chapter content</div></div>';
    }
  },

  buildStyleFilters() {
    if (this.activeFilters.size === 0) return [];
    const styles = [];
    this.activeFilters.forEach(filterKey => {
      const styleNames = this.STYLE_MAP[filterKey] || [];
      styles.push(...styleNames);
    });
    return styles;
  },

  buildNavBar(node, position) {
    const bar = document.createElement('div');
    bar.className = 'chapter-nav-bar';
    bar.style.cssText = 'display:flex;justify-content:center;gap:16px;padding:16px 0;';
    if (position === 'top') {
      bar.style.cssText += 'position:sticky;top:0;background:var(--surface);z-index:10;border-bottom:1px solid var(--border);';
    }

    const prevBtn = document.createElement('button');
    prevBtn.className = 'chapter-nav-btn';
    prevBtn.textContent = '← Previous Chapter';
    prevBtn.onclick = () => this.navigateChapter('prev');

    const title = document.createElement('span');
    title.style.cssText = 'font-family:var(--font-heading);font-size:var(--text-md);color:var(--saffron-dk);align-self:center;font-weight:600;';
    title.textContent = node.simpletitle || node.title || '';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'chapter-nav-btn';
    nextBtn.textContent = 'Next Chapter →';
    nextBtn.onclick = () => this.navigateChapter('next');

    bar.appendChild(prevBtn);
    bar.appendChild(title);
    bar.appendChild(nextBtn);
    return bar;
  },

  buildDivider() {
    const d = document.createElement('div');
    d.className = 'lotus-divider';
    d.innerHTML = '<span class="lotus-divider-icon">🪷</span>';
    return d;
  },

  async navigateChapter(direction) {
    if (!this.currentNode) return;
    try {
      const adjacent = await API.call('get_adjacent_chapter', this.currentNode.record, direction);
      if (adjacent) {
        // loadChapter already calls App.switchView('chapter') — don't also call navigateToRecid
        // which would switch back to doc view
        this.loadChapter(adjacent);
      } else {
        showToast(direction === 'next' ? 'This is the last chapter' : 'This is the first chapter', 'ok');
      }
    } catch (e) {
      console.error('[ChapterFilter] navigate failed:', e);
      showToast('Navigation failed', 'err');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => ChapterFilter.init());
