/* 와이어(단자 연결선) — 경로 계산, 생성, 자동 번호 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const W = (App.wires = {});

  // 와이어의 월드 경로 점 배열 (Manhattan Z 라우팅)
  W.route = function (state, wire) {
    const a = App.terminals.point(state, wire.fromComp, wire.fromTerm);
    const b = App.terminals.point(state, wire.toComp, wire.toTerm);
    if (!a || !b) return null;
    // 단자에서 살짝 빠져나온 뒤 중간 y에서 수평 이동
    const stub = 8;
    const ay = a.y + (a.side === 'top' ? -stub : stub);
    const by = b.y + (b.side === 'top' ? -stub : stub);
    const my = (ay + by) / 2;
    return [
      { x: a.x, y: a.y },
      { x: a.x, y: ay },
      { x: a.x, y: my },
      { x: b.x, y: my },
      { x: b.x, y: by },
      { x: b.x, y: b.y }
    ];
  };

  // 다음 와이어 번호 (W1, W2, …) — 기존 번호와 충돌 회피
  W.nextLabel = function (state) {
    let max = 0;
    state.wires.forEach(function (w) {
      const m = /^W(\d+)$/.exec(w.label || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'W' + (max + 1);
  };

  W.create = function (state, from, to) {
    return {
      id: App.uid('wire'),
      fromComp: from.compId, fromTerm: from.index,
      toComp: to.compId, toTerm: to.index,
      label: W.nextLabel(state),
      color: '#dc2626'
    };
  };

  // 폴리라인용 점 문자열
  W.pointsStr = function (pts) {
    return pts.map(function (p) { return p.x + ',' + p.y; }).join(' ');
  };

  // 경로 중간 지점 (라벨 위치)
  W.midPoint = function (pts) {
    if (!pts || pts.length < 2) return null;
    const i = Math.floor(pts.length / 2) - 1;
    const a = pts[i], b = pts[i + 1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
})(window);
