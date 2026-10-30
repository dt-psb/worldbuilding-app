/* ── relations.js: Character Relations, Narrative Reader ── */
'use strict';

const Relations = (() => {
  let selectedCharA = null;
  let selectedCharB = null;

  let formSelectedCharA = null;
  let formSelectedCharB = null;

  const COLOR_PRESETS = [
    { label: '적대', color: '#f43f5e' },
    { label: '우호', color: '#10b981' },
    { label: '가족', color: '#f59e0b' },
    { label: '연인', color: '#ec4899' },
    { label: '동료', color: '#3b82f6' },
    { label: '라이벌', color: '#8b5cf6' },
    { label: '스승/제자', color: '#06b6d4' },
    { label: '기타', color: '#64748b' },
  ];

  const STANDARD_REL_TYPES = ['적대', '우호', '가족', '연인', '동료', '라이벌', '스승/제자', '기타'];

  function getRelColor(type, customColor = null) {
    if (customColor) return customColor;
    const match = COLOR_PRESETS.find(p => p.label === type);
    return match ? match.color : '#64748b';
  }

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

    // 관계 방향에 따른 배지 구성
    let relMetaHtml = '';
    if (rel.is_mutual) {
      const col = rel.color || getRelColor(rel.type);
      relMetaHtml = `
        <span class="rel-type-tag" style="background:${col};box-shadow:0 2px 10px ${col}44;">${escHtml(rel.type || '관계')}</span>
        <span style="font-size:12px;font-weight:700;color:var(--accent);">⟷ 양방향 상호</span>
      `;
    } else {
      const isAtoB = (rel.char_a_id === charA.id);
      const a2b = isAtoB ? rel.type : rel.type_b_to_a;
      const colA2B = isAtoB ? (rel.color || getRelColor(rel.type)) : (rel.color_b_to_a || getRelColor(rel.type_b_to_a));
      const b2a = isAtoB ? rel.type_b_to_a : rel.type;
      const colB2A = isAtoB ? (rel.color_b_to_a || getRelColor(rel.type_b_to_a)) : (rel.color || getRelColor(rel.type));

      relMetaHtml = `
        <div style="display:flex;flex-direction:column;gap:5px;align-items:center;">
          ${a2b ? `
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;">
              <span class="text-muted">${escHtml(charA.name)} ➔</span>
              <span class="rel-type-tag" style="background:${colA2B};padding:3px 9px;font-size:11px;box-shadow:0 2px 8px ${colA2B}44;">${escHtml(a2b)}</span>
            </div>
          ` : `
            <div style="font-size:10px;color:var(--text-dim);">${escHtml(charA.name)} ➔ (의식 없음/모름)</div>
          `}
          ${b2a ? `
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;">
              <span class="rel-type-tag" style="background:${colB2A};padding:3px 9px;font-size:11px;box-shadow:0 2px 8px ${colB2A}44;">${escHtml(b2a)}</span>
              <span class="text-muted">⬅ ${escHtml(charB.name)}</span>
            </div>
          ` : `
            <div style="font-size:10px;color:var(--text-dim);">(의식 없음/모름) ⬅ ${escHtml(charB.name)}</div>
          `}
        </div>
      `;
    }

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
          ${relMetaHtml}
          <div style="display:flex;gap:6px;margin-top:6px;">
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

      let typeCellHtml = '';
      if (r.is_mutual) {
        const col = r.color || getRelColor(r.type);
        typeCellHtml = `<span class="rel-type-tag" style="background:${col};padding:3px 10px;font-size:11px;box-shadow:0 2px 6px ${col}44;">${escHtml(r.type || '관계')}</span>`;
      } else {
        const colA = r.color || getRelColor(r.type);
        const colB = r.color_b_to_a || getRelColor(r.type_b_to_a);
        typeCellHtml = `
          <div style="display:flex;flex-direction:column;gap:3px;font-size:11px;">
            ${r.type ? `<div><span style="color:var(--text-muted);font-size:10px;">A➔B:</span> <span class="rel-type-tag" style="background:${colA};padding:2px 7px;font-size:10px;">${escHtml(r.type)}</span></div>` : ''}
            ${r.type_b_to_a ? `<div><span style="color:var(--text-muted);font-size:10px;">B➔A:</span> <span class="rel-type-tag" style="background:${colB};padding:2px 7px;font-size:10px;">${escHtml(r.type_b_to_a)}</span></div>` : ''}
          </div>
        `;
      }

      tr.innerHTML = `
        <td>
          <strong class="link-char" data-id="${r.char_a_id}" style="cursor:pointer;color:var(--accent);">${escHtml(r.char_a_name)}</strong>
        </td>
        <td>${typeCellHtml}</td>
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

  // ── 컬러 팔레트 렌더러 ───────────────────────────────────────────
  function renderColorPalette(containerId, hiddenInputId, selectedColor = '#64748b') {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container || !hiddenInput) return;

    hiddenInput.value = selectedColor || '#64748b';
    container.innerHTML = COLOR_PRESETS.map(p => {
      const isAct = p.color.toLowerCase() === (hiddenInput.value || '').toLowerCase();
      return `
        <button type="button" class="rel-color-chip ${isAct ? 'active' : ''}" data-color="${p.color}" title="${p.label} 계열 (${p.color})">
          <span class="rel-color-dot" style="background:${p.color};"></span>
          <span>${p.label}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.rel-color-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.rel-color-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        hiddenInput.value = btn.dataset.color;
      });
    });
  }

  // ── 관계 설정 모드 (양방향 vs 단방향) ─────────────────────────────
  function setRelMode(isMutual) {
    const mutualVal = document.getElementById('rel-mutual-val');
    const btnMutual = document.getElementById('btn-rel-mode-mutual');
    const btnDir = document.getElementById('btn-rel-mode-directional');
    const secMutual = document.getElementById('rel-section-mutual');
    const secDir = document.getElementById('rel-section-directional');

    if (mutualVal) mutualVal.value = isMutual ? '1' : '0';
    if (isMutual) {
      btnMutual?.classList.add('active');
      btnDir?.classList.remove('active');
      secMutual?.classList.remove('hidden');
      secDir?.classList.add('hidden');
    } else {
      btnMutual?.classList.remove('active');
      btnDir?.classList.add('active');
      secMutual?.classList.add('hidden');
      secDir?.classList.remove('hidden');
      updateDirectionLabels();
    }
  }

  function updateDirectionLabels() {
    const nameA = formSelectedCharA ? formSelectedCharA.name : '캐릭터 A';
    const nameB = formSelectedCharB ? formSelectedCharB.name : '캐릭터 B';

    const lblA = document.getElementById('lbl-dir-a-name');
    const lblB = document.getElementById('lbl-dir-b-name');
    const lblB2 = document.getElementById('lbl-dir-b-name-2');
    const lblA2 = document.getElementById('lbl-dir-a-name-2');

    if (lblA) lblA.textContent = nameA;
    if (lblB) lblB.textContent = nameB;
    if (lblB2) lblB2.textContent = nameB;
    if (lblA2) lblA2.textContent = nameA;
  }

  // ── 관계 폼 모달 ─────────────────────────────────────────────────
  function openForm(id = null) {
    document.getElementById('relation-form-id').value = id || '';
    document.getElementById('relation-form-title').textContent = id ? '관계 서사 편집' : '관계 서사 작성 / 편집';

    document.getElementById('rel-char-a').value = '';
    document.getElementById('rel-char-b').value = '';

    // 1. 양방향 폼 리셋
    const typeSelect = document.getElementById('rel-type-select');
    const typeCustom = document.getElementById('rel-custom-type');
    const boxMutual = document.getElementById('rel-custom-box-mutual');
    if (typeSelect) typeSelect.value = '적대';
    if (typeCustom) typeCustom.value = '';
    boxMutual?.classList.add('hidden');
    renderColorPalette('rel-palette-mutual', 'rel-color-mutual-val', '#64748b');

    // 2. 단방향 폼 리셋
    const selA2B = document.getElementById('rel-type-a2b-select');
    const customA2B = document.getElementById('rel-custom-type-a2b');
    const boxA2B = document.getElementById('rel-custom-box-a2b');
    if (selA2B) selA2B.value = '적대';
    if (customA2B) customA2B.value = '';
    boxA2B?.classList.add('hidden');
    renderColorPalette('rel-palette-a2b', 'rel-color-a2b-val', '#64748b');

    const selB2A = document.getElementById('rel-type-b2a-select');
    const customB2A = document.getElementById('rel-custom-type-b2a');
    const boxB2A = document.getElementById('rel-custom-box-b2a');
    if (selB2A) selB2A.value = '__none__';
    if (customB2A) customB2A.value = '';
    boxB2A?.classList.add('hidden');
    renderColorPalette('rel-palette-b2a', 'rel-color-b2a-val', '#64748b');

    document.getElementById('rel-description').value = '';
    document.getElementById('rel-narrative').value = '';

    formSelectedCharA = null;
    formSelectedCharB = null;

    if (id) {
      const r = (App.state.relationships || []).find(x => x.id === id);
      if (r) {
        document.getElementById('rel-char-a').value = r.char_a_id;
        document.getElementById('rel-char-b').value = r.char_b_id;
        formSelectedCharA = App.state.characters.find(c => c.id === r.char_a_id) || null;
        formSelectedCharB = App.state.characters.find(c => c.id === r.char_b_id) || null;

        document.getElementById('rel-description').value = r.description || '';
        document.getElementById('rel-narrative').value = r.narrative || '';

        const isMutual = r.is_mutual != null ? !!r.is_mutual : true;
        setRelMode(isMutual);

        if (isMutual) {
          if (r.type && STANDARD_REL_TYPES.includes(r.type)) {
            if (typeSelect) typeSelect.value = r.type;
            boxMutual?.classList.add('hidden');
          } else if (r.type) {
            if (typeSelect) typeSelect.value = '__custom__';
            if (typeCustom) typeCustom.value = r.type;
            boxMutual?.classList.remove('hidden');
            renderColorPalette('rel-palette-mutual', 'rel-color-mutual-val', r.color || '#64748b');
          } else {
            if (typeSelect) typeSelect.value = '기타';
            boxMutual?.classList.add('hidden');
          }
        } else {
          // 단방향 복원
          // A ➔ B
          if (!r.type) {
            if (selA2B) selA2B.value = '__none__';
            boxA2B?.classList.add('hidden');
          } else if (STANDARD_REL_TYPES.includes(r.type)) {
            if (selA2B) selA2B.value = r.type;
            boxA2B?.classList.add('hidden');
          } else {
            if (selA2B) selA2B.value = '__custom__';
            if (customA2B) customA2B.value = r.type;
            boxA2B?.classList.remove('hidden');
            renderColorPalette('rel-palette-a2b', 'rel-color-a2b-val', r.color || '#64748b');
          }

          // B ➔ A
          if (!r.type_b_to_a) {
            if (selB2A) selB2A.value = '__none__';
            boxB2A?.classList.add('hidden');
          } else if (STANDARD_REL_TYPES.includes(r.type_b_to_a)) {
            if (selB2A) selB2A.value = r.type_b_to_a;
            boxB2A?.classList.add('hidden');
          } else {
            if (selB2A) selB2A.value = '__custom__';
            if (customB2A) customB2A.value = r.type_b_to_a;
            boxB2A?.classList.remove('hidden');
            renderColorPalette('rel-palette-b2a', 'rel-color-b2a-val', r.color_b_to_a || '#64748b');
          }
        }
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
      setRelMode(true);
    }

    updatePickButton('form-pick-a-label', formSelectedCharA, '👤 캐릭터 A 선택');
    updatePickButton('form-pick-b-label', formSelectedCharB, '👤 캐릭터 B 선택');
    updateDirectionLabels();

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
    updateDirectionLabels();
  }

  async function saveRelation() {
    try {
      const charA = document.getElementById('rel-char-a').value;
      const charB = document.getElementById('rel-char-b').value;
      const isMutual = document.getElementById('rel-mutual-val')?.value === '1';

      if (!charA || !charB) { App.showToast('❗ 두 캐릭터를 모두 선택해주세요.'); return; }
      if (charA === charB)  { App.showToast('❗ 동일한 캐릭터끼리는 관계를 맺을 수 없습니다.'); return; }

      let type = '';
      let color = '';
      let typeBtoA = '';
      let colorBtoA = '';

      if (isMutual) {
        const typeSelect = document.getElementById('rel-type-select');
        const typeCustom = document.getElementById('rel-custom-type');
        const colorVal = document.getElementById('rel-color-mutual-val')?.value || '#64748b';

        if (typeSelect.value === '__custom__') {
          type = (typeCustom ? typeCustom.value : '').trim();
          if (!type) {
            App.showToast('❗ 양방향 관계 명칭을 직접 입력해주세요.');
            typeCustom?.focus();
            return;
          }
          color = colorVal;
        } else {
          type = typeSelect.value;
          color = getRelColor(type);
        }
      } else {
        // 단방향: A ➔ B
        const selA2B = document.getElementById('rel-type-a2b-select');
        const customA2B = document.getElementById('rel-custom-type-a2b');
        const colorA2BVal = document.getElementById('rel-color-a2b-val')?.value || '#64748b';

        if (selA2B.value === '__none__') {
          type = '';
          color = '';
        } else if (selA2B.value === '__custom__') {
          type = (customA2B ? customA2B.value : '').trim();
          if (!type) {
            App.showToast(`❗ ${formSelectedCharA?.name || '캐릭터 A'} ➔ ${formSelectedCharB?.name || '캐릭터 B'} 관계 명칭을 입력해주세요.`);
            customA2B?.focus();
            return;
          }
          color = colorA2BVal;
        } else {
          type = selA2B.value;
          color = getRelColor(type);
        }

        // 단방향: B ➔ A
        const selB2A = document.getElementById('rel-type-b2a-select');
        const customB2A = document.getElementById('rel-custom-type-b2a');
        const colorB2AVal = document.getElementById('rel-color-b2a-val')?.value || '#64748b';

        if (selB2A.value === '__none__') {
          typeBtoA = '';
          colorBtoA = '';
        } else if (selB2A.value === '__custom__') {
          typeBtoA = (customB2A ? customB2A.value : '').trim();
          if (!typeBtoA) {
            App.showToast(`❗ ${formSelectedCharB?.name || '캐릭터 B'} ➔ ${formSelectedCharA?.name || '캐릭터 A'} 관계 명칭을 입력해주세요.`);
            customB2A?.focus();
            return;
          }
          colorBtoA = colorB2AVal;
        } else {
          typeBtoA = selB2A.value;
          colorBtoA = getRelColor(typeBtoA);
        }

        if (!type && !typeBtoA) {
          App.showToast('❗ 단방향 관계에서는 최소 한 방향 이상의 관계를 설정해야 합니다.');
          return;
        }
      }

      const data = {
        char_a_id:   Number(charA),
        char_b_id:   Number(charB),
        is_mutual:   isMutual ? 1 : 0,
        type,
        color,
        type_b_to_a: typeBtoA,
        color_b_to_a: colorBtoA,
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

    // 모드 전환 버튼
    document.getElementById('btn-rel-mode-mutual')?.addEventListener('click', () => setRelMode(true));
    document.getElementById('btn-rel-mode-directional')?.addEventListener('click', () => setRelMode(false));

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
          updateDirectionLabels();
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
          updateDirectionLabels();
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

    // 1. 양방향 관계 유형 셀렉트 변경 시 직접 입력 필드 토글
    document.getElementById('rel-type-select')?.addEventListener('change', (e) => {
      const box = document.getElementById('rel-custom-box-mutual');
      if (e.target.value === '__custom__') {
        box?.classList.remove('hidden');
        document.getElementById('rel-custom-type')?.focus();
      } else {
        box?.classList.add('hidden');
      }
    });

    // 2. 단방향 A➔B 셀렉트 변경 시 직접 입력 필드 토글
    document.getElementById('rel-type-a2b-select')?.addEventListener('change', (e) => {
      const box = document.getElementById('rel-custom-box-a2b');
      if (e.target.value === '__custom__') {
        box?.classList.remove('hidden');
        document.getElementById('rel-custom-type-a2b')?.focus();
      } else {
        box?.classList.add('hidden');
      }
    });

    // 3. 단방향 B➔A 셀렉트 변경 시 직접 입력 필드 토글
    document.getElementById('rel-type-b2a-select')?.addEventListener('change', (e) => {
      const box = document.getElementById('rel-custom-box-b2a');
      if (e.target.value === '__custom__') {
        box?.classList.remove('hidden');
        document.getElementById('rel-custom-type-b2a')?.focus();
      } else {
        box?.classList.add('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { render, openForm, openFormWith, deleteRelation, loadInViewer, getRelColor };
})();

window.Relations = Relations;
