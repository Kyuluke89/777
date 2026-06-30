/* 기하 헬퍼 — 경계 박스, 격자 스냅 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Geom = (App.geom = {});

  Geom.snap = function (v, grid) {
    if (!grid || grid <= 0) return v;
    return Math.round(v / grid) * grid;
  };

  // 엔티티의 화면상 경계 박스 (회전 미반영, MVP 충분)
  Geom.bounds = function (kind, item) {
    if (kind === 'ducts') {
      const w = item.orient === 'h' ? item.lengthMM : item.widthMM;
      const h = item.orient === 'h' ? item.widthMM : item.lengthMM;
      return { x: item.x, y: item.y, w: w, h: h };
    }
    if (kind === 'rails') {
      const w = item.orient === 'h' ? item.lengthMM : (item.widthMM || 35);
      const h = item.orient === 'h' ? (item.widthMM || 35) : item.lengthMM;
      return { x: item.x, y: item.y, w: w, h: h };
    }
    if (kind === 'components') {
      return { x: item.x, y: item.y, w: item.widthMM, h: item.heightMM };
    }
    if (kind === 'dimensions') {
      return App.dims ? App.dims.bounds(item) : { x: item.x1, y: item.y1, w: 0, h: 0 };
    }
    if (kind === 'wires') {
      const pts = App.wires ? App.wires.route(App.store.get(), item) : null;
      if (pts && pts.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach(function (p) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  };

  // 스냅 점 — 부품 모서리/단자/레일·덕트 모서리/패널 모서리 우선, 없으면 격자.
  Geom.snapPoint = function (state, x, y, tolMM) {
    const tol = tolMM || 8;
    let best = null, bestD = tol * tol;
    function consider(px, py) {
      const dx = px - x, dy = py - y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { x: px, y: py, snapped: true }; }
    }
    const p = state.panel;
    [[0, 0], [p.widthMM, 0], [0, p.heightMM], [p.widthMM, p.heightMM]].forEach(function (c) { consider(c[0], c[1]); });
    state.components.forEach(function (c) {
      consider(c.x, c.y); consider(c.x + c.widthMM, c.y);
      consider(c.x, c.y + c.heightMM); consider(c.x + c.widthMM, c.y + c.heightMM);
      if (App.terminals) App.terminals.world(c).forEach(function (t) { consider(t.x, t.y); });
    });
    ['ducts', 'rails'].forEach(function (k) {
      state[k].forEach(function (it) {
        const b = Geom.bounds(k, it);
        consider(b.x, b.y); consider(b.x + b.w, b.y);
        consider(b.x, b.y + b.h); consider(b.x + b.w, b.y + b.h);
      });
    });
    if (best) return best;
    return { x: Geom.snap(x, p.gridMM), y: Geom.snap(y, p.gridMM), snapped: false };
  };

  // 점에서 가장 가까운 단자 (월드 좌표), tolMM 이내
  Geom.nearestTerminal = function (state, x, y, tolMM) {
    let best = null, bestD = (tolMM || 12) * (tolMM || 12);
    state.components.forEach(function (c) {
      App.terminals.world(c).forEach(function (t) {
        const dx = t.x - x, dy = t.y - y;
        const d = dx * dx + dy * dy;
        if (d <= bestD) { bestD = d; best = { compId: c.id, index: t.index, x: t.x, y: t.y }; }
      });
    });
    return best;
  };

  // 점이 박스 안에 있는지
  Geom.hit = function (b, x, y) {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  };

  // 부품 y 를 가장 가까운 레일 상단에 스냅 (간단 버전)
  Geom.snapToRail = function (state, x, y, compH) {
    let best = null, bestDist = Infinity;
    state.rails.forEach(function (r) {
      if (r.orient !== 'h') return;
      // 부품 하단이 레일 상단에 닿도록
      const target = r.y - compH;
      const within = x + 0 >= r.x - 20 && x <= r.x + r.lengthMM + 20;
      const d = Math.abs(y - target);
      if (within && d < bestDist && d < 40) { bestDist = d; best = target; }
    });
    return best;
  };
})(window);
