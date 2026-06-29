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

  function selectOnly(id) {
    App.ui.selected.clear();
    if (id) App.ui.selected.add(id);
    App.render.all();
    if (App.inspector) App.inspector.update();
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
      label: part.partNo,
      terminals: part.terminals || App.terminals.defaultCount(part.type),
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

  // 와이어 세그먼트 드래그 — 수평선은 y만, 수직선은 x만 이동
  function startWireSeg(wireId, k, orient, sp) {
    const snap = App.store.snapshot();
    const wf = App.store.findById(wireId);
    if (!wf) return;
    const wire = wf.item;
    if (!wire.corners) wire.corners = App.clone(App.wires.corners(App.store.get(), wire));
    gesture = { type: 'wireseg', snap: snap, sp: sp, wireId: wireId, k: k, orient: orient,
      orig: App.clone(wire.corners), moved: false };
  }

  function updateWireSeg(cp) {
    const wire = App.store.findById(gesture.wireId).item;
    const c = wire.corners, k = gesture.k, o = gesture.orig;
    if (gesture.orient === 'H') {
      const ny = snapV(o[k].y + (cp.y - gesture.sp.y));
      c[k].y = ny; c[k + 1].y = ny;
    } else {
      const nx = snapV(o[k].x + (cp.x - gesture.sp.x));
      c[k].x = nx; c[k + 1].x = nx;
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
      if (!wire.corners) wire.corners = App.clone(App.wires.corners(state, wire));
      // 클릭에 가장 가까운 세그먼트 찾기
      const segs = App.wires.editSegments(state, wire);
      let best = null, bd = Infinity;
      segs.forEach(function (s) {
        const d = (s.mid.x - cp.x) * (s.mid.x - cp.x) + (s.mid.y - cp.y) * (s.mid.y - cp.y);
        if (d < bd) { bd = d; best = s; }
      });
      if (best) App.wires.addBend(wire.corners, best.k, cp.x, cp.y);
    });
  }

  function startMove(sp) {
    const snap = App.store.snapshot();
    const origPos = {};
    App.ui.selected.forEach(function (id) {
      const f = App.store.findById(id);
      if (f) origPos[id] = { x: f.item.x, y: f.item.y };
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
        App.store.commit(function (s) { s.wires.push(App.wires.create(s, from, to)); });
        App.ui.wireStart = null;
        App.render.wirePreview(null);
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
      return;
    }

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
      // 빈 공간 → 선택 해제 + 패닝
      if (App.ui.selected.size) selectOnly(null);
      gesture = { type: 'pan', last: { x: e.clientX, y: e.clientY } };
      svg.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e) {
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
  }

  function onPointerUp(e) {
    if (!gesture) return;
    try { svg.releasePointerCapture(e.pointerId); } catch (x) {}
    if (gesture.type === 'draw') finishDraw();
    else if (gesture.type === 'move') finishMove();
    else if (gesture.type === 'wireseg') { if (gesture.moved) App.store.pushUndo(gesture.snap); }
    gesture = null;
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
      ['ducts', 'rails', 'components', 'wires'].forEach(function (k) {
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

  function onKeyDown(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ') { App.ui.spaceDown = true; return; }
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
      App.render.wirePreview(null);
      App.ui.selected.clear();
      if (App.palette) App.palette.refresh();
      App.render.all();
      return;
    }
  }

  function onKeyUp(e) {
    if (e.key === ' ') App.ui.spaceDown = false;
  }

  Interact.deleteSelected = deleteSelected;
  Interact.rotateSelected = rotateSelected;

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
