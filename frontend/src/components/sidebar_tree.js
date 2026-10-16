/**
 * SidebarTree — Hierarchical Contents Navigation (F3)
 * Lazy-loading tree with checkboxes for scoped search.
 */

'use strict';

const SidebarTree = {
  activeNodeRecord: null,
  expandedNodes: new Set(),
  nodeMap: new Map(),  // record -> element

  async init() {
    const container = document.getElementById('sidebar-tree');
    if (!container) return;
    container.innerHTML = '<div class="tree-loading"><div class="loading-spinner"></div> Loading contents…</div>';

    try {
      const roots = await API.call('get_root_nodes');
      container.innerHTML = '';
      roots.forEach(node => {
        const el = this.createNode(node, 0);
        container.appendChild(el);
      });
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>Failed to load contents</div></div>';
      console.error('[SidebarTree] init failed:', e);
    }
  },

  getLevelIcon(level, hasChildren) {
    // Minimal clean icons — no emoji clutter
    if (!hasChildren) return '';
    return ''; // expand button handles the indicator
  },


  createNode(node, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = `tree-node tree-level-${Math.min(depth, 4)}`;
    wrapper.dataset.record = node.record;
    this.nodeMap.set(node.record, wrapper);

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.setAttribute('role', 'treeitem');

    // Indentation
    const indent = document.createElement('div');
    indent.style.width = `${depth * 12}px`;
    indent.style.flexShrink = '0';
    row.appendChild(indent);

    // Expand button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tree-expand';
    if (node.node_children) {
      expandBtn.textContent = '▶';
      expandBtn.title = 'Expand';
      expandBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.toggleExpand(node, wrapper, expandBtn, childrenContainer, depth, row);
      };
    } else {
      expandBtn.textContent = '';
      expandBtn.style.visibility = 'hidden';
    }
    row.appendChild(expandBtn);

    // Label only — no checkbox, no emoji icon
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.simpletitle || node.title || `Record ${node.record}`;
    label.title = node.title || '';
    row.appendChild(label);

    // Click to navigate
    row.addEventListener('click', () => {
      this.setActiveNode(node.record, row);
      App.navigateToRecid(node.record);
    });

    wrapper.appendChild(row);

    // Children container
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = 'none';
    wrapper.appendChild(childrenContainer);

    return wrapper;
  },


  async toggleExpand(node, wrapper, expandBtn, childrenContainer, depth, row) {
    const isExpanded = this.expandedNodes.has(node.record);

    if (isExpanded) {
      // Collapse
      this.expandedNodes.delete(node.record);
      childrenContainer.style.display = 'none';
      expandBtn.textContent = '▶';
      expandBtn.classList.remove('expanded');
      if (row) row.setAttribute('aria-expanded', 'false');
    } else {
      // Expand — load children if not already loaded
      this.expandedNodes.add(node.record);
      expandBtn.textContent = '⋯';
      expandBtn.disabled = true;

      if (!childrenContainer.hasChildNodes()) {
        // Show loading
        const loadingEl = document.createElement('div');
        loadingEl.className = 'tree-loading';
        loadingEl.innerHTML = '<div class="loading-spinner"></div> Loading…';
        childrenContainer.appendChild(loadingEl);
        childrenContainer.style.display = 'block';

        try {
          const children = await API.call('get_children', node.record);
          childrenContainer.innerHTML = '';
          if (children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'tree-loading';
            empty.style.color = 'var(--color-text-muted)';
            empty.textContent = 'No sub-items';
            childrenContainer.appendChild(empty);
          } else {
            children.forEach(child => {
              childrenContainer.appendChild(this.createNode(child, depth + 1));
            });
          }
        } catch (e) {
          childrenContainer.innerHTML = '<div class="tree-loading" style="color:#EF4444">Load failed</div>';
        }
      } else {
        childrenContainer.style.display = 'block';
      }

      expandBtn.textContent = '▼';
      expandBtn.disabled = false;
      expandBtn.classList.add('expanded');
      if (row) row.setAttribute('aria-expanded', 'true');
    }
  },


  setActiveNode(record, rowEl) {
    document.querySelectorAll('.tree-row.active').forEach(el => el.classList.remove('active'));
    rowEl.classList.add('active');
    this.activeNodeRecord = record;
  },


  expandAll() {
    document.querySelectorAll('#sidebar-tree > .tree-node > .tree-row > .tree-expand').forEach(btn => {
      if (btn.textContent === '\u25b6') btn.click();
    });
  },

  collapseAll() {
    document.querySelectorAll('.tree-expand.expanded').forEach(btn => btn.click());
  },

  // Filter sidebar labels in real-time
  filterTree(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('#sidebar-tree .tree-node').forEach(node => {
      const label = node.querySelector('.tree-label');
      if (!label) return;
      const text = label.textContent.toLowerCase();
      node.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
  },

  // Get scoped recid ranges from checked nodes (not used currently but kept for future)
  async getScopedRecids() {
    if (!State.checkedNodes || State.checkedNodes.size === 0) return null;
    return null; // simplified — scoped search not active in current UI
  },
};
