/* 캔버스 상호작용 — 선택/이동/그리기/배치 + 키보드 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Interact = (App.interact = {});

  let svg;
  let gesture = null;
  let lastPanDist = 0; // 우클릭 팬 이동량(컨텍스트 메뉴 억제용) // { type, sp, snap, origPos, orient, kind }

  function snapV(v) {
    return App.geom.snap(v, App.store.get().panel.gridMM);
  }

  // 라벨 자동 증가: 1→2, W1→W2, L01→L02(자리수 유지), 숫자없으면 +1
  function incLabel(s) {
    const m = /^(.*?)(\d+)$/.exec(s || '');
    if (!m) return (s || '') + '1';
    const next = String(parseInt(m[2], 10) + 1);
    const padded = m[2].length > next.length ? m[2].slice(0, m[2].length - next.length) + next : next;
    return m[1] + padded;
  }

  function selectOnly(id) {
    App.ui.selected.clear();
    if (id) App.ui.selected.add(id);
    App.render.all();
    if (App.inspector) App.inspector.update();
  }
  function selectMany(ids) {
    App.ui.selected.clear();
    ids.forEach(function (id) { App.ui.selected.add(id); });
    App.render.all();
    if (App.inspector) App.inspector.update();
  }

  // 타입별 호기번호 접두 (IEC 표준 참고)
  const REF_PREFIX = { MCCB: 'Q', ELCB: 'Q', MCB: 'F', CP: 'F', MC: 'K', RELAY: 'K', SMPS: 'G', PLC: 'A', TB: 'X', ETC: 'A' };
  function nextRef(state, type) {
    const pfx = REF_PREFIX[type] || 'A';
    let max = 0;
    state.components.forEach(function (c) {
      const m = new RegExp('^' + pfx + '(\\d+)$').exec(c.label || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return pfx + (max + 1);
  }

  function placeComponent(part, wx, wy) {
    const state = App.store.get();
    let x = snapV(wx - part.w / 2);
    let y = snapV(wy - part.h / 2);
    // 가까운 가로 레일이 있으면 부품 하단을 레일 상단에 정렬
    const railTop = App.geom.snapToRail(state, x, wy - part.h / 2, part.h);
    if (railTop != null) y = railTop;
    const comp = {
      id: App.uid('cmp'),
      partNo: part.partNo,
      type: part.type || 'ETC',
      x: x, y: y,
      widthMM: part.w, heightMM: part.h,
      rotation: 0,
      // 기본 표시 = 라이브러리 타이틀(품번). 심볼은 예외(품명/라벨 유지)
      label: part.type === 'SYM' ? (part.name || part.partNo) : (part.partNo || part.name),
      tag: '',                          // 호기번호(선택) — 인스펙터에서 입력
      partName: part.name || '',
      manufacturer: part.manufacturer || '',
      // 라이브러리에 저장된 글씨 배치(위치/방향) 그대로 적용
      labelDx: part.labelDx || 0, labelDy: part.labelDy || 0,
      typeDx: part.typeDx || 0, typeDy: part.typeDy || 0,
      tagDx: part.tagDx || 0, tagDy: part.tagDy || 0,
      textVert: part.textVert || false,
      labelVert: part.labelVert != null ? part.labelVert : null,
      typeVert: part.typeVert != null ? part.typeVert : null,
      tagVert: part.tagVert != null ? part.tagVert : null,
      terminals: part.terminals != null ? part.terminals : App.terminals.defaultCount(part.type),
      term: part.term ? App.clone(part.term) : null,
      sym: part.sym || null,
      shapes: part.shapes ? App.clone(part.shapes) : null,
      img: part.img || null, imgX: part.imgX || 0, imgY: part.imgY || 0, imgS: part.imgS || 1, imgAR: part.imgAR || 0, imgO: part.imgO != null ? part.imgO : 1, imgCX: part.imgCX || 0, imgCY: part.imgCY || 0, imgCW: part.imgCW || 0, imgCH: part.imgCH || 0
    };
    App.store.commit(function (s) { s.components.push(comp); });
    selectOnly(comp.id);
  }

  function startDraw(orient, kind, sp) {
    gesture = { type: 'draw', orient: orient, kind: kind, sp: sp };
  }

  function updateDraw(cp) {
    const sp = gesture.sp;
    const state = App.store.get();
    let rect;
    if (gesture.orient === 'h') {
      const x = snapV(Math.min(sp.x, cp.x));
      const len = Math.abs(snapV(cp.x) - x);
      const w = gesture.kind === 'ducts' ? (App.ui.ductWidth || 60) : (App.ui.railWidth || 35);
      rect = { x: x, y: snapV(sp.y), w: len, h: w };
    } else {
      const y = snapV(Math.min(sp.y, cp.y));
      const len = Math.abs(snapV(cp.y) - y);
      const w = gesture.kind === 'ducts' ? (App.ui.ductWidth || 60) : (App.ui.railWidth || 35);
      rect = { x: snapV(sp.x), y: y, w: w, h: len };
    }
    gesture.rect = rect;
    App.render.preview(rect);
  }

  function finishDraw() {
    App.render.preview(null);
    const r = gesture.rect;
    if (!r) return;
    const lenMM = gesture.orient === 'h' ? r.w : r.h;
    if (lenMM < App.store.get().panel.gridMM) return; // 너무 짧으면 취소
    const orient = gesture.orient;
    const id = App.uid(gesture.kind === 'ducts' ? 'dct' : 'rail');
    if (gesture.kind === 'ducts') {
      const w = App.ui.ductWidth || 60;
      App.store.commit(function (s) {
        s.ducts.push({ id: id, orient: orient, x: r.x, y: r.y, lengthMM: lenMM, widthMM: w });
      });
    } else {
      const w = App.ui.railWidth || 35;
      App.store.commit(function (s) {
        s.rails.push({ id: id, orient: orient, x: r.x, y: r.y, lengthMM: lenMM, widthMM: w, type: 'DIN35' });
      });
    }
    selectOnly(id);
  }

  // 와이어 세그먼트 드래그 — 수평선은 상하(y), 수직선은 좌우(x). 단자 옆 구간도 가능.
  function startWireSeg(wireId, i, orient, sp) {
    const snap = App.store.snapshot();
    const wf = App.store.findById(wireId);
    if (!wf) return;
    const wire = wf.item;
    // 전체 경로를 꼭짓점으로 실체화 + 단자 옆이면 스터브/꺾임 삽입
    const map = App.wires.beginSegmentDrag(App.store.get(), wire, i, orient);
    gesture = {
      type: 'wireseg', snap: snap, sp: sp, wireId: wireId, orient: orient,
      cP: map.cP, cQ: map.cQ, orig: App.clone(wire.corners), moved: false
    };
  }

  function updateWireSeg(cp) {
    const wire = App.store.findById(gesture.wireId).item;
    const c = wire.corners, o = gesture.orig;
    const cP = gesture.cP, cQ = gesture.cQ;
    if (gesture.orient === 'H') {
      const ny = snapV(o[cP].y + (cp.y - gesture.sp.y));
      c[cP].y = ny; c[cQ].y = ny;
    } else {
      const nx = snapV(o[cP].x + (cp.x - gesture.sp.x));
      c[cP].x = nx; c[cQ].x = nx;
    }
    gesture.moved = true;
    App.store.touch();
  }

  function addBendAt(wireId, cp) {
    const wf = App.store.findById(wireId);
    if (!wf) return;
    const state = App.store.get();
    const wire = wf.item;
    App.store.commit(function () {
      // 전체 경로를 꼭짓점으로 실체화 후, 클릭에 가장 가까운 내부 세그먼트에 꺾임 추가
      const R = App.wires.route(state, wire);
      wire.corners = R.slice(1, R.length - 1);
      let best = -1, bd = Infinity;
      for (let k = 0; k < wire.corners.length - 1; k++) {
        const p = wire.corners[k], q = wire.corners[k + 1];
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const d = (mx - cp.x) * (mx - cp.x) + (my - cp.y) * (my - cp.y);
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) App.wires.addBend(wire.corners, best, cp.x, cp.y);
      wire.corners = App.wires.cleanCorners(wire.corners);
    });
  }

  function startMove(sp) {
    const snap = App.store.snapshot();
    const origPos = {};
    App.ui.selected.forEach(function (id) {
      const f = App.store.findById(id);
      if (!f || f.item.locked) return; // 잠긴 항목은 이동 제외
      if (f.kind === 'clines' || f.kind === 'dimensions') {
        origPos[id] = { pts: true, x1: f.item.x1, y1: f.item.y1, x2: f.item.x2, y2: f.item.y2 };
      } else origPos[id] = { x: f.item.x, y: f.item.y };
    });
    gesture = { type: 'move', sp: sp, snap: snap, origPos: origPos, moved: false };
  }

  function updateMove(cp) {
    let dx = cp.x - gesture.sp.x;
    let dy = cp.y - gesture.sp.y;
    if (gesture.constrain) { // Shift: 수평/수직 제한(우세 축만)
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
    }
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) gesture.moved = true;
    const state = App.store.get();
    for (const id in gesture.origPos) {
      const f = App.store.findById(id);
      if (!f) continue;
      const o = gesture.origPos[id];
      if (o.pts) { // 두 점 엔티티(센터선/치수) — 양 끝점을 함께 이동
        f.item.x1 = snapV(o.x1 + dx); f.item.y1 = snapV(o.y1 + dy);
        f.item.x2 = snapV(o.x2 + dx); f.item.y2 = snapV(o.y2 + dy);
        continue;
      }
      f.item.x = snapV(o.x + dx);
      f.item.y = snapV(o.y + dy);
      // 부품은 가까운 찬넬(레일) 중심에 자동 정렬
      if (f.kind === 'components') {
        const rt = App.geom.snapToRail(state, f.item.x, f.item.y, f.item.heightMM);
        if (rt != null) f.item.y = rt;
      }
    }
    // 스마트 정렬 가이드 — 단일 부품 이동 시 다른 부품/전장 모서리·중심에 자석
    let guides = null;
    const ids = Object.keys(gesture.origPos);
    if (ids.length === 1) {
      const f1 = App.store.findById(ids[0]);
      if (f1 && f1.kind === 'components') guides = smartAlign(state, f1.item);
    }
    App.store.touch();
    if (App.render.guides) App.render.guides(guides); // touch 재렌더 후 그려야 유지됨
  }

  // 이동 중인 부품 m 을 다른 부품/전장의 모서리·중심에 스냅하고 가이드선 반환
  function smartAlign(state, m) {
    const tol = App.viewport.pxToMM(6);
    const p = state.panel;
    const lines = [];
    const xTargets = [0, p.widthMM, p.widthMM / 2];
    const yTargets = [0, p.heightMM, p.heightMM / 2];
    state.components.forEach(function (o) {
      if (o.id === m.id) return;
      xTargets.push(o.x, o.x + o.widthMM, o.x + o.widthMM / 2);
      yTargets.push(o.y, o.y + o.heightMM, o.y + o.heightMM / 2);
    });
    const xCands = [{ off: 0 }, { off: m.widthMM }, { off: m.widthMM / 2 }];
    const yCands = [{ off: 0 }, { off: m.heightMM }, { off: m.heightMM / 2 }];
    let best = null;
    xCands.forEach(function (c) {
      xTargets.forEach(function (t) {
        const d = Math.abs((m.x + c.off) - t);
        if (d <= tol && (!best || d < best.d)) best = { d: d, t: t, off: c.off };
      });
    });
    if (best) { m.x = best.t - best.off; lines.push({ x: best.t }); }
    best = null;
    yCands.forEach(function (c) {
      yTargets.forEach(function (t) {
        const d = Math.abs((m.y + c.off) - t);
        if (d <= tol && (!best || d < best.d)) best = { d: d, t: t, off: c.off };
      });
    });
    if (best) { m.y = best.t - best.off; lines.push({ y: best.t }); }
    return lines.length ? lines : null;
  }

  function finishMove() {
    if (gesture.moved) App.store.pushUndo(gesture.snap);
    if (App.render.guides) App.render.guides(null);
    if (App.inspector) App.inspector.update();
  }

  function onPointerDown(e) {
    if (e.target.closest && e.target.closest('.no-canvas')) return;
    const sp = App.viewport.clientToWorld(e.clientX, e.clientY);
    const panKey = e.button === 1 || e.button === 2 || App.ui.spaceDown;

    if (panKey) {
      gesture = { type: 'pan', last: { x: e.clientX, y: e.clientY }, dist: 0 };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    // 배치 모드
    if (App.ui.placing) {
      placeComponent(App.ui.placing, sp.x, sp.y);
      if (!e.shiftKey) {
        App.ui.placing = null;
        if (App.palette) App.palette.refresh();
      }
      return;
    }

    // 속성 복사 모드 (캐드 MATCHPROP): 원본 속성을 클릭한 같은 종류 대상에 적용, Esc 종료
    if (App.ui.matchProp) {
      const mpEl = e.target.closest && e.target.closest('[data-id][data-kind]');
      const mp = App.ui.matchProp;
      if (mpEl) {
        const mid = mpEl.getAttribute('data-id'), mkind = mpEl.getAttribute('data-kind');
        if (mkind === mp.kind && mid !== mp.srcId) {
          App.store.commit(function () {
            const fm = App.store.findById(mid);
            if (fm) { for (const k in mp.props) fm.item[k] = App.clone(mp.props[k]); }
          });
          App.render.all();
          if (App.toolbar) App.toolbar.flash('속성 적용 — 계속 클릭하거나 Esc로 종료');
        } else if (mkind !== mp.kind) {
          if (App.toolbar) App.toolbar.flash('같은 종류에만 적용할 수 있습니다');
        }
        return;
      }
      App.ui.matchProp = null; // 빈 곳 클릭 → 종료
      if (App.toolbar) App.toolbar.flash('속성 복사 종료');
      return;
    }

    // 선 정렬 모드: 기준선(배선 구간) 클릭 → 상대선 클릭 → 같은 좌표로 정렬 (Esc 종료)
    if (App.ui.wireAlign) {
      const waEl = e.target.closest && e.target.closest('[data-id][data-kind="wires"]');
      const wa = App.ui.wireAlign;
      if (waEl) {
        const wid = waEl.getAttribute('data-id');
        const wf = App.store.findById(wid);
        if (wf) {
          if (wa.stage === 0) {
            const seg = nearestWireSeg(App.store.get(), wf.item, sp, null);
            if (seg) {
              wa.stage = 1; wa.orient = seg.orient; wa.coord = seg.coord; wa.refId = wid;
              selectOnly(wid);
              if (App.toolbar) App.toolbar.flash('기준선 지정(' + (seg.orient === 'H' ? '수평 y=' : '수직 x=') + seg.coord + ') — 정렬할 선을 클릭하세요 (Esc 종료)');
            }
          } else {
            if (wid === wa.refId) { if (App.toolbar) App.toolbar.flash('기준선 자신입니다 — 다른 선을 클릭하세요'); return; }
            const seg = nearestWireSeg(App.store.get(), wf.item, sp, wa.orient);
            if (!seg) { if (App.toolbar) App.toolbar.flash('같은 방향(' + (wa.orient === 'H' ? '수평' : '수직') + ') 구간이 없습니다'); return; }
            App.store.commit(function () {
              const wf2 = App.store.findById(wid);
              if (!wf2) return;
              const map = App.wires.beginSegmentDrag(App.store.get(), wf2.item, seg.i, seg.orient);
              if (wa.orient === 'H') { wf2.item.corners[map.cP].y = wa.coord; wf2.item.corners[map.cQ].y = wa.coord; }
              else { wf2.item.corners[map.cP].x = wa.coord; wf2.item.corners[map.cQ].x = wa.coord; }
              wf2.item.corners = App.wires.cleanCorners(wf2.item.corners);
            });
            App.render.all();
            if (App.toolbar) App.toolbar.flash('선 정렬 적용 — 계속 클릭하거나 Esc로 종료');
          }
        }
        return;
      }
      App.ui.wireAlign = null; // 빈 곳 클릭 → 종료
      if (App.toolbar) App.toolbar.flash('선 정렬 종료');
      return;
    }

    // 사이 센터 모드: 기준 2개 클릭(예: 위 덕트, 아래 덕트) → 선택 항목을 그 사이 정중앙으로
    if (App.ui.centerBetween) {
      const cbEl = e.target.closest && e.target.closest('[data-id][data-kind]');
      const cb = App.ui.centerBetween;
      if (cbEl) {
        const rid = cbEl.getAttribute('data-id'), rkind = cbEl.getAttribute('data-kind');
        if (cb.ids.indexOf(rid) >= 0) {
          if (App.toolbar) App.toolbar.flash('대상 자신은 기준이 될 수 없습니다 — 다른 항목을 클릭하세요');
          return;
        }
        const rf = App.store.findById(rid);
        if (rf) {
          cb.refs.push(App.geom.bounds(rkind, rf.item));
          if (cb.refs.length === 1) {
            if (App.toolbar) App.toolbar.flash('기준 2번째 클릭 (예: 아래 덕트)');
          } else {
            applyCenterBetween(cb);
            App.ui.centerBetween = null;
          }
        }
        return;
      }
      App.ui.centerBetween = null; // 빈 곳 클릭 → 취소
      if (App.toolbar) App.toolbar.flash('사이 센터 취소');
      return;
    }

    const tool = App.ui.tool;

    // 와이어 도구: 단자 클릭 → 단자 클릭
    if (tool === 'wire') {
      const term = e.target.closest && e.target.closest('[data-term]');
      let pick = null;
      if (term) {
        pick = { compId: term.getAttribute('data-comp'), index: parseInt(term.getAttribute('data-term'), 10) };
      } else {
        const near = App.geom.nearestTerminal(App.store.get(), sp.x, sp.y, 12);
        if (near) pick = { compId: near.compId, index: near.index };
      }
      if (!pick) { App.ui.wireStart = null; App.render.wirePreview(null); return; }
      if (!App.ui.wireStart) {
        App.ui.wireStart = pick;
      } else {
        if (App.ui.wireStart.compId === pick.compId && App.ui.wireStart.index === pick.index) {
          App.ui.wireStart = null; App.render.wirePreview(null); return;
        }
        const from = App.ui.wireStart, to = pick;
        App.store.commit(function (s) {
          const w = App.wires.create(s, from, to);
          if (App.ui.nextWireLabel) w.label = App.ui.nextWireLabel; // 사용자 지정 라인번호
          const wd = App.ui.wireDefaults; // 활성 프리셋(색/두께/규격)
          if (wd) {
            if (wd.color) w.color = wd.color;
            if (wd.width != null) w.width = wd.width;
            if (wd.sq != null) w.sq = wd.sq;
            if (wd.awg != null) w.awg = wd.awg;
            if (wd.acdc != null) w.acdc = wd.acdc;
          }
          s.wires.push(w);
        });
        // 지정 번호면 자동 증가 후 입력칸 갱신
        if (App.ui.nextWireLabel) {
          App.ui.nextWireLabel = incLabel(App.ui.nextWireLabel);
          const inp = document.getElementById('wire-next');
          if (inp) inp.value = App.ui.nextWireLabel;
        }
        App.ui.wireStart = null;
        App.render.wirePreview(null);
      }
      return;
    }

    // 치수 도구: 점1 → 점2 → 오프셋 위치 (캐드식 3클릭, 스냅)
    if (tool === 'dim') {
      const state = App.store.get();
      const d = App.ui.dim || (App.ui.dim = { stage: 0 });
      if (d.stage === 0) {
        d.p1 = App.geom.snapPoint(state, sp.x, sp.y, App.viewport.pxToMM(8)); d.stage = 1;
      } else if (d.stage === 1) {
        d.p2 = App.geom.snapPoint(state, sp.x, sp.y, App.viewport.pxToMM(8)); d.stage = 2;
      } else {
        const base = { x1: d.p1.x, y1: d.p1.y, x2: d.p2.x, y2: d.p2.y };
        const off = snapV(App.dims.offsetFromPoint(base, sp.x, sp.y));
        const dim = App.dims.create(base.x1, base.y1, base.x2, base.y2, off);
        App.store.commit(function (s) { s.dimensions.push(dim); });
        App.ui.dim = { stage: 0 };
        App.render.dimPreview(null); App.render.snapMarker(null);
        selectOnly(dim.id);
      }
      return;
    }

    // 센터선 도구: 두 점(위/아래 또는 좌/우) 클릭 → 일점쇄선 중심선 (수직/수평 근처면 자동 정렬)
    if (tool === 'cline') {
      const state = App.store.get();
      const c = App.ui.cline || (App.ui.cline = { stage: 0 });
      const pt = App.geom.snapPoint(state, sp.x, sp.y, App.viewport.pxToMM(8));
      if (c.stage === 0) {
        c.p1 = pt; c.stage = 1;
      } else {
        let x2 = pt.x, y2 = pt.y;
        const adx = Math.abs(x2 - c.p1.x), ady = Math.abs(y2 - c.p1.y);
        if (adx < ady * 0.15) x2 = c.p1.x;       // 거의 수직 → 수직 정렬
        else if (ady < adx * 0.15) y2 = c.p1.y;  // 거의 수평 → 수평 정렬
        const id = App.uid('cl');
        App.store.commit(function (s) {
          s.clines = s.clines || [];
          s.clines.push({ id: id, x1: c.p1.x, y1: c.p1.y, x2: x2, y2: y2 });
        });
        App.ui.cline = { stage: 0 };
        App.render.clinePreview(null); App.render.snapMarker(null);
        selectOnly(id);
      }
      return;
    }

    // 자유 텍스트 도구: 클릭 지점에 주석 텍스트 배치
    if (tool === 'text') {
      const tid = App.uid('txt');
      App.store.commit(function (s) {
        s.texts = s.texts || [];
        s.texts.push({ id: tid, x: sp.x, y: sp.y, text: '텍스트', size: 8, color: '#0f172a' });
      });
      selectOnly(tid);
      return;
    }

    // 덕트: 길이를 미리 입력해 두면(덕트길이 칸) 클릭 한 번으로 그 크기 배치, 아니면 드래그
    if (tool === 'duct-h' || tool === 'duct-v') {
      const fixedLen = App.ui.ductLen || 0;
      if (fixedLen > 0) {
        const orient = tool === 'duct-h' ? 'h' : 'v';
        const id = App.uid('dct');
        App.store.commit(function (s) {
          s.ducts.push({ id: id, orient: orient, x: snapV(sp.x), y: snapV(sp.y), lengthMM: fixedLen, widthMM: App.ui.ductWidth || 60 });
        });
        selectOnly(id);
        return;
      }
      startDraw(tool === 'duct-h' ? 'h' : 'v', 'ducts', sp); svg.setPointerCapture(e.pointerId); return;
    }
    if (tool === 'rail-h') { startDraw('h', 'rails', sp); svg.setPointerCapture(e.pointerId); return; }
    if (tool === 'rail-v') { startDraw('v', 'rails', sp); svg.setPointerCapture(e.pointerId); return; }

    // 클릭 지점 아래의 모든 요소에서 속성으로 핸들 찾기(겹쳐도 우선순위대로)
    // → 짧은 선에서 라벨이 위에 겹쳐도 세그먼트 이동 핸들을 먼저 잡게 함
    const stack = (document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target]);
    function pick(attr) {
      for (let i = 0; i < stack.length; i++) {
        const m = stack[i].closest && stack[i].closest('[' + attr + ']');
        if (m) return m;
      }
      return null;
    }

    // 배선 끝점 핸들 드래그 — 다른 단자에 놓으면 연결 변경
    const wendEl = pick('data-wend');
    if (wendEl) {
      startWireEnd(wendEl.getAttribute('data-wire'), wendEl.getAttribute('data-wend'), sp);
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // 와이어 세그먼트 핸들 드래그 (선택된 와이어 편집) — 라벨보다 우선
    const segEl = pick('data-seg');
    if (segEl) {
      startWireSeg(segEl.getAttribute('data-wire'),
        parseInt(segEl.getAttribute('data-seg'), 10),
        segEl.getAttribute('data-orient'), sp);
      svg.setPointerCapture(e.pointerId);
      App.render.all(); // 핸들 위치 갱신
      return;
    }

    // 치수 중앙 핸들 → 오프셋(치수선 위치) 이동
    const dimEl = pick('data-dim');
    if (dimEl) {
      startDimOff(dimEl.getAttribute('data-dim'), sp);
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // 덕트/레일 끝 리사이즈 핸들 드래그 (길이 조절)
    const drEl = pick('data-dresize');
    if (drEl) {
      startDuctResize(drEl.getAttribute('data-dtarget'), drEl.getAttribute('data-dresize'), sp);
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // 덕트 라벨 스티커 드래그 (덕트 길이 방향 이동) — Ctrl+드래그: 복사해서 끌기
    const stkEl = pick('data-sticker');
    if (stkEl) {
      startStickerDrag(stkEl.getAttribute('data-duct'), stkEl.getAttribute('data-sticker'), sp, e.ctrlKey || e.metaKey);
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // 글씨(라벨) 드래그 — 부품 이름 / 배선 라벨
    const lblEl = pick('data-labelfor');
    if (lblEl) { startLabelDrag('comp', lblEl.getAttribute('data-labelfor'), null, sp); svg.setPointerCapture(e.pointerId); return; }
    const tagEl = pick('data-tagfor');
    if (tagEl) { startLabelDrag('tag', tagEl.getAttribute('data-tagfor'), null, sp); svg.setPointerCapture(e.pointerId); return; }
    const typeEl = pick('data-typefor');
    if (typeEl) { startLabelDrag('type', typeEl.getAttribute('data-typefor'), null, sp); svg.setPointerCapture(e.pointerId); return; }
    const titleEl = pick('data-titlemove');
    if (titleEl) { startTitleDrag(sp); svg.setPointerCapture(e.pointerId); return; }
    const wlblEl = pick('data-wirelabel');
    if (wlblEl) { startLabelDrag('wire', wlblEl.getAttribute('data-wirelabel'), wlblEl.getAttribute('data-end'), sp); svg.setPointerCapture(e.pointerId); return; }

    // 선택 도구
    const node = e.target.closest && e.target.closest('[data-id]');
    if (node) {
      const id = node.getAttribute('data-id');
      if (e.shiftKey) {
        if (App.ui.selected.has(id)) App.ui.selected.delete(id); else App.ui.selected.add(id);
        App.render.all();
        if (App.inspector) App.inspector.update();
      } else if (!App.ui.selected.has(id)) {
        selectOnly(id);
      }
      // Alt+드래그: 제자리 복제 후 복제본을 끌기 (캐드 방식)
      if (e.altKey && App.ui.selected.size) {
        const nids = duplicateInPlace();
        if (nids.length) selectMany(nids);
      }
      startMove(sp);
      svg.setPointerCapture(e.pointerId);
    } else {
      // 빈 공간 → 영역(마퀴) 선택. (이동은 Space/휠클릭/우클릭)
      if (App.ui.selected.size && !e.shiftKey) selectOnly(null);
      gesture = { type: 'marquee', sp: sp, add: e.shiftKey };
      svg.setPointerCapture(e.pointerId);
    }
  }

  function rectFrom(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }
  function rectsIntersect(a, b) {
    return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y);
  }
  function updateMarquee(cp) {
    gesture.rect = rectFrom(gesture.sp, cp);
    App.render.marquee(gesture.rect);
  }
  function finishMarquee() {
    App.render.marquee(null);
    const r = gesture.rect;
    if (!r || (r.w < 1 && r.h < 1)) return;
    const state = App.store.get();
    const hit = [];
    ['components', 'ducts', 'rails', 'wires', 'dimensions', 'texts', 'clines'].forEach(function (k) {
      (state[k] || []).forEach(function (it) {
        if (rectsIntersect(r, App.geom.bounds(k, it))) hit.push(it.id);
      });
    });
    if (gesture.add) hit.forEach(function (id) { App.ui.selected.add(id); });
    else selectMany(hit);
    App.render.all();
    if (App.inspector) App.inspector.update();
  }

  let posEl = null; // 좌표 표시(캐시)
  function onPointerMove(e) {
    // 마우스 좌표(mm) 실시간 표시
    if (posEl !== false) {
      if (!posEl) posEl = document.getElementById('cursor-pos') || false;
      if (posEl) {
        const w = App.viewport.clientToWorld(e.clientX, e.clientY);
        posEl.textContent = Math.round(w.x) + ', ' + Math.round(w.y) + ' mm';
      }
    }
    if (gesture) gesture.constrain = e.shiftKey; // Shift 드래그: 수평/수직 제한
    // 치수 도구 미리보기 + 스냅 (버튼 안 눌러도)
    if (App.ui.tool === 'dim') {
      const state = App.store.get();
      const cp = App.viewport.clientToWorld(e.clientX, e.clientY);
      const d = App.ui.dim || { stage: 0 };
      if (d.stage === 2) {
        const base = { x1: d.p1.x, y1: d.p1.y, x2: d.p2.x, y2: d.p2.y };
        App.render.snapMarker(null);
        App.render.dimPreview(Object.assign({ off: snapV(App.dims.offsetFromPoint(base, cp.x, cp.y)) }, base));
      } else {
        const snap = App.geom.snapPoint(state, cp.x, cp.y, App.viewport.pxToMM(8));
        App.render.snapMarker(snap);
        if (d.stage === 1) App.render.dimPreview({ x1: d.p1.x, y1: d.p1.y, x2: snap.x, y2: snap.y, off: 0 });
        else App.render.dimPreview(null);
      }
    }
    // 센터선 미리보기 + 스냅 마커
    if (App.ui.tool === 'cline') {
      const cp2 = App.viewport.clientToWorld(e.clientX, e.clientY);
      const snap = App.geom.snapPoint(App.store.get(), cp2.x, cp2.y, App.viewport.pxToMM(8));
      App.render.snapMarker(snap);
      const c = App.ui.cline || { stage: 0 };
      if (c.stage === 1) {
        let x2 = snap.x, y2 = snap.y;
        const adx = Math.abs(x2 - c.p1.x), ady = Math.abs(y2 - c.p1.y);
        if (adx < ady * 0.15) x2 = c.p1.x; else if (ady < adx * 0.15) y2 = c.p1.y;
        App.render.clinePreview({ x1: c.p1.x, y1: c.p1.y, x2: x2, y2: y2 });
      } else App.render.clinePreview(null);
    }
    // 와이어 미리보기 (버튼 안 눌러도 동작)
    if (App.ui.tool === 'wire' && App.ui.wireStart) {
      const cp = App.viewport.clientToWorld(e.clientX, e.clientY);
      const a = App.terminals.point(App.store.get(), App.ui.wireStart.compId, App.ui.wireStart.index);
      if (a) {
        const near = App.geom.nearestTerminal(App.store.get(), cp.x, cp.y, 12);
        const end = near ? { x: near.x, y: near.y } : cp;
        App.render.wirePreview([{ x: a.x, y: a.y }, end]);
      }
    }
    if (!gesture) return;
    if (gesture.type === 'pan') {
      const dxPx = e.clientX - gesture.last.x;
      const dyPx = e.clientY - gesture.last.y;
      const s = App.viewport.scale();
      App.viewport.panBy(dxPx / s, dyPx / s);
      gesture.dist = (gesture.dist || 0) + Math.abs(dxPx) + Math.abs(dyPx);
      gesture.last = { x: e.clientX, y: e.clientY };
      App.render.all(); // overlay 핸들 크기 갱신용
      return;
    }
    const cp = App.viewport.clientToWorld(e.clientX, e.clientY);
    if (gesture.type === 'draw') updateDraw(cp);
    else if (gesture.type === 'move') updateMove(cp);
    else if (gesture.type === 'wireseg') updateWireSeg(cp);
    else if (gesture.type === 'dimoff') updateDimOff(cp);
    else if (gesture.type === 'labeldrag') updateLabelDrag(cp);
    else if (gesture.type === 'sticker') updateStickerDrag(cp);
    else if (gesture.type === 'wend') updateWireEnd(cp);
    else if (gesture.type === 'dresize') updateDuctResize(cp);
    else if (gesture.type === 'titledrag') updateTitleDrag(cp);
    else if (gesture.type === 'marquee') updateMarquee(cp);
  }

  function onPointerUp(e) {
    if (!gesture) return;
    try { svg.releasePointerCapture(e.pointerId); } catch (x) {}
    if (gesture.type === 'pan') lastPanDist = gesture.dist || 0;
    if (gesture.type === 'draw') finishDraw();
    else if (gesture.type === 'move') finishMove();
    else if (gesture.type === 'wireseg') {
      const wf = App.store.findById(gesture.wireId);
      if (wf) wf.item.corners = App.wires.cleanCorners(wf.item.corners); // 0길이/일직선 정리
      if (gesture.moved) App.store.pushUndo(gesture.snap);
      App.store.touch();
    }
    else if (gesture.type === 'dimoff') { if (gesture.moved) App.store.pushUndo(gesture.snap); }
    else if (gesture.type === 'labeldrag') {
      if (gesture.moved) {
        App.store.pushUndo(gesture.snap);
        // 품명/타입/호기 글씨 배치를 라이브러리에도 기억 → 다음 배치에 동일 적용
        if (gesture.kind === 'comp' || gesture.kind === 'tag' || gesture.kind === 'type') saveLabelLayout(gesture.id);
      }
    }
    else if (gesture.type === 'sticker') { if (gesture.moved) App.store.pushUndo(gesture.snap); }
    else if (gesture.type === 'wend') finishWireEnd();
    else if (gesture.type === 'dresize') {
      if (gesture.moved) { App.store.pushUndo(gesture.snap); if (App.inspector) App.inspector.update(); }
    }
    else if (gesture.type === 'titledrag') { if (gesture.moved) App.store.pushUndo(gesture.snap); }
    else if (gesture.type === 'marquee') finishMarquee();
    gesture = null;
  }

  // 진행 중 제스처 취소(예: 모바일에서 두번째 손가락 터치 시) — 변경 되돌림
  function cancelGesture() {
    if (!gesture) return;
    if (gesture.snap) { try { App.store.replace(gesture.snap, { history: false }); } catch (x) {} }
    gesture = null;
    if (App.render) { App.render.preview(null); App.render.wirePreview(null); App.render.dimPreview(null); }
    App.render.all();
  }

  // 글씨(라벨) 위치 드래그 — 부품 이름(회전 보정) / 배선 라벨(끝별)
  function startLabelDrag(kind, id, end, sp) {
    const snap = App.store.snapshot();
    const f = App.store.findById(id); if (!f) return;
    let orig, rot = 0;
    if (kind === 'comp') { orig = { dx: f.item.labelDx || 0, dy: f.item.labelDy || 0 }; rot = f.item.rotation || 0; }
    else if (kind === 'tag') { orig = { dx: f.item.tagDx || 0, dy: f.item.tagDy || 0 }; rot = f.item.rotation || 0; }
    else if (kind === 'type') { orig = { dx: f.item.typeDx || 0, dy: f.item.typeDy || 0 }; rot = f.item.rotation || 0; }
    else { const o = (end === 'a' ? f.item.lblA : f.item.lblB) || { dx: 0, dy: 0 }; orig = { dx: o.dx, dy: o.dy }; }
    gesture = { type: 'labeldrag', snap: snap, sp: sp, kind: kind, id: id, end: end, orig: orig, rot: rot, moved: false };
  }
  function updateLabelDrag(cp) {
    let dx = cp.x - gesture.sp.x, dy = cp.y - gesture.sp.y;
    if ((gesture.kind === 'comp' || gesture.kind === 'tag' || gesture.kind === 'type') && gesture.rot) {
      const th = gesture.rot * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
      const lx = dx * c + dy * s, ly = -dx * s + dy * c; // 월드→로컬(역회전)
      dx = lx; dy = ly;
    }
    const it = App.store.findById(gesture.id).item;
    if (gesture.kind === 'comp') {
      it.labelDx = Math.round(gesture.orig.dx + dx); it.labelDy = Math.round(gesture.orig.dy + dy);
    } else if (gesture.kind === 'tag') {
      it.tagDx = Math.round(gesture.orig.dx + dx); it.tagDy = Math.round(gesture.orig.dy + dy);
    } else if (gesture.kind === 'type') {
      it.typeDx = Math.round(gesture.orig.dx + dx); it.typeDy = Math.round(gesture.orig.dy + dy);
    } else {
      const o = { dx: Math.round(gesture.orig.dx + dx), dy: Math.round(gesture.orig.dy + dy) };
      if (gesture.end === 'a') it.lblA = o; else it.lblB = o;
    }
    gesture.moved = true;
    App.store.touch();
  }

  // 덕트/레일 끝 리사이즈 — 시작/끝 핸들을 드래그해 길이 조절 (격자 스냅)
  function startDuctResize(id, end, sp) {
    const f = App.store.findById(id);
    if (!f || (f.kind !== 'ducts' && f.kind !== 'rails')) return;
    gesture = {
      type: 'dresize', snap: App.store.snapshot(), sp: sp, id: id, end: end,
      orig: { x: f.item.x, y: f.item.y, len: f.item.lengthMM }, moved: false
    };
  }
  function updateDuctResize(cp) {
    const f = App.store.findById(gesture.id);
    if (!f) return;
    const d = f.item;
    const minLen = Math.max(10, App.store.get().panel.gridMM);
    const delta = d.orient === 'h' ? (cp.x - gesture.sp.x) : (cp.y - gesture.sp.y);
    if (gesture.end === 'end') {
      d.lengthMM = Math.max(minLen, snapV(gesture.orig.len + delta));
    } else {
      // 시작쪽: 반대 끝 고정 — 위치와 길이를 함께 조정
      const shift = Math.min(snapV(delta), gesture.orig.len - minLen);
      if (d.orient === 'h') d.x = gesture.orig.x + shift; else d.y = gesture.orig.y + shift;
      d.lengthMM = gesture.orig.len - shift;
    }
    gesture.moved = true;
    App.store.touch();
  }

  // ── 배선 끝점 재연결 — 끝점 핸들을 끌어 다른 단자에 놓으면 연결 변경 ──
  function startWireEnd(wireId, end, sp) {
    const f = App.store.findById(wireId);
    if (!f || f.kind !== 'wires') return;
    gesture = { type: 'wend', snap: App.store.snapshot(), wireId: wireId, end: end, sp: sp, target: null };
  }
  function updateWireEnd(cp) {
    const state = App.store.get();
    const f = App.store.findById(gesture.wireId);
    if (!f) return;
    const w = f.item;
    const near = App.geom.nearestTerminal(state, cp.x, cp.y, 15);
    gesture.target = near;
    App.render.snapMarker(near ? { x: near.x, y: near.y, snapped: true } : null);
    // 미리보기: 고정된 반대쪽 끝 → 커서(또는 스냅 단자)
    const fixed = gesture.end === 'a'
      ? App.terminals.point(state, w.toComp, w.toTerm)
      : App.terminals.point(state, w.fromComp, w.fromTerm);
    const to = near ? { x: near.x, y: near.y } : cp;
    if (fixed) App.render.wirePreview([{ x: fixed.x, y: fixed.y }, { x: to.x, y: fixed.y }, { x: to.x, y: to.y }]);
  }
  function finishWireEnd() {
    App.render.wirePreview(null);
    App.render.snapMarker(null);
    const t = gesture.target;
    const f = App.store.findById(gesture.wireId);
    if (!f) return;
    const w = f.item;
    if (!t) { if (App.toolbar) App.toolbar.flash('단자 위에 놓아야 연결이 변경됩니다'); App.render.all(); return; }
    // 같은 단자면 변경 없음
    if (gesture.end === 'a' && w.fromComp === t.compId && w.fromTerm === t.index) { App.render.all(); return; }
    if (gesture.end === 'b' && w.toComp === t.compId && w.toTerm === t.index) { App.render.all(); return; }
    App.store.pushUndo(gesture.snap);
    if (gesture.end === 'a') { w.fromComp = t.compId; w.fromTerm = t.index; }
    else { w.toComp = t.compId; w.toTerm = t.index; }
    w.corners = null; w.midY = null; // 새 경로로 재라우팅
    App.store.touch();
    if (App.inspector) App.inspector.update();
    if (App.toolbar) App.toolbar.flash('배선 연결 변경됨 (' + (w.label || '') + ')');
  }

  // 덕트 라벨 스티커 드래그 — 덕트 길이 방향으로만 이동 (off 클램프). copy=true 면 복사본을 끌기
  function startStickerDrag(ductId, stId, sp, copy) {
    const f = App.store.findById(ductId);
    if (!f || f.kind !== 'ducts') return;
    const st = (f.item.stickers || []).find(function (s) { return s.id === stId; });
    if (!st) return;
    const snap = App.store.snapshot();
    let dragId = stId;
    if (copy) {
      const cl = App.clone(st);
      cl.id = App.uid('stk');
      f.item.stickers.push(cl);
      dragId = cl.id;
      App.store.touch();
    }
    gesture = { type: 'sticker', snap: snap, sp: sp, ductId: ductId, stId: dragId, origOff: st.off || 0, moved: !!copy };
  }
  function updateStickerDrag(cp) {
    const f = App.store.findById(gesture.ductId);
    if (!f) return;
    const d = f.item;
    const st = (d.stickers || []).find(function (s) { return s.id === gesture.stId; });
    if (!st) return;
    const delta = d.orient === 'h' ? (cp.x - gesture.sp.x) : (cp.y - gesture.sp.y);
    const max = Math.max(0, d.lengthMM - App.stickerDims(st).len);
    st.off = Math.round(Math.max(0, Math.min(max, gesture.origOff + delta)));
    gesture.moved = true;
    App.store.touch();
  }

  // 제목(타이틀) 위치 드래그 — panel.titleDx/titleDy
  function startTitleDrag(sp) {
    const snap = App.store.snapshot();
    const p = App.store.get().panel;
    gesture = { type: 'titledrag', snap: snap, sp: sp, orig: { dx: p.titleDx || 0, dy: p.titleDy || 0 }, moved: false };
  }
  function updateTitleDrag(cp) {
    const p = App.store.get().panel;
    p.titleDx = Math.round(gesture.orig.dx + (cp.x - gesture.sp.x));
    p.titleDy = Math.round(gesture.orig.dy + (cp.y - gesture.sp.y));
    gesture.moved = true;
    App.store.touch();
  }

  function startDimOff(dimId, sp) {
    const snap = App.store.snapshot();
    const f = App.store.findById(dimId); if (!f) return;
    gesture = { type: 'dimoff', snap: snap, sp: sp, dimId: dimId, origOff: f.item.off || 0, moved: false };
  }
  function updateDimOff(cp) {
    const dim = App.store.findById(gesture.dimId).item;
    const dx = dim.x2 - dim.x1, dy = dim.y2 - dim.y1, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const delta = (cp.x - gesture.sp.x) * nx + (cp.y - gesture.sp.y) * ny;
    dim.off = snapV(gesture.origOff + delta);
    gesture.moved = true;
    App.store.touch();
  }

  function onDblClick(e) {
    // 클릭 지점 스택에서 탐색(선택 시 뜨는 투명 핸들에 가려져도 동작)
    const stack = (document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target]);
    function pick(selq) {
      for (let i = 0; i < stack.length; i++) {
        const m = stack[i].closest && stack[i].closest(selq);
        if (m) return m;
      }
      return null;
    }
    const wireGrp = pick('[data-kind="wires"]');
    if (wireGrp) {
      const id = wireGrp.getAttribute('data-id');
      selectOnly(id);
      addBendAt(id, App.viewport.clientToWorld(e.clientX, e.clientY));
      return;
    }
    // 라벨 스티커 더블클릭 → 3칸 내용 편집
    const stkEl2 = pick('[data-sticker]');
    if (stkEl2) {
      const did = stkEl2.getAttribute('data-duct'), sid = stkEl2.getAttribute('data-sticker');
      const fd = App.store.findById(did);
      const st = fd && (fd.item.stickers || []).find(function (s) { return s.id === sid; });
      if (st) {
        const cur = st.lines || [];
        let next;
        if (st.linkId) {
          // 부품 연동 스티커: 1·2줄은 자동 — 3줄(직접 작성)만 편집
          const v3 = prompt('3줄 (직접 작성, 예: MAS-025 25A)', cur[2] || '');
          if (v3 == null) return;
          next = [cur[0] || '', cur[1] || '', v3];
        } else {
          next = [];
          const hints = ['1줄 (유형, 예: POWER S/W 01)', '2줄 (품명, 예: MAIN POWER S/W)', '3줄 (직접 작성, 예: MAS-025 25A)'];
          for (let ci = 0; ci < 3; ci++) {
            const v = prompt(hints[ci], cur[ci] || '');
            if (v == null) return;
            next.push(v);
          }
        }
        App.store.commit(function () {
          const fd2 = App.store.findById(did);
          const st2 = fd2 && (fd2.item.stickers || []).find(function (s) { return s.id === sid; });
          if (st2) st2.lines = next;
        });
        App.render.all();
        if (App.inspector) App.inspector.update();
      }
      return;
    }
    // 자유 텍스트 더블클릭 → 내용 즉시 편집
    const txtEl = pick('[data-kind="texts"]');
    if (txtEl) {
      const id = txtEl.getAttribute('data-id');
      selectOnly(id);
      const f = App.store.findById(id);
      if (f) {
        const nv = prompt('텍스트 내용', f.item.text || '');
        if (nv != null) {
          App.store.commit(function (s) {
            const f2 = App.store.findById(id);
            if (f2) f2.item.text = nv;
          });
          App.render.all();
          if (App.inspector) App.inspector.update();
        }
      }
      return;
    }
    // 부품 더블클릭 → 크기·단자 편집 (CAD 관례)
    const compGrp = pick('[data-kind="components"]');
    if (compGrp) {
      const id = compGrp.getAttribute('data-id');
      selectOnly(id);
      const f = App.store.findById(id);
      if (f && App.partEditor) App.partEditor.open({ component: f.item });
      return;
    }
    // 다른 요소(덕트/레일/치수 핸들 등) 위가 아니면: 빈 공간 더블클릭 → 화면 맞춤
    const anyEl = pick('[data-id]') || pick('[data-seg]') || pick('[data-dim]');
    if (!anyEl) {
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM);
      App.render.all();
      if (App.toolbar && App.toolbar.updateZoomPct) App.toolbar.updateZoomPct();
    }
  }

  function deleteSelected() {
    if (!App.ui.selected.size) return;
    const ids = Array.from(App.ui.selected);
    App.store.commit(function (s) {
      ['ducts', 'rails', 'components', 'wires', 'dimensions', 'texts', 'clines'].forEach(function (k) {
        if (s[k]) s[k] = s[k].filter(function (it) { return ids.indexOf(it.id) < 0; });
      });
      // 삭제된 부품에 연결된 와이어도 제거
      s.wires = s.wires.filter(function (w) {
        return ids.indexOf(w.fromComp) < 0 && ids.indexOf(w.toComp) < 0;
      });
    });
    App.ui.selected.clear();
    App.render.all();
    if (App.inspector) App.inspector.update();
  }

  function rotateSelected() {
    if (!App.ui.selected.size) return;
    const ids = Array.from(App.ui.selected);
    App.store.commit(function (s) {
      s.components.forEach(function (c) {
        if (ids.indexOf(c.id) >= 0) c.rotation = ((c.rotation || 0) + 90) % 360;
      });
    });
    App.render.all();
  }

  // 선택 항목 복사 → 클립보드 (부품·덕트·레일·텍스트·치수. 와이어는 단자 종속이라 제외)
  function copySelected() {
    const ids = Array.from(App.ui.selected);
    const s = App.store.get();
    const items = [];
    ['components', 'ducts', 'rails', 'texts', 'dimensions', 'clines'].forEach(function (k) {
      (s[k] || []).forEach(function (it) {
        if (ids.indexOf(it.id) >= 0) items.push({ kind: k, item: App.clone(it) });
      });
    });
    if (items.length) App.ui.clipboard = items;
  }
  // 붙여넣기 (격자 2칸 오프셋, id 재발급)
  function paste() {
    if (!App.ui.clipboard || !App.ui.clipboard.length) return;
    // 하위호환: 예전 클립보드(부품 배열)도 처리
    const list = App.ui.clipboard.map(function (e) { return e && e.kind ? e : { kind: 'components', item: e }; });
    const g = App.store.get().panel.gridMM * 2;
    const prefix = { components: 'cmp', ducts: 'duct', rails: 'rail', texts: 'txt', dimensions: 'dim', clines: 'cl' };
    const newIds = [];
    App.store.commit(function (s) {
      list.forEach(function (e) {
        const nc = App.clone(e.item);
        nc.id = App.uid(prefix[e.kind] || 'id');
        if (e.kind === 'dimensions' || e.kind === 'clines') { nc.x1 += g; nc.y1 += g; nc.x2 += g; nc.y2 += g; }
        else { nc.x += g; nc.y += g; }
        nc.locked = false;
        if (nc.stickers) nc.stickers.forEach(function (st) { st.id = App.uid('stk'); }); // 스티커 id 재발급
        s[e.kind].push(nc); // 품명 라벨 유지 (호기번호는 인스펙터에서 부여)
        newIds.push(nc.id);
      });
    });
    selectMany(newIds);
  }
  function duplicateSelected() { copySelected(); paste(); }

  // 선택 항목을 제자리에 복제 (Alt+드래그용) — 새 id 반환
  function duplicateInPlace() {
    const ids = Array.from(App.ui.selected);
    const prefix = { components: 'cmp', ducts: 'duct', rails: 'rail', texts: 'txt', dimensions: 'dim', clines: 'cl' };
    const newIds = [];
    App.store.commit(function (s) {
      ['components', 'ducts', 'rails', 'texts', 'dimensions', 'clines'].forEach(function (k) {
        (s[k] || []).forEach(function (it) {
          if (ids.indexOf(it.id) < 0) return;
          const nc = App.clone(it);
          nc.id = App.uid(prefix[k] || 'id');
          nc.locked = false;
          if (nc.stickers) nc.stickers.forEach(function (st) { st.id = App.uid('stk'); });
          s[k].push(nc);
          newIds.push(nc.id);
        });
      });
    });
    return newIds;
  }

  // 부품의 글씨 배치(품명/타입/호기 위치·방향)를 라이브러리 정의에 저장
  // → 같은 부품을 다음에 배치할 때 동일한 글씨 배치로 나옴
  function saveLabelLayout(compId) {
    const f = App.store.findById(compId);
    if (!f || f.kind !== 'components' || !f.item.partNo) return;
    if (!App.userlib || !App.palette || !App.palette.getLibrary) return;
    const c = f.item;
    const libPart = App.palette.getLibrary().find(function (p) { return p.partNo === c.partNo; });
    if (!libPart) return; // 라이브러리에 없는 부품(불러온 옛 프로젝트 등)은 통과
    App.userlib.add(Object.assign({}, libPart, {
      labelDx: c.labelDx || 0, labelDy: c.labelDy || 0,
      typeDx: c.typeDx || 0, typeDy: c.typeDy || 0,
      tagDx: c.tagDx || 0, tagDy: c.tagDy || 0,
      textVert: c.textVert || false,
      labelVert: c.labelVert != null ? c.labelVert : null,
      typeVert: c.typeVert != null ? c.typeVert : null,
      tagVert: c.tagVert != null ? c.tagVert : null
    }));
    App.palette.reloadUser();
    // 이미 배치돼 있는 같은 부품에도 즉시 적용 (모든 시트, 실행취소 가능)
    let applied = 0;
    App.store.commit(function (s) {
      function apply(c2) {
        if (c2.partNo !== c.partNo || c2.id === c.id) return;
        c2.labelDx = c.labelDx || 0; c2.labelDy = c.labelDy || 0;
        c2.typeDx = c.typeDx || 0; c2.typeDy = c.typeDy || 0;
        c2.tagDx = c.tagDx || 0; c2.tagDy = c.tagDy || 0;
        c2.textVert = c.textVert || false;
        c2.labelVert = c.labelVert != null ? c.labelVert : null;
        c2.typeVert = c.typeVert != null ? c.typeVert : null;
        c2.tagVert = c.tagVert != null ? c.tagVert : null;
        applied++;
      }
      s.components.forEach(apply);
      (s.sheets || []).forEach(function (sh) {
        if (sh.data && sh.data.components) sh.data.components.forEach(apply);
      });
    });
    App.render.all();
    if (App.toolbar) App.toolbar.flash('글씨 배치 라이브러리 기억' + (applied ? ' + 배치된 같은 부품 ' + applied + '개 적용' : '') + ' (' + c.partNo + ')');
  }
  Interact.saveLabelLayout = saveLabelLayout;

  // 속성 복사 (MATCHPROP) — 종류별로 복사되는 속성
  const MATCH_PROPS = {
    wires: ['color', 'width', 'sq', 'awg', 'acdc'],
    components: ['type', 'textVert', 'labelVert', 'typeVert', 'tagVert', 'coverL', 'coverR'],
    ducts: ['widthMM'],
    rails: ['widthMM', 'type'],
    texts: ['size', 'color', 'bold'],
    dimensions: ['off']
  };
  const KIND_NAMES = { wires: '배선', components: '부품', ducts: '덕트', rails: '레일', texts: '텍스트', dimensions: '치수' };
  function startMatchProp() {
    if (App.ui.selected.size !== 1) {
      if (App.toolbar) App.toolbar.flash('속성 복사: 원본 1개를 먼저 선택하세요');
      return;
    }
    const id = Array.from(App.ui.selected)[0];
    const f = App.store.findById(id);
    if (!f || !MATCH_PROPS[f.kind]) { if (App.toolbar) App.toolbar.flash('이 항목은 속성 복사를 지원하지 않습니다'); return; }
    const props = {};
    MATCH_PROPS[f.kind].forEach(function (k) { if (f.item[k] != null) props[k] = App.clone(f.item[k]); });
    App.ui.matchProp = { kind: f.kind, srcId: id, props: props };
    if (App.toolbar) App.toolbar.flash('속성 복사: 적용할 ' + KIND_NAMES[f.kind] + '를 클릭하세요 (Esc 종료)');
  }
  Interact.startMatchProp = startMatchProp;

  // ── 선 정렬 (배선 구간 얼라인) ──────────────────────────────
  // 클릭 지점에서 가장 가까운 배선 직선 구간 찾기 (orientFilter: 'H'|'V'|null)
  function nearestWireSeg(state, wire, cp, orientFilter) {
    const R = App.wires.route(state, wire);
    if (!R) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < R.length - 1; i++) {
      const p = R[i], q = R[i + 1];
      const orient = (Math.round(p.x) === Math.round(q.x)) ? 'V' : (Math.round(p.y) === Math.round(q.y) ? 'H' : null);
      if (!orient) continue;
      if (orientFilter && orient !== orientFilter) continue;
      if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 3) continue; // 스터브 등 짧은 구간 제외
      let d;
      if (orient === 'H') {
        const cx = Math.max(Math.min(p.x, q.x), Math.min(Math.max(p.x, q.x), cp.x));
        d = Math.hypot(cp.x - cx, cp.y - p.y);
      } else {
        const cy = Math.max(Math.min(p.y, q.y), Math.min(Math.max(p.y, q.y), cp.y));
        d = Math.hypot(cp.x - p.x, cp.y - cy);
      }
      if (d < bd) { bd = d; best = { i: i, orient: orient, coord: Math.round(orient === 'H' ? p.y : p.x) }; }
    }
    return best;
  }
  function startWireAlign() {
    App.ui.wireAlign = { stage: 0 };
    if (App.toolbar) App.toolbar.flash('선 정렬: 기준이 될 배선 구간을 클릭하세요');
  }
  Interact.startWireAlign = startWireAlign;

  // 사이 센터 — 선택 항목을 기준 2개 사이 정중앙으로 (예: 찬넬을 위/아래 덕트 사이 센터에)
  function startCenterBetween() {
    if (!App.ui.selected.size) {
      if (App.toolbar) App.toolbar.flash('사이 센터: 이동할 대상(찬넬/부품 등)을 먼저 선택하세요');
      return;
    }
    App.ui.centerBetween = { ids: Array.from(App.ui.selected), refs: [] };
    if (App.toolbar) App.toolbar.flash('기준 1번째 클릭 (예: 위 덕트)');
  }
  Interact.startCenterBetween = startCenterBetween;

  function applyCenterBetween(cb) {
    const b1 = cb.refs[0], b2 = cb.refs[1];
    // 두 기준이 위아래로 떨어져 있으면 세로 센터, 좌우면 가로 센터 (간격이 큰 축 기준)
    const gapV = Math.max(b1.y - (b2.y + b2.h), b2.y - (b1.y + b1.h));
    const gapH = Math.max(b1.x - (b2.x + b2.w), b2.x - (b1.x + b1.w));
    const axis = gapV >= gapH ? 'y' : 'x';
    let mid;
    if (axis === 'y') {
      const upper = (b1.y + b1.h / 2) <= (b2.y + b2.h / 2) ? b1 : b2;
      const lower = upper === b1 ? b2 : b1;
      mid = ((upper.y + upper.h) + lower.y) / 2; // 마주보는 모서리 사이 정중앙
    } else {
      const left = (b1.x + b1.w / 2) <= (b2.x + b2.w / 2) ? b1 : b2;
      const right = left === b1 ? b2 : b1;
      mid = ((left.x + left.w) + right.x) / 2;
    }
    // 선택 그룹의 경계 상자 중심을 mid 로 이동 (그룹 형태 유지)
    const state = App.store.get();
    let minC = Infinity, maxC = -Infinity, any = false;
    cb.ids.forEach(function (id) {
      const f = App.store.findById(id);
      if (!f || f.item.locked) return;
      const b = App.geom.bounds(f.kind, f.item);
      const lo = axis === 'y' ? b.y : b.x, hi = axis === 'y' ? b.y + b.h : b.x + b.w;
      minC = Math.min(minC, lo); maxC = Math.max(maxC, hi); any = true;
    });
    if (!any) return;
    const delta = mid - (minC + maxC) / 2;
    App.store.commit(function () {
      cb.ids.forEach(function (id) {
        const f = App.store.findById(id);
        if (!f || f.item.locked) return;
        if (f.kind === 'clines' || f.kind === 'dimensions') {
          if (axis === 'y') { f.item.y1 += delta; f.item.y2 += delta; }
          else { f.item.x1 += delta; f.item.x2 += delta; }
        } else {
          if (axis === 'y') f.item.y += delta; else f.item.x += delta;
        }
      });
    });
    App.render.all();
    if (App.inspector) App.inspector.update();
    if (App.toolbar) App.toolbar.flash('사이 센터 정렬 완료 (' + (axis === 'y' ? '세로' : '가로') + ')');
  }

  // 방향키 미세 이동 (격자 단위, Shift=10배)
  function nudge(dx, dy, big) {
    if (!App.ui.selected.size) return;
    const g = App.store.get().panel.gridMM * (big ? 10 : 1);
    const ids = Array.from(App.ui.selected);
    App.store.commit(function (s) {
      ['components', 'ducts', 'rails'].forEach(function (k) {
        s[k].forEach(function (it) {
          if (ids.indexOf(it.id) >= 0 && !it.locked) { it.x += dx * g; it.y += dy * g; }
        });
      });
    });
    if (App.inspector) App.inspector.update();
  }

  function onKeyDown(e) {
    if (App.partEditor && App.partEditor.isOpen && App.partEditor.isOpen()) return; // 에디터 모달이 처리
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ') { App.ui.spaceDown = true; return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1, 0, e.shiftKey); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1, 0, e.shiftKey); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -1, e.shiftKey); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, 1, e.shiftKey); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) App.store.redo(); else App.store.undo();
      App.ui.selected.clear();
      App.render.all();
      if (App.inspector) App.inspector.update();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault(); App.store.redo(); App.render.all(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { // 전체 선택
      e.preventDefault();
      const s = App.store.get();
      App.ui.selected = new Set(
        [].concat(s.components, s.ducts, s.rails, s.wires, s.dimensions || [])
          .map(function (it) { return it.id; })
      );
      App.render.all();
      if (App.inspector) App.inspector.update();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (e.key === 'r' || e.key === 'R') { rotateSelected(); return; }
    // 도구 단축키 (CAD 관례): V=선택, W=배선, D=치수, T=텍스트
    if (!e.ctrlKey && !e.metaKey && !e.altKey && App.toolbar && App.toolbar.setTool) {
      const k = e.key.toLowerCase();
      if (k === 'v') { App.toolbar.setTool('select'); return; }
      if (k === 'w') { App.toolbar.setTool('wire'); return; }
      if (k === 'd') { App.toolbar.setTool('dim'); return; }
      if (k === 't') { App.toolbar.setTool('text'); return; }
      if (k === 'c') { App.toolbar.setTool('cline'); return; }
    }
    if (e.key === 'Escape') {
      App.ui.placing = null;
      App.ui.wireStart = null;
      App.ui.matchProp = null;
      App.ui.centerBetween = null;
      App.ui.wireAlign = null;
      App.ui.dim = { stage: 0 };
      App.ui.cline = { stage: 0 };
      App.render.wirePreview(null);
      App.render.dimPreview(null);
      if (App.render.clinePreview) App.render.clinePreview(null);
      App.render.snapMarker(null);
      App.ui.selected.clear();
      if (App.palette) App.palette.refresh();
      App.render.all();
      return;
    }
  }

  function onKeyUp(e) {
    if (e.key === ' ') App.ui.spaceDown = false;
  }

  // 선택 항목 잠금/해제 토글 (덕트·레일·부품)
  function toggleLock() {
    if (!App.ui.selected.size) return;
    const ids = Array.from(App.ui.selected);
    // 하나라도 잠겨있지 않으면 모두 잠금, 전부 잠겨있으면 해제
    let anyUnlocked = false;
    ids.forEach(function (id) { const f = App.store.findById(id); if (f && !f.item.locked) anyUnlocked = true; });
    App.store.commit(function (s) {
      ['ducts', 'rails', 'components'].forEach(function (k) {
        s[k].forEach(function (it) { if (ids.indexOf(it.id) >= 0) it.locked = anyUnlocked; });
      });
    });
    if (App.inspector) App.inspector.update();
  }

  // 선택 부품 정렬 — mode: left/right/top/bottom/hcenter/vcenter (잠금 제외)
  function alignSelected(mode) {
    const ids = Array.from(App.ui.selected);
    const items = [];
    App.store.get().components.forEach(function (c) {
      if (ids.indexOf(c.id) >= 0 && !c.locked) items.push(c);
    });
    if (items.length < 2) return 0;
    let ref;
    if (mode === 'left') ref = Math.min.apply(null, items.map(function (c) { return c.x; }));
    else if (mode === 'right') ref = Math.max.apply(null, items.map(function (c) { return c.x + c.widthMM; }));
    else if (mode === 'top') ref = Math.min.apply(null, items.map(function (c) { return c.y; }));
    else if (mode === 'bottom') ref = Math.max.apply(null, items.map(function (c) { return c.y + c.heightMM; }));
    else if (mode === 'hcenter') ref = items.reduce(function (s, c) { return s + c.y + c.heightMM / 2; }, 0) / items.length;
    else if (mode === 'vcenter') ref = items.reduce(function (s, c) { return s + c.x + c.widthMM / 2; }, 0) / items.length;
    App.store.commit(function (s) {
      s.components.forEach(function (c) {
        if (ids.indexOf(c.id) < 0 || c.locked) return;
        if (mode === 'left') c.x = ref;
        else if (mode === 'right') c.x = ref - c.widthMM;
        else if (mode === 'top') c.y = ref;
        else if (mode === 'bottom') c.y = ref - c.heightMM;
        else if (mode === 'hcenter') c.y = Math.round(ref - c.heightMM / 2);
        else if (mode === 'vcenter') c.x = Math.round(ref - c.widthMM / 2);
      });
    });
    App.render.all();
    return items.length;
  }

  // 선택 부품 균등 간격 배치 — axis: 'h'(가로 간격) | 'v'(세로 간격)
  function distributeSelected(axis) {
    const ids = Array.from(App.ui.selected);
    const items = [];
    App.store.get().components.forEach(function (c) {
      if (ids.indexOf(c.id) >= 0 && !c.locked) items.push(c);
    });
    if (items.length < 3) return 0;
    const key = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'widthMM' : 'heightMM';
    items.sort(function (a, b) { return a[key] - b[key]; });
    const first = items[0], last = items[items.length - 1];
    const span = (last[key] + last[size]) - first[key];
    const total = items.reduce(function (s, c) { return s + c[size]; }, 0);
    const gap = (span - total) / (items.length - 1);
    let pos = first[key];
    const target = {};
    items.forEach(function (c) { target[c.id] = Math.round(pos); pos += c[size] + gap; });
    App.store.commit(function (s) {
      s.components.forEach(function (c) { if (target[c.id] != null && !c.locked) c[key] = target[c.id]; });
    });
    App.render.all();
    return items.length;
  }

  // 선택 부품을 지정 간격(mm)으로 나란히 배열 — 겹친 것들을 옆으로 붙여 배치
  // axis 'h': 왼→오, 'v': 위→아래. 첫 부품 위치 기준, 간격 0 = 딱 붙임
  function packSelected(axis, gapMM) {
    gapMM = gapMM || 0;
    const ids = Array.from(App.ui.selected);
    const items = App.store.get().components.filter(function (c) { return ids.indexOf(c.id) >= 0 && !c.locked; });
    if (items.length < 2) {
      if (App.toolbar) App.toolbar.flash('간격 배열: 부품 2개 이상을 선택하세요');
      return 0;
    }
    const key = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'widthMM' : 'heightMM';
    items.sort(function (a, b) { return a[key] - b[key] || (axis === 'h' ? a.y - b.y : a.x - b.x); });
    let pos = items[0][key];
    const target = {};
    items.forEach(function (c) { target[c.id] = Math.round(pos * 10) / 10; pos += c[size] + gapMM; });
    App.store.commit(function (s) {
      s.components.forEach(function (c) { if (target[c.id] != null) c[key] = target[c.id]; });
    });
    App.render.all();
    if (App.inspector) App.inspector.update();
    if (App.toolbar) App.toolbar.flash('간격 배열: ' + items.length + '개 · 간격 ' + gapMM + 'mm');
    return items.length;
  }
  Interact.packSelected = packSelected;

  Interact.alignSelected = alignSelected;
  Interact.distributeSelected = distributeSelected;
  Interact.deleteSelected = deleteSelected;
  Interact.rotateSelected = rotateSelected;
  Interact.toggleLock = toggleLock;
  Interact.copySelected = copySelected;
  Interact.paste = paste;
  Interact.duplicateSelected = duplicateSelected;
  Interact.cancelGesture = cancelGesture;

  // 우클릭 메뉴 구성 — 대상(부품/덕트·레일/배선/빈곳)에 따라 항목 변경
  function openContextMenu(e) {
    if (!App.ctxMenu) return;
    const stack = (document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target]);
    let hit = null;
    for (let i = 0; i < stack.length; i++) {
      const m = stack[i].closest && stack[i].closest('[data-id][data-kind]');
      if (m) { hit = m; break; }
    }
    const items = [];
    if (hit) {
      const id = hit.getAttribute('data-id'), kind = hit.getAttribute('data-kind');
      if (!App.ui.selected.has(id)) selectOnly(id);
      const f = App.store.findById(id);
      if (kind === 'components') {
        items.push({ icon: '✎', label: '크기·단자 편집', fn: function () { App.partEditor.open({ component: f.item }); } });
        items.push({ icon: '⟳', label: '회전', key: 'R', fn: rotateSelected });
      }
      if (kind === 'ducts') {
        items.push({ icon: '🏷', label: '라벨 스티커 추가', fn: function () {
          const pos = App.viewport.clientToWorld(e.clientX, e.clientY);
          App.store.commit(function () {
            const fd = App.store.findById(id);
            if (!fd) return;
            const duct = fd.item;
            duct.stickers = duct.stickers || [];
            const stNew = { id: App.uid('stk'), off: 0, cellW: 30, cellH: 24, linkId: null, lines: ['LABEL', '', ''] };
            const len = App.stickerDims(stNew).len;
            const max = Math.max(0, duct.lengthMM - len);
            const off = duct.orient === 'h' ? (pos.x - duct.x - len / 2) : (pos.y - duct.y - len / 2);
            stNew.off = Math.round(Math.max(0, Math.min(max, off)));
            duct.stickers.push(stNew);
          });
          App.render.all();
          if (App.inspector) App.inspector.update();
        } });
      }
      if (kind !== 'wires') {
        items.push({ icon: '⎘', label: '복제', key: 'Ctrl+D', fn: duplicateSelected });
        items.push({ icon: '🔒', label: (f && f.item.locked) ? '잠금 해제' : '잠금', fn: toggleLock });
      }
      items.push({ icon: '🖌', label: '속성 복사 (다른 대상에 적용)', fn: startMatchProp });
      if (kind === 'wires') {
        items.push({ icon: '≡', label: '이 선을 기준으로 선 정렬', fn: function () {
          const cp = App.viewport.clientToWorld(e.clientX, e.clientY);
          const seg = nearestWireSeg(App.store.get(), f.item, cp, null);
          if (!seg) { if (App.toolbar) App.toolbar.flash('직선 구간을 찾지 못했습니다'); return; }
          App.ui.wireAlign = { stage: 1, orient: seg.orient, coord: seg.coord, refId: id };
          if (App.toolbar) App.toolbar.flash('기준선 지정 — 정렬할 선을 클릭하세요 (Esc 종료)');
        } });
      }
      if (kind !== 'wires') items.push({ icon: '⇹', label: '사이 센터 (기준 2개 클릭)', fn: startCenterBetween });
      items.push('sep');
      items.push({ icon: '🗑', label: '삭제', key: 'Del', danger: true, fn: deleteSelected });
    } else {
      items.push({ icon: '📋', label: '붙여넣기', key: 'Ctrl+V', fn: paste });
      items.push({ icon: '⬚', label: '전체 선택', key: 'Ctrl+A', fn: function () {
        const s = App.store.get();
        App.ui.selected = new Set([].concat(s.components, s.ducts, s.rails, s.wires, s.dimensions || [], s.texts || [], s.clines || []).map(function (it) { return it.id; }));
        App.render.all(); if (App.inspector) App.inspector.update();
      } });
      items.push('sep');
      items.push({ icon: '⛶', label: '화면 맞춤', fn: function () {
        const p = App.store.get().panel;
        App.viewport.fitTo(p.widthMM, p.heightMM);
        App.render.all();
        if (App.toolbar && App.toolbar.updateZoomPct) App.toolbar.updateZoomPct();
      } });
    }
    App.ctxMenu.show(e.clientX, e.clientY, items);
  }

  Interact.init = function (svgEl) {
    svg = svgEl;
    // 포인터 캡처 방어 — 이미 해제된/합성 포인터로 호출돼도 조용히 무시
    const _cap = svg.setPointerCapture.bind(svg);
    svg.setPointerCapture = function (pid) { try { _cap(pid); } catch (err) { /* no-op */ } };
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('dblclick', onDblClick);
    svg.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (lastPanDist > 6) { lastPanDist = 0; return; } // 우드래그(팬)였으면 메뉴 생략
      lastPanDist = 0;
      openContextMenu(e);
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  };
})(window);
