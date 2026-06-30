/* 치수선(Dimension) — 두 점 사이 정렬 치수, 오프셋(치수선 위치) 조절 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const D = (App.dims = {});

  // 치수 기하: 측정점 p1,p2 + 법선 오프셋 off → 치수선 a1,a2, 중점 등
  D.geom = function (dim) {
    const x1 = dim.x1, y1 = dim.y1, x2 = dim.x2, y2 = dim.y2;
    const dx = x2 - x1, dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;          // 단위 법선
    const off = dim.off || 0;
    const a1 = { x: x1 + nx * off, y: y1 + ny * off };
    const a2 = { x: x2 + nx * off, y: y2 + ny * off };
    const mid = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
    let ang = Math.atan2(dy, dx) * 180 / Math.PI;
    // 텍스트 회전: [-90, 90) 로 정규화 → 가로는 수평, 세로는 아래→위로 읽힘(기계제도 표준)
    let textAng = ang;
    while (textAng < -90) textAng += 180;
    while (textAng >= 90) textAng -= 180;
    return { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, a1: a1, a2: a2, mid: mid, nx: nx, ny: ny, L: L, ang: ang, textAng: textAng };
  };

  // 표시 길이(mm, 반올림)
  D.length = function (dim) { return Math.round(Math.hypot(dim.x2 - dim.x1, dim.y2 - dim.y1)); };

  // 커서 위치 → 오프셋(부호 포함): 측정선 법선 방향 투영
  D.offsetFromPoint = function (dim, px, py) {
    const dx = dim.x2 - dim.x1, dy = dim.y2 - dim.y1;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    return (px - dim.x1) * nx + (py - dim.y1) * ny;
  };

  D.create = function (x1, y1, x2, y2, off) {
    return { id: App.uid('dim'), x1: x1, y1: y1, x2: x2, y2: y2, off: off || 0 };
  };

  // 경계 박스(선택/마퀴용)
  D.bounds = function (dim) {
    const g = D.geom(dim);
    const xs = [g.p1.x, g.p2.x, g.a1.x, g.a2.x], ys = [g.p1.y, g.p2.y, g.a1.y, g.a2.y];
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };
})(window);
