/* 와이어(단자 연결선) — 편집 가능한 직각(Orthogonal) 라우팅
 *  - 기본: 단자A → 수직 → 수평(midY) → 수직 → 단자B (Z자)
 *  - wire.corners: 사용자가 편집한 꺾임점(절대좌표) 배열. 있으면 그대로 사용.
 *  - 세그먼트(수평/수직)를 잡아 수직/수평으로만 이동, 더블클릭으로 꺾임 추가.
 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const W = (App.wires = {});

  const STUB = 8; // 단자에서 빠져나오는 길이(mm)

  function term(state, wire, which) {
    return which === 'from'
      ? App.terminals.point(state, wire.fromComp, wire.fromTerm)
      : App.terminals.point(state, wire.toComp, wire.toTerm);
  }
  function stub(p) {
    return { x: p.x, y: p.y + (p.side === 'top' ? -STUB : STUB) };
  }

  // 기본 꺾임점 (Z자). stub 점도 꼭짓점으로 포함 → 단자에서 나오는 수직선도
  // 좌우로 움직일 수 있게 됨(편집 가능한 세그먼트가 됨).
  function defaultCorners(state, wire) {
    const a = term(state, wire, 'from'), b = term(state, wire, 'to');
    if (!a || !b) return [];
    const sa = stub(a), sb = stub(b);
    const midY = (wire.midY != null) ? wire.midY : Math.round((sa.y + sb.y) / 2);
    return [
      { x: sa.x, y: sa.y },   // A 단자 스터브
      { x: sa.x, y: midY },   // 좌 수직선 ↔ 좌우 이동
      { x: sb.x, y: midY },   // 수평선 ↔ 상하 이동
      { x: sb.x, y: sb.y }    // B 단자 스터브
    ];
  }

  // 현재 편집용 꺾임점 (편집된 corners 우선)
  W.corners = function (state, wire) {
    return (wire.corners && wire.corners.length) ? wire.corners : defaultCorners(state, wire);
  };
  W.defaultCorners = defaultCorners;

  // 직각화: 두 점이 대각이면 모서리 하나 삽입(수직 먼저)
  function ortho(anchors) {
    const out = [anchors[0]];
    for (let i = 1; i < anchors.length; i++) {
      const p = out[out.length - 1], q = anchors[i];
      if (p.x !== q.x && p.y !== q.y) out.push({ x: p.x, y: q.y });
      out.push(q);
    }
    return out;
  }
  // 중복/일직선 중간점 제거
  function dedup(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (out.length && out[out.length - 1].x === p.x && out[out.length - 1].y === p.y) continue;
      out.push(p);
    }
    for (let i = 1; i < out.length - 1;) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      const colinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (colinear) out.splice(i, 1); else i++;
    }
    return out;
  }

  // 와이어의 월드 경로 점 배열 (corners 에 stub 포함됨)
  W.route = function (state, wire) {
    const a = term(state, wire, 'from'), b = term(state, wire, 'to');
    if (!a || !b) return null;
    const corners = W.corners(state, wire);
    const anchors = [{ x: a.x, y: a.y }].concat(corners, [{ x: b.x, y: b.y }]);
    return dedup(ortho(anchors));
  };

  // 편집 가능한 세그먼트(양 끝이 모두 꺾임점) → 핸들용
  W.editSegments = function (state, wire) {
    const corners = W.corners(state, wire);
    const segs = [];
    for (let k = 0; k < corners.length - 1; k++) {
      const p = corners[k], q = corners[k + 1];
      const orient = (p.x === q.x) ? 'V' : (p.y === q.y ? 'H' : 'D');
      if (orient === 'D') continue;
      segs.push({ k: k, orient: orient, mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } });
    }
    return segs;
  };

  // 세그먼트 k 에 꺾임 추가(더블클릭) — corners 를 직접 변형
  W.addBend = function (corners, k, clickX, clickY) {
    const p = corners[k], q = corners[k + 1];
    const JOG = 20;
    if (p.y === q.y) { // 수평 → 위로 점프하는 꺾임
      const y = p.y, x2 = q.x;
      let cx = clickX;
      const lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
      cx = Math.max(lo + 5, Math.min(hi - 5, cx));
      const yj = y - JOG;
      corners.splice(k + 1, 0, { x: cx, y: y }, { x: cx, y: yj }, { x: x2, y: yj });
    } else { // 수직 → 옆으로 점프
      const x = p.x, y2 = q.y;
      let cy = clickY;
      const lo = Math.min(p.y, q.y), hi = Math.max(p.y, q.y);
      cy = Math.max(lo + 5, Math.min(hi - 5, cy));
      const xj = x + JOG;
      corners.splice(k + 1, 0, { x: x, y: cy }, { x: xj, y: cy }, { x: xj, y: y2 });
    }
  };

  // 다음 와이어 번호 (W1, W2, …)
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
      color: '#dc2626',
      corners: null, midY: null
    };
  };

  W.pointsStr = function (pts) {
    return pts.map(function (p) { return p.x + ',' + p.y; }).join(' ');
  };
  W.midPoint = function (pts) {
    if (!pts || pts.length < 2) return null;
    const i = Math.floor(pts.length / 2) - 1;
    const a = pts[i], b = pts[i + 1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  // 양 끝 라벨 위치(단자 바로 바깥)
  W.endLabels = function (state, wire) {
    const a = term(state, wire, 'from'), b = term(state, wire, 'to');
    if (!a || !b) return null;
    return {
      a: { x: a.x + 2.5, y: a.y + (a.side === 'top' ? -3 : 5) },
      b: { x: b.x + 2.5, y: b.y + (b.side === 'top' ? -3 : 5) }
    };
  };
})(window);
