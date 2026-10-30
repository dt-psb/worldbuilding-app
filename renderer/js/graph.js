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

  // Focus & Path Highlight State
  let focusCenterId = null;
  let focusDepth = 1; // 1 | 2
  let highlightPathNodeIds = null; // Set<number>
  let highlightPathEdgeIds = null; // Set<number>
  let lastFoundPath = null;
  let _pfCharA = null;
  let _pfCharB = null;

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

  const BASE_REL_TYPES = ['적대', '우호', '가족', '연인', '동료', '라이벌', '스승/제자'];

  function getRelColor(type, customColor = null) {
    if (customColor) return customColor;
    if (!type) return REL_COLORS['기타'];
    return REL_COLORS[type] || REL_COLORS['기타'];
  }

  function drawArrowhead(ctx, tipX, tipY, angle, color, size = 9) {
    const wingAngle = Math.PI / 6.5;
    const x1 = tipX - size * Math.cos(angle - wingAngle);
    const y1 = tipY - size * Math.sin(angle - wingAngle);
    const x2 = tipX - size * Math.cos(angle + wingAngle);
    const y2 = tipY - size * Math.sin(angle + wingAngle);

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEdgeLabel(ctx, text, color, x, y, isPathEdge, isDimmed, isHighlighted, light) {
    if (!text) return;
    ctx.save();
    ctx.globalAlpha = isPathEdge ? 1 : isDimmed ? 0.04 : isHighlighted ? 1 : 0.85;
    const fontSize = Math.max(9, Math.min(11, 11 / transform.k * 0.85));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const pw = tw + 12, ph = fontSize + 8;

    // 알약 배경
    ctx.fillStyle = light ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.92)';
    ctx.strokeStyle = isPathEdge ? '#38bdf8' : color;
    ctx.lineWidth = isPathEdge ? 2 : 1;
    roundRect(ctx, x - pw / 2, y - ph / 2, pw, ph, 5);
    ctx.fill();
    ctx.stroke();

    // 텍스트
    ctx.fillStyle = isPathEdge ? '#38bdf8' : color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
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

    // 1. 특정 인물 집중 모드 (Ego Network)
    if (focusCenterId) {
      const focusNodeSet = new Set([focusCenterId]);
      const directEdges = edges.filter(e => e.char_a_id === focusCenterId || e.char_b_id === focusCenterId);
      directEdges.forEach(e => {
        focusNodeSet.add(e.char_a_id);
        focusNodeSet.add(e.char_b_id);
      });

      if (focusDepth === 2) {
        const level1Set = new Set(focusNodeSet);
        const level2Edges = edges.filter(e => level1Set.has(e.char_a_id) || level1Set.has(e.char_b_id));
        level2Edges.forEach(e => {
          focusNodeSet.add(e.char_a_id);
          focusNodeSet.add(e.char_b_id);
        });
      }

      nodes = nodes.filter(n => focusNodeSet.has(n.id));
      edges = edges.filter(e => focusNodeSet.has(e.char_a_id) && focusNodeSet.has(e.char_b_id));
    }

    if (factionFilter) {
      const nodeIds = new Set(
        nodes.filter(n => n.factions && n.factions.some(f => String(f.id) === factionFilter)).map(n => n.id)
      );
      nodes = nodes.filter(n => nodeIds.has(n.id));
      edges = edges.filter(e => nodeIds.has(e.char_a_id) && nodeIds.has(e.char_b_id));
    }

    if (relTypeFilter) {
      if (relTypeFilter === '기타') {
        const baseSet = new Set(BASE_REL_TYPES);
        edges = edges.filter(e => {
          if (e.is_mutual) {
            return !baseSet.has(e.type);
          } else {
            return (!baseSet.has(e.type) && !!e.type) || (!baseSet.has(e.type_b_to_a) && !!e.type_b_to_a);
          }
        });
      } else {
        edges = edges.filter(e => {
          if (e.is_mutual) {
            return (e.type || '') === relTypeFilter;
          } else {
            return (e.type || '') === relTypeFilter || (e.type_b_to_a || '') === relTypeFilter;
          }
        });
      }
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

    // 마우스 이벤트 (hover, drag, click, dblclick)
    svgOverlay.addEventListener('mousemove', onMouseMove);
    svgOverlay.addEventListener('mousedown', onMouseDown);
    svgOverlay.addEventListener('mouseup',   onMouseUp);
    svgOverlay.addEventListener('click',     onClick);
    svgOverlay.addEventListener('dblclick',  onDblClick);
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

    const baseSet = new Set(BASE_REL_TYPES);
    const legendTypes = [];
    let hasOther = false;
    simEdges.forEach(e => {
      const types = [e.type, e.type_b_to_a].filter(Boolean);
      types.forEach(t => {
        if (baseSet.has(t)) {
          if (!legendTypes.includes(t)) legendTypes.push(t);
        } else {
          hasOther = true;
        }
      });
    });
    if (hasOther) {
      legendTypes.push('기타');
    }
    updateLegend(legendTypes);
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

    const hasPathHighlight = highlightPathNodeIds !== null;

    // ── 간선 그리기 ──
    simEdges.forEach(e => {
      if (!e.source || !e.target) return;
      const sx = e.source.x, sy = e.source.y;
      const tx = e.target.x, ty = e.target.y;
      const dist = Math.hypot(tx - sx, ty - sy);
      if (dist === 0) return;

      const rA = nodeRadius(e.source);
      const rB = nodeRadius(e.target);

      const ux = (tx - sx) / dist;
      const uy = (ty - sy) / dist;
      const nx = -uy;
      const ny = ux;

      const isPathEdge = hasPathHighlight && highlightPathEdgeIds && highlightPathEdgeIds.has(e.id);
      const isHighlighted = (hoveredNode && (e.source.id === hoveredNode.id || e.target.id === hoveredNode.id)) || isPathEdge;
      const isDimmed = (hoveredNode && !isHighlighted) || (hasPathHighlight && !isPathEdge);
      const showLabel = (isHighlighted || simNodes.length <= 60 || isPathEdge);

      const isMutual = (e.is_mutual != null ? !!e.is_mutual : true);
      const typeA = e.type || '';
      const colorA = isPathEdge ? '#38bdf8' : getRelColor(typeA, e.color);
      const typeB = e.type_b_to_a || '';
      const colorB = isPathEdge ? '#38bdf8' : getRelColor(typeB, e.color_b_to_a);

      const isDualDirectional = !isMutual && !!typeA && !!typeB;

      if (isMutual) {
        // ── 1. 양방향 상호 관계 (무향 직선) ──
        ctx.save();
        ctx.globalAlpha = isPathEdge ? 1 : isDimmed ? 0.04 : isHighlighted ? 0.95 : 0.38;
        ctx.strokeStyle = colorA;
        ctx.lineWidth = isPathEdge ? 4 : isHighlighted ? 2.8 : 2;
        if (typeA === '적대' && !isPathEdge) ctx.setLineDash([5, 4]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();

        if (showLabel && typeA) {
          drawEdgeLabel(ctx, typeA, colorA, (sx + tx) / 2, (sy + ty) / 2, isPathEdge, isDimmed, isHighlighted, light);
        }
      } else if (isDualDirectional) {
        // ── 2. 서로 다른 관계를 가진 2중 단방향 관계 (곡선 2개로 분리하여 선과 글자 안 겹치게) ──
        const curvature = Math.min(36, Math.max(22, dist * 0.18));

        // A ➔ B 곡선
        const p0x = sx + ux * rA, p0y = sy + uy * rA;
        const p2x = tx - ux * (rB + 3), p2y = ty - uy * (rB + 3);
        const cxA = (sx + tx) / 2 + nx * curvature;
        const cyA = (sy + ty) / 2 + ny * curvature;

        ctx.save();
        ctx.globalAlpha = isPathEdge ? 1 : isDimmed ? 0.04 : isHighlighted ? 0.95 : 0.45;
        ctx.strokeStyle = colorA;
        ctx.lineWidth = isPathEdge ? 3.5 : isHighlighted ? 2.5 : 1.8;
        if (typeA === '적대' && !isPathEdge) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.quadraticCurveTo(cxA, cyA, p2x, p2y);
        ctx.stroke();
        ctx.restore();

        // A ➔ B 화살표
        const angleA = Math.atan2(p2y - cyA, p2x - cxA);
        drawArrowhead(ctx, p2x, p2y, angleA, colorA, 9);

        // A ➔ B 라벨 (t=0.5)
        if (showLabel && typeA) {
          const lblXA = 0.25 * p0x + 0.5 * cxA + 0.25 * p2x;
          const lblYA = 0.25 * p0y + 0.5 * cyA + 0.25 * p2y;
          drawEdgeLabel(ctx, `➔ ${typeA}`, colorA, lblXA, lblYA, isPathEdge, isDimmed, isHighlighted, light);
        }

        // B ➔ A 곡선 (반대편으로 볼록하게)
        const q0x = tx - ux * rB, q0y = ty - uy * rB;
        const q2x = sx + ux * (rA + 3), q2y = sy + uy * (rA + 3);
        const cxB = (sx + tx) / 2 - nx * curvature;
        const cyB = (sy + ty) / 2 - ny * curvature;

        ctx.save();
        ctx.globalAlpha = isPathEdge ? 1 : isDimmed ? 0.04 : isHighlighted ? 0.95 : 0.45;
        ctx.strokeStyle = colorB;
        ctx.lineWidth = isPathEdge ? 3.5 : isHighlighted ? 2.5 : 1.8;
        if (typeB === '적대' && !isPathEdge) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(q0x, q0y);
        ctx.quadraticCurveTo(cxB, cyB, q2x, q2y);
        ctx.stroke();
        ctx.restore();

        // B ➔ A 화살표
        const angleB = Math.atan2(q2y - cyB, q2x - cxB);
        drawArrowhead(ctx, q2x, q2y, angleB, colorB, 9);

        // B ➔ A 라벨 (t=0.5)
        if (showLabel && typeB) {
          const lblXB = 0.25 * q0x + 0.5 * cxB + 0.25 * q2x;
          const lblYB = 0.25 * q0y + 0.5 * cyB + 0.25 * q2y;
          drawEdgeLabel(ctx, `➔ ${typeB}`, colorB, lblXB, lblYB, isPathEdge, isDimmed, isHighlighted, light);
        }
      } else {
        // ── 3. 단일 단방향 관계 (A➔B만 있거나 B➔A만 있음) ──
        const isAtoB = !!typeA;
        const activeType = isAtoB ? typeA : typeB;
        const activeColor = isAtoB ? colorA : colorB;

        const startX = isAtoB ? sx + ux * rA : tx - ux * rB;
        const startY = isAtoB ? sy + uy * rA : ty - uy * rB;
        const targetX = isAtoB ? tx - ux * (rB + 3) : sx + ux * (rA + 3);
        const targetY = isAtoB ? ty - uy * (rB + 3) : sy + uy * (rA + 3);

        ctx.save();
        ctx.globalAlpha = isPathEdge ? 1 : isDimmed ? 0.04 : isHighlighted ? 0.95 : 0.4;
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = isPathEdge ? 3.5 : isHighlighted ? 2.5 : 1.8;
        if (activeType === '적대' && !isPathEdge) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        ctx.restore();

        // 화살표
        const arrowAngle = isAtoB ? Math.atan2(uy, ux) : Math.atan2(-uy, -ux);
        drawArrowhead(ctx, targetX, targetY, arrowAngle, activeColor, 9);

        // 라벨
        if (showLabel && activeType) {
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;
          drawEdgeLabel(ctx, `➔ ${activeType}`, activeColor, mx, my, isPathEdge, isDimmed, isHighlighted, light);
        }
      }
    });

    // ── 노드 그리기 ──
    simNodes.forEach(d => {
      const r = nodeRadius(d);
      const isPathNode = hasPathHighlight && highlightPathNodeIds && highlightPathNodeIds.has(d.id);
      const isFocusCenter = (focusCenterId === d.id);
      const isHovered = hoveredNode && hoveredNode.id === d.id;
      const isDimmed  = (hoveredNode && !isHovered && !simEdges.some(
        e => (e.source.id === hoveredNode.id && e.target.id === d.id) ||
             (e.target.id === hoveredNode.id && e.source.id === d.id)
      )) || (hasPathHighlight && !isPathNode);

      ctx.save();
      ctx.globalAlpha = isPathNode || isFocusCenter ? 1 : isDimmed ? 0.12 : 1;

      // 1. 집중 모드 중심 인물 또는 경로 하이라이트 외곽 효과
      if (isFocusCenter) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (isPathNode) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        // 일반 glow ring
        ctx.beginPath();
        ctx.arc(d.x, d.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = d.color || '#7c6af7';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = (isDimmed ? 0.04 : isHovered ? 0.8 : 0.25);
        ctx.stroke();
      }

      // 메인 원
      ctx.globalAlpha = isPathNode || isFocusCenter ? 1 : isDimmed ? 0.15 : 1;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isFocusCenter ? '#f59e0b' : (d.color || '#3b82f6');
      ctx.fill();
      ctx.strokeStyle = isFocusCenter ? '#ffffff' : (isHovered || isPathNode ? '#ffffff' : 'rgba(255,255,255,0.6)');
      ctx.lineWidth = isFocusCenter ? 3 : (isHovered || isPathNode ? 2.5 : 1.5);
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
      ctx.font = `${isFocusCenter || isPathNode ? 'bold' : '600'} ${labelSize}px system-ui, sans-serif`;
      ctx.strokeStyle = labelOutline;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isFocusCenter ? '#f59e0b' : isPathNode ? '#38bdf8' : labelColor;
      const labelY = d.y + r + 5;
      const labelText = isFocusCenter ? `🎯 ${d.name}` : d.name || '';
      ctx.strokeText(labelText, d.x, labelY);
      ctx.fillText(labelText, d.x, labelY);

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
        <div style="font-weight:700;font-size:13px;color:var(--accent);margin-bottom:2px;">${escHtml(hit.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);">소속: ${escHtml(factionNames)}</div>
        <div style="font-size:11px;color:var(--text-muted);">연결된 관계: <strong>${conns}개</strong></div>
        <div style="margin-top:6px;font-size:10px;color:var(--accent);display:flex;align-items:center;gap:6px;">
          <span>더블클릭: 🎯 집중 모드</span>
          <span>· 클릭: 상세 프로필 ↗</span>
        </div>
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

  let clickTimer = null;

  function onClick(e) {
    if (isDragging) return;
    const { x, y } = getEventPos(e);
    const hit = getNodeAt(x, y);
    if (!hit) return;

    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      setFocusMode(hit.id);
    } else {
      clickTimer = setTimeout(() => {
        clickTimer = null;
        Characters.openDetail(hit.id);
      }, 240);
    }
  }

  function onDblClick(e) {
    e.preventDefault();
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

  // ═════════════════════════════════════════════════════════════════════
  // ── 🎯 특정 인물 중심 집중 모드 (Ego Network) ────────────────────
  // ═════════════════════════════════════════════════════════════════════
  function setFocusMode(charId, depth = 1) {
    focusCenterId = charId;
    focusDepth = depth;

    const banner = document.getElementById('graph-focus-banner');
    const textEl = document.getElementById('graph-focus-text');
    const btnD1 = document.getElementById('btn-focus-depth-1');
    const btnD2 = document.getElementById('btn-focus-depth-2');

    const centerChar = (graphData?.nodes || []).find(n => n.id === charId);
    const charName = centerChar ? centerChar.name : '인물';
    const conns = degreeCount[charId] || 0;

    if (banner && textEl) {
      banner.classList.remove('hidden');
      textEl.innerHTML = `🎯 <strong>${escHtml(charName)}</strong> 중심 집중 모드 <span style="opacity:0.7;font-size:11px;">(1촌 연결 ${conns}명)</span>`;
    }
    if (btnD1 && btnD2) {
      btnD1.classList.toggle('active', depth === 1);
      btnD2.classList.toggle('active', depth === 2);
    }

    startSimulation();
    App.showToast(`🎯 '${charName}' 중심 ${depth}촌 집중 모드가 적용되었습니다.`);
  }

  function resetFocusMode() {
    focusCenterId = null;
    document.getElementById('graph-focus-banner')?.classList.add('hidden');
    startSimulation();
    App.showToast('전체 그래프 뷰로 복귀했습니다.');
  }

  // ═════════════════════════════════════════════════════════════════════
  // ── 🔍 인맥 관계 경로 탐색기 (Path Finder) ────────────────────────
  // ═════════════════════════════════════════════════════════════════════
  function openPathfinderModal() {
    App.openModal('modal-graph-pathfinder');
  }

  function findShortestPath(startId, endId) {
    if (!graphData || !graphData.edges) return null;
    if (startId === endId) {
      const node = (graphData.nodes || []).find(n => n.id === startId);
      return { nodes: [node].filter(Boolean), edges: [] };
    }

    // 1. 인접 리스트 생성
    const adj = new Map();
    const edgeMap = new Map();

    graphData.edges.forEach(e => {
      const u = e.char_a_id, v = e.char_b_id;
      if (!adj.has(u)) adj.set(u, []);
      if (!adj.has(v)) adj.set(v, []);
      adj.get(u).push(v);
      if (e.is_mutual) adj.get(v).push(u);

      const k1 = `${u}_${v}`;
      const k2 = `${v}_${u}`;
      edgeMap.set(k1, e);
      if (e.is_mutual) edgeMap.set(k2, e);
    });

    // 2. BFS 탐색
    const queue = [[startId]];
    const visited = new Set([startId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];

      if (curr === endId) {
        // 경로 완성: 노드 객체 및 간선 매핑
        const pathNodes = path.map(id => (graphData.nodes || []).find(n => n.id === id)).filter(Boolean);
        const pathEdges = [];
        for (let i = 0; i < path.length - 1; i++) {
          const u = path[i], v = path[i + 1];
          const edge = edgeMap.get(`${u}_${v}`) || edgeMap.get(`${v}_${u}`);
          if (edge) pathEdges.push(edge);
        }
        return { nodes: pathNodes, edges: pathEdges };
      }

      const neighbors = adj.get(curr) || [];
      for (const nxt of neighbors) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push([...path, nxt]);
        }
      }
    }

    return null;
  }

  function searchPath() {
    const aId = Number(document.getElementById('pf-char-a-id')?.value);
    const bId = Number(document.getElementById('pf-char-b-id')?.value);
    const container = document.getElementById('pf-result-container');
    const hlBtn = document.getElementById('btn-pf-highlight-graph');

    if (!aId || !bId) {
      App.showToast('❗ 출발 인물과 도착 인물을 모두 선택해주세요.');
      return;
    }
    if (aId === bId) {
      App.showToast('❗ 서로 다른 인물을 선택해주세요.');
      return;
    }

    const path = findShortestPath(aId, bId);
    lastFoundPath = path;

    if (!path || path.nodes.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:30px 0;">
          <div style="font-size:32px;margin-bottom:8px;">⚡</div>
          <div>두 인물 사이에 연결된 관계 경로가 없습니다.<br><span style="font-size:11px;opacity:0.6;">(서로 완전히 독립된 인맥 네트워크에 속해 있습니다)</span></div>
        </div>`;
      hlBtn?.classList.add('hidden');
      return;
    }

    hlBtn?.classList.remove('hidden');

    // 경로 시각화 HTML 생성
    const stepsHtml = [];
    for (let i = 0; i < path.nodes.length; i++) {
      const node = path.nodes[i];
      const avatarSrc = (node.avatar_crop) || (node.avatar_path ? `file://${node.avatar_path}` : null);
      const avatarHtml = avatarSrc
        ? `<img class="pf-step-avatar" src="${avatarSrc}" alt="${escHtml(node.name)}" />`
        : `<div class="pf-step-avatar initial" style="background:${window.strColor ? window.strColor(node.name) : '#7c6af7'}">${escHtml((node.name || '?')[0])}</div>`;

      stepsHtml.push(`
        <div class="pf-step-node">
          ${avatarHtml}
          <div class="pf-step-name">${escHtml(node.name)}</div>
        </div>
      `);

      if (i < path.edges.length) {
        const edge = path.edges[i];
        stepsHtml.push(`
          <div class="pf-step-edge">
            <span class="rel-type-tag" style="font-size:10px;padding:2px 8px;">${escHtml(edge.type || '관계')}</span>
            <div class="pf-edge-line">➔</div>
          </div>
        `);
      }
    }

    const distance = path.nodes.length - 1;
    container.innerHTML = `
      <div class="pf-path-card">
        <div class="pf-path-header">
          <strong>최단 관계 경로 발견!</strong>
          <span class="sub-label">관계 거리: <strong>${distance}단계</strong></span>
        </div>
        <div class="pf-path-chain">
          ${stepsHtml.join('')}
        </div>
      </div>
    `;
  }

  function highlightPathOnGraph(path) {
    if (!path) return;
    highlightPathNodeIds = new Set(path.nodes.map(n => n.id));
    highlightPathEdgeIds = new Set(path.edges.map(e => e.id));

    const banner = document.getElementById('graph-path-banner');
    const textEl = document.getElementById('graph-path-text');
    if (banner && textEl) {
      banner.classList.remove('hidden');
      const startName = path.nodes[0]?.name || '';
      const endName = path.nodes[path.nodes.length - 1]?.name || '';
      textEl.innerHTML = `🔍 <strong>${escHtml(startName)}</strong> ➔ <strong>${escHtml(endName)}</strong> 최단 경로 하이라이트 중 (${path.nodes.length - 1}단계)`;
    }

    drawFrame();
    App.showToast('🕸️ 그래프에서 최단 인맥 경로가 하이라이트되었습니다.');
  }

  function resetPathHighlight() {
    highlightPathNodeIds = null;
    highlightPathEdgeIds = null;
    document.getElementById('graph-path-banner')?.classList.add('hidden');
    drawFrame();
    App.showToast('경로 하이라이트가 해제되었습니다.');
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
      resetFocusMode();
      resetPathHighlight();
      if (zoomBehavior && svgOverlay) {
        d3.select(svgOverlay).call(zoomBehavior.transform, d3.zoomIdentity);
      }
      transform = d3.zoomIdentity;
      startSimulation();
    });

    // 집중 모드 컨트롤러
    document.getElementById('btn-focus-depth-1')?.addEventListener('click', () => {
      if (focusCenterId) setFocusMode(focusCenterId, 1);
    });
    document.getElementById('btn-focus-depth-2')?.addEventListener('click', () => {
      if (focusCenterId) setFocusMode(focusCenterId, 2);
    });
    document.getElementById('btn-focus-reset')?.addEventListener('click', resetFocusMode);

    // 경로 하이라이트 해제
    document.getElementById('btn-path-reset')?.addEventListener('click', resetPathHighlight);

    // 인맥 경로 탐색기 모달 열기
    document.getElementById('btn-graph-pathfinder')?.addEventListener('click', openPathfinderModal);

    // 경로 탐색기 A/B 선택기
    document.getElementById('btn-pf-pick-a')?.addEventListener('click', () => {
      CharPicker.open({
        title: '출발 인물 A 선택',
        onSelect: (c) => {
          document.getElementById('pf-char-a-id').value = c.id;
          document.getElementById('pf-pick-a-label').innerHTML = `<strong>${escHtml(c.name)}</strong>`;
        }
      });
    });

    document.getElementById('btn-pf-pick-b')?.addEventListener('click', () => {
      CharPicker.open({
        title: '도착 인물 B 선택',
        onSelect: (c) => {
          document.getElementById('pf-char-b-id').value = c.id;
          document.getElementById('pf-pick-b-label').innerHTML = `<strong>${escHtml(c.name)}</strong>`;
        }
      });
    });

    // 경로 탐색 실행
    document.getElementById('btn-pf-search')?.addEventListener('click', searchPath);

    // 경로 그래프 하이라이트 버튼
    document.getElementById('btn-pf-highlight-graph')?.addEventListener('click', () => {
      if (!lastFoundPath) return;
      App.closeModal('modal-graph-pathfinder');
      highlightPathOnGraph(lastFoundPath);
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

  return { render, setFocusMode, resetFocusMode, openPathfinderModal };
})();

window.Graph = Graph;
