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

function getStatusMeta(status, customText) {
  switch (status) {
    case 'deceased':
      return { key: 'deceased', label: '사망 (스토리 시작 전)', badgeClass: 'status-deceased', icon: '⚫', short: '사망' };
    case 'comatose':
      return { key: 'comatose', label: '의식불명', badgeClass: 'status-comatose', icon: '🟣', short: '의식불명' };
    case 'missing':
      return { key: 'missing', label: '행방불명', badgeClass: 'status-missing', icon: '🟡', short: '행방불명' };
    case 'custom':
      const txt = (customText || '').trim() || '기타';
      return { key: 'custom', label: txt, badgeClass: 'status-custom', icon: '🔵', short: txt };
    case 'alive':
    default:
      return { key: 'alive', label: '생존 / 활동 중', badgeClass: 'status-alive', icon: '🟢', short: '생존' };
  }
}
window.getStatusMeta = getStatusMeta;

const Characters = (() => {
  let viewMode = 'grid'; // 'grid' | 'list'
  let currentDetailId = null;

  // Form State
  let formImages = [];
  let formAvatarPath = '';
  let formAvatarCrop = '';
  let formPalette = [];
  let formExtraProfiles = [];
  let formCustomSections = [];

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
    const filterEp = document.getElementById('filter-episodes')?.value || '';
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
    if (filterEp === 'unappeared') {
      list = list.filter(c => (c.episode_count || 0) === 0);
    } else if (filterEp === 'appeared') {
      list = list.filter(c => (c.episode_count || 0) > 0);
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
      if (sortBy === 'episodes_desc') {
        const epDiff = (b.episode_count || 0) - (a.episode_count || 0);
        return epDiff !== 0 ? epDiff : (a.name || '').localeCompare(b.name || '', 'ko');
      }
      if (sortBy === 'episodes_asc') {
        const epDiff = (a.episode_count || 0) - (b.episode_count || 0);
        return epDiff !== 0 ? epDiff : (a.name || '').localeCompare(b.name || '', 'ko');
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

      const sMeta = getStatusMeta(c.status, c.status_custom);
      if (c.status === 'deceased') {
        card.classList.add('is-deceased');
      }

      const avatarSrc = getAvatarSrc(c);
      const avatarHtml = avatarSrc
        ? `<img class="char-card-image" src="${avatarSrc}" alt="${escHtml(c.name)}" />`
        : `<div class="char-card-avatar" style="background:${strColor(c.name)}">${escHtml((c.name || '?')[0])}</div>`;

      const factionBadges = (c.factions || []).map(f =>
        `<span class="faction-badge" style="background:${f.color}">${escHtml(f.name)}</span>`
      ).join('');

      const metaParts = [];
      if (c.age != null) metaParts.push(`${c.age}세`);
      if (c.height != null) metaParts.push(`${c.height}cm`);
      if (c.gender) metaParts.push(c.gender);
      if (c.origin) metaParts.push(c.origin);
      const meta = metaParts.join(' · ');

      const epCount = c.episode_count || 0;
      const epBadge = epCount === 0
        ? `<span class="char-ep-badge unappeared" title="에피소드 미등장 인물">미등장</span>`
        : `<span class="char-ep-badge appeared" title="총 에피소드 출연 횟수">📖 ${epCount}회</span>`;

      const statusBadge = (c.status && c.status !== 'alive')
        ? `<span class="card-status-pill ${sMeta.badgeClass}" title="${escHtml(sMeta.label)}">${sMeta.icon} ${escHtml(sMeta.short)}</span>`
        : '';

      card.innerHTML = `
        ${statusBadge}
        <div class="char-card-top-badges">
          ${epBadge}
        </div>
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
      const sMeta = getStatusMeta(c.status, c.status_custom);
      const statusTag = (c.status && c.status !== 'alive')
        ? `<span class="char-status-badge ${sMeta.badgeClass}" style="margin-left:6px;font-size:11px;padding:2px 7px;">${sMeta.icon} ${escHtml(sMeta.short)}</span>`
        : '';

      const factions = (c.factions || []).map(f =>
        `<span class="faction-badge" style="background:${f.color}">${escHtml(f.name)}</span>`
      ).join(' ');
      const epCount = c.episode_count || 0;
      const epBadge = epCount > 0
        ? `<span class="char-ep-badge appeared">📖 ${epCount}회</span>`
        : `<span class="char-ep-badge unappeared">미등장</span>`;

      tr.innerHTML = `
        <td><strong>${escHtml(c.name)}</strong>${statusTag}</td>
        <td>${c.age != null ? c.age + '세' : '-'}</td>
        <td>${c.height != null ? c.height + 'cm' : '-'}</td>
        <td>${escHtml(c.gender || '-')}</td>
        <td>${escHtml(c.origin || '-')}</td>
        <td>${factions || '-'}</td>
        <td>${epBadge}</td>
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
  async function openDetail(id, options = {}) {
    currentDetailId = id;
    const c = await window.api.getCharacter(id);
    if (!c) return;

    // Return to episode button setup
    const returnBtn = document.getElementById('btn-return-to-episode');
    if (returnBtn) {
      if (options && options.returnToEpisodeId) {
        returnBtn.classList.remove('hidden');
        returnBtn.onclick = () => {
          App.closeModal('modal-char-detail');
          if (window.Episodes) {
            window.Episodes.openDetail(options.returnToEpisodeId);
          }
        };
      } else {
        returnBtn.classList.add('hidden');
      }
    }

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

    // Status Badge & Text
    const sMeta = getStatusMeta(c.status, c.status_custom);
    const statusBadgeEl = document.getElementById('detail-status-badge');
    if (statusBadgeEl) {
      statusBadgeEl.className = 'char-status-badge ' + sMeta.badgeClass;
      statusBadgeEl.innerHTML = `${sMeta.icon} ${escHtml(sMeta.label)}`;
    }
    const statusTextEl = document.getElementById('detail-status-text');
    if (statusTextEl) {
      statusTextEl.textContent = sMeta.label;
    }

    // Meta
    document.getElementById('detail-age').textContent = c.age != null ? `${c.age}세` : '-';
    document.getElementById('detail-birthdate').textContent = c.birthdate || '-';
    document.getElementById('detail-gender').textContent = c.gender || '-';
    document.getElementById('detail-origin').textContent = c.origin || '-';
    const heightEl = document.getElementById('detail-height');
    if (heightEl) heightEl.textContent = c.height != null ? `${c.height}cm` : '-';
    const epCountEl = document.getElementById('detail-episode-count');
    if (epCountEl) epCountEl.textContent = `${c.episode_count || 0}회`;
    const epTabCountEl = document.getElementById('detail-ep-tab-count');
    if (epTabCountEl) epTabCountEl.textContent = (c.episodes ? c.episodes.length : 0);

    // Factions
    const factionsEl = document.getElementById('detail-factions');
    factionsEl.innerHTML = (c.factions || []).map(f =>
      `<span class="faction-badge" style="background:${f.color}">${escHtml(f.name)}${f.role ? ' · ' + escHtml(f.role) : ''}</span>`
    ).join('') || '<span class="text-muted">없음</span>';

    // Palette Swatches
    const paletteListEl = document.getElementById('detail-palette-list');
    if (paletteListEl) {
      const palette = Array.isArray(c.color_palette) ? c.color_palette : [];
      if (palette.length === 0) {
        paletteListEl.innerHTML = '<span class="text-muted" style="font-size:12px;">등록된 컬러 팔레트가 없습니다.</span>';
      } else {
        paletteListEl.innerHTML = palette.map(p => `
          <div class="detail-palette-chip" data-hex="${escHtml(p.hex || '')}" title="클릭하여 ${escHtml(p.hex || '')} 복사">
            <span class="detail-palette-dot" style="background:${escHtml(p.hex || '#ccc')}"></span>
            ${p.name ? `<span class="detail-palette-name">${escHtml(p.name)}</span>` : ''}
            <span class="detail-palette-hex">${escHtml(p.hex || '')}</span>
          </div>
        `).join('');

        paletteListEl.querySelectorAll('.detail-palette-chip').forEach(chip => {
          chip.addEventListener('click', async () => {
            const hex = chip.dataset.hex;
            if (!hex) return;
            try {
              if (window.api && window.api.copyText) {
                await window.api.copyText(hex);
              } else {
                await navigator.clipboard.writeText(hex);
              }
              if (App.showToast) {
                App.showToast(`색상 코드 ${hex}가 클립보드에 복사되었습니다!`);
              }
            } catch (err) {
              console.error(err);
            }
          });
        });
      }
    }

    // Relationships
    const relsEl = document.getElementById('detail-relationships');
    if (!c.relationships || c.relationships.length === 0) {
      relsEl.innerHTML = '<span class="text-muted">연결된 관계 없음</span>';
    } else {
      relsEl.innerHTML = c.relationships.map(r => {
        const isA = r.char_a_id === id;
        const other = isA ? r.char_b_name : r.char_a_name;
        const otherId = isA ? r.char_b_id : r.char_a_id;

        let tagHtml = '';
        if (r.is_mutual) {
          const col = r.color || '#7c6af7';
          tagHtml = `<span class="rel-type-tag" style="background:${col};padding:2px 8px;font-size:11px;">${escHtml(r.type || '관계')}</span>`;
        } else {
          const myRel = isA ? r.type : r.type_b_to_a;
          const colMy = isA ? (r.color || '#7c6af7') : (r.color_b_to_a || '#7c6af7');
          const theirRel = isA ? r.type_b_to_a : r.type;
          const colTheir = isA ? (r.color_b_to_a || '#7c6af7') : (r.color || '#7c6af7');

          const parts = [];
          if (myRel) {
            parts.push(`<span class="rel-type-tag" style="background:${colMy};padding:1px 6px;font-size:10px;">➔ ${escHtml(myRel)}</span>`);
          }
          if (theirRel) {
            parts.push(`<span class="rel-type-tag" style="background:${colTheir};padding:1px 6px;font-size:10px;">⬅ ${escHtml(theirRel)}</span>`);
          }
          tagHtml = `<span style="display:inline-flex;gap:4px;vertical-align:middle;">${parts.join('')}</span>`;
        }

        return `<div class="rel-item" style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <div>
            ${tagHtml}
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

    // 1) 메인 프로필 렌더링
    renderMd(document.getElementById('detail-profile-main'), c.profile_public, '등록된 메인 프로필이 없습니다.');
    const copyMainBtn = document.getElementById('btn-copy-main-profile');
    if (copyMainBtn) {
      copyMainBtn.onclick = async () => {
        if (!c.profile_public) { App.showToast('복사할 메인 프로필이 없습니다.'); return; }
        await window.api.copyText(c.profile_public);
        App.showToast('📋 메인 프로필이 클립보드에 복사되었습니다!');
      };
    }

    // 2) 추가 프로필 목록 렌더링
    const extraContainer = document.getElementById('detail-extra-profiles-container');
    if (extraContainer) {
      extraContainer.innerHTML = '';
      const extras = Array.isArray(c.extra_profiles) ? c.extra_profiles : [];
      extras.forEach((item, idx) => {
        const title = item.title || `추가 프로필 #${idx + 1}`;
        const card = document.createElement('div');
        card.className = 'profile-card-block';
        card.innerHTML = `
          <div class="profile-tab-header">
            <span class="sub-label">${escHtml(title)}</span>
            <button type="button" class="btn-secondary btn-sm btn-copy-extra">📋 복사</button>
          </div>
          <div class="detail-text extra-profile-body"></div>
        `;
        renderMd(card.querySelector('.extra-profile-body'), item.content, '내용이 없습니다.');
        card.querySelector('.btn-copy-extra').onclick = async () => {
          if (!item.content) { App.showToast('복사할 내용이 없습니다.'); return; }
          await window.api.copyText(item.content);
          App.showToast(`📋 [${title}] 내용이 클립보드에 복사되었습니다!`);
        };
        extraContainer.appendChild(card);
      });
    }

    // 3) 그 외 정보 (커스텀 항목) 렌더링
    const customContainer = document.getElementById('detail-custom-sections-container');
    if (customContainer) {
      customContainer.innerHTML = '';
      const customSections = Array.isArray(c.custom_sections) ? c.custom_sections : [];
      if (customSections.length === 0) {
        customContainer.innerHTML = '<div class="empty-state" style="padding:28px 0;">등록된 추가 정보(과거사, 능력, 특이사항 등)가 없습니다. 편집에서 자유롭게 추가해보세요.</div>';
      } else {
        customSections.forEach((item, idx) => {
          const title = item.title || `항목 #${idx + 1}`;
          const card = document.createElement('div');
          card.className = 'profile-card-block';
          card.innerHTML = `
            <div class="profile-tab-header">
              <span class="sub-label">${escHtml(title)}</span>
              <button type="button" class="btn-secondary btn-sm btn-copy-custom">📋 복사</button>
            </div>
            <div class="detail-text custom-section-body"></div>
          `;
          renderMd(card.querySelector('.custom-section-body'), item.content, '내용이 없습니다.');
          card.querySelector('.btn-copy-custom').onclick = async () => {
            if (!item.content) { App.showToast('복사할 내용이 없습니다.'); return; }
            await window.api.copyText(item.content);
            App.showToast(`📋 [${title}] 내용이 클립보드에 복사되었습니다!`);
          };
          customContainer.appendChild(card);
        });
      }
    }

    // Episodes tab
    const epListEl = document.getElementById('detail-episodes-list');
    if (epListEl) {
      if (!c.episodes || c.episodes.length === 0) {
        epListEl.innerHTML = '<div class="empty-state" style="padding:24px 0;">아직 출연한 에피소드가 없습니다.</div>';
      } else {
        epListEl.innerHTML = c.episodes.map(ep => {
          let roleBadge = '';
          if (ep.role_type === 'main') {
            roleBadge = '<span class="char-chip main">주요</span>';
          } else if (ep.role_type === 'sub') {
            roleBadge = '<span class="char-chip sub">조연</span>';
          } else {
            roleBadge = '<span class="char-chip mentioned">💬 언급</span>';
          }
          return `
            <div class="detail-ep-item" data-ep-id="${ep.id}">
              <div class="detail-ep-info">
                ${roleBadge}
                <strong class="detail-ep-title">${escHtml(ep.title)}</strong>
              </div>
              <button type="button" class="btn-secondary btn-xs btn-go-ep" data-ep-id="${ep.id}">에피소드 보기 ↗</button>
            </div>
          `;
        }).join('');
        epListEl.querySelectorAll('.btn-go-ep, .detail-ep-item').forEach(el => {
          el.addEventListener('click', (e) => {
            const epId = Number(el.dataset.epId);
            if (!epId) return;
            App.closeModal('modal-char-detail');
            App.navigate('episodes');
            if (window.Episodes) window.Episodes.openDetail(epId);
          });
        });
      }
    }

    // Prompt tab
    const promptBox = document.getElementById('detail-prompt');
    promptBox.textContent = c.prompt || '등록된 생성 프롬프트가 없습니다.';
    const copyPromptBtn = document.getElementById('btn-copy-prompt');
    copyPromptBtn.onclick = async () => {
      if (!c.prompt) { App.showToast('복사할 프롬프트가 없습니다.'); return; }
      await window.api.copyText(c.prompt);
      App.showToast('📋 프롬프트가 클립보드에 복사되었습니다!');
    };

    // Gallery tab
    renderDetailGallery(c);

    // Reset tabs to first tab
    const detailModal = document.getElementById('modal-char-detail');
    detailModal.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    detailModal.querySelectorAll('.tab-content').forEach((tc, i) => tc.classList.toggle('hidden', i !== 0));

    // Footer buttons
    document.getElementById('btn-export-profile-card').onclick = () => {
      openProfileCardExport(id);
    };
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
     'form-profile-main', 'form-prompt'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const bMonth = document.getElementById('form-birth-month');
    const bDay = document.getElementById('form-birth-day');
    if (bMonth) bMonth.value = '';
    if (bDay) bDay.value = '';

    const statusSel = document.getElementById('form-status');
    if (statusSel) statusSel.value = 'alive';
    const statusCustom = document.getElementById('form-status-custom');
    if (statusCustom) {
      statusCustom.value = '';
      statusCustom.classList.add('hidden');
    }

    formPalette = [];
    renderFormPalette();

    formExtraProfiles = [];
    renderFormExtraProfiles();

    formCustomSections = [];
    renderFormCustomSections();

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
    document.getElementById('form-profile-main').value = c.profile_public || '';
    document.getElementById('form-prompt').value = c.prompt || '';

    // Status
    const statusVal = c.status || 'alive';
    const statusSel = document.getElementById('form-status');
    if (statusSel) statusSel.value = statusVal;
    const statusCustom = document.getElementById('form-status-custom');
    if (statusCustom) {
      statusCustom.value = c.status_custom || '';
      if (statusVal === 'custom') {
        statusCustom.classList.remove('hidden');
      } else {
        statusCustom.classList.add('hidden');
      }
    }

    // Palette
    formPalette = Array.isArray(c.color_palette)
      ? c.color_palette.map(p => ({ hex: p.hex || '#000000', name: p.name || '' }))
      : [];
    renderFormPalette();

    // Extra Profiles
    formExtraProfiles = Array.isArray(c.extra_profiles)
      ? c.extra_profiles.map(p => ({ ...p }))
      : [];
    renderFormExtraProfiles();

    // Custom Sections (그 외 정보)
    formCustomSections = Array.isArray(c.custom_sections)
      ? c.custom_sections.map(s => ({ ...s }))
      : [];
    renderFormCustomSections();

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

  function renderFormPalette() {
    const container = document.getElementById('form-palette-items');
    if (!container) return;
    container.innerHTML = '';

    if (formPalette.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:16px;">등록된 색상이 없습니다. 위 [+ 색상 추가] 버튼을 눌러 등록하세요.</div>';
      return;
    }

    formPalette.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'form-palette-row';

      const validHex = /^#[0-9A-Fa-f]{6}$/.test(item.hex || '') ? item.hex : '#4a90e2';

      row.innerHTML = `
        <input type="color" class="palette-color-picker" value="${validHex}" title="색상 선택기" />
        <input type="text" class="form-input palette-hex-input" value="${escHtml(item.hex || '')}" placeholder="#RRGGBB" maxlength="9" />
        <input type="text" class="form-input palette-name-input" value="${escHtml(item.name || '')}" placeholder="부위명 (머리카락, 눈동자, 피부, 의상 등)" />
        <button type="button" class="btn-ghost btn-del-palette" title="삭제">✕</button>
      `;

      const colorPicker = row.querySelector('.palette-color-picker');
      const hexInput = row.querySelector('.palette-hex-input');
      const nameInput = row.querySelector('.palette-name-input');
      const delBtn = row.querySelector('.btn-del-palette');

      colorPicker.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase();
        hexInput.value = val;
        formPalette[idx].hex = val;
      });

      hexInput.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (val && !val.startsWith('#')) {
          val = '#' + val;
          e.target.value = val;
        }
        formPalette[idx].hex = val;
        if (/^#[0-9A-Fa-f]{6}$/i.test(val)) {
          colorPicker.value = val;
        }
      });

      nameInput.addEventListener('input', (e) => {
        formPalette[idx].name = e.target.value;
      });

      delBtn.addEventListener('click', () => {
        formPalette.splice(idx, 1);
        renderFormPalette();
      });

      container.appendChild(row);
    });
  }

  function addPaletteItem(hex = '#4a90e2', name = '') {
    formPalette.push({ hex, name });
    renderFormPalette();
  }

  // ── Extra Profiles (추가 프로필) Form Management ──
  function renderFormExtraProfiles() {
    const container = document.getElementById('form-extra-profiles-list');
    if (!container) return;
    container.innerHTML = '';

    if (formExtraProfiles.length === 0) {
      container.innerHTML = '<span class="text-muted" style="font-size:12px;padding:6px 0;display:block;">등록된 추가 프로필이 없습니다. 위 [+ 프로필 추가] 버튼으로 추가하세요.</span>';
      return;
    }

    formExtraProfiles.forEach((item, idx) => {
      const block = document.createElement('div');
      block.className = 'dynamic-section-form-item';
      block.innerHTML = `
        <div class="dynamic-section-form-header">
          <input type="text" class="dynamic-section-title-input profile-title-input" value="${escHtml(item.title || '')}" placeholder="프로필 제목 (예: 비밀 프로필, 과거 프로필, 2부 프로필 등)" />
          <button type="button" class="btn-secondary btn-sm btn-copy-section-form" title="내용 클립보드 복사">📋 복사</button>
          <button type="button" class="btn-ghost btn-del-section-form" title="삭제" style="color:var(--danger);font-size:13px;padding:3px 8px;">✕</button>
        </div>
        <textarea class="form-textarea profile-content-textarea" rows="7" placeholder="해당 프로필 내용을 자유롭게 입력하거나 마크다운으로 붙여넣으세요...">${escHtml(item.content || '')}</textarea>
      `;

      const titleInput = block.querySelector('.profile-title-input');
      const contentTextarea = block.querySelector('.profile-content-textarea');
      const copyBtn = block.querySelector('.btn-copy-section-form');
      const delBtn = block.querySelector('.btn-del-section-form');

      titleInput.addEventListener('input', (e) => {
        formExtraProfiles[idx].title = e.target.value;
      });
      contentTextarea.addEventListener('input', (e) => {
        formExtraProfiles[idx].content = e.target.value;
      });
      copyBtn.onclick = async () => {
        const text = contentTextarea.value;
        if (!text) { App.showToast('복사할 내용이 없습니다.'); return; }
        await window.api.copyText(text);
        App.showToast(`📋 [${titleInput.value || '프로필'}] 내용이 복사되었습니다!`);
      };
      delBtn.onclick = () => {
        formExtraProfiles.splice(idx, 1);
        renderFormExtraProfiles();
      };

      container.appendChild(block);
    });
  }

  function addExtraProfile(title = '', content = '') {
    formExtraProfiles.push({
      id: 'ep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: title || '새 추가 프로필',
      content: content || ''
    });
    renderFormExtraProfiles();
    setTimeout(() => {
      const inputs = document.querySelectorAll('.profile-title-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 50);
  }

  // ── Custom Sections (그 외 정보) Form Management ──
  function renderFormCustomSections() {
    const container = document.getElementById('form-custom-sections-list');
    if (!container) return;
    container.innerHTML = '';

    if (formCustomSections.length === 0) {
      container.innerHTML = '<span class="text-muted" style="font-size:12px;padding:6px 0;display:block;">등록된 추가 정보가 없습니다. 위 [+ 항목 추가] 버튼으로 과거사, 능력, 특이사항 등을 추가해보세요.</span>';
      return;
    }

    formCustomSections.forEach((item, idx) => {
      const block = document.createElement('div');
      block.className = 'dynamic-section-form-item';
      block.innerHTML = `
        <div class="dynamic-section-form-header">
          <input type="text" class="dynamic-section-title-input custom-title-input" value="${escHtml(item.title || '')}" placeholder="항목 이름 (예: 과거사, 보유 능력, 특이사항, 장비 등)" />
          <button type="button" class="btn-secondary btn-sm btn-copy-custom-form" title="내용 클립보드 복사">📋 복사</button>
          <button type="button" class="btn-ghost btn-del-custom-form" title="삭제" style="color:var(--danger);font-size:13px;padding:3px 8px;">✕</button>
        </div>
        <textarea class="form-textarea custom-content-textarea" rows="7" placeholder="해당 항목 내용을 자유롭게 입력하거나 마크다운으로 붙여넣으세요...">${escHtml(item.content || '')}</textarea>
      `;

      const titleInput = block.querySelector('.custom-title-input');
      const contentTextarea = block.querySelector('.custom-content-textarea');
      const copyBtn = block.querySelector('.btn-copy-custom-form');
      const delBtn = block.querySelector('.btn-del-custom-form');

      titleInput.addEventListener('input', (e) => {
        formCustomSections[idx].title = e.target.value;
      });
      contentTextarea.addEventListener('input', (e) => {
        formCustomSections[idx].content = e.target.value;
      });
      copyBtn.onclick = async () => {
        const text = contentTextarea.value;
        if (!text) { App.showToast('복사할 내용이 없습니다.'); return; }
        await window.api.copyText(text);
        App.showToast(`📋 [${titleInput.value || '항목'}] 내용이 복사되었습니다!`);
      };
      delBtn.onclick = () => {
        formCustomSections.splice(idx, 1);
        renderFormCustomSections();
      };

      container.appendChild(block);
    });
  }

  function addCustomSection(title = '', content = '') {
    formCustomSections.push({
      id: 'cs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: title || '새 항목',
      content: content || ''
    });
    renderFormCustomSections();
    setTimeout(() => {
      const inputs = document.querySelectorAll('.custom-title-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 50);
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

    const statusVal = document.getElementById('form-status')?.value || 'alive';
    const statusCustomVal = (document.getElementById('form-status-custom')?.value || '').trim();

    return {
      name,
      aliases,
      status: statusVal,
      status_custom: statusVal === 'custom' ? statusCustomVal : '',
      color_palette: formPalette.filter(p => p.hex && p.hex.trim()),
      extra_profiles: formExtraProfiles.filter(p => (p.title && p.title.trim()) || (p.content && p.content.trim())),
      custom_sections: formCustomSections.filter(s => (s.title && s.title.trim()) || (s.content && s.content.trim())),
      profile_public: document.getElementById('form-profile-main')?.value.trim() || null,
      profile_secret: null,
      appearance: null,
      personality: null,
      age: ageVal !== '' ? Number(ageVal) : null,
      height: heightVal !== '' ? Number(heightVal) : null,
      birthdate: document.getElementById('form-birthdate').value.trim() || null,
      gender: document.getElementById('form-gender').value.trim() || null,
      origin: document.getElementById('form-origin').value.trim() || null,
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
    ['char-search', 'filter-faction', 'filter-gender', 'filter-episodes', 'sort-by'].forEach(id => {
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

    // Form Status change
    const formStatusSel = document.getElementById('form-status');
    const formStatusCustomInput = document.getElementById('form-status-custom');
    if (formStatusSel && formStatusCustomInput) {
      formStatusSel.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          formStatusCustomInput.classList.remove('hidden');
          formStatusCustomInput.focus();
        } else {
          formStatusCustomInput.classList.add('hidden');
        }
      });
    }

    // Add palette item button
    document.getElementById('btn-add-palette-item')?.addEventListener('click', () => {
      addPaletteItem();
    });

    // Add extra profile button
    document.getElementById('btn-add-extra-profile')?.addEventListener('click', () => {
      addExtraProfile();
    });

    // Add custom section (그 외 정보) button
    document.getElementById('btn-add-custom-section')?.addEventListener('click', () => {
      addCustomSection();
    });

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

    // Height comparison button
    document.getElementById('btn-open-height-compare')?.addEventListener('click', () => openHeightCompare());
    document.getElementById('btn-hc-add-char')?.addEventListener('click', () => {
      CharPicker.open({
        title: '키 비교에 캐릭터 추가 (최대 8명)',
        onSelect: (c) => {
          addCharToHeightCompare(c.id);
        }
      });
    });

    // Profile card export buttons
    document.getElementById('btn-card-copy-clipboard')?.addEventListener('click', copyProfileCardToClipboard);
    document.getElementById('btn-card-save-png')?.addEventListener('click', saveProfileCardAsPng);

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

  // ═════════════════════════════════════════════════════════════════════
  // ── 📏 키 비교 차트 (Visual Height Comparison) ──────────────────────
  // ═════════════════════════════════════════════════════════════════════
  let _hcCharIds = [];
  let _hcBaselineId = null;

  function openHeightCompare(targetCharId = null) {
    if (_hcCharIds.length === 0) {
      const withHeight = (App.state.characters || []).filter(c => c.height != null && c.height > 0);
      if (withHeight.length > 0) {
        _hcCharIds = withHeight.slice(0, 4).map(c => c.id);
      } else {
        _hcCharIds = (App.state.characters || []).slice(0, 4).map(c => c.id);
      }
    }
    if (targetCharId && !_hcCharIds.includes(targetCharId)) {
      if (_hcCharIds.length >= 8) _hcCharIds.shift();
      _hcCharIds.push(targetCharId);
    }
    if (targetCharId) {
      _hcBaselineId = targetCharId;
    } else if (!_hcBaselineId && _hcCharIds.length > 0) {
      _hcBaselineId = _hcCharIds[0];
    }
    renderHeightChart();
    App.openModal('modal-height-compare');
  }

  function addCharToHeightCompare(charId) {
    if (_hcCharIds.includes(charId)) {
      App.showToast('이미 비교 목록에 추가되어 있습니다.');
      return;
    }
    if (_hcCharIds.length >= 8) {
      App.showToast('최대 8명까지만 동시에 비교할 수 있습니다.');
      return;
    }
    _hcCharIds.push(charId);
    if (!_hcBaselineId) _hcBaselineId = charId;
    renderHeightChart();
  }

  function removeCharFromHeightCompare(charId) {
    _hcCharIds = _hcCharIds.filter(id => id !== charId);
    if (_hcBaselineId === charId) {
      _hcBaselineId = _hcCharIds[0] || null;
    }
    renderHeightChart();
  }

  function renderHeightChart() {
    const chipsContainer = document.getElementById('hc-chips-list');
    const chartView = document.getElementById('hc-chart-view');
    if (!chipsContainer || !chartView) return;

    const chars = _hcCharIds
      .map(id => (App.state.characters || []).find(c => c.id === id))
      .filter(Boolean);

    // 1. 칩 리스트
    chipsContainer.innerHTML = chars.map(c => `
      <div class="hc-chip ${c.id === _hcBaselineId ? 'is-baseline' : ''}">
        <span>${escHtml(c.name)} (${c.height != null ? c.height + 'cm' : '미등록'})</span>
        <button type="button" class="hc-chip-remove" data-id="${c.id}" title="제거">✕</button>
      </div>
    `).join('');

    chipsContainer.querySelectorAll('.hc-chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCharFromHeightCompare(Number(btn.dataset.id));
      });
    });

    if (chars.length === 0) {
      chartView.innerHTML = '<div class="empty-state" style="padding:40px;">비교할 캐릭터가 없습니다. 상단의 [+ 캐릭터 추가] 버튼을 눌러보세요!</div>';
      return;
    }

    // 2. 신장 스케일 계산
    const validHeights = chars.map(c => c.height).filter(h => h != null && h > 0);
    const minH = validHeights.length > 0 ? Math.min(130, Math.floor((Math.min(...validHeights) - 10) / 10) * 10) : 130;
    const maxH = validHeights.length > 0 ? Math.max(200, Math.ceil((Math.max(...validHeights) + 10) / 10) * 10) : 200;

    const baselineChar = chars.find(c => c.id === _hcBaselineId);
    const baselineHeight = baselineChar?.height || null;

    // 눈금선 라벨들 (10cm 단위)
    const rulerSteps = [];
    for (let h = minH; h <= maxH; h += 10) {
      rulerSteps.push(h);
    }

    const chartHeightPx = 360;

    const rulerLinesHtml = rulerSteps.map(h => {
      const bottomPct = ((h - minH) / (maxH - minH)) * 100;
      return `
        <div class="hc-ruler-line" style="bottom:${bottomPct}%;">
          <span class="hc-ruler-label">${h}cm</span>
        </div>
      `;
    }).join('');

    // 캐릭터 컬럼들
    const columnsHtml = chars.map(c => {
      const isBaseline = c.id === _hcBaselineId;
      const h = c.height;
      const hasHeight = (h != null && h > 0);
      const heightPct = hasHeight ? Math.max(5, Math.min(100, ((h - minH) / (maxH - minH)) * 100)) : 10;

      let diffHtml = '';
      if (isBaseline) {
        diffHtml = `<span class="hc-diff-badge baseline">기준</span>`;
      } else if (hasHeight && baselineHeight != null) {
        const diff = h - baselineHeight;
        if (diff > 0) diffHtml = `<span class="hc-diff-badge taller">+${diff}cm</span>`;
        else if (diff < 0) diffHtml = `<span class="hc-diff-badge shorter">${diff}cm</span>`;
        else diffHtml = `<span class="hc-diff-badge equal">±0cm</span>`;
      }

      const avatarSrc = (c.avatar_crop) || (c.avatar_path ? `file://${c.avatar_path}` : null);
      const avatarHtml = avatarSrc
        ? `<img class="hc-col-avatar" src="${avatarSrc}" alt="${escHtml(c.name)}" />`
        : `<div class="hc-col-avatar initial" style="background:${window.strColor ? window.strColor(c.name) : '#7c6af7'}">${escHtml((c.name || '?')[0])}</div>`;

      const primaryFaction = (c.factions && c.factions[0]) || null;
      const barColor = primaryFaction ? primaryFaction.color : '#7c6af7';

      return `
        <div class="hc-col ${isBaseline ? 'is-baseline' : ''}" data-id="${c.id}" title="클릭하여 비교 기준으로 설정">
          <!-- 상단 인물 정보 카드 -->
          <div class="hc-col-header">
            ${diffHtml}
            ${avatarHtml}
            <div class="hc-col-name">${escHtml(c.name)}</div>
            <div class="hc-col-height">${hasHeight ? `<strong>${h}</strong>cm` : '<span class="text-muted" style="font-size:11px;">미등록</span>'}</div>
          </div>

          <!-- 키 바 (Bar) -->
          <div class="hc-col-bar-wrap">
            <div class="hc-col-bar" style="height:${heightPct}%; background: linear-gradient(180deg, ${barColor}, rgba(124,106,247,0.3)); border-color:${barColor};">
              <span class="hc-col-bar-tip">${hasHeight ? `${h}cm` : '?'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    chartView.innerHTML = `
      <div class="hc-chart-grid" style="height:${chartHeightPx}px;">
        <div class="hc-ruler-axis">
          ${rulerLinesHtml}
        </div>
        <div class="hc-columns-container">
          ${columnsHtml}
        </div>
        <div class="hc-ground-line"></div>
      </div>
    `;

    chartView.querySelectorAll('.hc-col').forEach(col => {
      col.addEventListener('click', () => {
        _hcBaselineId = Number(col.dataset.id);
        renderHeightChart();
      });
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // ── 📷 미니 프로필 카드 내보내기 (Canvas 2D Export) ────────────────
  // ═════════════════════════════════════════════════════════════════════
  let _currentCardChar = null;

  async function openProfileCardExport(charId) {
    const c = await window.api.getCharacter(charId);
    if (!c) return;
    _currentCardChar = c;

    App.openModal('modal-card-export');
    await renderProfileCardCanvas(c);
  }

  async function renderProfileCardCanvas(c) {
    const canvas = document.getElementById('card-export-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = 800;
    const H = canvas.height = 460;

    // 1. 배경 그라데이션
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0d0d16');
    bgGrad.addColorStop(1, '#17172b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 미세 그리드 배경 장식
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 외곽 장식 테두리
    ctx.strokeStyle = 'rgba(124, 106, 247, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    // 2. 좌측 패널 (아바타 + 세력)
    const avatarX = 40, avatarY = 50, avatarSize = 180;

    // 아바타 이미지 로드
    const avatarSrc = (c.avatar_crop) || (c.avatar_path ? `file://${c.avatar_path}` : null);
    if (avatarSrc) {
      try {
        const img = new Image();
        img.src = avatarSrc;
        await new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });

        // 둥근 사각 클리핑
        ctx.save();
        ctx.beginPath();
        const cr = 16;
        ctx.moveTo(avatarX + cr, avatarY);
        ctx.lineTo(avatarX + avatarSize - cr, avatarY);
        ctx.quadraticCurveTo(avatarX + avatarSize, avatarY, avatarX + avatarSize, avatarY + cr);
        ctx.lineTo(avatarX + avatarSize, avatarY + avatarSize - cr);
        ctx.quadraticCurveTo(avatarX + avatarSize, avatarY + avatarSize, avatarX + avatarSize - cr, avatarY + avatarSize);
        ctx.lineTo(avatarX + cr, avatarY + avatarSize);
        ctx.quadraticCurveTo(avatarX, avatarY + avatarSize, avatarX, avatarY + avatarSize - cr);
        ctx.lineTo(avatarX, avatarY + cr);
        ctx.quadraticCurveTo(avatarX, avatarY, avatarX + cr, avatarY);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();

        // 테두리
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 3;
        ctx.strokeRect(avatarX, avatarY, avatarSize, avatarSize);
      } catch (e) {
        drawDefaultAvatar(ctx, c, avatarX, avatarY, avatarSize);
      }
    } else {
      drawDefaultAvatar(ctx, c, avatarX, avatarY, avatarSize);
    }

    // 세력 뱃지들 (아바타 아래)
    let factionY = avatarY + avatarSize + 20;
    ctx.font = 'bold 12px sans-serif';
    if (c.factions && c.factions.length > 0) {
      c.factions.slice(0, 3).forEach(f => {
        const fText = `${f.name}${f.role ? ' · ' + f.role : ''}`;
        const tw = ctx.measureText(fText).width;
        ctx.fillStyle = f.color || '#7c6af7';
        ctx.fillRect(avatarX, factionY, Math.min(180, tw + 16), 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(fText, avatarX + 8, factionY + 16);
        factionY += 30;
      });
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('소속: 무소속', avatarX, factionY + 16);
    }

    // 3. 우측 정보 영역
    const infoX = 260;
    let textY = 65;

    // 캐릭터 이름
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(c.name || '무명', infoX, textY);

    // 별명들
    if (c.aliases && c.aliases.length > 0) {
      ctx.font = 'italic 13px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`(${c.aliases.join(', ')})`, infoX + ctx.measureText(c.name || '').width + 12, textY - 2);
    }

    textY += 35;

    // 메타 그리드 (나이, 키, 성별, 생일, 출신지, 에피소드)
    const metaList = [
      { label: '나이', val: c.age != null ? `${c.age}세` : '-' },
      { label: '키', val: c.height != null ? `${c.height}cm` : '-' },
      { label: '성별', val: c.gender || '-' },
      { label: '생일', val: c.birthdate || '-' },
      { label: '출신지', val: c.origin || '-' },
      { label: '에피소드', val: `${c.episode_count || 0}회` },
    ];

    const colW = 160;
    metaList.forEach((m, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const mx = infoX + col * colW;
      const my = textY + row * 46;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.fillRect(mx, my, colW - 14, 38);
      ctx.strokeRect(mx, my, colW - 14, 38);

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#7c6af7';
      ctx.fillText(m.label.toUpperCase(), mx + 8, my + 14);

      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(m.val, mx + 8, my + 30);
    });

    textY += 115;

    // 구분선
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(infoX, textY);
    ctx.lineTo(W - 40, textY);
    ctx.stroke();

    textY += 24;

    // 프로필 소개 요약
    const summaryText = c.profile_public || '등록된 프로필 내용이 없습니다.';
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#cbd5e1';

    // 줄바꿈 렌더링 (최대 4줄)
    const maxLines = 4;
    const maxLineW = W - infoX - 50;
    const words = summaryText.replace(/\n+/g, ' ').split('');
    let currentLine = '';
    let lineCount = 0;

    for (let char of words) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxLineW) {
        ctx.fillText(currentLine, infoX, textY);
        textY += 22;
        currentLine = char;
        lineCount++;
        if (lineCount >= maxLines - 1) {
          currentLine += '...';
          break;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine && lineCount < maxLines) {
      ctx.fillText(currentLine, infoX, textY);
    }

    // 워터마크
    ctx.font = 'italic 11px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillText('⚔️ 세계관 빌더 — Character Profile Card', W - 230, H - 24);
  }

  function drawDefaultAvatar(ctx, c, x, y, size) {
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(x, y, size, size);
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = '#7c6af7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((c.name || '?')[0], x + size / 2, y + size / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  async function copyProfileCardToClipboard() {
    const canvas = document.getElementById('card-export-canvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const ok = await window.api.copyImageDataUrl(dataUrl);
    if (ok) App.showToast('📋 프로필 카드가 클립보드에 복사되었습니다! (Ctrl+V 로 붙여넣기 가능)');
    else App.showToast('이미지 복사 실패');
  }

  async function saveProfileCardAsPng() {
    const canvas = document.getElementById('card-export-canvas');
    if (!canvas || !_currentCardChar) return;
    const dataUrl = canvas.toDataURL('image/png');
    const safeName = (_currentCardChar.name || 'character').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    const ok = await window.api.saveImageDataUrl({
      dataUrl,
      defaultName: `${safeName}_profile_card.png`
    });
    if (ok) App.showToast('💾 프로필 카드 이미지가 저장되었습니다.');
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { render, openDetail, openForm, deleteChar, openHeightCompare, openProfileCardExport };
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
