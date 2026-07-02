/* 중앙 상태 스토어 — 프로젝트 데이터 + 구독 + undo/redo */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  // 고유 ID 생성
  let _seq = 0;
  App.uid = function (prefix) {
    _seq += 1;
    return (prefix || 'id') + '_' + _seq.toString(36) + '_' + ((performance.now() | 0).toString(36));
  };

  // 깊은 복제 (structuredClone 우선, 없으면 JSON)
  function clone(obj) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(obj));
  }
  App.clone = clone;

  // HTML 이스케이프 — 사용자 문자열을 innerHTML 에 넣을 때 필수
  App.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  // 빈 프로젝트 생성
  App.createEmptyProject = function () {
    return {
      id: App.uid('proj'),
      name: '새 제어반',
      version: 1,
      panel: { widthMM: 600, heightMM: 800, gridMM: 10 },
      fonts: { comp: 1, term: 1, wire: 1, dim: 1 }, // 글씨 크기 배율(종류별)
      ducts: [],      // 배선 덕트
      rails: [],      // 채널 / DIN 레일
      components: [],  // 배치 부품
      wires: [],      // 단자 연결선
      dimensions: [], // 치수선
      labels: [],     // (다음 단계) 라인 라벨
      meta: { createdAt: null, updatedAt: null }
    };
  };

  const Store = (App.store = {});
  let state = App.createEmptyProject();
  const undoStack = [];
  const redoStack = [];
  const listeners = new Set();
  const MAX_HISTORY = 100;

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  Store.get = function () { return state; };

  Store.subscribe = function (fn) {
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  };

  // mutator(draft) 안에서 state 를 변경. history=true 면 undo 기록.
  Store.commit = function (mutator, opts) {
    opts = opts || {};
    if (opts.history !== false) {
      undoStack.push(clone(state));
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
    }
    mutator(state);
    state.meta = state.meta || {};
    notify();
  };

  // 전체 교체 (불러오기 등). history 보존하지 않음.
  Store.replace = function (newState, opts) {
    opts = opts || {};
    if (opts.history !== false) {
      undoStack.push(clone(state));
      redoStack.length = 0;
    }
    state = newState;
    notify();
  };

  // --- 제스처(드래그) 지원: 시작 시 스냅샷, 도중엔 직접 변경 + touch, 끝에 pushUndo ---
  Store.snapshot = function () { return clone(state); };
  Store.touch = function () { notify(); };
  Store.pushUndo = function (snap) {
    undoStack.push(snap);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  };

  Store.canUndo = function () { return undoStack.length > 0; };
  Store.canRedo = function () { return redoStack.length > 0; };

  Store.undo = function () {
    if (!undoStack.length) return;
    redoStack.push(clone(state));
    state = undoStack.pop();
    notify();
  };

  Store.redo = function () {
    if (!redoStack.length) return;
    undoStack.push(clone(state));
    state = redoStack.pop();
    notify();
  };

  // --- 엔티티 헬퍼 ---
  Store.findById = function (id) {
    if (!id) return null;
    const groups = ['ducts', 'rails', 'components', 'wires', 'dimensions'];
    for (let i = 0; i < groups.length; i++) {
      const arr = state[groups[i]];
      for (let j = 0; j < arr.length; j++) {
        if (arr[j].id === id) return { kind: groups[i], item: arr[j] };
      }
    }
    return null;
  };
})(window);
