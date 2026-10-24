/* ── relations.js: Character Relations, Narrative Reader ── */
'use strict';

const Relations = (() => {
  let selectedCharA = null;
  let selectedCharB = null;

  let formSelectedCharA = null;
  let formSelectedCharB = null;

  function render() {
    renderViewer();
    renderTable();
  }

  // ── 캐릭터 선택 버튼 칩 렌더링 ──────────────────────────────────
  function updatePickButton(btnLabelId, char, defaultText) {
    const labelEl = document.getElementById(btnLabelId);
    if (!labelEl) return;
    if (!char) {
      labelEl.innerHTML = `<span>${escHtml(defaultText)}</span>`;
      return;
    }
    const avatarSrc = char.avatar_crop
      || (char.avatar_path ? `file://${char.avatar_path}` : null)
      || (char.image_path  ? `file://${char.image_path}`  : null);

    const avatarHtml = avatarSrc
      ? `<img class="char-pick-chip-img" src="${avatarSrc}" alt="${escHtml(char.name)}" />`
      : `<div class="char-pick-chip-img" style="background:${strColor(char.name)};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:12px;">${escHtml((char.name || '?')[0])}</div>`;

    labelEl.innerHTML = `
      <div class="char-pick-chip">
        ${avatarHtml}
        <div>
          <div class="char-pick-chip-name">${escHtml(char.name)}</div>
          <div class="text-muted" style="font-size:10px;">${char.age != null ? char.age + '세' : ''} ${char.gender || ''}</div>
        </div>
      </div>
    `;
  }

  // ── 관계 비교 뷰어 ───────────────────────────────────────────────
  async function renderViewer() {
    const container = document.getElementById('rel-view-content');
    if (!container) return;

    const charAId = selectedCharA ? selectedCharA.id : Number(document.getElementById('rel-view-char-a')?.value || 0);
    const charBId = selectedCharB ? selectedCharB.id : Number(document.getElementById('rel-view-char-b')?.value || 0);

    if (!charAId || !charBId) {
      container.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;">
          위에서 <strong>[👤 캐릭터 A 선택]</strong>과 <strong>[👤 캐릭터 B 선택]</strong> 버튼을 눌러 인물을 골라보세요.<br/>
          두 인물의 프로필 비교와 <strong>AI로 생성한 긴 관계 서사 본문(2000자 이상)</strong>을 바로 읽고 복사할 수 있습니다.
        </div>
      `;
      return;
    }

    if (charAId === charBId) {
      container.innerHTML = `
        <div class="empty-state" style="padding:40px 20px; color:var(--warning);">
          동일한 캐릭터입니다. 서로 다른 두 캐릭터를 선택해주세요.
        </div>
      `;
      return;
    }

    const charA = App.state.characters.find(c => c.id === charAId) || selectedCharA;
    const charB = App.state.characters.find(c => c.id === charBId) || selectedCharB;

    if (!charA || !charB) {
      container.innerHTML = '<div class="empty-state">캐릭터 정보를 찾을 수 없습니다.</div>';
      return;
    }

    // 관계 검색
    let rel = (App.state.relationships || []).find(r =>
      (r.char_a_id === charAId && r.char_b_id === charBId) ||
      (r.is_mutual && r.char_a_id === charBId && r.char_b_id === charAId)
    );

    if (!rel && window.api.getRelationshipBetween) {
      rel = await window.api.getRelationshipBetween(charAId, charBId);
    }

    const avatarA = getAvatarHtml(charA);
    const avatarB = getAvatarHtml(charB);

    const factionsA = (charA.factions || []).map(f =>
      `<span class="faction-badge" style="background:${f.color};font-size:11px;">${escHtml(f.name)}</span>`
    ).join(' ') || '-';

    const factionsB = (charB.factions || []).map(f =>
      `<span class="faction-badge" style="background:${f.color};font-size:11px;">${escHtml(f.name)}</span>`
    ).join(' ') || '-';

    const ageA = charA.age != null ? charA.age + '세' : '';
    const ageB = charB.age != null ? charB.age + '세' : '';

    if (!rel) {
      container.innerHTML = `
        <div class="rel-compare-container">
          <div class="rel-char-profile" style="cursor:pointer;" onclick="Characters.openDetail(${charA.id})" title="상세 프로필 보기">
            ${avatarA}
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--accent);">${escHtml(charA.name)}</div>
              <div class="text-muted" style="font-size:12px;">${ageA} ${charA.gender || ''}</div>
              <div style="margin-top:4px;">${factionsA}</div>
            </div>
          </div>
          <div class="rel-center-meta">
            <span class="text-muted" style="font-size:12px;font-weight:600;">관계 미등록</span>
            <span style="font-size:22px;color:var(--text-dim);margin:4px 0;">?</span>
          </div>
          <div class="rel-char-profile right" style="cursor:pointer;" onclick="Characters.openDetail(${charB.id})" title="상세 프로필 보기">
            ${avatarB}
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--accent);">${escHtml(charB.name)}</div>
              <div class="text-muted" style="font-size:12px;">${ageB} ${charB.gender || ''}</div>
              <div style="margin-top:4px;">${factionsB}</div>
            </div>
          </div>
        </div>
        <div style="text-align:center;padding:24px 0;">
          <p class="text-muted" style="margin-bottom:14px;">아직 두 캐릭터 사이의 등록된 관계 서사가 없습니다.</p>
          <button type="button" class="btn-primary" onclick="Relations.openFormWith(${charAId}, ${charBId})">+ 두 사람의 관계 서사 작성하기</button>
        </div>
      `;
      return;
    }

    // 관계 있음
    const narrativeText = rel.narrative || rel.description || '등록된 서사 내용이 없습니다.';
    const narrativeHtml = window.marked
      ? window.marked.parse(narrativeText)
      : escHtml(narrativeText).replace(/\n/g, '<br>');

    container.innerHTML = `
      <div class="rel-compare-container">
        <div class="rel-char-profile" style="cursor:pointer;" onclick="Characters.openDetail(${charA.id})" title="상세 프로필 보기">
          ${avatarA}
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--accent);">${escHtml(charA.name)}</div>
            <div class="text-muted" style="font-size:12px;">${ageA} ${charA.gender || ''}</div>
            <div style="margin-top:4px;">${factionsA}</div>
          </div>
        </div>

        <div class="rel-center-meta">
          <span class="rel-type-tag">${escHtml(rel.type || '관계')}</span>
          <span style="font-size:18px;font-weight:700;color:var(--accent);">${rel.is_mutual ? '↔' : '→'}</span>
          <div style="display:flex;gap:6px;margin-top:4px;">
            <button type="button" class="btn-secondary btn-sm" onclick="Relations.openForm(${rel.id})">편집</button>
            <button type="button" class="btn-danger btn-sm" onclick="Relations.deleteRelation(${rel.id})">삭제</button>
          </div>
        </div>

        <div class="rel-char-profile right" style="cursor:pointer;" onclick="Characters.openDetail(${charB.id})" title="상세 프로필 보기">
          ${avatarB}
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--accent);">${escHtml(charB.name)}</div>
            <div class="text-muted" style="font-size:12px;">${ageB} ${charB.gender || ''}</div>
            <div style="margin-top:4px;">${factionsB}</div>
          </div>
        </div>
      </div>

      ${rel.description ? `
        <div style="background:var(--sidebar-bg);padding:12px 18px;border-radius:var(--radius-sm);margin-bottom:14px;border-left:4px solid var(--accent);font-size:13px;">
          <strong>한줄 요약:</strong> ${escHtml(rel.description)}
        </div>
      ` : ''}

      <div class="rel-narrative-container">
        <div class="rel-narrative-header">
          <label style="font-weight:700;font-size:14px;">📖 관계 서사 본문 (AI 복붙 스토리 / 상세 설정)</label>
          <button type="button" class="btn-secondary btn-sm btn-copy-narrative">📋 본문 전체 복사</button>
        </div>
        <div class="rel-narrative-body markdown-body">${narrativeHtml}</div>
      </div>
    `;

    container.querySelector('.btn-copy-narrative')?.addEventListener('click', async () => {
      await window.api.copyText(narrativeText);
      App.showToast('📋 관계 서사 본문이 클립보드에 복사되었습니다!');
    });
  }

  function getAvatarHtml(c) {
    if (c.avatar_crop) {
      return `<img class="rel-char-avatar" src="${c.avatar_crop}" alt="${escHtml(c.name)}" />`;
    }
    if (c.avatar_path || c.image_path) {
      return `<img class="rel-char-avatar" src="file://${c.avatar_path || c.image_path}" alt="${escHtml(c.name)}" />`;
    }
    return `<div class="rel-char-avatar" style="background:${strColor(c.name)};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:white;">${escHtml((c.name || '?')[0])}</div>`;
  }

  // ── 관계 목록 테이블 ─────────────────────────────────────────────
  function getFilteredList() {
    const search = document.getElementById('rel-search-input')?.value.trim().toLowerCase() || '';
    let list = [...(App.state.relationships || [])];

    if (search) {
      list = list.filter(r => {
        const inA = (r.char_a_name || '').toLowerCase().includes(search);
        const inB = (r.char_b_name || '').toLowerCase().includes(search);
        const inType = (r.type || '').toLowerCase().includes(search);
        const inDesc = (r.description || '').toLowerCase().includes(search);
        const inNarrative = (r.narrative || '').toLowerCase().includes(search);
        return inA || inB || inType || inDesc || inNarrative;
      });
    }

    return list;
  }

  function renderTable() {
    const tbody = document.getElementById('relations-table-body');
    if (!tbody) return;
    const list = getFilteredList();
    tbody.innerHTML = '';

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding:24px;">등록된 관계가 없습니다.</td></tr>`;
      return;
    }

    list.forEach(r => {
      const tr = document.createElement('tr');
      const narrativePreview = r.narrative
        ? (r.narrative.length > 50 ? escHtml(r.narrative.substring(0, 50)) + '...' : escHtml(r.narrative))
        : '<span class="text-muted">-</span>';

      tr.innerHTML = `
        <td>
          <strong class="link-char" data-id="${r.char_a_id}" style="cursor:pointer;color:var(--accent);">${escHtml(r.char_a_name)}</strong>
        </td>
        <td><span class="rel-type-tag" style="padding:3px 10px;font-size:11px;">${escHtml(r.type || '관계')}</span></td>
        <td>
          <strong class="link-char" data-id="${r.char_b_id}" style="cursor:pointer;color:var(--accent);">${escHtml(r.char_b_name)}</strong>
        </td>
        <td class="text-muted">${escHtml(r.description || '-')}</td>
        <td class="text-muted" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${narrativePreview}</td>
        <td>
          <div class="action-btns">
            <button type="button" class="btn-secondary btn-sm btn-load-view" title="상단 서사 뷰어로 보기">보기</button>
            <button type="button" class="btn-primary btn-sm" onclick="Relations.openForm(${r.id})">편집</button>
            <button type="button" class="btn-danger btn-sm" onclick="Relations.deleteRelation(${r.id})">삭제</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-load-view')?.addEventListener('click', () => {
        loadInViewer(r.char_a_id, r.char_b_id);
      });

      // 이름 클릭 → 캐릭터 상세
      tr.querySelectorAll('.link-char').forEach(el => {
        el.addEventListener('click', () => Characters.openDetail(Number(el.dataset.id)));
      });

      tbody.appendChild(tr);
    });
  }

  function loadInViewer(charAId, charBId) {
    const charA = App.state.characters.find(c => c.id === charAId);
    const charB = App.state.characters.find(c => c.id === charBId);

    selectedCharA = charA || null;
    selectedCharB = charB || null;

    document.getElementById('rel-view-char-a').value = charAId;
    document.getElementById('rel-view-char-b').value = charBId;

    updatePickButton('rel-pick-a-label', charA, '👤 캐릭터 A 선택');
    updatePickButton('rel-pick-b-label', charB, '👤 캐릭터 B 선택');

    renderViewer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 관계 폼 모달 ─────────────────────────────────────────────────
  function openForm(id = null) {
    document.getElementById('relation-form-id').value = id || '';
    document.getElementById('relation-form-title').textContent = id ? '관계 서사 편집' : '관계 서사 작성 / 편집';

    document.getElementById('rel-char-a').value = '';
    document.getElementById('rel-char-b').value = '';
    document.getElementById('rel-type').value = '';
    document.getElementById('rel-mutual').checked = true;
    document.getElementById('rel-description').value = '';
    document.getElementById('rel-narrative').value = '';

    formSelectedCharA = null;
    formSelectedCharB = null;

    if (id) {
      const r = (App.state.relationships || []).find(x => x.id === id);
      if (r) {
        document.getElementById('rel-char-a').value = r.char_a_id;
        document.getElementById('rel-char-b').value = r.char_b_id;
        document.getElementById('rel-type').value = r.type || '';
        document.getElementById('rel-mutual').checked = (r.is_mutual != null ? !!r.is_mutual : true);
        document.getElementById('rel-description').value = r.description || '';
        document.getElementById('rel-narrative').value = r.narrative || '';

        formSelectedCharA = App.state.characters.find(c => c.id === r.char_a_id) || null;
        formSelectedCharB = App.state.characters.find(c => c.id === r.char_b_id) || null;
      }
    } else {
      if (selectedCharA) {
        formSelectedCharA = selectedCharA;
        document.getElementById('rel-char-a').value = selectedCharA.id;
      }
      if (selectedCharB) {
        formSelectedCharB = selectedCharB;
        document.getElementById('rel-char-b').value = selectedCharB.id;
      }
    }

    updatePickButton('form-pick-a-label', formSelectedCharA, '👤 캐릭터 A 선택');
    updatePickButton('form-pick-b-label', formSelectedCharB, '👤 캐릭터 B 선택');

    App.openModal('modal-relation-form');
  }

  function openFormWith(charAId, charBId) {
    const charA = App.state.characters.find(c => c.id === charAId);
    const charB = App.state.characters.find(c => c.id === charBId);

    openForm();
    formSelectedCharA = charA;
    formSelectedCharB = charB;

    document.getElementById('rel-char-a').value = charAId;
    document.getElementById('rel-char-b').value = charBId;

    updatePickButton('form-pick-a-label', charA, '👤 캐릭터 A 선택');
    updatePickButton('form-pick-b-label', charB, '👤 캐릭터 B 선택');
  }

  async function saveRelation() {
    try {
      const charA = document.getElementById('rel-char-a').value;
      const charB = document.getElementById('rel-char-b').value;
      const type  = document.getElementById('rel-type').value.trim();

      if (!charA || !charB) { App.showToast('❗ 두 캐릭터를 모두 선택해주세요.'); return; }
      if (charA === charB)  { App.showToast('❗ 동일한 캐릭터끼리는 관계를 맺을 수 없습니다.'); return; }
      if (!type)            { App.showToast('❗ 관계 명칭을 입력해주세요. (예: 라이벌, 절친)'); return; }

      const data = {
        char_a_id:   Number(charA),
        char_b_id:   Number(charB),
        type,
        is_mutual:   document.getElementById('rel-mutual').checked ? 1 : 0,
        description: document.getElementById('rel-description').value.trim(),
        narrative:   document.getElementById('rel-narrative').value.trim()
      };

      const id = document.getElementById('relation-form-id').value;
      if (id) {
        await window.api.updateRelationship(Number(id), data);
      } else {
        await window.api.createRelationship(data);
      }

      await App.loadAll();
      App.closeModal('modal-relation-form');

      loadInViewer(data.char_a_id, data.char_b_id);
      renderTable();
      App.showToast('✅ 관계 서사가 저장되었습니다.');
    } catch (err) {
      console.error('Failed to save relationship:', err);
      App.showToast('❌ 관계 저장 오류: ' + err.message);
    }
  }

  async function deleteRelation(id) {
    const confirmed = await App.confirm('정말 이 관계 서사를 삭제하시겠습니까?');
    if (!confirmed) return;
    await window.api.deleteRelationship(id);
    await App.loadAll();
    renderViewer();
    renderTable();
    App.showToast('🗑️ 관계가 삭제되었습니다.');
  }

  // ── 유틸 ─────────────────────────────────────────────────────────
  function strColor(name) {
    let hash = 0;
    const s = name || 'default';
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 45%, 35%)`;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────────────
  function initEvents() {
    document.getElementById('btn-new-relation')?.addEventListener('click', () => openForm());
    document.getElementById('btn-save-relation')?.addEventListener('click', saveRelation);

    // 뷰어 A 선택
    document.getElementById('rel-btn-pick-a')?.addEventListener('click', () => {
      CharPicker.open({
        title: '관계 비교: 캐릭터 A 선택',
        selectedId: selectedCharA ? selectedCharA.id : null,
        onSelect: (char) => {
          selectedCharA = char;
          document.getElementById('rel-view-char-a').value = char.id;
          updatePickButton('rel-pick-a-label', char, '👤 캐릭터 A 선택');
          renderViewer();
        }
      });
    });

    // 뷰어 B 선택
    document.getElementById('rel-btn-pick-b')?.addEventListener('click', () => {
      CharPicker.open({
        title: '관계 비교: 캐릭터 B 선택',
        selectedId: selectedCharB ? selectedCharB.id : null,
        onSelect: (char) => {
          selectedCharB = char;
          document.getElementById('rel-view-char-b').value = char.id;
          updatePickButton('rel-pick-b-label', char, '👤 캐릭터 B 선택');
          renderViewer();
        }
      });
    });

    // 폼 A 선택
    document.getElementById('form-btn-pick-a')?.addEventListener('click', () => {
      CharPicker.open({
        title: '관계 작성: 캐릭터 A 선택',
        selectedId: formSelectedCharA ? formSelectedCharA.id : null,
        onSelect: (char) => {
          formSelectedCharA = char;
          document.getElementById('rel-char-a').value = char.id;
          updatePickButton('form-pick-a-label', char, '👤 캐릭터 A 선택');
        }
      });
    });

    // 폼 B 선택
    document.getElementById('form-btn-pick-b')?.addEventListener('click', () => {
      CharPicker.open({
        title: '관계 작성: 캐릭터 B 선택',
        selectedId: formSelectedCharB ? formSelectedCharB.id : null,
        onSelect: (char) => {
          formSelectedCharB = char;
          document.getElementById('rel-char-b').value = char.id;
          updatePickButton('form-pick-b-label', char, '👤 캐릭터 B 선택');
        }
      });
    });

    // A ↔ B 스왑
    document.getElementById('btn-rel-swap')?.addEventListener('click', () => {
      const temp = selectedCharA;
      selectedCharA = selectedCharB;
      selectedCharB = temp;

      document.getElementById('rel-view-char-a').value = selectedCharA ? selectedCharA.id : '';
      document.getElementById('rel-view-char-b').value = selectedCharB ? selectedCharB.id : '';

      updatePickButton('rel-pick-a-label', selectedCharA, '👤 캐릭터 A 선택');
      updatePickButton('rel-pick-b-label', selectedCharB, '👤 캐릭터 B 선택');

      renderViewer();
    });

    // 목록 검색
    document.getElementById('rel-search-input')?.addEventListener('input', renderTable);
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { render, openForm, openFormWith, deleteRelation, loadInViewer };
})();

window.Relations = Relations;
