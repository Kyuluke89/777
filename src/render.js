/* state → SVG 렌더링. 상태 변경 시 레이어를 다시 그린다. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Render = (App.render = {});

  const TYPE_COLORS = {
    MCCB: '#1d4ed8', MCB: '#2563eb', ELCB: '#1e40af',
    MC: '#0d9488', CP: '#7c3aed', SMPS: '#ea580c',
    PLC: '#15803d', TB: '#64748b', RELAY: '#db2777', ETC: '#475569'
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
      // 타입 배지
      const badge = App.el('text', {
        x: cx, y: cy - 2, 'text-anchor': 'middle',
        'font-size': Math.min(14, c.heightMM * 0.28), fill: color,
        'font-weight': 'bold', 'pointer-events': 'none'
      }, grp);
      badge.textContent = c.type || '';
      // 라벨 (참조명/부품번호)
      const lab = App.el('text', {
        x: cx, y: cy + Math.min(14, c.heightMM * 0.28),
        'text-anchor': 'middle',
        'font-size': Math.min(11, c.heightMM * 0.22), fill: '#334155',
        'pointer-events': 'none'
      }, grp);
      lab.textContent = c.label || c.partNo || '';
      // 단자 점 (로컬 좌표 — 그룹 회전 적용됨) + 단자 번호
      App.terminals.local(c).forEach(function (t) {
        App.el('circle', {
          cx: t.x, cy: t.y, r: 1.8,
          fill: '#ffffff', stroke: color, 'stroke-width': 0.8,
          'data-comp': c.id, 'data-term': t.index
        }, grp);
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
            'data-wire': w.id, 'data-seg': s.k, 'data-orient': s.orient,
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

  Render.all = function (state) {
    state = state || App.store.get();
    renderPanel(state);
    renderDucts(state);
    renderRails(state);
    renderComponents(state);
    renderWires(state);
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
})(window);
