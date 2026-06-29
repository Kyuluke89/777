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

  function renderComponents(state) {
    const g = App.viewport.layers().components;
    clear(g);
    state.components.forEach(function (c) {
      const cx = c.x + c.widthMM / 2;
      const cy = c.y + c.heightMM / 2;
      const grp = App.el('g', {
        'data-id': c.id, 'data-kind': 'components',
        transform: c.rotation ? ('rotate(' + c.rotation + ' ' + cx + ' ' + cy + ')') : null
      }, g);
      const color = App.typeColor(c.type);
      App.el('rect', {
        x: c.x, y: c.y, width: c.widthMM, height: c.heightMM,
        rx: 2, fill: color, 'fill-opacity': 0.16,
        stroke: isSelected(c.id) ? '#111827' : color,
        'stroke-width': isSelected(c.id) ? 2 : 1.2
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
})(window);
