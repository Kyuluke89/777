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

  // 편집 가능한 세그먼트 — 렌더되는 전체 경로의 모든 직선 구간(단자 옆 포함).
  // i 는 경로(route) 인덱스. pTerm/qTerm 은 끝점이 단자인지 표시(드래그 시 처리).
  W.editSegments = function (state, wire) {
    const R = W.route(state, wire);
    if (!R) return [];
    const segs = [];
    for (let i = 0; i < R.length - 1; i++) {
      const p = R[i], q = R[i + 1];
      const orient = (p.x === q.x) ? 'V' : (p.y === q.y ? 'H' : null);
      if (!orient) continue;
      const len = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
      if (len < 3) continue; // 단자 스터브 등 너무 짧은 구간 제외
      segs.push({
        i: i, orient: orient,
        mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
        pTerm: i === 0, qTerm: i === R.length - 2
      });
    }
    return segs;
  };

  // 드래그 시작 시 corners 를 "현재 전체 경로의 내부 꼭짓점"으로 실체화하고,
  // 단자에 붙은 세그먼트면 스터브+꺾임을 끼워 넣어 옮길 수 있게 만든다.
  // 반환: { cP, cQ } 실제로 움직일 corner 인덱스 쌍.
  W.beginSegmentDrag = function (state, wire, i, orient) {
    const a = term(state, wire, 'from'), b = term(state, wire, 'to');
    const R = W.route(state, wire);
    const corners = R.slice(1, R.length - 1); // 내부 꼭짓점 = 모든 꺾임
    const sideA = (a.side === 'top') ? -1 : 1;
    const sideB = (b.side === 'top') ? -1 : 1;
    let cP = i - 1, cQ = i;
    const pTerm = (i === 0), qTerm = (i === R.length - 2);

    if (pTerm) {
      // A→corners[0] 세그먼트. 단자 옆에 스터브+꺾임 삽입
      const sy = a.y + sideA * STUB;
      if (orient === 'V') {
        corners.splice(0, 0, { x: a.x, y: sy }, { x: a.x, y: sy });
        cP = 1; cQ = 2;
      } else {
        const sx = a.x + sideA * STUB;
        corners.splice(0, 0, { x: sx, y: a.y }, { x: sx, y: a.y });
        cP = 1; cQ = 2;
      }
    } else if (qTerm) {
      // corners[last]→B 세그먼트. B 옆에 꺾임+스터브 삽입
      const cpx = corners[cP] ? corners[cP].x : b.x;
      const cpy = corners[cP] ? corners[cP].y : b.y;
      const sy = b.y + sideB * STUB;
      if (orient === 'V') {
        corners.push({ x: cpx, y: sy }, { x: b.x, y: sy });
        cQ = corners.length - 2;
      } else {
        const sx = b.x + sideB * STUB;
        corners.push({ x: sx, y: cpy }, { x: sx, y: b.y });
        cQ = corners.length - 2;
      }
    }
    wire.corners = corners;
    return { cP: cP, cQ: cQ };
  };

  // 꼭짓점 정리(연속 중복/일직선 제거)
  W.cleanCorners = function (corners) {
    const r = dedup(corners.slice());
    return r;
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
  function polyLen(pts) {
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return L;
  }
  // 배선(라인) 실제 경로 길이(mm)
  W.length = function (state, wire) {
    const pts = W.route(state, wire);
    return pts ? Math.round(polyLen(pts)) : 0;
  };
  // 전체 배선 총 길이(mm)
  W.totalLength = function (state) {
    return (state.wires || []).reduce(function (s, w) { return s + W.length(state, w); }, 0);
  };
  // 경로 시작에서 dist 만큼 진행한 점 + 그 지점 세그먼트 방향
  function pointAlong(pts, dist) {
    let rem = dist;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (rem <= seg || i === pts.length - 2) {
        const t = seg > 0 ? Math.max(0, Math.min(1, rem / seg)) : 0;
        const dx = seg > 0 ? (b.x - a.x) / seg : 1, dy = seg > 0 ? (b.y - a.y) / seg : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: dx, dy: dy };
      }
      rem -= seg;
    }
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y, dx: 1, dy: 0 };
  }
  // 텍스트 회전: 가로 좌→우, 세로 아래→위(앞글자 아래). [-90,90)
  function textAng(dx, dy) {
    let a = Math.atan2(dy, dx) * 180 / Math.PI;
    while (a < -90) a += 180;
    while (a >= 90) a -= 180;
    return a;
  }
  // 양 끝 라벨 — 선 끝에서 30mm 안쪽, 선에 정렬(마킹튜브 방식)
  W.LABEL_INSET = 30;
  W.endLabels = function (state, wire) {
    const pts = W.route(state, wire);
    if (!pts || pts.length < 2) return null;
    const L = polyLen(pts);
    const d = Math.min(W.LABEL_INSET, L * 0.45);   // 너무 짧으면 안쪽으로 조정
    const A = pointAlong(pts, d);
    const B = pointAlong(pts.slice().reverse(), d);
    return {
      a: { x: A.x, y: A.y, ang: textAng(A.dx, A.dy) },
      b: { x: B.x, y: B.y, ang: textAng(B.dx, B.dy) }
    };
  };
})(window);
