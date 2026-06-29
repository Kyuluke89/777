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
    return { x: 0, y: 0, w: 0, h: 0 };
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
