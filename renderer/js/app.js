/* ── app.js: routing, global state, modal helpers ── */
'use strict';

const App = (() => {
  // ── Global state ──────────────────────────────────────────────────
  const state = {
    currentPage: 'characters',
    characters: [],
    factions: [],
    relationships: [],
  };

  // ── Page routing ──────────────────────────────────────────────────
  function navigate(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(el => {
      el.classList.toggle('hidden', !el.id.endsWith(page));
      el.classList.toggle('active', el.id.endsWith(page));
    });
    state.currentPage = page;

    if (page === 'characters') Characters.render();
    else if (page === 'factions') Factions.render();
    else if (page === 'relations') Relations.render();
    else if (page === 'graph') Graph.render();
    else if (page === 'episodes') Episodes.render();
    else if (page === 'calendar') Calendar.render();
  }

  // ── Theme management ─────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem('wb_theme') || 'dark';
    applyTheme(saved);

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        const next = current === 'light' ? 'dark' : 'light';
        applyTheme(next);
      });
    }
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('wb_theme', theme);
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.textContent = theme === 'light' ? '☀️ 라이트' : '🌙 다크';
    }
  }

  // ── Toast notification ───────────────────────────────────────────
  function showToast(message) {
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2000);
  }

  // ── Modal helpers ─────────────────────────────────────────────────
  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function confirm(message) {
    return new Promise(resolve => {
      document.getElementById('confirm-message').textContent = message;
      openModal('modal-confirm');
      const yes = document.getElementById('btn-confirm-yes');
      const no = document.getElementById('btn-confirm-no');
      const cleanup = (result) => {
        closeModal('modal-confirm');
        yes.removeEventListener('click', onYes);
        no.removeEventListener('click', onNo);
        resolve(result);
      };
      const onYes = () => cleanup(true);
      const onNo = () => cleanup(false);
      yes.addEventListener('click', onYes);
      no.addEventListener('click', onNo);
    });
  }

  // ── Tab switching ─────────────────────────────────────────────────
  function initTabs(containerSel) {
    const container = typeof containerSel === 'string'
      ? document.querySelector(containerSel)
      : containerSel;
    if (!container) return;
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        container.querySelectorAll('.tab-content').forEach(c => {
          c.classList.toggle('hidden', c.id !== tabId);
        });
      });
    });
  }

  // ── Update sidebar badge ──────────────────────────────────────────
  function updateCharCount(n) {
    document.getElementById('char-count-badge').textContent = `${n}명`;
  }

  // ── Init ─────────────────────────────────────────────────────────
  async function init() {
    // Ensure all modals are closed and never block clicks
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));

    // Init theme
    initTheme();

    // Setup nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.page));
    });

    // Setup global modal close buttons
    document.querySelectorAll('.modal-close[data-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.modal));
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          closeModal(overlay.id);
        }
      });
    });

    // Init tabs on detail and form modals
    initTabs(document.getElementById('modal-char-detail'));
    initTabs(document.getElementById('modal-char-form'));

    // Load initial data
    await loadAll();

    // Initial page
    navigate('characters');
  }

  async function loadAll() {
    const [chars, factions, rels] = await Promise.all([
      window.api.getCharacters(),
      window.api.getFactions(),
      window.api.getRelationships(),
    ]);
    state.characters = chars;
    state.factions = factions;
    state.relationships = rels;
    updateCharCount(chars.length);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { state, navigate, openModal, closeModal, confirm, initTabs, updateCharCount, loadAll, showToast };
})();

// ── Universal Character Picker Modal ────────────────────────────────
const CharPicker = (() => {
  let onSelectCallback = null;
  let currentlySelectedId = null;

  function open({ title = '캐릭터 선택', selectedId = null, onSelect }) {
    onSelectCallback = onSelect;
    currentlySelectedId = selectedId;

    const titleEl = document.getElementById('picker-title');
    if (titleEl) titleEl.textContent = title;

    populateFilters();
    renderGrid();
    App.openModal('modal-char-picker');

    setTimeout(() => {
      document.getElementById('picker-search')?.focus();
    }, 100);
  }

  function populateFilters() {
    const factionSel = document.getElementById('picker-filter-faction');
    if (factionSel) {
      factionSel.innerHTML = '<option value="">모든 세력</option>';
      (App.state.factions || []).forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        factionSel.appendChild(opt);
      });
    }

    const genderSel = document.getElementById('picker-filter-gender');
    if (genderSel) {
      const genders = [...new Set((App.state.characters || []).map(c => c.gender).filter(Boolean))].sort();
      genderSel.innerHTML = '<option value="">모든 성별</option>';
      genders.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        genderSel.appendChild(opt);
      });
    }
  }

  function getFiltered() {
    let list = [...(App.state.characters || [])];
    const search = document.getElementById('picker-search')?.value.trim().toLowerCase() || '';
    const factionId = document.getElementById('picker-filter-faction')?.value || '';
    const gender = document.getElementById('picker-filter-gender')?.value || '';
    const sortBy = document.getElementById('picker-sort-by')?.value || 'name';

    if (search) {
      list = list.filter(c => {
        const inName = (c.name || '').toLowerCase().includes(search);
        const inAlias = (c.aliases || []).some(a => a.toLowerCase().includes(search));
        const inOrigin = (c.origin || '').toLowerCase().includes(search);
        const inFaction = (c.factions || []).some(f => (f.name || '').toLowerCase().includes(search));
        return inName || inAlias || inOrigin || inFaction;
      });
    }

    if (factionId) {
      list = list.filter(c => c.factions && c.factions.some(f => String(f.id) === factionId));
    }

    if (gender) {
      list = list.filter(c => c.gender === gender);
    }

    list.sort((a, b) => {
      if (sortBy === 'age') {
        const ageA = a.age != null ? a.age : 99999;
        const ageB = b.age != null ? b.age : 99999;
        return ageA - ageB;
      }
      if (sortBy === 'created_at') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });

    return list;
  }

  function renderGrid() {
    const container = document.getElementById('picker-grid');
    if (!container) return;
    const list = getFiltered();
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:30px;">조건에 일치하는 캐릭터가 없습니다.</div>';
      return;
    }

    list.forEach(c => {
      const card = document.createElement('div');
      const isSelected = (c.id === currentlySelectedId);
      card.className = `picker-card ${isSelected ? 'selected' : ''}`;

      const avatarSrc = c.avatar_crop || (c.avatar_path ? `file://${c.avatar_path}` : (c.image_path ? `file://${c.image_path}` : null));
      const avatarHtml = avatarSrc
        ? `<img class="picker-card-avatar" src="${avatarSrc}" alt="${escapeHtml(c.name)}" />`
        : `<div class="picker-card-avatar" style="background:${strColor(c.name)};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:white;">${escapeHtml((c.name || '?')[0])}</div>`;

      const primaryFaction = (c.factions && c.factions.length > 0) ? c.factions[0].name : '';

      card.innerHTML = `
        ${avatarHtml}
        <div class="picker-card-name">${escapeHtml(c.name)}</div>
        <div class="picker-card-meta">${c.age != null ? `${c.age}세` : ''} ${c.gender || ''}</div>
        ${primaryFaction ? `<div style="margin-top:4px;"><span class="faction-badge" style="font-size:10px;padding:2px 6px;">${escapeHtml(primaryFaction)}</span></div>` : ''}
      `;

      card.addEventListener('click', () => {
        if (onSelectCallback) onSelectCallback(c);
        App.closeModal('modal-char-picker');
      });

      container.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function strColor(name) {
    let hash = 0;
    const s = name || 'default';
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 45%, 35%)`;
  }

  function initEvents() {
    ['picker-search', 'picker-filter-faction', 'picker-filter-gender', 'picker-sort-by'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderGrid);
    });
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { open, renderGrid };
})();

window.CharPicker = CharPicker;
