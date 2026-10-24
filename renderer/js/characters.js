/* ── characters.js: Character Management, Gallery, Cropper ── */
'use strict';

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function strColor(name) {
  let hash = 0;
  const s = name || 'default';
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  const h2 = (h + 30) % 360;
  return `linear-gradient(135deg, hsl(${h},60%,38%), hsl(${h2},55%,50%))`;
}

window.escHtml = escHtml;
window.strColor = strColor;

const Characters = (() => {
  let viewMode = 'grid'; // 'grid' | 'list'
  let currentDetailId = null;

  // Form State
  let formImages = [];
  let formAvatarPath = '';
  let formAvatarCrop = '';

  // ── Render (list page) ────────────────────────────────────────────
  function render() {
    populateFilters();
    renderList();
  }

  function populateFilters() {
    const { factions, characters } = App.state;

    // Factions filter
    const factionSel = document.getElementById('filter-faction');
    if (factionSel) {
      const prev = factionSel.value;
      factionSel.innerHTML = '<option value="">모든 세력</option>';
      factions.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        factionSel.appendChild(opt);
      });
      factionSel.value = prev;
    }

    // Gender filter
    const genderSel = document.getElementById('filter-gender');
    if (genderSel) {
      const prevG = genderSel.value;
      const genders = [...new Set(characters.map(c => c.gender).filter(Boolean))].sort();
      genderSel.innerHTML = '<option value="">모든 성별</option>';
      genders.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        genderSel.appendChild(opt);
      });
      genderSel.value = prevG;
    }
  }

  function getFiltered() {
    let list = [...App.state.characters];
    const search = document.getElementById('char-search')?.value.trim().toLowerCase() || '';
    const factionId = document.getElementById('filter-faction')?.value || '';
    const gender = document.getElementById('filter-gender')?.value || '';
    const sortBy = document.getElementById('sort-by')?.value || 'name';

    if (search) {
      list = list.filter(c => {
        const inName = (c.name || '').toLowerCase().includes(search);
        const inAlias = (c.aliases || []).some(a => a.toLowerCase().includes(search));
        const inOrigin = (c.origin || '').toLowerCase().includes(search);
        return inName || inAlias || inOrigin;
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
      if (sortBy === 'height') {
        const hA = a.height != null ? a.height : -1;
        const hB = b.height != null ? b.height : -1;
        return hB - hA; // 키 큰 순
      }
      if (sortBy === 'created_at') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });

    return list;
  }

  function renderList() {
    const list = getFiltered();
    renderGrid(list);
    renderTable(list);
  }

  function getAvatarSrc(c) {
    if (c.avatar_crop) return c.avatar_crop;
    if (c.avatar_path) return `file://${c.avatar_path}`;
    if (c.image_path) return `file://${c.image_path}`;
    return null;
  }

  function renderGrid(list) {
    const container = document.getElementById('char-grid');
    if (!container) return;
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-state">등록된 캐릭터가 없습니다. 새 캐릭터를 추가해보세요!</div>';
      return;
    }
    container.innerHTML = '';
    list.forEach(c => {
      const card = document.createElement('div');
      card.className = 'char-card';
      card.dataset.id = c.id;

      const avatarSrc = getAvatarSrc(c);
      const avatarHtml = avatarSrc
        ? `<img class="char-card-image" src="${avatarSrc}" alt="${escHtml(c.name)}" />`
        : `<div class="char-card-avatar" style="background:${strColor(c.name)}">${escHtml((c.name || '?')[0])}</div>`;

      const factionBadges = (c.factions || []).map(f =>
        `<span class="faction-badge" style="background:${f.color}">${escHtml(f.name)}</span>`
      ).join('');

      const metaParts = [];
      if (c.age != null) metaParts.push(`${c.age}세`);
      if (c.gender) metaParts.push(c.gender);
      if (c.origin) metaParts.push(c.origin);
      const meta = metaParts.join(' · ');

      card.innerHTML = `
        ${avatarHtml}
        <div class="char-card-name">${escHtml(c.name)}</div>
        <div class="char-card-meta">${escHtml(meta)}</div>
        <div class="char-card-factions">${factionBadges}</div>
      `;
      card.addEventListener('click', () => openDetail(c.id));
      container.appendChild(card);
    });
  }

  function renderTable(list) {
    const tbody = document.getElementById('char-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    list.forEach(c => {
      const tr = document.createElement('tr');
      const factions = (c.factions || []).map(f =>
        `<span class="faction-badge" style="background:${f.color}">${escHtml(f.name)}</span>`
      ).join(' ');
      tr.innerHTML = `
        <td><strong>${escHtml(c.name)}</strong></td>
        <td>${c.age != null ? c.age + '세' : '-'}</td>
        <td>${escHtml(c.gender || '-')}</td>
        <td>${escHtml(c.origin || '-')}</td>
        <td>${factions || '-'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-secondary btn-sm" onclick="Characters.openDetail(${c.id})">보기</button>
            <button class="btn-primary btn-sm" onclick="Characters.openForm(${c.id})">편집</button>
            <button class="btn-danger btn-sm" onclick="Characters.deleteChar(${c.id})">삭제</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Detail Modal ──────────────────────────────────────────────────
  async function openDetail(id) {
    currentDetailId = id;
    const c = await window.api.getCharacter(id);
    if (!c) return;

    // Header avatar
    const avatarEl = document.getElementById('detail-avatar');
    const avatarSrc = getAvatarSrc(c);
    if (avatarSrc) {
      avatarEl.innerHTML = `<img src="${avatarSrc}" alt="${escHtml(c.name)}" />`;
    } else {
      avatarEl.innerHTML = '';
      avatarEl.style.background = strColor(c.name);
      avatarEl.textContent = (c.name || '?')[0];
    }

    document.getElementById('detail-name').textContent = c.name;
    const aliasEl = document.getElementById('detail-aliases');
    aliasEl.innerHTML = (c.aliases || []).map(a => `<span class="alias-tag">${escHtml(a)}</span>`).join('');

    // Meta
    document.getElementById('detail-age').textContent = c.age != null ? `${c.age}세` : '-';
    document.getElementById('detail-birthdate').textContent = c.birthdate || '-';
    document.getElementById('detail-gender').textContent = c.gender || '-';
    document.getElementById('detail-origin').textContent = c.origin || '-';
    const heightEl = document.getElementById('detail-height');
    if (heightEl) heightEl.textContent = c.height != null ? `${c.height}cm` : '-';

    // Factions
    const factionsEl = document.getElementById('detail-factions');
    factionsEl.innerHTML = (c.factions || []).map(f =>
      `<span class="faction-badge" style="background:${f.color}">${escHtml(f.name)}${f.role ? ' · ' + escHtml(f.role) : ''}</span>`
    ).join('') || '<span class="text-muted">없음</span>';

    // Relationships
    const relsEl = document.getElementById('detail-relationships');
    if (!c.relationships || c.relationships.length === 0) {
      relsEl.innerHTML = '<span class="text-muted">연결된 관계 없음</span>';
    } else {
      relsEl.innerHTML = c.relationships.map(r => {
        const isA = r.char_a_id === id;
        const other = isA ? r.char_b_name : r.char_a_name;
        const otherId = isA ? r.char_b_id : r.char_a_id;
        return `<div class="rel-item" style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <div>
            <span class="rel-type-tag" style="padding:2px 8px;font-size:11px;">${escHtml(r.type || '관계')}</span>
            <span class="link-char" data-id="${otherId}" style="cursor:pointer;color:var(--accent);font-weight:600;margin-left:6px;">${escHtml(other)}</span>
            ${r.description ? `<span class="text-muted" style="margin-left:4px;font-size:12px;">— ${escHtml(r.description)}</span>` : ''}
          </div>
          <button type="button" class="btn-secondary btn-sm btn-view-narrative" data-other-id="${otherId}" style="font-size:11px;padding:3px 8px;">서사 📖</button>
        </div>`;
      }).join('');

      relsEl.querySelectorAll('.link-char').forEach(el => {
        el.addEventListener('click', () => {
          App.closeModal('modal-char-detail');
          openDetail(Number(el.dataset.id));
        });
      });

      relsEl.querySelectorAll('.btn-view-narrative').forEach(btn => {
        btn.addEventListener('click', () => {
          const otherId = Number(btn.dataset.otherId);
          App.closeModal('modal-char-detail');
          App.navigate('relations');
          if (window.Relations) {
            window.Relations.loadInViewer(id, otherId);
          }
        });
      });
    }

    // Tabs content - Markdown 렌더링
    function renderMd(el, text, fallback) {
      if (!el) return;
      if (!text) {
        el.textContent = fallback;
        el.classList.remove('markdown-body');
        return;
      }
      if (window.marked) {
        el.innerHTML = window.marked.parse(text);
        el.classList.add('markdown-body');
      } else {
        el.textContent = text;
        el.classList.remove('markdown-body');
      }
    }
    renderMd(document.getElementById('detail-appearance'),    c.appearance,    '내용 없음');
    renderMd(document.getElementById('detail-personality'),   c.personality,   '내용 없음');
    renderMd(document.getElementById('detail-profile-public'),c.profile_public,'등록된 공개 프로필이 없습니다.');
    renderMd(document.getElementById('detail-profile-secret'),c.profile_secret,'등록된 비밀 프로필이 없습니다.');

    // Prompt tab
    const promptBox = document.getElementById('detail-prompt');
    promptBox.textContent = c.prompt || '등록된 생성 프롬프트가 없습니다.';
    const copyPromptBtn = document.getElementById('btn-copy-prompt');
    copyPromptBtn.onclick = async () => {
      if (!c.prompt) { App.showToast('복사할 프롬프트가 없습니다.'); return; }
      await window.api.copyText(c.prompt);
      App.showToast('📋 프롬프트가 클립보드에 복사되었습니다!');
    };

    // 공개 프로필 복사
    const copyPublicBtn = document.getElementById('btn-copy-public');
    if (copyPublicBtn) {
      copyPublicBtn.onclick = async () => {
        if (!c.profile_public) { App.showToast('복사할 공개 프로필이 없습니다.'); return; }
        await window.api.copyText(c.profile_public);
        App.showToast('📋 공개 프로필이 클립보드에 복사되었습니다!');
      };
    }

    // 비밀 프로필 복사
    const copySecretBtn = document.getElementById('btn-copy-secret');
    if (copySecretBtn) {
      copySecretBtn.onclick = async () => {
        if (!c.profile_secret) { App.showToast('복사할 비밀 프로필이 없습니다.'); return; }
        await window.api.copyText(c.profile_secret);
        App.showToast('📋 비밀 프로필이 클립보드에 복사되었습니다!');
      };
    }

    // Gallery tab
    renderDetailGallery(c);

    // Reset tabs to first tab
    const detailModal = document.getElementById('modal-char-detail');
    detailModal.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    detailModal.querySelectorAll('.tab-content').forEach((tc, i) => tc.classList.toggle('hidden', i !== 0));

    // Footer buttons
    document.getElementById('btn-detail-edit').onclick = () => {
      App.closeModal('modal-char-detail');
      openForm(id);
    };
    document.getElementById('btn-detail-delete').onclick = () => deleteChar(id);

    App.openModal('modal-char-detail');
  }

  function renderDetailGallery(c) {
    const galleryGrid = document.getElementById('detail-gallery-grid');
    galleryGrid.innerHTML = '';
    const images = Array.isArray(c.images) ? c.images : [];

    if (images.length === 0) {
      galleryGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">등록된 이미지가 없습니다.<br><small style="opacity:0.6;">편집 모드에서 이미지를 추가할 수 있습니다.</small></div>';
      return;
    }

    images.forEach((imgPath, idx) => {
      const isAvatar = (c.avatar_path === imgPath);
      const card = document.createElement('div');
      card.className = `gallery-card ${isAvatar ? 'is-avatar' : ''}`;

      card.innerHTML = `
        <div class="gallery-card-img-wrap" data-idx="${idx}" title="클릭하여 크게 보기">
          <img src="file://${imgPath}" alt="character image" />
          ${isAvatar ? '<span class="badge-avatar">★ 대표</span>' : ''}
          <div class="gallery-img-overlay"><span>🔍</span></div>
        </div>
        <div class="gallery-card-actions">
          <button type="button" class="btn-secondary btn-copy" title="클립보드로 복사">📋 복사</button>
          <button type="button" class="btn-primary btn-crop" title="대표 이미지로 설정">✦ 대표</button>
          <button type="button" class="btn-ghost btn-del" title="삭제">🗑️</button>
        </div>
      `;

      // 이미지 클릭 → 라이트박스
      card.querySelector('.gallery-card-img-wrap').addEventListener('click', () => {
        openLightbox(images, idx);
      });

      // Copy image
      card.querySelector('.btn-copy').addEventListener('click', async () => {
        const ok = await window.api.copyImage(imgPath);
        if (ok) App.showToast('📋 이미지가 클립보드에 복사되었습니다!');
        else App.showToast('이미지 복사 실패');
      });

      // Crop & Set avatar
      card.querySelector('.btn-crop').addEventListener('click', () => {
        openCropperModal(imgPath, async (croppedDataUrl) => {
          await window.api.updateCharacter(c.id, {
            avatar_path: imgPath,
            avatar_crop: croppedDataUrl
          });
          await App.loadAll();
          openDetail(c.id);
          renderList();
          App.showToast('★ 대표 이미지가 변경되었습니다.');
        });
      });

      // Delete image
      card.querySelector('.btn-del').addEventListener('click', async () => {
        const conf = await App.confirm('이 이미지를 목록에서 삭제하시겠습니까?');
        if (!conf) return;
        const newImages = images.filter(p => p !== imgPath);
        const updates = { images: newImages };
        if (c.avatar_path === imgPath) {
          updates.avatar_path = newImages[0] || null;
          updates.avatar_crop = null;
        }
        await window.api.updateCharacter(c.id, updates);
        await App.loadAll();
        openDetail(c.id);
        renderList();
        App.showToast('이미지가 삭제되었습니다.');
      });

      galleryGrid.appendChild(card);
    });
  }

  // ── Lightbox ──────────────────────────────────────────────────────
  let _lbImages = [], _lbIdx = 0;

  function openLightbox(images, startIdx) {
    _lbImages = images;
    _lbIdx = startIdx;
    renderLightbox();
    document.getElementById('modal-lightbox').classList.remove('hidden');
    document.addEventListener('keydown', onLightboxKey);
  }

  function closeLightbox() {
    document.getElementById('modal-lightbox').classList.add('hidden');
    document.removeEventListener('keydown', onLightboxKey);
  }

  function renderLightbox() {
    const img = document.getElementById('lightbox-img');
    const counter = document.getElementById('lightbox-counter');
    img.src = `file://${_lbImages[_lbIdx]}`;
    counter.textContent = `${_lbIdx + 1} / ${_lbImages.length}`;
    document.getElementById('lightbox-prev').style.display = _lbImages.length > 1 ? '' : 'none';
    document.getElementById('lightbox-next').style.display = _lbImages.length > 1 ? '' : 'none';
  }

  function onLightboxKey(e) {
    if (e.key === 'Escape') { closeLightbox(); }
    else if (e.key === 'ArrowLeft' && _lbImages.length > 1) { _lbIdx = (_lbIdx - 1 + _lbImages.length) % _lbImages.length; renderLightbox(); }
    else if (e.key === 'ArrowRight' && _lbImages.length > 1) { _lbIdx = (_lbIdx + 1) % _lbImages.length; renderLightbox(); }
  }

  // ── Form Modal ────────────────────────────────────────────────────
  async function openForm(id = null) {
    const formModal = document.getElementById('modal-char-form');
    formModal.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    formModal.querySelectorAll('.tab-content').forEach((tc, i) => tc.classList.toggle('hidden', i !== 0));

    document.getElementById('form-char-id').value = id || '';
    document.getElementById('form-title').textContent = id ? '캐릭터 편집' : '캐릭터 추가';

    clearForm();
    buildFactionCheckboxes([]);

    if (id) {
      const c = await window.api.getCharacter(id);
      if (c) fillForm(c);
    }

    App.openModal('modal-char-form');
  }

  function clearForm() {
    ['form-name', 'form-age', 'form-height', 'form-birthdate', 'form-gender', 'form-origin',
     'form-appearance-text', 'form-personality', 'form-profile-public', 'form-profile-secret', 'form-prompt'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const bMonth = document.getElementById('form-birth-month');
    const bDay = document.getElementById('form-birth-day');
    if (bMonth) bMonth.value = '';
    if (bDay) bDay.value = '';

    const factionSearch = document.getElementById('faction-search-input');
    if (factionSearch) factionSearch.value = '';

    formImages = [];
    formAvatarPath = '';
    formAvatarCrop = '';
    updateFormAvatarPreview();
    renderFormGallery();
    document.getElementById('alias-tags').innerHTML = '';
    document.getElementById('alias-input').value = '';
  }

  function fillForm(c) {
    document.getElementById('form-name').value = c.name || '';
    document.getElementById('form-age').value = c.age != null ? c.age : '';
    document.getElementById('form-height').value = c.height != null ? c.height : '';
    document.getElementById('form-birthdate').value = c.birthdate || '';
    document.getElementById('form-gender').value = c.gender || '';
    document.getElementById('form-origin').value = c.origin || '';
    document.getElementById('form-appearance-text').value = c.appearance || '';
    document.getElementById('form-personality').value = c.personality || '';
    document.getElementById('form-profile-public').value = c.profile_public || '';
    document.getElementById('form-profile-secret').value = c.profile_secret || '';
    document.getElementById('form-prompt').value = c.prompt || '';

    // Birthdate month/day select match
    if (c.birthdate) {
      const match = c.birthdate.match(/(\d+월)?\s*(\d+일)?/);
      if (match) {
        if (match[1]) document.getElementById('form-birth-month').value = match[1];
        if (match[2]) document.getElementById('form-birth-day').value = match[2];
      }
    }

    formImages = Array.isArray(c.images) ? [...c.images] : [];
    formAvatarPath = c.avatar_path || (formImages[0] || '');
    formAvatarCrop = c.avatar_crop || '';

    updateFormAvatarPreview();
    renderFormGallery();

    // Aliases
    const tagsEl = document.getElementById('alias-tags');
    tagsEl.innerHTML = '';
    (c.aliases || []).forEach(a => addAliasTag(a));

    // Factions
    buildFactionCheckboxes(c.factions || []);
  }

  function updateFormAvatarPreview() {
    const preview = document.getElementById('form-image-preview');
    if (formAvatarCrop) {
      preview.innerHTML = `<img src="${formAvatarCrop}" alt="avatar" />`;
    } else if (formAvatarPath) {
      preview.innerHTML = `<img src="file://${formAvatarPath}" alt="avatar" />`;
    } else {
      preview.innerHTML = '<span>대표 이미지 없음</span>';
    }
  }

  function renderFormGallery() {
    const container = document.getElementById('form-gallery-list');
    if (!container) return;
    container.innerHTML = '';

    if (formImages.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1; padding: 20px;">등록된 이미지가 없습니다. 위 [+ 이미지 추가] 버튼을 눌러보세요.</div>';
      return;
    }

    formImages.forEach(imgPath => {
      const isAvatar = (formAvatarPath === imgPath);
      const item = document.createElement('div');
      item.className = `gallery-form-item ${isAvatar ? 'is-avatar' : ''}`;
      item.innerHTML = `
        <img src="file://${imgPath}" alt="image" />
        <div class="gallery-form-item-actions">
          <button type="button" class="btn-primary btn-crop-form">✂️ 대표</button>
          <button type="button" class="btn-ghost btn-del-form">✕</button>
        </div>
      `;

      item.querySelector('.btn-crop-form').addEventListener('click', () => {
        openCropperModal(imgPath, (croppedDataUrl) => {
          formAvatarPath = imgPath;
          formAvatarCrop = croppedDataUrl;
          updateFormAvatarPreview();
          renderFormGallery();
          App.showToast('대표 이미지가 설정되었습니다.');
        });
      });

      item.querySelector('.btn-del-form').addEventListener('click', () => {
        formImages = formImages.filter(p => p !== imgPath);
        if (formAvatarPath === imgPath) {
          formAvatarPath = formImages[0] || '';
          formAvatarCrop = '';
          updateFormAvatarPreview();
        }
        renderFormGallery();
      });

      container.appendChild(item);
    });
  }

  function buildFactionCheckboxes(selectedFactions) {
    const container = document.getElementById('faction-checkboxes');
    if (!container) return;
    container.innerHTML = '';
    const factions = App.state.factions || [];
    if (factions.length === 0) {
      container.innerHTML = '<span class="text-muted" style="font-size:12px;padding:4px;">등록된 세력이 없습니다. 먼저 세력 탭에서 세력을 추가해보세요.</span>';
      return;
    }

    // Organize into parent and children
    const rootFactions = factions.filter(f => !f.parent_id);
    const subFactions = factions.filter(f => f.parent_id);

    const renderRow = (f, isSub = false, parentName = '') => {
      const sel = selectedFactions.find(sf => sf.id === f.id);
      const div = document.createElement('div');
      div.className = 'faction-row-item';
      div.dataset.name = `${parentName} ${f.name}`.trim();
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '8px';
      if (isSub) {
        div.style.paddingLeft = '18px';
      }

      div.innerHTML = `
        <label style="display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;">
          <input type="checkbox" class="faction-check" data-id="${f.id}" ${sel ? 'checked' : ''} />
          <span class="faction-badge" style="background:${f.color};padding:3px 8px;font-size:11px;">
            ${isSub ? 'ㄴ ' : ''}${escHtml(f.name)}
          </span>
        </label>
        <input type="text" class="form-input faction-role-input" style="width:110px;padding:3px 8px;font-size:11px;" placeholder="직책/역할" value="${escHtml(sel ? sel.role || '' : '')}" data-faction-id="${f.id}" />
      `;
      return div;
    };

    rootFactions.forEach(rf => {
      container.appendChild(renderRow(rf, false));
      const children = subFactions.filter(sf => sf.parent_id === rf.id);
      children.forEach(cf => {
        container.appendChild(renderRow(cf, true, rf.name));
      });
    });

    // Sub factions whose parent might be deleted or missing
    const rootIds = new Set(rootFactions.map(r => r.id));
    const orphanSubs = subFactions.filter(sf => !rootIds.has(sf.parent_id));
    orphanSubs.forEach(os => {
      container.appendChild(renderRow(os, false));
    });
  }

  function addAliasTag(text) {
    const tagsEl = document.getElementById('alias-tags');
    const tag = document.createElement('span');
    tag.className = 'tag-item';
    tag.innerHTML = `${escHtml(text)}<span class="tag-remove" data-val="${escHtml(text)}">×</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => tag.remove());
    tagsEl.appendChild(tag);
  }

  function collectFormData() {
    const name = document.getElementById('form-name').value.trim();
    if (!name) { alert('이름을 입력해주세요.'); return null; }

    const aliases = [...document.getElementById('alias-tags').querySelectorAll('.tag-item')]
      .map(t => t.childNodes[0].textContent.trim()).filter(Boolean);

    const factions = [];
    document.querySelectorAll('.faction-check:checked').forEach(cb => {
      const fid = Number(cb.dataset.id);
      const role = document.querySelector(`.faction-role-input[data-faction-id="${fid}"]`)?.value || '';
      factions.push({ faction_id: fid, role });
    });

    const ageVal = document.getElementById('form-age').value;
    const heightVal = document.getElementById('form-height').value;

    return {
      name,
      aliases,
      age: ageVal !== '' ? Number(ageVal) : null,
      height: heightVal !== '' ? Number(heightVal) : null,
      birthdate: document.getElementById('form-birthdate').value.trim() || null,
      gender: document.getElementById('form-gender').value.trim() || null,
      origin: document.getElementById('form-origin').value.trim() || null,
      appearance: document.getElementById('form-appearance-text').value.trim() || null,
      personality: document.getElementById('form-personality').value.trim() || null,
      profile_public: document.getElementById('form-profile-public').value.trim() || null,
      profile_secret: document.getElementById('form-profile-secret').value.trim() || null,
      prompt: document.getElementById('form-prompt').value.trim() || null,
      avatar_path: formAvatarPath || null,
      avatar_crop: formAvatarCrop || null,
      images: formImages,
      factions
    };
  }

  async function saveCharacter() {
    try {
      const data = collectFormData();
      if (!data) return;

      const id = document.getElementById('form-char-id').value;
      if (id) {
        await window.api.updateCharacter(Number(id), data);
      } else {
        await window.api.createCharacter(data);
      }

      await App.loadAll();
      App.closeModal('modal-char-form');
      renderList();
      App.showToast('캐릭터 정보가 저장되었습니다.');
    } catch (err) {
      console.error('Failed to save character:', err);
      alert('저장 중 오류가 발생했습니다: ' + err.message);
    }
  }

  async function deleteChar(id) {
    const confirmed = await App.confirm('정말 이 캐릭터를 삭제하시겠습니까?');
    if (!confirmed) return;
    await window.api.deleteCharacter(id);
    await App.loadAll();
    App.closeModal('modal-char-detail');
    renderList();
    App.showToast('캐릭터가 삭제되었습니다.');
  }

  // ── Image Cropper Modal ──────────────────────────────────────────
  let cropState = {
    img: null,
    imgPath: '',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    onApply: null
  };

  function openCropperModal(imgPath, onApplyCallback) {
    cropState.imgPath = imgPath;
    cropState.onApply = onApplyCallback;
    cropState.zoom = 1;
    cropState.offsetX = 0;
    cropState.offsetY = 0;

    const canvas = document.getElementById('crop-canvas');
    const zoomSlider = document.getElementById('crop-zoom');
    zoomSlider.value = 1;
    document.getElementById('crop-zoom-val').textContent = '100%';

    const img = new Image();
    img.onload = () => {
      cropState.img = img;
      // Auto-fit initial zoom
      const minScale = Math.max(canvas.width / img.width, canvas.height / img.height);
      cropState.zoom = minScale;
      zoomSlider.min = (minScale * 0.5).toFixed(2);
      zoomSlider.max = (minScale * 4.0).toFixed(2);
      zoomSlider.value = minScale.toFixed(2);
      document.getElementById('crop-zoom-val').textContent = Math.round(minScale * 100) + '%';
      drawCropper();
    };
    img.src = `file://${imgPath}`;

    App.openModal('modal-image-crop');
  }

  function drawCropper() {
    const canvas = document.getElementById('crop-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!cropState.img) return;

    const img = cropState.img;
    const w = img.width * cropState.zoom;
    const h = img.height * cropState.zoom;
    const x = (canvas.width - w) / 2 + cropState.offsetX;
    const y = (canvas.height - h) / 2 + cropState.offsetY;

    ctx.drawImage(img, x, y, w, h);
  }

  function initCropperEvents() {
    const canvas = document.getElementById('crop-canvas');
    const zoomSlider = document.getElementById('crop-zoom');

    zoomSlider.addEventListener('input', (e) => {
      cropState.zoom = parseFloat(e.target.value);
      document.getElementById('crop-zoom-val').textContent = Math.round(cropState.zoom * 100) + '%';
      drawCropper();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      cropState.zoom = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max), cropState.zoom + delta));
      zoomSlider.value = cropState.zoom;
      document.getElementById('crop-zoom-val').textContent = Math.round(cropState.zoom * 100) + '%';
      drawCropper();
    });

    canvas.addEventListener('mousedown', (e) => {
      cropState.isDragging = true;
      cropState.dragStartX = e.clientX - cropState.offsetX;
      cropState.dragStartY = e.clientY - cropState.offsetY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!cropState.isDragging) return;
      cropState.offsetX = e.clientX - cropState.dragStartX;
      cropState.offsetY = e.clientY - cropState.dragStartY;
      drawCropper();
    });

    window.addEventListener('mouseup', () => {
      cropState.isDragging = false;
    });

    document.getElementById('btn-crop-reset').addEventListener('click', () => {
      if (!cropState.img) return;
      const canvas = document.getElementById('crop-canvas');
      const minScale = Math.max(canvas.width / cropState.img.width, canvas.height / cropState.img.height);
      cropState.zoom = minScale;
      cropState.offsetX = 0;
      cropState.offsetY = 0;
      zoomSlider.value = minScale;
      document.getElementById('crop-zoom-val').textContent = Math.round(minScale * 100) + '%';
      drawCropper();
    });

    document.getElementById('btn-crop-apply').addEventListener('click', () => {
      const canvas = document.getElementById('crop-canvas');
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      if (cropState.onApply) {
        cropState.onApply(dataUrl);
      }
      App.closeModal('modal-image-crop');
    });
  }

  function initBirthdateCombo() {
    const daySel = document.getElementById('form-birth-day');
    if (daySel && daySel.options.length <= 1) {
      for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = `${i}일`;
        opt.textContent = `${i}일`;
        daySel.appendChild(opt);
      }
    }

    const monthSel = document.getElementById('form-birth-month');
    const input = document.getElementById('form-birthdate');

    const updateFromCombo = () => {
      const m = monthSel?.value || '';
      const d = daySel?.value || '';
      if (m && d) {
        input.value = `${m} ${d}`;
      } else if (m) {
        input.value = m;
      } else if (d) {
        input.value = d;
      }
    };

    monthSel?.addEventListener('change', updateFromCombo);
    daySel?.addEventListener('change', updateFromCombo);
  }

  function initFactionSearch() {
    const searchInput = document.getElementById('faction-search-input');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const container = document.getElementById('faction-checkboxes');
      if (!container) return;
      container.querySelectorAll('.faction-row-item').forEach(row => {
        const name = (row.dataset.name || '').toLowerCase();
        row.style.display = name.includes(query) ? 'flex' : 'none';
      });
    });
  }

  // ── Init Global Events ────────────────────────────────────────────
  function initEvents() {
    initBirthdateCombo();
    initFactionSearch();

    // New character button
    document.getElementById('btn-new-character')?.addEventListener('click', () => openForm());

    // Search & Filters
    ['char-search', 'filter-faction', 'filter-gender', 'sort-by'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderList);
    });

    // View toggle
    document.getElementById('btn-grid-view')?.addEventListener('click', () => {
      viewMode = 'grid';
      document.getElementById('btn-grid-view').classList.add('active');
      document.getElementById('btn-list-view').classList.remove('active');
      document.getElementById('char-grid').classList.remove('hidden');
      document.getElementById('char-table-wrap').classList.add('hidden');
    });

    document.getElementById('btn-list-view')?.addEventListener('click', () => {
      viewMode = 'list';
      document.getElementById('btn-list-view').classList.add('active');
      document.getElementById('btn-grid-view').classList.remove('active');
      document.getElementById('char-grid').classList.add('hidden');
      document.getElementById('char-table-wrap').classList.remove('hidden');
    });

    // Alias input
    document.getElementById('alias-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val) { addAliasTag(val); e.target.value = ''; }
      }
    });

    // Save character
    document.getElementById('btn-save-character')?.addEventListener('click', saveCharacter);

    // Form Image upload & clear
    document.getElementById('btn-upload-image')?.addEventListener('click', async () => {
      const paths = await window.api.openImages();
      if (paths && paths.length > 0) {
        paths.forEach(p => {
          if (!formImages.includes(p)) formImages.push(p);
        });
        if (!formAvatarPath && formImages.length > 0) {
          formAvatarPath = formImages[0];
        }
        updateFormAvatarPreview();
        renderFormGallery();
      }
    });

    document.getElementById('btn-clear-image')?.addEventListener('click', () => {
      formAvatarPath = '';
      formAvatarCrop = '';
      updateFormAvatarPreview();
    });

    // Form add images in gallery tab
    document.getElementById('btn-form-add-images')?.addEventListener('click', async () => {
      const paths = await window.api.openImages();
      if (paths && paths.length > 0) {
        paths.forEach(p => {
          if (!formImages.includes(p)) formImages.push(p);
        });
        if (!formAvatarPath && formImages.length > 0) {
          formAvatarPath = formImages[0];
        }
        updateFormAvatarPreview();
        renderFormGallery();
      }
    });

    // Cropper Events
    initCropperEvents();

    // Lightbox Events
    document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
    document.getElementById('lightbox-prev')?.addEventListener('click', () => {
      _lbIdx = (_lbIdx - 1 + _lbImages.length) % _lbImages.length;
      renderLightbox();
    });
    document.getElementById('lightbox-next')?.addEventListener('click', () => {
      _lbIdx = (_lbIdx + 1) % _lbImages.length;
      renderLightbox();
    });
    // 오버레이 배경 클릭 시 닫기
    document.getElementById('modal-lightbox')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget || e.target.classList.contains('lightbox-container')) closeLightbox();
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────
  function relTypeClass(type) {
    const map = {
      '적대': 'rel-적대',
      '우호': 'rel-우호',
      '가족': 'rel-가족',
      '연인': 'rel-연인',
      '동료': 'rel-동료',
      '라이벌': 'rel-라이벌',
      '스승/제자': 'rel-스승제자',
      '기타': 'rel-기타'
    };
    return map[type] || 'rel-기타';
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { render, openDetail, openForm, deleteChar };
})();

// Make globally accessible
window.Characters = Characters;

// ── Factions Module ────────────────────────────────────────────────
const Factions = (() => {
  function render() {
    const container = document.getElementById('factions-grid');
    if (!container) return;
    container.innerHTML = '';
    const factions = App.state.factions || [];

    if (factions.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">등록된 세력이 없습니다. 우측 상단의 [+ 세력 추가] 버튼으로 대세력을 먼저 만들어보세요!</div>';
      return;
    }

    const rootFactions = factions.filter(f => !f.parent_id);
    const subFactions = factions.filter(f => f.parent_id);

    rootFactions.forEach(rf => {
      const chars = App.state.characters.filter(c => c.factions && c.factions.some(fc => fc.id === rf.id));
      const subs = subFactions.filter(sf => sf.parent_id === rf.id);

      const card = document.createElement('div');
      card.className = 'faction-card';
      card.style.borderLeftColor = rf.color;

      const subsHtml = subs.map(sf => {
        const subChars = App.state.characters.filter(c => c.factions && c.factions.some(fc => fc.id === sf.id));
        return `
          <div class="faction-sub-item" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--input-bg);border-radius:4px;margin-bottom:6px;border:1px solid var(--border);">
            <div>
              <span style="font-weight:700;font-size:12px;color:var(--text);">ㄴ ${escHtml(sf.name)}</span>
              <span class="text-muted" style="font-size:11px;margin-left:6px;">(${subChars.length}명)</span>
            </div>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn-secondary btn-sm" style="font-size:10px;padding:2px 6px;" onclick="Factions.openForm(${sf.id})">편집</button>
              <button type="button" class="btn-danger btn-sm" style="font-size:10px;padding:2px 6px;" onclick="Factions.deleteFaction(${sf.id})">✕</button>
            </div>
          </div>
        `;
      }).join('');

      card.innerHTML = `
        <div class="faction-card-header">
          <div>
            <span class="faction-card-name" style="font-size:16px;">${escHtml(rf.name)}</span>
            <span class="text-muted" style="font-size:11px;margin-left:6px;">(최상위 조직)</span>
          </div>
          <div class="faction-card-color-dot" style="background:${rf.color}"></div>
        </div>
        ${rf.description ? `<p class="faction-card-desc">${escHtml(rf.description)}</p>` : ''}

        <div style="margin-top:12px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:12px;font-weight:700;color:var(--text-muted);">소속 부서 / 하위 팀 (${subs.length}개)</span>
            <button type="button" class="btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;" onclick="Factions.openForm(null, ${rf.id})">+ 부서 추가</button>
          </div>
          ${subs.length > 0 ? subsHtml : '<p class="text-muted" style="font-size:11px;">등록된 하위 부서가 없습니다.</p>'}
        </div>

        <div class="faction-members-title">직속 소속 캐릭터 (${chars.length}명)</div>
        <div class="faction-members-list">
          ${chars.length > 0
            ? chars.map(c => `<span class="faction-member-tag" onclick="Characters.openDetail(${c.id})">${escHtml(c.name)}</span>`).join('')
            : '<span class="text-muted" style="font-size:11px">직속 소속원 없음</span>'
          }
        </div>
        <div class="faction-card-actions">
          <button class="btn-secondary btn-sm" onclick="Factions.openForm(${rf.id})">대세력 편집</button>
          <button class="btn-danger btn-sm" onclick="Factions.deleteFaction(${rf.id})">삭제</button>
        </div>
      `;
      container.appendChild(card);
    });

    // Orphan sub-factions if any
    const rootIds = new Set(rootFactions.map(r => r.id));
    const orphanSubs = subFactions.filter(sf => !rootIds.has(sf.parent_id));
    orphanSubs.forEach(os => {
      const chars = App.state.characters.filter(c => c.factions && c.factions.some(fc => fc.id === os.id));
      const card = document.createElement('div');
      card.className = 'faction-card';
      card.style.borderLeftColor = os.color;
      card.innerHTML = `
        <div class="faction-card-header">
          <span class="faction-card-name">${escHtml(os.name)}</span>
          <div class="faction-card-color-dot" style="background:${os.color}"></div>
        </div>
        <div class="faction-card-actions">
          <button class="btn-secondary btn-sm" onclick="Factions.openForm(${os.id})">편집</button>
          <button class="btn-danger btn-sm" onclick="Factions.deleteFaction(${os.id})">삭제</button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function openForm(id = null, defaultParentId = null) {
    document.getElementById('faction-form-id').value = id || '';
    document.getElementById('faction-form-title').textContent = id ? '세력 편집' : (defaultParentId ? '하위 부서 추가' : '세력 추가');

    // Populate parent select
    const parentSel = document.getElementById('faction-form-parent');
    parentSel.innerHTML = '<option value="">없음 (최상위 대세력 / 독립 조직)</option>';
    const rootFactions = (App.state.factions || []).filter(f => !f.parent_id && f.id !== id);
    rootFactions.forEach(rf => {
      const opt = document.createElement('option');
      opt.value = rf.id;
      opt.textContent = `[대세력] ${rf.name}`;
      parentSel.appendChild(opt);
    });

    if (id) {
      const f = App.state.factions.find(x => x.id === id);
      if (f) {
        document.getElementById('faction-form-name').value = f.name;
        document.getElementById('faction-form-desc').value = f.description || '';
        document.getElementById('faction-form-color').value = f.color || '#888888';
        parentSel.value = f.parent_id || '';
      }
    } else {
      document.getElementById('faction-form-name').value = '';
      document.getElementById('faction-form-desc').value = '';
      document.getElementById('faction-form-color').value = '#888888';
      parentSel.value = defaultParentId || '';
    }
    App.openModal('modal-faction-form');
  }

  async function saveFaction() {
    try {
      const name = document.getElementById('faction-form-name').value.trim();
      if (!name) { alert('세력명을 입력해주세요.'); return; }
      const id = document.getElementById('faction-form-id').value;
      const parentIdVal = document.getElementById('faction-form-parent').value;

      const data = {
        name,
        description: document.getElementById('faction-form-desc').value.trim(),
        color: document.getElementById('faction-form-color').value,
        parent_id: parentIdVal ? Number(parentIdVal) : null,
      };

      if (id) {
        await window.api.updateFaction(Number(id), data);
      } else {
        await window.api.createFaction(data);
      }

      await App.loadAll();
      App.closeModal('modal-faction-form');
      render();
      // Re-populate faction filters in other pages
      Characters.render();
      App.showToast('세력 정보가 저장되었습니다.');
    } catch (err) {
      console.error('Failed to save faction:', err);
      alert('세력 저장 중 오류: ' + err.message);
    }
  }

  async function deleteFaction(id) {
    const confirmed = await App.confirm('이 세력(또는 부서)을 삭제하시겠습니까?');
    if (!confirmed) return;
    await window.api.deleteFaction(id);
    await App.loadAll();
    render();
    Characters.render();
    App.showToast('세력이 삭제되었습니다.');
  }

  function initEvents() {
    document.getElementById('btn-new-faction')?.addEventListener('click', () => openForm());
    document.getElementById('btn-save-faction')?.addEventListener('click', saveFaction);
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { render, openForm, deleteFaction };
})();

window.Factions = Factions;
