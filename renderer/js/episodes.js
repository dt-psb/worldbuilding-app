/* ── episodes.js: 에피소드 탭 모듈 ── */
'use strict';

const Episodes = (() => {
  // ── 상태 ─────────────────────────────────────────────────────────
  let _episodes = [];
  let _editMainChars = [];   // [{id, name}]
  let _editSubChars  = [];   // [{id, name}]
  let _editExtras    = [];   // [{tmpId, name, description, gender}]
  let _editEpisodeId = null;
  let _eventsInitialized = false;

  // ── Helper ────────────────────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 목록 렌더링 ──────────────────────────────────────────────────
  async function render() {
    try {
      _episodes = await window.api.getEpisodes();
    } catch (e) {
      console.error('[Episodes] getEpisodes error:', e);
      _episodes = [];
    }
    renderGrid();
  }

  function renderGrid() {
    const grid = document.getElementById('episodes-grid');
    if (!grid) return;

    if (_episodes.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:60px 20px;">
          <div style="font-size:48px;margin-bottom:16px;">📖</div>
          <div>에피소드가 없습니다.<br>오른쪽 위의 <strong>+ 에피소드 추가</strong> 버튼으로 첫 에피소드를 만들어보세요.</div>
        </div>`;
      return;
    }

    grid.innerHTML = _episodes.map(ep => {
      const total = (ep.char_count || 0) + (ep.extra_count || 0);
      return `
        <div class="episode-card" data-id="${ep.id}">
          <div class="episode-card-title">${escHtml(ep.title)}</div>
          ${ep.summary ? `<div class="episode-card-summary">${escHtml(ep.summary.substring(0, 80))}${ep.summary.length > 80 ? '...' : ''}</div>` : ''}
          <div class="episode-card-meta">등장인물 ${total}명 (주요/조연 ${ep.char_count || 0}명, 단역 ${ep.extra_count || 0}명)</div>
        </div>`;
    }).join('');

    // 이벤트 위임: grid 자체에 한 번만 등록, 자식 클릭도 잡힘
    grid.onclick = (e) => {
      const card = e.target.closest('.episode-card');
      if (card && card.dataset.id) {
        openDetail(Number(card.dataset.id));
      }
    };
  }

  // ── 상세 보기 모달 ───────────────────────────────────────────────
  async function openDetail(id) {
    let ep;
    try {
      ep = await window.api.getEpisode(id);
    } catch (e) {
      console.error('[Episodes] getEpisode error:', e);
      return;
    }
    if (!ep) return;

    document.getElementById('epd-title').textContent = ep.title;
    // epd-order 엘리먼트는 UI에서 제거됨 — null 체크
    const epdOrder = document.getElementById('epd-order');
    if (epdOrder) epdOrder.textContent = '';

    // 요약 마크다운 렌더링
    const summaryEl = document.getElementById('epd-summary');
    if (ep.summary) {
      if (window.marked) {
        summaryEl.innerHTML = window.marked.parse(ep.summary);
        summaryEl.classList.add('markdown-body');
      } else {
        summaryEl.textContent = ep.summary;
        summaryEl.classList.remove('markdown-body');
      }
    } else {
      summaryEl.textContent = '(요약 없음)';
      summaryEl.classList.remove('markdown-body');
    }
    document.getElementById('epd-episode-id').value = ep.id;

    // 주요/조연 칩
    const mainChars = (ep.characters || []).filter(c => c.role_type === 'main');
    const subChars  = (ep.characters || []).filter(c => c.role_type === 'sub');
    const extras    = ep.extras || [];

    renderDetailChips('epd-main-chars', mainChars, 'main');
    renderDetailChips('epd-sub-chars',  subChars,  'sub');
    renderDetailExtrasChips('epd-extras', extras);

    // 관계 자동 나열
    const charIds = (ep.characters || []).map(c => c.id);
    renderEpisodeRelations('epd-relations-list', charIds);

    App.openModal('modal-episode-detail');
  }

  function renderDetailChips(containerId, chars, roleClass) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!chars || chars.length === 0) {
      el.innerHTML = '<span style="opacity:0.5;font-size:13px;">없음</span>';
      return;
    }
    el.innerHTML = chars.map(c =>
      `<span class="char-chip ${roleClass}">${escHtml(c.name)}${c.gender ? ` <small style="opacity:0.7">${escHtml(c.gender)}</small>` : ''}</span>`
    ).join('');
  }

  function renderDetailExtrasChips(containerId, extras) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!extras || extras.length === 0) {
      el.innerHTML = '<span style="opacity:0.5;font-size:13px;">없음</span>';
      return;
    }
    el.innerHTML = extras.map(ex =>
      `<span class="char-chip extra" title="${escHtml(ex.description || '')}">${escHtml(ex.name)}${ex.gender ? ` <small style="opacity:0.7">${escHtml(ex.gender)}</small>` : ''}</span>`
    ).join('');
  }

  function renderEpisodeRelations(containerId, charIds) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rels = (App.state.relationships || []).filter(r => {
      const aIn = charIds.includes(r.char_a_id);
      const bIn = charIds.includes(r.char_b_id);
      return aIn && bIn;
    });

    if (rels.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:16px 0;">등장인물들 간의 등록된 관계가 없습니다.</div>';
      return;
    }

    container.innerHTML = rels.map(r => `
      <div class="ep-relation-item">
        <span class="ep-relation-names">${escHtml(r.char_a_name)} ↔ ${escHtml(r.char_b_name)}</span>
        <span class="ep-relation-type">
          ${r.type ? `<strong>[${escHtml(r.type)}]</strong>` : ''}
          ${r.description ? `— ${escHtml(r.description)}` : ''}
        </span>
      </div>
    `).join('');
  }

  // ── 편집/생성 모달 ───────────────────────────────────────────────
  async function openForm(id = null) {
    _editEpisodeId = id;
    _editMainChars = [];
    _editSubChars  = [];
    _editExtras    = [];

    document.getElementById('episode-form-title').textContent = id ? '에피소드 편집' : '에피소드 추가';
    document.getElementById('ep-form-id').value    = id || '';
    document.getElementById('ep-form-title').value = '';
    document.getElementById('ep-form-summary').value = '';

    if (id) {
      let ep;
      try {
        ep = await window.api.getEpisode(id);
      } catch (e) {
        console.error('[Episodes] getEpisode (form) error:', e);
      }
      if (ep) {
        document.getElementById('ep-form-title').value   = ep.title || '';
        document.getElementById('ep-form-summary').value = ep.summary || '';

        _editMainChars = (ep.characters || [])
          .filter(c => c.role_type === 'main')
          .map(c => ({ id: c.id, name: c.name }));
        _editSubChars = (ep.characters || [])
          .filter(c => c.role_type === 'sub')
          .map(c => ({ id: c.id, name: c.name }));
        _editExtras = (ep.extras || []).map(ex => ({
          tmpId: `ex_${ex.id}`,
          name: ex.name,
          description: ex.description || '',
          gender: ex.gender || ''
        }));
      }
    }

    renderFormChips();
    App.openModal('modal-episode-form');
  }

  function renderFormChips() {
    // 주요
    renderEditableChips('ep-main-chars', _editMainChars, 'main', (id) => {
      _editMainChars = _editMainChars.filter(c => c.id !== id);
      renderFormChips();
    });
    // 조연
    renderEditableChips('ep-sub-chars', _editSubChars, 'sub', (id) => {
      _editSubChars = _editSubChars.filter(c => c.id !== id);
      renderFormChips();
    });
    // 단역
    renderEditableExtras('ep-extras-list', _editExtras, (tmpId) => {
      _editExtras = _editExtras.filter(ex => ex.tmpId !== tmpId);
      renderFormChips();
    });
  }

  function renderEditableChips(containerId, chars, roleClass, onRemove) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (chars.length === 0) {
      el.innerHTML = '<span style="opacity:0.4;font-size:12px;padding:4px;">추가된 인물 없음</span>';
      return;
    }
    chars.forEach(c => {
      const chip = document.createElement('span');
      chip.className = `char-chip ${roleClass}`;
      chip.innerHTML = `${escHtml(c.name)} <span class="char-chip-remove" title="제거">✕</span>`;
      chip.querySelector('.char-chip-remove').addEventListener('click', () => onRemove(c.id));
      el.appendChild(chip);
    });
  }

  function renderEditableExtras(containerId, extras, onRemove) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (extras.length === 0) {
      el.innerHTML = '<span style="opacity:0.4;font-size:12px;padding:4px;">추가된 단역 없음</span>';
      return;
    }
    extras.forEach(ex => {
      const chip = document.createElement('span');
      chip.className = 'char-chip extra';
      chip.title = ex.description || '';
      chip.innerHTML = `${escHtml(ex.name)}${ex.gender ? ` <small style="opacity:0.7">${escHtml(ex.gender)}</small>` : ''} <span class="char-chip-remove" title="제거">✕</span>`;
      chip.querySelector('.char-chip-remove').addEventListener('click', () => onRemove(ex.tmpId));
      el.appendChild(chip);
    });
  }

  // ── 저장 ─────────────────────────────────────────────────────────
  async function saveEpisode() {
    const title = (document.getElementById('ep-form-title').value || '').trim();
    if (!title) {
      App.showToast('❗ 에피소드 제목을 입력해주세요.');
      document.getElementById('ep-form-title').focus();
      return;
    }

    const data = {
      title,
      summary: (document.getElementById('ep-form-summary').value || '').trim(),
      characters: [
        ..._editMainChars.map(c => ({ character_id: c.id, role_type: 'main' })),
        ..._editSubChars.map(c =>  ({ character_id: c.id, role_type: 'sub'  })),
      ],
      extras: _editExtras.map(ex => ({
        name: ex.name,
        description: ex.description,
        gender: ex.gender
      }))
    };

    try {
      const id = _editEpisodeId;
      if (id) {
        await window.api.updateEpisode(id, data);
        App.showToast('✅ 에피소드가 수정되었습니다.');
      } else {
        await window.api.createEpisode(data);
        App.showToast('✅ 에피소드가 생성되었습니다.');
      }
      App.closeModal('modal-episode-form');
      await render();
    } catch (e) {
      console.error('[Episodes] save error:', e);
      App.showToast('❌ 저장 중 오류가 발생했습니다.');
    }
  }

  // ── 삭제 ─────────────────────────────────────────────────────────
  async function deleteEpisode(id) {
    const yes = await App.confirm('이 에피소드를 삭제하시겠습니까?\n단역 등장인물 정보도 함께 삭제됩니다.');
    if (!yes) return;
    try {
      await window.api.deleteEpisode(id);
      App.showToast('🗑️ 에피소드가 삭제되었습니다.');
      App.closeModal('modal-episode-detail');
      await render();
    } catch (e) {
      console.error('[Episodes] delete error:', e);
      App.showToast('❌ 삭제 중 오류가 발생했습니다.');
    }
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────────────
  function initEvents() {
    if (_eventsInitialized) return;
    _eventsInitialized = true;

    // 에피소드 추가 버튼
    document.getElementById('btn-new-episode')?.addEventListener('click', () => openForm(null));

    // 저장 버튼
    document.getElementById('btn-save-episode')?.addEventListener('click', saveEpisode);

    // 주요 인물 추가 (CharPicker)
    document.getElementById('btn-ep-add-main')?.addEventListener('click', () => {
      const excludeIds = new Set([
        ..._editMainChars.map(c => c.id),
        ..._editSubChars.map(c => c.id),
      ]);
      CharPicker.open({
        title: '주요 등장인물 추가',
        onSelect: (c) => {
          if (!excludeIds.has(c.id) && !_editMainChars.find(x => x.id === c.id)) {
            _editMainChars.push({ id: c.id, name: c.name });
            renderFormChips();
          } else {
            App.showToast('이미 추가된 인물입니다.');
          }
        }
      });
    });

    // 조연 인물 추가 (CharPicker)
    document.getElementById('btn-ep-add-sub')?.addEventListener('click', () => {
      const excludeIds = new Set([
        ..._editMainChars.map(c => c.id),
        ..._editSubChars.map(c => c.id),
      ]);
      CharPicker.open({
        title: '조연 등장인물 추가',
        onSelect: (c) => {
          if (!excludeIds.has(c.id) && !_editSubChars.find(x => x.id === c.id)) {
            _editSubChars.push({ id: c.id, name: c.name });
            renderFormChips();
          } else {
            App.showToast('이미 추가된 인물입니다.');
          }
        }
      });
    });

    // 단역 추가 버튼
    document.getElementById('btn-ep-add-extra')?.addEventListener('click', () => {
      const nameEl = document.getElementById('ep-extra-name');
      const genderEl = document.getElementById('ep-extra-gender');
      const descEl = document.getElementById('ep-extra-desc');
      const name = (nameEl?.value || '').trim();
      if (!name) {
        App.showToast('❗ 단역 이름을 입력해주세요.');
        nameEl?.focus();
        return;
      }
      _editExtras.push({
        tmpId: `tmp_${Date.now()}_${Math.random()}`,
        name,
        gender: (genderEl?.value || '').trim(),
        description: (descEl?.value || '').trim()
      });
      if (nameEl) nameEl.value = '';
      if (genderEl) genderEl.value = '';
      if (descEl) descEl.value = '';
      renderFormChips();
    });

    // 단역 name 입력에서 Enter → 추가
    document.getElementById('ep-extra-desc')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-ep-add-extra')?.click();
      }
    });

    // 상세 > 편집 버튼
    document.getElementById('btn-epd-edit')?.addEventListener('click', () => {
      const id = Number(document.getElementById('epd-episode-id').value);
      App.closeModal('modal-episode-detail');
      openForm(id);
    });

    // 상세 > 삭제 버튼
    document.getElementById('btn-epd-delete')?.addEventListener('click', () => {
      const id = Number(document.getElementById('epd-episode-id').value);
      deleteEpisode(id);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', initEvents);

  return { render, openForm, openDetail };
})();

window.Episodes = Episodes;
