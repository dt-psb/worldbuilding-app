/* ── graph.js: D3-force + HTML5 Canvas 하이브리드 그래프 ──
   - D3-force 알고리즘으로 물리 시뮬레이션
   - 렌더링은 Canvas로 (300명+ 관계선도 부드럽게)
   - SVG는 줌/팬 이벤트 레이어로만 사용
   ─────────────────────────────────────────────────────── */
'use strict';

const Graph = (() => {
  let simulation = null;
  let graphData  = null;

  // Canvas & context
  let canvas = null;
  let ctx    = null;
  let svgOverlay = null;         // 이벤트 캡처용 투명 SVG
  let zoomBehavior = null;

  // Transform state
  let transform = { x: 0, y: 0, k: 1 };

  // Hover / drag state
  let hoveredNode = null;
  let dragNode    = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let isDragging  = false;

  // Tooltip
  let tooltipEl = null;

  // Sizes
  let W = 1000, H = 700;

  // 관계 유형 색상
  const REL_COLORS = {
    '적대':    '#f43f5e',
    '우호':    '#10b981',
    '가족':    '#f59e0b',
    '연인':    '#ec4899',
    '동료':    '#3b82f6',
    '라이벌':  '#8b5cf6',
    '스승/제자':'#06b6d4',
    '기타':    '#64748b',
  };

  function getRelColor(type) {
    if (!type) return '#64748b';
    if (REL_COLORS[type]) return REL_COLORS[type];
    let hash = 0;
    for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
  }

  function isLight() {
    return document.body.classList.contains('light-theme');
  }

  // ── 데이터 ────────────────────────────────────────────────────────
  async function render() {
    graphData = await window.api.getGraphData();
    populateFactionFilter();
    setupCanvas();
    startSimulation();
  }

  function populateFactionFilter() {
    const sel = document.getElementById('filter-graph-faction');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">모든 세력</option>';
    (App.state.factions || []).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      sel.appendChild(opt);
    });
    sel.value = prev;
  }

  function getFilteredData() {
    if (!graphData) return { nodes: [], edges: [] };
    const factionFilter = document.getElementById('filter-graph-faction')?.value || '';
    const relTypeFilter  = document.getElementById('filter-graph-reltype')?.value  || '';

    let nodes = graphData.nodes || [];
    let edges = graphData.edges || [];

    if (factionFilter) {
      const nodeIds = new Set(
        nodes.filter(n => n.factions && n.factions.some(f => String(f.id) === factionFilter)).map(n => n.id)
      );
      nodes = nodes.filter(n => nodeIds.has(n.id));
      edges = edges.filter(e => nodeIds.has(e.char_a_id) && nodeIds.has(e.char_b_id));
    }

    if (relTypeFilter) {
      edges = edges.filter(e => (e.type || '') === relTypeFilter);
    }

    return { nodes, edges };
  }

  // ── Canvas 셋업 ───────────────────────────────────────────────────
  function setupCanvas() {
    const container = document.getElementById('graph-container');
    if (!container) return;

    // 기존 canvas / svg overlay 제거
    container.querySelectorAll('canvas.graph-canvas, svg.graph-svg-overlay').forEach(el => el.remove());
    container.querySelector('#graph-svg')?.setAttribute('style', 'display:none');

    W = container.clientWidth  || 1000;
    H = container.clientHeight || 700;

    // Canvas (렌더링 레이어)
    canvas = document.createElement('canvas');
    canvas.className = 'graph-canvas';
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');

    // SVG overlay (D3 줌/팬 이벤트 캡처용)
    svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgOverlay.setAttribute('class', 'graph-svg-overlay');
    svgOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    container.appendChild(svgOverlay);

    // D3 줌
    transform = d3.zoomIdentity;
    zoomBehavior = d3.zoom()
      .scaleExtent([0.05, 4])
      .on('zoom', e => {
        transform = e.transform;
        drawFrame();
      });
    d3.select(svgOverlay).call(zoomBehavior);

    // 마우스 이벤트 (hover, drag, click)
    svgOverlay.addEventListener('mousemove', onMouseMove);
    svgOverlay.addEventListener('mousedown', onMouseDown);
    svgOverlay.addEventListener('mouseup',   onMouseUp);
    svgOverlay.addEventListener('click',     onClick);
    svgOverlay.addEventListener('mouseleave',() => { hoveredNode = null; drawFrame(); hideTooltip(); });

    // Tooltip
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.style.cssText = `
        position:absolute;pointer-events:none;opacity:0;z-index:20;
        background:var(--sidebar-bg);border:1px solid var(--border);border-radius:8px;
        padding:8px 14px;font-size:12px;color:var(--text);
        box-shadow:0 4px 15px rgba(0,0,0,0.25);transition:opacity 0.1s;
        max-width:200px;
      `;
      container.style.position = 'relative';
      container.appendChild(tooltipEl);
    }
  }

  // ── D3 Simulation ─────────────────────────────────────────────────
  let simNodes = [], simEdges = [], degreeCount = {};

  function startSimulation() {
    if (simulation) { simulation.stop(); simulation = null; }

    const { nodes, edges } = getFilteredData();

    if (nodes.length === 0) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = isLight() ? '#64748b' : '#8899aa';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('표시할 캐릭터가 없습니다.', W / 2, H / 2);
      updateLegend([]);
      return;
    }

    simNodes = nodes.map(n => ({ ...n, x: W/2 + (Math.random()-0.5)*200, y: H/2 + (Math.random()-0.5)*200 }));
    const nodeMap = new Map(simNodes.map(n => [n.id, n]));

    degreeCount = {};
    edges.forEach(e => {
      degreeCount[e.char_a_id] = (degreeCount[e.char_a_id] || 0) + 1;
      degreeCount[e.char_b_id] = (degreeCount[e.char_b_id] || 0) + 1;
    });

    simEdges = edges.map(e => ({
      ...e,
      source: nodeMap.get(e.char_a_id),
      target: nodeMap.get(e.char_b_id),
    })).filter(e => e.source && e.target);

    // 노드 수에 따라 시뮬레이션 강도 조절
    const nodeCount = simNodes.length;
    const chargeStrength = nodeCount > 150 ? -180 : nodeCount > 50 ? -280 : -380;
    const linkDist      = nodeCount > 150 ?  120 : 150;

    simulation = d3.forceSimulation(simNodes)
      .force('link',      d3.forceLink(simEdges).id(d => d.id).distance(linkDist).strength(0.5))
      .force('charge',    d3.forceManyBody().strength(chargeStrength).distanceMax(400))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(d => nodeRadius(d) + 8))
      .velocityDecay(0.45)
      .alphaDecay(0.02)
      .on('tick', drawFrame);

    const usedTypes = [...new Set(simEdges.map(e => e.type).filter(Boolean))];
    updateLegend(usedTypes);
  }

  function nodeRadius(d) {
    return 14 + Math.min((degreeCount[d.id] || 0) * 2, 16);
  }

  // ── Canvas Draw ───────────────────────────────────────────────────
  function drawFrame() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const light = isLight();
    const labelColor = light ? '#0f172a' : '#f8fafc';
    const labelOutline = light ? 'rgba(241,245,249,0.9)' : 'rgba(18,19,30,0.9)';

    // ── 간선 그리기 ──
    simEdges.forEach(e => {
      if (!e.source || !e.target) return;
      const sx = e.source.x, sy = e.source.y;
      const tx = e.target.x, ty = e.target.y;
      const color = getRelColor(e.type);

      // Hover 강조
      const isHighlighted = hoveredNode &&
        (e.source.id === hoveredNode.id || e.target.id === hoveredNode.id);
      const isDimmed = hoveredNode && !isHighlighted;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.06 : isHighlighted ? 0.9 : 0.38;
      ctx.strokeStyle = color;
      ctx.lineWidth = isHighlighted ? 2.5 : e.is_mutual ? 2 : 1.5;

      // 적대관계 → 점선
      if (e.type === '적대') ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 관계 유형 레이블 (hover 시 또는 노드 적을 때)
      if (e.type && (isHighlighted || simNodes.length <= 60)) {
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.05 : isHighlighted ? 1 : 0.8;
        const fontSize = Math.max(9, Math.min(11, 11 / transform.k * 0.85));
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        const tw = ctx.measureText(e.type).width;
        const pw = tw + 12, ph = fontSize + 8;

        // 알약 배경
        ctx.fillStyle = light ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.92)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        roundRect(ctx, mx - pw/2, my - ph/2, pw, ph, 5);
        ctx.fill();
        ctx.stroke();

        // 텍스트
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.type, mx, my);
        ctx.restore();
      }
    });

    // ── 노드 그리기 ──
    simNodes.forEach(d => {
      const r = nodeRadius(d);
      const isHovered = hoveredNode && hoveredNode.id === d.id;
      const isDimmed  = hoveredNode && !isHovered && !simEdges.some(
        e => (e.source.id === hoveredNode.id && e.target.id === d.id) ||
             (e.target.id === hoveredNode.id && e.source.id === d.id)
      );

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.2 : 1;

      // 외곽 glow ring
      ctx.beginPath();
      ctx.arc(d.x, d.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = d.color || '#7c6af7';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = (isDimmed ? 0.05 : isHovered ? 0.7 : 0.25);
      ctx.stroke();

      // 메인 원
      ctx.globalAlpha = isDimmed ? 0.2 : 1;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fillStyle = d.color || '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      ctx.stroke();

      // 이니셜
      const fontSize = Math.min(r * 0.75, 18);
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((d.name || '?')[0], d.x, d.y);

      // 이름 레이블
      const labelSize = Math.max(9, Math.min(11, 10 / transform.k * 0.9));
      ctx.font = `600 ${labelSize}px system-ui, sans-serif`;
      ctx.strokeStyle = labelOutline;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = labelColor;
      const labelY = d.y + r + 5;
      ctx.strokeText(d.name || '', d.x, labelY);
      ctx.fillText(d.name || '', d.x, labelY);

      ctx.restore();
    });

    ctx.restore();
  }

  // ── RoundRect helper ──────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── 좌표 변환 ─────────────────────────────────────────────────────
  function screenToWorld(screenX, screenY) {
    return {
      x: (screenX - transform.x) / transform.k,
      y: (screenY - transform.y) / transform.k,
    };
  }

  function getNodeAt(screenX, screenY) {
    const { x, y } = screenToWorld(screenX, screenY);
    // 역순으로 검색 (위에 그려진 노드 먼저)
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const d = simNodes[i];
      const dx = d.x - x, dy = d.y - y;
      if (Math.sqrt(dx*dx + dy*dy) <= nodeRadius(d) + 4) return d;
    }
    return null;
  }

  // ── Mouse 이벤트 ─────────────────────────────────────────────────
  function getEventPos(e) {
    const rect = svgOverlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseMove(e) {
    const { x, y } = getEventPos(e);

    if (isDragging && dragNode) {
      const world = screenToWorld(x, y);
      dragNode.fx = world.x - dragOffsetX;
      dragNode.fy = world.y - dragOffsetY;
      if (simulation) simulation.alphaTarget(0.1).restart();
      drawFrame();
      return;
    }

    const hit = getNodeAt(x, y);
    if (hit !== hoveredNode) {
      hoveredNode = hit;
      svgOverlay.style.cursor = hit ? 'pointer' : 'grab';
      drawFrame();
    }

    if (hit) {
      const factionNames = (hit.factions || []).map(f => f.name).join(', ') || '없음';
      const conns = degreeCount[hit.id] || 0;
      tooltipEl.innerHTML = `
        <div style="font-weight:700;font-size:13px;color:var(--accent);margin-bottom:2px;">${hit.name}</div>
        <div style="font-size:11px;color:var(--text-muted);">소속: ${factionNames}</div>
        <div style="font-size:11px;color:var(--text-muted);">연결된 관계: <strong>${conns}개</strong></div>
        <div style="margin-top:4px;font-size:10px;color:var(--accent);">클릭 시 상세 프로필 오픈 ↗</div>
      `;
      const container = document.getElementById('graph-container');
      const rect = container.getBoundingClientRect();
      tooltipEl.style.left = (e.clientX - rect.left + 14) + 'px';
      tooltipEl.style.top  = (e.clientY - rect.top  - 10) + 'px';
      tooltipEl.style.opacity = '1';
    } else {
      hideTooltip();
    }
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    const { x, y } = getEventPos(e);
    const hit = getNodeAt(x, y);
    if (hit) {
      isDragging = true;
      dragNode = hit;
      const world = screenToWorld(x, y);
      dragOffsetX = world.x - hit.x;
      dragOffsetY = world.y - hit.y;
      hit.fx = hit.x;
      hit.fy = hit.y;
      // D3 줌 이벤트 차단
      d3.select(svgOverlay).on('.zoom', null);
      e.stopPropagation();
    }
  }

  function onMouseUp(e) {
    if (isDragging && dragNode) {
      isDragging = false;
      dragNode.fx = null;
      dragNode.fy = null;
      if (simulation) simulation.alphaTarget(0);
      dragNode = null;
      // 줌 이벤트 복원
      d3.select(svgOverlay).call(zoomBehavior);
    }
  }

  function onClick(e) {
    if (isDragging) return;
    const { x, y } = getEventPos(e);
    const hit = getNodeAt(x, y);
    if (hit) {
      Characters.openDetail(hit.id);
    }
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.opacity = '0';
  }

  // ── 범례 ─────────────────────────────────────────────────────────
  function updateLegend(types) {
    const legend = document.getElementById('graph-legend');
    if (!legend) return;
    if (!types || types.length === 0) { legend.innerHTML = ''; return; }
    legend.innerHTML =
      '<div style="font-weight:700;margin-bottom:8px;font-size:12px;color:var(--text-muted)">관계 유형</div>' +
      types.map(t => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <div style="width:16px;height:3px;border-radius:2px;background:${getRelColor(t)};flex-shrink:0;"></div>
          <span style="font-size:11px;font-weight:600;color:${getRelColor(t)}">${t}</span>
        </div>
      `).join('');
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────────────
  function initEvents() {
    document.getElementById('filter-graph-faction')?.addEventListener('change', () => {
      startSimulation();
    });
    document.getElementById('filter-graph-reltype')?.addEventListener('change', () => {
      startSimulation();
    });
    document.getElementById('btn-graph-reset')?.addEventListener('click', () => {
      const f = document.getElementById('filter-graph-faction');
      const r = document.getElementById('filter-graph-reltype');
      if (f) f.value = '';
      if (r) r.value = '';
      if (zoomBehavior && svgOverlay) {
        d3.select(svgOverlay).call(zoomBehavior.transform, d3.zoomIdentity);
      }
      transform = d3.zoomIdentity;
      startSimulation();
    });

    window.addEventListener('resize', () => {
      if (App.state.currentPage === 'graph') {
        const container = document.getElementById('graph-container');
        if (container && canvas) {
          W = container.clientWidth  || 1000;
          H = container.clientHeight || 700;
          canvas.width  = W;
          canvas.height = H;
          svgOverlay.setAttribute('width',  W);
          svgOverlay.setAttribute('height', H);
          drawFrame();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { render };
})();

window.Graph = Graph;
