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

  // 가로 덕트 중심선으로 배선 경유(자동 라우팅).
  // 두 스터브 사이의 덕트 우선, 없으면 근처(150mm 이내) 덕트로 우회.
  function ductMidY(state, sa, sb) {
    const lo = Math.min(sa.y, sb.y), hi = Math.max(sa.y, sb.y);
    const xlo = Math.min(sa.x, sb.x), xhi = Math.max(sa.x, sb.x);
    const mid = (lo + hi) / 2;
    let best = null, bestScore = Infinity;
    (state.ducts || []).forEach(function (d) {
      if (d.orient !== 'h') return;
      if (d.x + d.lengthMM < xlo || d.x > xhi) return;    // 가로로 겹쳐야
      const cy = d.y + d.widthMM / 2;
      const out = (cy >= lo && cy <= hi) ? 0 : Math.min(Math.abs(cy - lo), Math.abs(cy - hi));
      if (out > 150) return;                              // 너무 먼 덕트는 제외
      const score = out * 1000 + Math.abs(cy - mid);      // 사이 덕트 우선, 그다음 가까운 순
      if (score < bestScore) { bestScore = score; best = cy; }
    });
    return best != null ? Math.round(best) : null;
  }

  // 기본 꺾임점 (Z자). stub 점도 꼭짓점으로 포함 → 단자에서 나오는 수직선도
  // 좌우로 움직일 수 있게 됨(편집 가능한 세그먼트가 됨).
  function defaultCorners(state, wire) {
    const a = term(state, wire, 'from'), b = term(state, wire, 'to');
    if (!a || !b) return [];
    const sa = stub(a), sb = stub(b);
    let midY = (wire.midY != null) ? wire.midY : ductMidY(state, sa, sb);
    if (midY == null) midY = Math.round((sa.y + sb.y) / 2);
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

  // 라벨 자동 증가 (자릿수 유지: 001→002, W9→W10)
  W.incLabel = function (s) {
    const m = /^(.*?)(\d+)$/.exec(s || '');
    if (!m) return (s || 'W') + '1';
    let n = String(parseInt(m[2], 10) + 1);
    while (n.length < m[2].length) n = '0' + n;
    return m[1] + n;
  };

  // 라인번호 일괄 재부여 — 시작점 위치(위→아래, 왼→오) 순서로 start 부터 증가
  W.renumber = function (state, start) {
    const items = state.wires.map(function (w) {
      const r = W.route(state, w);
      return { w: w, p: r ? r[0] : { x: 0, y: 0 } };
    });
    items.sort(function (A, B) { return (A.p.y - B.p.y) || (A.p.x - B.p.x); });
    let cur = (start || 'W1');
    items.forEach(function (it) { it.w.label = cur; cur = W.incLabel(cur); });
    return items.length;
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

  // 표준 색띠(저항/배선 색코드) — 흑갈적등황초파보회흰
  W.COLORS = [
    { n: '흑', v: '#1a1a1a' },
    { n: '갈', v: '#8b4513' },
    { n: '적', v: '#e11d2a' },
    { n: '등', v: '#ff7a00' },
    { n: '황', v: '#ffd400' },
    { n: '초', v: '#16a34a' },
    { n: '파', v: '#1d4ed8' },
    { n: '보', v: '#8b2be2' },
    { n: '회', v: '#9aa0a6' },
    { n: '흰', v: '#ffffff' }
  ];

  // KS 표준 전선 규격(SQ mm²) → AWG 대략 환산
  W.SQ_AWG = { '0.75': '18', '1.25': '16', '2.0': '14', '2.5': '14', '3.5': '12', '5.5': '10', '8': '8', '14': '6', '22': '4', '30': '3', '38': '2', '60': '1/0', '100': '3/0' };
  W.SQ_LIST = ['0.75', '1.25', '2.0', '3.5', '5.5', '8', '14', '22', '30', '38', '60', '100'];

  W.create = function (state, from, to) {
    return {
      id: App.uid('wire'),
      fromComp: from.compId, fromTerm: from.index,
      toComp: to.compId, toTerm: to.index,
      label: W.nextLabel(state),
      color: '#e11d2a', width: 1.2, sq: '', awg: '', acdc: '',
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
  // ── 겹선 분리(같은 경로로 겹쳐 지나가는 배선을 나란히 벌려 구분) ──────────
  // 같은 직선(같은 방향·같은 좌표) 위에서 구간이 겹치는 다른 배선들을 찾아
  // 각 구간에 수직 방향 오프셋을 배정한다. 단자 접점은 그대로 두고 코너에서
  // 다시 이어지므로 직각 형태와 연결성은 유지된다.
  W.SPREAD = 3; // 겹선 간격(mm)
  W.spreadOffsets = function (state) {
    const SP = W.SPREAD;
    const items = [];
    (state.wires || []).forEach(function (w) {
      const R = W.route(state, w);
      if (!R) return;
      for (let i = 0; i < R.length - 1; i++) {
        const p = R[i], q = R[i + 1];
        if (Math.round(p.x) === Math.round(q.x)) {
          items.push({ wid: w.id, key: i, orient: 'V', c: Math.round(p.x), lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
        } else if (Math.round(p.y) === Math.round(q.y)) {
          items.push({ wid: w.id, key: i, orient: 'H', c: Math.round(p.y), lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
        }
      }
    });
    const buckets = {};
    items.forEach(function (s) { const k = s.orient + ':' + s.c; (buckets[k] = buckets[k] || []).push(s); });
    const off = {};
    Object.keys(buckets).forEach(function (k) {
      const arr = buckets[k].slice().sort(function (a, b) { return a.lo - b.lo || (a.wid < b.wid ? -1 : 1); });
      let i = 0;
      while (i < arr.length) {
        let j = i, hi = arr[i].hi;
        const cluster = [arr[i]];
        while (j + 1 < arr.length && arr[j + 1].lo <= hi + 0.5) { // 겹치거나 맞닿음
          j++; cluster.push(arr[j]); hi = Math.max(hi, arr[j].hi);
        }
        const wids = {}; cluster.forEach(function (s) { wids[s.wid] = 1; });
        if (Object.keys(wids).length > 1) { // 서로 다른 배선이 겹칠 때만 분리
          const n = cluster.length;
          cluster.forEach(function (s, idx) {
            off[s.wid + ':' + s.key] = (idx - (n - 1) / 2) * SP;
          });
        }
        i = j + 1;
      }
    });
    return off;
  };

  // 화면 표시용 경로 — 겹선 오프셋을 적용(단자 접점은 정확히 유지).
  // 끝 구간이 오프셋되면 대각(부채꼴) 대신 직각 꺾임(작은 단)으로 연결한다.
  W.displayRoute = function (state, wire, off) {
    const R = W.route(state, wire);
    if (!R) return null;
    if (!off) return R;
    const segOff = [];
    const out = R.map(function (p) { return { x: p.x, y: p.y }; });
    for (let i = 0; i < R.length - 1; i++) {
      const o = off[wire.id + ':' + i] || 0;
      segOff[i] = o;
      if (!o) continue;
      if (Math.round(R[i].x) === Math.round(R[i + 1].x)) { out[i].x += o; out[i + 1].x += o; }
      else { out[i].y += o; out[i + 1].y += o; }
    }
    const last = R.length - 1;
    const res = [];
    res.push({ x: R[0].x, y: R[0].y });                 // 시작 단자(정확히)
    if (segOff[0]) {                                     // 첫 구간 오프셋 → 단자 옆 직각 단
      if (Math.round(R[0].x) === Math.round(R[1].x)) res.push({ x: R[0].x + segOff[0], y: R[0].y });
      else res.push({ x: R[0].x, y: R[0].y + segOff[0] });
    }
    for (let i = 1; i < last; i++) res.push(out[i]);    // 내부 꼭짓점(오프셋 반영)
    if (segOff[last - 1]) {                              // 끝 구간 오프셋 → 단자 옆 직각 단
      if (Math.round(R[last].x) === Math.round(R[last - 1].x)) res.push({ x: R[last].x + segOff[last - 1], y: R[last].y });
      else res.push({ x: R[last].x, y: R[last].y + segOff[last - 1] });
    }
    res.push({ x: R[last].x, y: R[last].y });            // 끝 단자(정확히)
    return res;
  };

  // 둥근 모서리 경로(d) — 각 꼭짓점을 반지름 r 의 곡선으로 깎음(직각/대각 모두)
  W.roundedPath = function (pts, r) {
    if (!pts || pts.length < 2) return '';
    if (pts.length === 2 || !r || r <= 0) {
      return 'M ' + pts.map(function (p) { return p.x + ' ' + p.y; }).join(' L ');
    }
    function d(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
    let s = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const l1 = d(p0, p1) || 1, l2 = d(p1, p2) || 1;
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const a = { x: p1.x + (p0.x - p1.x) / l1 * rr, y: p1.y + (p0.y - p1.y) / l1 * rr };
      const b = { x: p1.x + (p2.x - p1.x) / l2 * rr, y: p1.y + (p2.y - p1.y) / l2 * rr };
      s += ' L ' + a.x + ' ' + a.y + ' Q ' + p1.x + ' ' + p1.y + ' ' + b.x + ' ' + b.y;
    }
    const e = pts[pts.length - 1];
    s += ' L ' + e.x + ' ' + e.y;
    return s;
  };

  // 양 끝 라벨 — 선 끝에서 30mm 안쪽, 선에 정렬(마킹튜브 방식)
  W.LABEL_INSET = 30;
  W.endLabels = function (state, wire, pts) {
    pts = pts || W.route(state, wire);
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
