/* 단자 모델 — 부품의 단자 좌표 계산 (로컬 / 회전 적용 월드) */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const T = (App.terminals = {});

  // 타입별 기본 단자 수 (부품에 terminals 정보가 없을 때)
  const DEFAULTS = { MCCB: 6, MCB: 4, ELCB: 6, MC: 8, CP: 2, SMPS: 6, PLC: 20, RELAY: 8, TB: 2, ETC: 4 };
  T.defaultCount = function (type) { return DEFAULTS[type] || 4; };

  function count(comp) {
    let n = comp.terminals;
    if (n == null) n = T.defaultCount(comp.type);
    return Math.max(1, n);
  }

  // 로컬(회전 미적용) 단자 좌표 — 컴포넌트 그룹 안에서 점을 찍을 때 사용
  T.local = function (comp) {
    const n = count(comp);
    const w = comp.widthMM, h = comp.heightMM;
    const top = Math.ceil(n / 2);
    const bottom = n - top;
    const pts = [];
    let idx = 0;
    for (let i = 0; i < top; i++) {
      pts.push({ index: idx++, side: 'top', x: comp.x + (w * (i + 1)) / (top + 1), y: comp.y });
    }
    for (let i = 0; i < bottom; i++) {
      pts.push({ index: idx++, side: 'bottom', x: comp.x + (w * (i + 1)) / (bottom + 1), y: comp.y + h });
    }
    return pts;
  };

  // 월드(회전 적용) 단자 좌표 — 와이어 끝점/히트테스트에 사용
  T.world = function (comp) {
    const local = T.local(comp);
    const rot = ((comp.rotation || 0) * Math.PI) / 180;
    if (!rot) return local;
    const cx = comp.x + comp.widthMM / 2;
    const cy = comp.y + comp.heightMM / 2;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    return local.map(function (p) {
      const dx = p.x - cx, dy = p.y - cy;
      return {
        index: p.index, side: p.side,
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos
      };
    });
  };

  // 컴포넌트+단자 인덱스 → 월드 점
  T.point = function (state, compId, index) {
    const comp = state.components.find(function (c) { return c.id === compId; });
    if (!comp) return null;
    const pts = T.world(comp);
    return pts[index] || null;
  };
})(window);
