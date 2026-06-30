/* state → SVG 렌더링. 상태 변경 시 레이어를 다시 그린다. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Render = (App.render = {});

  const TYPE_COLORS = {
    MCCB: '#1d4ed8', MCB: '#2563eb', ELCB: '#1e40af',
    MC: '#0d9488', CP: '#7c3aed', SMPS: '#ea580c',
    PLC: '#15803d', TB: '#64748b', RELAY: '#db2777', STOP: '#0f766e', NF: '#0e7490', ETC: '#475569'
  };
  App.typeColor = function (t) { return TYPE_COLORS[t] || TYPE_COLORS.ETC; };

  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }

  function isSelected(id) {
    return App.ui && App.ui.selected && App.ui.selected.has(id);
  }

  function renderPanel(state) {
    const g = App.viewport.layers().panel;
    clear(g);
    const p = state.panel;
    App.el('rect', {
      x: 0, y: 0, width: p.widthMM, height: p.heightMM,
      fill: '#ffffff', stroke: '#334155', 'stroke-width': 2,
      'data-kind': 'panel'
    }, g);
    // 치수 라벨
    const t = App.el('text', {
      x: p.widthMM / 2, y: -12, 'text-anchor': 'middle',
      'font-size': 18, fill: '#334155', 'pointer-events': 'none'
    }, g);
    t.textContent = p.widthMM + ' × ' + p.heightMM + ' mm';
  }

  function renderDucts(state) {
    const g = App.viewport.layers().ducts;
    clear(g);
    state.ducts.forEach(function (d) {
      const w = d.orient === 'h' ? d.lengthMM : d.widthMM;
      const h = d.orient === 'h' ? d.widthMM : d.lengthMM;
      const grp = App.el('g', { 'data-id': d.id, 'data-kind': 'ducts' }, g);
      App.el('rect', {
        x: d.x, y: d.y, width: w, height: h,
        fill: '#fde68a', 'fill-opacity': 0.55,
        stroke: isSelected(d.id) ? '#d97706' : '#b45309',
        'stroke-width': isSelected(d.id) ? 2 : 1
      }, grp);
      // 덕트 빗금 표현 (슬롯 느낌)
      App.el('rect', {
        x: d.x + 2, y: d.y + 2, width: Math.max(0, w - 4), height: Math.max(0, h - 4),
        fill: 'none', stroke: '#f59e0b', 'stroke-width': 0.6,
        'stroke-dasharray': '3 3', 'pointer-events': 'none'
      }, grp);
    });
  }

  function renderRails(state) {
    const g = App.viewport.layers().rails;
    clear(g);
    state.rails.forEach(function (r) {
      const w = r.orient === 'h' ? r.lengthMM : (r.widthMM || 35);
      const h = r.orient === 'h' ? (r.widthMM || 35) : r.lengthMM;
      const grp = App.el('g', { 'data-id': r.id, 'data-kind': 'rails' }, g);
      App.el('rect', {
        x: r.x, y: r.y, width: w, height: h,
        fill: '#cbd5e1',
        stroke: isSelected(r.id) ? '#0ea5e9' : '#64748b',
        'stroke-width': isSelected(r.id) ? 2 : 1
      }, grp);
      // DIN 레일 중앙 홈
      if (r.orient === 'h') {
        App.el('line', { x1: r.x, y1: r.y + h / 2, x2: r.x + w, y2: r.y + h / 2, stroke: '#94a3b8', 'stroke-width': 0.8, 'pointer-events': 'none' }, grp);
      } else {
        App.el('line', { x1: r.x + w / 2, y1: r.y, x2: r.x + w / 2, y2: r.y + h, stroke: '#94a3b8', 'stroke-width': 0.8, 'pointer-events': 'none' }, grp);
      }
    });
  }

  // 겹치는 부품 id 집합 (배치 실수 경고용)
  function overlappingIds(state) {
    const set = new Set();
    const cs = state.components;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        if (a.x < b.x + b.widthMM && a.x + a.widthMM > b.x &&
            a.y < b.y + b.heightMM && a.y + a.heightMM > b.y) {
          set.add(a.id); set.add(b.id);
        }
      }
    }
    return set;
  }

  function renderComponents(state) {
    const g = App.viewport.layers().components;
    clear(g);
    const overlaps = overlappingIds(state);
    state.components.forEach(function (c) {
      const cx = c.x + c.widthMM / 2;
      const cy = c.y + c.heightMM / 2;
      const over = overlaps.has(c.id);
      const grp = App.el('g', {
        'data-id': c.id, 'data-kind': 'components',
        transform: c.rotation ? ('rotate(' + c.rotation + ' ' + cx + ' ' + cy + ')') : null
      }, g);
      const color = App.typeColor(c.type);
      App.el('rect', {
        x: c.x, y: c.y, width: c.widthMM, height: c.heightMM,
        rx: 2, fill: over ? '#ef4444' : color, 'fill-opacity': over ? 0.18 : 0.16,
        stroke: over ? '#dc2626' : (isSelected(c.id) ? '#111827' : color),
        'stroke-width': isSelected(c.id) || over ? 2 : 1.2,
        'stroke-dasharray': over ? '4 2' : null
      }, grp);
      // 호기번호(tag) — 입력 시 상단에 작게
      if (c.tag) {
        const tg = App.el('text', {
          x: cx, y: c.y + Math.min(8, c.heightMM * 0.12), 'text-anchor': 'middle',
          'font-size': Math.min(8, c.heightMM * 0.14), fill: '#111827',
          'font-weight': 'bold', 'pointer-events': 'none'
        }, grp);
        tg.textContent = c.tag;
      }
      // 타입 배지
      const badge = App.el('text', {
        x: cx, y: cy - 2, 'text-anchor': 'middle',
        'font-size': Math.min(12, c.heightMM * 0.22), fill: color,
        'font-weight': 'bold', 'pointer-events': 'none'
      }, grp);
      badge.textContent = c.type || '';
      // 품명 (폭에 맞게 자동 축소)
      const txt = c.label || c.partName || c.partNo || '';
      const fit = Math.max(2.2, Math.min(c.heightMM * 0.16, 9, (c.widthMM - 2) / (0.56 * Math.max(4, txt.length))));
      const lab = App.el('text', {
        x: cx, y: cy + Math.min(14, c.heightMM * 0.26),
        'text-anchor': 'middle', 'font-size': fit, fill: '#334155',
        'pointer-events': 'none'
      }, grp);
      lab.textContent = txt;
      // 단자 점 (원형/사각형, 로컬 좌표 — 그룹 회전 적용됨) + 단자 번호
      App.terminals.local(c).forEach(function (t) {
        if (t.shape === 'rect') {
          App.el('rect', {
            x: t.x - t.w / 2, y: t.y - t.h / 2, width: t.w, height: t.h,
            fill: '#ffffff', stroke: color, 'stroke-width': 0.8,
            'data-comp': c.id, 'data-term': t.index
          }, grp);
        } else {
          App.el('circle', {
            cx: t.x, cy: t.y, r: (t.w || 3.6) / 2,
            fill: '#ffffff', stroke: color, 'stroke-width': 0.8,
            'data-comp': c.id, 'data-term': t.index
          }, grp);
        }
        if (t.name) {
          const ty = (t.side === 'top') ? (t.y - 2.6) : (t.y + 4.6);
          const tn = App.el('text', {
            x: t.x, y: ty, 'text-anchor': 'middle',
            'font-size': 3.4, fill: '#475569', 'pointer-events': 'none'
          }, grp);
          tn.textContent = t.name;
        }
      });
    });
  }

  function renderWires(state) {
    const g = App.viewport.layers().wires;
    clear(g);
    state.wires.forEach(function (w) {
      const pts = App.wires.route(state, w);
      if (!pts) return;
      const sel = isSelected(w.id);
      const grp = App.el('g', { 'data-id': w.id, 'data-kind': 'wires' }, g);
      // 클릭 영역 (투명 굵은 선)
      App.el('polyline', {
        points: App.wires.pointsStr(pts), fill: 'none',
        stroke: 'transparent', 'stroke-width': 6
      }, grp);
      App.el('polyline', {
        points: App.wires.pointsStr(pts), fill: 'none',
        stroke: sel ? '#111827' : (w.color || '#dc2626'),
        'stroke-width': sel ? 2 : 1.2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'pointer-events': 'none'
      }, grp);
      // 양 끝 라인번호 텍스트
      const ends = App.wires.endLabels(state, w);
      if (ends && w.label) {
        [ends.a, ends.b].forEach(function (e) {
          const t = App.el('text', {
            x: e.x, y: e.y, 'font-size': 8,
            fill: '#b91c1c', 'pointer-events': 'none', 'font-weight': 'bold'
          }, grp);
          t.textContent = w.label;
        });
      }
      // 선택 시: 세그먼트 이동 핸들 (수평=상하, 수직=좌우)
      if (sel) {
        const hs = App.viewport.pxToMM(5);
        App.wires.editSegments(state, w).forEach(function (s) {
          App.el('rect', {
            x: s.mid.x - hs, y: s.mid.y - hs, width: hs * 2, height: hs * 2,
            rx: hs * 0.4,
            fill: '#fff', stroke: '#2563eb', 'stroke-width': App.viewport.pxToMM(1.5),
            'data-wire': w.id, 'data-seg': s.i, 'data-orient': s.orient,
            'data-pterm': s.pTerm ? '1' : '0', 'data-qterm': s.qTerm ? '1' : '0',
            style: 'cursor:' + (s.orient === 'H' ? 'ns-resize' : 'ew-resize')
          }, grp);
        });
      }
    });
  }

  function renderOverlay(state) {
    const g = App.viewport.layers().overlay;
    clear(g);
    if (!App.ui || !App.ui.selected) return;
    const handle = App.viewport.pxToMM(4);
    App.ui.selected.forEach(function (id) {
      const found = App.store.findById(id);
      if (!found) return;
      const b = App.geom.bounds(found.kind, found.item);
      App.el('rect', {
        x: b.x - handle, y: b.y - handle,
        width: b.w + handle * 2, height: b.h + handle * 2,
        fill: 'none', stroke: '#2563eb', 'stroke-width': App.viewport.pxToMM(1.5),
        'stroke-dasharray': App.viewport.pxToMM(4) + ' ' + App.viewport.pxToMM(3)
      }, g);
    });
  }

  function arrow(grp, x, y, dirx, diry, sizeMM, color) {
    const s = sizeMM, a = 0.42;
    const bx = x + dirx * s, by = y + diry * s;
    const px = -diry, py = dirx;
    App.el('path', {
      d: 'M ' + x + ' ' + y + ' L ' + (bx + px * a * s) + ' ' + (by + py * a * s) +
         ' L ' + (bx - px * a * s) + ' ' + (by - py * a * s) + ' Z',
      fill: color, stroke: color, 'stroke-width': sizeMM * 0.1, 'pointer-events': 'none'
    }, grp);
  }

  function renderDims(state) {
    const g = App.viewport.layers().dims;
    clear(g);
    const fontMM = App.viewport.pxToMM(13);   // 화면 기준 일정 크기(읽기 쉬움)
    const lw = App.viewport.pxToMM(1);
    state.dimensions.forEach(function (dim) {
      const m = App.dims.geom(dim);
      const sel = isSelected(dim.id);
      const col = sel ? '#0ea5e9' : '#7c3aed';
      const grp = App.el('g', { 'data-id': dim.id, 'data-kind': 'dimensions' }, g);
      const ux = (m.a2.x - m.a1.x) / m.L, uy = (m.a2.y - m.a1.y) / m.L; // 선 방향 단위
      // 클릭 영역
      App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: m.a2.x, y2: m.a2.y, stroke: 'transparent', 'stroke-width': App.viewport.pxToMM(8) }, grp);
      // 연장선 (측정점 → 치수선, 약간 연장)
      const ex = m.nx * fontMM * 0.4, ey = m.ny * fontMM * 0.4;
      App.el('line', { x1: m.p1.x, y1: m.p1.y, x2: m.a1.x + ex, y2: m.a1.y + ey, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      App.el('line', { x1: m.p2.x, y1: m.p2.y, x2: m.a2.x + ex, y2: m.a2.y + ey, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      // 치수선 — 가운데 글자 자리만큼 끊어서(걸리게) 두 토막
      const label = String(App.dims.length(dim));
      const half = (label.length * fontMM * 0.32) + fontMM * 0.35; // 글자 폭 절반
      const gS = { x: m.mid.x - ux * half, y: m.mid.y - uy * half };
      const gE = { x: m.mid.x + ux * half, y: m.mid.y + uy * half };
      App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: gS.x, y2: gS.y, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      App.el('line', { x1: gE.x, y1: gE.y, x2: m.a2.x, y2: m.a2.y, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      // 화살표 (안쪽)
      arrow(grp, m.a1.x, m.a1.y, ux, uy, fontMM * 0.55, col);
      arrow(grp, m.a2.x, m.a2.y, -ux, -uy, fontMM * 0.55, col);
      // 치수 텍스트 — 선 가운데, 선과 정렬(수평/수직 모두 바로 읽히게)
      const tx = App.el('text', {
        x: m.mid.x, y: m.mid.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': fontMM, fill: col, 'font-weight': 'bold', 'pointer-events': 'none',
        transform: 'rotate(' + m.textAng + ' ' + m.mid.x + ' ' + m.mid.y + ')'
      }, grp);
      tx.textContent = label;
      if (sel) {
        const hs = App.viewport.pxToMM(5);
        App.el('rect', {
          x: m.mid.x - hs, y: m.mid.y - hs, width: hs * 2, height: hs * 2, rx: hs * 0.4,
          fill: '#fff', stroke: '#0ea5e9', 'stroke-width': App.viewport.pxToMM(1.5),
          'data-dim': dim.id, style: 'cursor:move'
        }, grp);
      }
    });
  }

  Render.all = function (state) {
    state = state || App.store.get();
    renderPanel(state);
    renderDucts(state);
    renderRails(state);
    renderComponents(state);
    renderWires(state);
    renderDims(state);
    renderOverlay(state);
  };

  // 미리보기(드래그 중 새 엔티티) 그리기 — overlay 사용
  Render.preview = function (rectMM) {
    const g = App.viewport.layers().overlay;
    let pv = g.querySelector('#preview');
    if (!rectMM) { if (pv) pv.remove(); return; }
    if (!pv) { pv = App.el('rect', { id: 'preview' }, g); }
    pv.setAttribute('x', rectMM.x);
    pv.setAttribute('y', rectMM.y);
    pv.setAttribute('width', Math.max(0, rectMM.w));
    pv.setAttribute('height', Math.max(0, rectMM.h));
    pv.setAttribute('fill', '#3b82f6');
    pv.setAttribute('fill-opacity', '0.2');
    pv.setAttribute('stroke', '#2563eb');
    pv.setAttribute('stroke-width', App.viewport.pxToMM(1.2));
  };

  // 와이어 그리는 중 미리보기 (고무줄)
  Render.wirePreview = function (pts) {
    const g = App.viewport.layers().overlay;
    let pv = g.querySelector('#wire-preview');
    if (!pts) { if (pv) pv.remove(); return; }
    if (!pv) { pv = App.el('polyline', { id: 'wire-preview' }, g); }
    pv.setAttribute('points', pts.map(function (p) { return p.x + ',' + p.y; }).join(' '));
    pv.setAttribute('fill', 'none');
    pv.setAttribute('stroke', '#dc2626');
    pv.setAttribute('stroke-width', App.viewport.pxToMM(1.5));
    pv.setAttribute('stroke-dasharray', App.viewport.pxToMM(4) + ' ' + App.viewport.pxToMM(3));
  };

  // 영역(마퀴) 선택 박스
  Render.marquee = function (rectMM) {
    const g = App.viewport.layers().overlay;
    let m = g.querySelector('#marquee');
    if (!rectMM) { if (m) m.remove(); return; }
    if (!m) { m = App.el('rect', { id: 'marquee' }, g); }
    m.setAttribute('x', rectMM.x);
    m.setAttribute('y', rectMM.y);
    m.setAttribute('width', Math.max(0, rectMM.w));
    m.setAttribute('height', Math.max(0, rectMM.h));
    m.setAttribute('fill', '#3b82f6');
    m.setAttribute('fill-opacity', '0.08');
    m.setAttribute('stroke', '#3b82f6');
    m.setAttribute('stroke-width', App.viewport.pxToMM(1));
    m.setAttribute('stroke-dasharray', App.viewport.pxToMM(3) + ' ' + App.viewport.pxToMM(2));
  };

  // 스냅 점 표시 (치수 도구)
  Render.snapMarker = function (pt) {
    const g = App.viewport.layers().overlay;
    let s = g.querySelector('#snap-marker');
    if (!pt) { if (s) s.remove(); return; }
    const r = App.viewport.pxToMM(4);
    if (!s) { s = App.el('path', { id: 'snap-marker' }, g); }
    s.setAttribute('d', 'M ' + (pt.x - r) + ' ' + (pt.y - r) + ' L ' + (pt.x + r) + ' ' + (pt.y + r) +
      ' M ' + (pt.x - r) + ' ' + (pt.y + r) + ' L ' + (pt.x + r) + ' ' + (pt.y - r));
    s.setAttribute('stroke', pt.snapped ? '#16a34a' : '#94a3b8');
    s.setAttribute('stroke-width', App.viewport.pxToMM(1.5));
    s.setAttribute('fill', 'none');
  };

  // 치수 미리보기 (그리는 중)
  Render.dimPreview = function (dim) {
    const g = App.viewport.layers().overlay;
    let p = g.querySelector('#dim-preview');
    if (!dim) { if (p) p.remove(); return; }
    if (p) p.remove();
    p = App.el('g', { id: 'dim-preview' }, g);
    const m = App.dims.geom(dim);
    App.el('line', { x1: m.p1.x, y1: m.p1.y, x2: m.a1.x, y2: m.a1.y, stroke: '#7c3aed', 'stroke-width': 0.4, 'stroke-dasharray': '2 1' }, p);
    App.el('line', { x1: m.p2.x, y1: m.p2.y, x2: m.a2.x, y2: m.a2.y, stroke: '#7c3aed', 'stroke-width': 0.4, 'stroke-dasharray': '2 1' }, p);
    App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: m.a2.x, y2: m.a2.y, stroke: '#7c3aed', 'stroke-width': App.viewport.pxToMM(1) }, p);
    const fontMM = App.viewport.pxToMM(13);
    const t = App.el('text', {
      x: m.mid.x, y: m.mid.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': fontMM, fill: '#7c3aed', 'font-weight': 'bold',
      transform: 'rotate(' + m.textAng + ' ' + m.mid.x + ' ' + m.mid.y + ')'
    }, p);
    t.textContent = App.dims.length(dim);
  };
})(window);
