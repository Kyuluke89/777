/* 캔버스 상호작용 — 선택/이동/그리기/배치 + 키보드 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Interact = (App.interact = {});

  let svg;
  let gesture = null; // { type, sp, snap, origPos, orient, kind }

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
      label: part.name || part.partNo,  // 기본 표시 = 품명
      tag: '',                          // 호기번호(선택) — 인스펙터에서 입력
      partName: part.name || '',
      terminals: part.terminals != null ? part.terminals : App.terminals.defaultCount(part.type),
      term: part.term ? App.clone(part.term) : null
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
      if (f && !f.item.locked) origPos[id] = { x: f.item.x, y: f.item.y }; // 잠긴 항목은 이동 제외
    });
    gesture = { type: 'move', sp: sp, snap: snap, origPos: origPos, moved: false };
  }

  function updateMove(cp) {
    const dx = cp.x - gesture.sp.x;
    const dy = cp.y - gesture.sp.y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) gesture.moved = true;
    const state = App.store.get();
    for (const id in gesture.origPos) {
      const f = App.store.findById(id);
      if (!f) continue;
      f.item.x = snapV(gesture.origPos[id].x + dx);
      f.item.y = snapV(gesture.origPos[id].y + dy);
    }
    App.store.touch();
  }

  function finishMove() {
    if (gesture.moved) App.store.pushUndo(gesture.snap);
    if (App.inspector) App.inspector.update();
  }

  function onPointerDown(e) {
    if (e.target.closest && e.target.closest('.no-canvas')) return;
    const sp = App.viewport.clientToWorld(e.clientX, e.clientY);
    const panKey = e.button === 1 || e.button === 2 || App.ui.spaceDown;

    if (panKey) {
      gesture = { type: 'pan', last: { x: e.clientX, y: e.clientY } };
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

    if (tool === 'duct-h') { startDraw('h', 'ducts', sp); svg.setPointerCapture(e.pointerId); return; }
    if (tool === 'duct-v') { startDraw('v', 'ducts', sp); svg.setPointerCapture(e.pointerId); return; }
    if (tool === 'rail-h') { startDraw('h', 'rails', sp); svg.setPointerCapture(e.pointerId); return; }
    if (tool === 'rail-v') { startDraw('v', 'rails', sp); svg.setPointerCapture(e.pointerId); return; }

    // 와이어 세그먼트 핸들 드래그 (선택된 와이어 편집)
    const segEl = e.target.closest && e.target.closest('[data-seg]');
    if (segEl) {
      startWireSeg(segEl.getAttribute('data-wire'),
        parseInt(segEl.getAttribute('data-seg'), 10),
        segEl.getAttribute('data-orient'), sp);
      svg.setPointerCapture(e.pointerId);
      App.render.all(); // 핸들 위치 갱신
      return;
    }

    // 치수 중앙 핸들 → 오프셋(치수선 위치) 이동
    const dimEl = e.target.closest && e.target.closest('[data-dim]');
    if (dimEl) {
      startDimOff(dimEl.getAttribute('data-dim'), sp);
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // 글씨(라벨) 드래그 — 부품 이름 / 배선 라벨
    const lblEl = e.target.closest && e.target.closest('[data-labelfor]');
    if (lblEl) { startLabelDrag('comp', lblEl.getAttribute('data-labelfor'), null, sp); svg.setPointerCapture(e.pointerId); return; }
    const tagEl = e.target.closest && e.target.closest('[data-tagfor]');
    if (tagEl) { startLabelDrag('tag', tagEl.getAttribute('data-tagfor'), null, sp); svg.setPointerCapture(e.pointerId); return; }
    const wlblEl = e.target.closest && e.target.closest('[data-wirelabel]');
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
    ['components', 'ducts', 'rails', 'wires', 'dimensions'].forEach(function (k) {
      state[k].forEach(function (it) {
        if (rectsIntersect(r, App.geom.bounds(k, it))) hit.push(it.id);
      });
    });
    if (gesture.add) hit.forEach(function (id) { App.ui.selected.add(id); });
    else selectMany(hit);
    App.render.all();
    if (App.inspector) App.inspector.update();
  }

  function onPointerMove(e) {
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
    else if (gesture.type === 'marquee') updateMarquee(cp);
  }

  function onPointerUp(e) {
    if (!gesture) return;
    try { svg.releasePointerCapture(e.pointerId); } catch (x) {}
    if (gesture.type === 'draw') finishDraw();
    else if (gesture.type === 'move') finishMove();
    else if (gesture.type === 'wireseg') {
      const wf = App.store.findById(gesture.wireId);
      if (wf) wf.item.corners = App.wires.cleanCorners(wf.item.corners); // 0길이/일직선 정리
      if (gesture.moved) App.store.pushUndo(gesture.snap);
      App.store.touch();
    }
    else if (gesture.type === 'dimoff') { if (gesture.moved) App.store.pushUndo(gesture.snap); }
    else if (gesture.type === 'labeldrag') { if (gesture.moved) App.store.pushUndo(gesture.snap); }
    else if (gesture.type === 'marquee') finishMarquee();
    gesture = null;
  }

  // 글씨(라벨) 위치 드래그 — 부품 이름(회전 보정) / 배선 라벨(끝별)
  function startLabelDrag(kind, id, end, sp) {
    const snap = App.store.snapshot();
    const f = App.store.findById(id); if (!f) return;
    let orig, rot = 0;
    if (kind === 'comp') { orig = { dx: f.item.labelDx || 0, dy: f.item.labelDy || 0 }; rot = f.item.rotation || 0; }
    else if (kind === 'tag') { orig = { dx: f.item.tagDx || 0, dy: f.item.tagDy || 0 }; rot = f.item.rotation || 0; }
    else { const o = (end === 'a' ? f.item.lblA : f.item.lblB) || { dx: 0, dy: 0 }; orig = { dx: o.dx, dy: o.dy }; }
    gesture = { type: 'labeldrag', snap: snap, sp: sp, kind: kind, id: id, end: end, orig: orig, rot: rot, moved: false };
  }
  function updateLabelDrag(cp) {
    let dx = cp.x - gesture.sp.x, dy = cp.y - gesture.sp.y;
    if ((gesture.kind === 'comp' || gesture.kind === 'tag') && gesture.rot) {
      const th = gesture.rot * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
      const lx = dx * c + dy * s, ly = -dx * s + dy * c; // 월드→로컬(역회전)
      dx = lx; dy = ly;
    }
    const it = App.store.findById(gesture.id).item;
    if (gesture.kind === 'comp') {
      it.labelDx = Math.round(gesture.orig.dx + dx); it.labelDy = Math.round(gesture.orig.dy + dy);
    } else if (gesture.kind === 'tag') {
      it.tagDx = Math.round(gesture.orig.dx + dx); it.tagDy = Math.round(gesture.orig.dy + dy);
    } else {
      const o = { dx: Math.round(gesture.orig.dx + dx), dy: Math.round(gesture.orig.dy + dy) };
      if (gesture.end === 'a') it.lblA = o; else it.lblB = o;
    }
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
    const wireGrp = e.target.closest && e.target.closest('[data-kind="wires"]');
    if (!wireGrp) return;
    const id = wireGrp.getAttribute('data-id');
    selectOnly(id);
    addBendAt(id, App.viewport.clientToWorld(e.clientX, e.clientY));
  }

  function deleteSelected() {
    if (!App.ui.selected.size) return;
    const ids = Array.from(App.ui.selected);
    App.store.commit(function (s) {
      ['ducts', 'rails', 'components', 'wires', 'dimensions'].forEach(function (k) {
        s[k] = s[k].filter(function (it) { return ids.indexOf(it.id) < 0; });
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

  // 선택 부품 복사 → 클립보드 (부품만; 와이어는 단자 종속이라 제외)
  function copySelected() {
    const ids = Array.from(App.ui.selected);
    const comps = App.store.get().components.filter(function (c) { return ids.indexOf(c.id) >= 0; });
    if (comps.length) App.ui.clipboard = App.clone(comps);
  }
  // 붙여넣기 (격자 2칸 오프셋, 호기번호 재발급)
  function paste() {
    if (!App.ui.clipboard || !App.ui.clipboard.length) return;
    const g = App.store.get().panel.gridMM * 2;
    const newIds = [];
    App.store.commit(function (s) {
      App.ui.clipboard.forEach(function (c) {
        const nc = App.clone(c);
        nc.id = App.uid('cmp');
        nc.x += g; nc.y += g;
        s.components.push(nc); // 품명 라벨 유지 (호기번호는 인스펙터에서 부여)
        newIds.push(nc.id);
      });
    });
    selectMany(newIds);
  }
  function duplicateSelected() { copySelected(); paste(); }

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
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (e.key === 'r' || e.key === 'R') { rotateSelected(); return; }
    if (e.key === 'Escape') {
      App.ui.placing = null;
      App.ui.wireStart = null;
      App.ui.dim = { stage: 0 };
      App.render.wirePreview(null);
      App.render.dimPreview(null);
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

  Interact.deleteSelected = deleteSelected;
  Interact.rotateSelected = rotateSelected;
  Interact.toggleLock = toggleLock;
  Interact.copySelected = copySelected;
  Interact.paste = paste;
  Interact.duplicateSelected = duplicateSelected;

  Interact.init = function (svgEl) {
    svg = svgEl;
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('dblclick', onDblClick);
    svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  };
})(window);
