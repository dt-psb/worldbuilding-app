/* ── calendar.js: 생일 달력 모듈 (연도 없이 월/일만) ── */
'use strict';

const Calendar = (() => {
  // 현재 표시 중인 월 (1~12)
  let _currentMonth = new Date().getMonth() + 1;
  let _eventsInitialized = false;

  function escH(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── 생일 파싱: "3월 15일" → { month: 3, day: 15 } ────────────────
  function parseBirthdate(bd) {
    if (!bd) return null;
    const mMatch = bd.match(/(\d+)월/);
    const dMatch = bd.match(/(\d+)일/);
    if (!mMatch) return null;
    return {
      month: parseInt(mMatch[1], 10),
      day: dMatch ? parseInt(dMatch[1], 10) : 0
    };
  }

  // ── 특정 월에 생일인 캐릭터 반환 ─────────────────────────────────
  function getBirthdayMap(month) {
    // Map: day → [character, ...]
    const map = {};
    const chars = App.state.characters || [];
    for (const c of chars) {
      const bd = parseBirthdate(c.birthdate);
      if (!bd || bd.month !== month) continue;
      const day = bd.day || 0;
      if (!map[day]) map[day] = [];
      map[day].push(c);
    }
    return map;
  }

  // ── 월별 날짜 수 ──────────────────────────────────────────────────
  function getDaysInMonth(month) {
    // 연도 무관, 윤년 평균으로 2월은 29일 허용
    const days = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month] || 30;
  }

  // 해당 월 1일의 요일 (임의 연도 2024 기준, 달력 표시용 레이아웃만)
  function getFirstDayOfWeek(month) {
    // 연도 무관 달력이므로 고정 연도(2024) 사용해 1일 요일 계산
    return new Date(2024, month - 1, 1).getDay(); // 0=일
  }

  // ── 렌더링 ────────────────────────────────────────────────────────
  function render() {
    updateMonthLabel();
    renderGrid();
    hidePanel();
    initEvents();
  }

  function updateMonthLabel() {
    const el = document.getElementById('cal-month-label');
    if (el) el.textContent = `${_currentMonth}월`;
  }

  function renderGrid() {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;

    const daysInMonth = getDaysInMonth(_currentMonth);
    const firstDow = getFirstDayOfWeek(_currentMonth);
    const bdMap = getBirthdayMap(_currentMonth);

    grid.innerHTML = '';

    // 빈 칸 채우기 (월요일 시작 → 일요일 시작 기준)
    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell cal-blank';
      grid.appendChild(blank);
    }

    // 날짜 칸
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay   = today.getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      const chars = bdMap[d] || [];
      const isToday = (_currentMonth === todayMonth && d === todayDay);
      cell.className = `cal-cell${chars.length > 0 ? ' has-birthday' : ''}${isToday ? ' today' : ''}`;
      cell.dataset.day = d;

      let birthdayHtml = '';
      if (chars.length > 0) {
        birthdayHtml = chars.slice(0, 3).map(c => {
          const avatarSrc = c.avatar_crop || (c.avatar_path ? `file://${c.avatar_path}` : null);
          if (avatarSrc) {
            return `<img class="cal-mini-avatar" src="${avatarSrc}" alt="${escH(c.name)}" title="${escH(c.name)}" />`;
          } else {
            const col = window.strColor ? window.strColor(c.name) : '#888';
            return `<span class="cal-mini-avatar cal-mini-initial" style="background:${col}" title="${escH(c.name)}">${escH((c.name || '?')[0])}</span>`;
          }
        }).join('');
        if (chars.length > 3) {
          birthdayHtml += `<span class="cal-more">+${chars.length - 3}</span>`;
        }
      }

      cell.innerHTML = `
        <span class="cal-day-num">${d}</span>
        <div class="cal-birthday-icons">${birthdayHtml}</div>
        ${chars.length > 0 ? `<span class="cal-birthday-count">🎂 ${chars.length}명</span>` : ''}
      `;

      if (chars.length > 0) {
        cell.addEventListener('click', () => showPanel(d, chars));
      }

      grid.appendChild(cell);
    }
  }

  // ── 사이드 패널 (생일인 캐릭터 목록) ─────────────────────────────
  function showPanel(day, chars) {
    const panel = document.getElementById('cal-birthday-panel');
    const label = document.getElementById('cal-selected-date-label');
    const container = document.getElementById('cal-birthday-chars');
    if (!panel || !label || !container) return;

    label.textContent = `${_currentMonth}월 ${day}일 생일`;
    container.innerHTML = chars.map(c => {
      const avatarSrc = c.avatar_crop || (c.avatar_path ? `file://${c.avatar_path}` : null);
      const avatarHtml = avatarSrc
        ? `<img class="cal-panel-avatar" src="${avatarSrc}" alt="${escH(c.name)}" />`
        : `<div class="cal-panel-avatar cal-panel-initial" style="background:${window.strColor ? window.strColor(c.name) : '#888'}">${escH((c.name||'?')[0])}</div>`;

      const factionBadges = (c.factions || []).map(f =>
        `<span class="faction-badge" style="background:${f.color};font-size:10px;padding:2px 6px;">${escH(f.name)}</span>`
      ).join('');

      return `
        <div class="cal-panel-char" data-char-id="${c.id}">
          ${avatarHtml}
          <div class="cal-panel-char-info">
            <div class="cal-panel-char-name">${escH(c.name)}</div>
            <div class="cal-panel-char-meta">
              ${c.age != null ? `${c.age}세` : ''}
              ${c.gender ? `· ${escH(c.gender)}` : ''}
              ${c.height != null ? `· ${c.height}cm` : ''}
            </div>
            ${factionBadges ? `<div style="margin-top:4px;">${factionBadges}</div>` : ''}
          </div>
          <span class="cal-birthday-cake">🎂</span>
        </div>
      `;
    }).join('');

    // 클릭 → 캐릭터 상세 모달
    container.querySelectorAll('.cal-panel-char').forEach(el => {
      el.addEventListener('click', () => {
        const id = Number(el.dataset.charId);
        if (window.Characters) Characters.openDetail(id);
      });
    });

    panel.classList.remove('hidden');
  }

  function hidePanel() {
    const panel = document.getElementById('cal-birthday-panel');
    if (panel) panel.classList.add('hidden');
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────────────
  function initEvents() {
    if (_eventsInitialized) return;
    _eventsInitialized = true;

    document.getElementById('cal-prev-month')?.addEventListener('click', () => {
      _currentMonth = _currentMonth <= 1 ? 12 : _currentMonth - 1;
      render();
    });

    document.getElementById('cal-next-month')?.addEventListener('click', () => {
      _currentMonth = _currentMonth >= 12 ? 1 : _currentMonth + 1;
      render();
    });

    document.getElementById('cal-panel-close')?.addEventListener('click', hidePanel);
  }

  return { render };
})();

window.Calendar = Calendar;
