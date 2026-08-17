/* 저장/불러오기 — JSON 파일 + IndexedDB 자동저장 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const P = (App.persistence = {});

  // --- JSON 파일 저장 — 도면 + 내 부품 라이브러리 동봉 ---
  // File System Access API 지원 시: 처음 한 번 위치 지정 후 Ctrl+S 가 같은 파일에 덮어쓰기.
  // 미지원(file:// 포함) 시: 기존처럼 다운로드.
  let fileHandle = null;
  P.currentFileName = function () { return fileHandle ? fileHandle.name : null; };

  function serialize(state) {
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
    const out = App.clone(state);
    out.userParts = App.userlib ? App.userlib.load() : []; // 커스텀 부품 라이브러리 포함
    out.customTypes = App.types ? App.types.allCustom() : []; // 사용자 추가 타입(색상) 포함
    return JSON.stringify(out, null, 2);
  }

  function safeName(state) {
    const base = (state.panel && state.panel.title) || state.name || 'panel';
    return String(base).replace(/[^\w가-힣\-]+/g, '_');
  }

  function downloadJSON(json, name) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // opts.as = true → 항상 위치 다시 지정("다른 이름으로 저장")
  P.saveToFile = function (state, opts) {
    opts = opts || {};
    state = state || App.store.get();
    const json = serialize(state);
    P.pushRecent(state);
    if (global.showSaveFilePicker) {
      const write = function (handle) {
        return handle.createWritable()
          .then(function (w) { return w.write(json).then(function () { return w.close(); }); })
          .then(function () {
            fileHandle = handle;
            P.markSaved();
            if (App.toolbar) App.toolbar.flash('저장됨: ' + handle.name);
          });
      };
      if (fileHandle && !opts.as) {
        write(fileHandle).catch(function () {
          // 권한 만료 등 → 위치 다시 지정
          fileHandle = null;
          P.saveToFile(state, opts);
        });
        return;
      }
      global.showSaveFilePicker({
        suggestedName: safeName(state) + '.panel.json',
        types: [{ description: 'Panel JSON', accept: { 'application/json': ['.json'] } }],
      }).then(write).catch(function () { /* 사용자가 취소 */ });
      return;
    }
    P.markSaved();
    downloadJSON(json, safeName(state) + '.panel.json');
  };

  // --- JSON 파일 불러오기 ---
  // 텍스트 → 프로젝트 객체 (누락 필드 보정 + 동봉 라이브러리 복원)
  P.parseProject = function (text) {
    const data = JSON.parse(text);
    if (!data || !data.panel) throw new Error('패널 정보가 없는 파일입니다.');
    data.ducts = data.ducts || [];
    data.rails = data.rails || [];
    data.components = data.components || [];
    data.wires = data.wires || [];
    data.dimensions = data.dimensions || [];
    data.texts = data.texts || [];
    data.clines = data.clines || [];
    data.fonts = data.fonts || { comp: 1, term: 1, wire: 1, dim: 1 };
    data.labels = data.labels || [];
    data.meta = data.meta || {};
    // 동봉된 내 부품 라이브러리 복원 → 팔레트 반영 후 프로젝트에서 분리
    if (Array.isArray(data.userParts) && App.userlib) {
      App.userlib.merge(data.userParts);
      if (App.palette) App.palette.reloadUser();
    }
    delete data.userParts;
    if (Array.isArray(data.customTypes) && App.types) App.types.merge(data.customTypes);
    delete data.customTypes;
    return data;
  };

  P.loadFromFile = function (onLoaded) {
    function finish(text, handle) {
      try {
        const data = P.parseProject(text);
        if (handle) fileHandle = handle; // 이후 Ctrl+S 가 이 파일에 덮어쓰기
        P.pushRecent(data);
        if (onLoaded) onLoaded(data);
      } catch (e) {
        alert('불러오기 실패: ' + e.message);
      }
    }
    if (global.showOpenFilePicker) {
      global.showOpenFilePicker({
        types: [{ description: 'Panel JSON', accept: { 'application/json': ['.json'] } }],
      }).then(function (handles) {
        const h = handles && handles[0];
        if (!h) return;
        return h.getFile().then(function (f) { return f.text(); }).then(function (t) { finish(t, h); });
      }).catch(function () { /* 사용자가 취소 */ });
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { finish(reader.result, null); };
      reader.readAsText(file);
    };
    input.click();
  };

  // --- 자동저장 저장소 ---
  // http(s): IndexedDB (용량 큼) · file://(더블클릭): localStorage 폴백 —
  // 파일을 실수로 지워도 브라우저 안 사본으로 복구할 수 있게 어느 환경에서든 켠다.
  const DB_NAME = 'panel-designer';
  const STORE = 'projects';
  const AUTOSAVE_KEY = 'autosave';
  const RECENT_KEY = 'recent';      // 최근 프로젝트 목록 [{name, ts, data}]
  const SNAPSHOTS_KEY = 'snapshots'; // 버전 히스토리 [{ts, data}]
  const LS_PREFIX = 'panel-store-';  // localStorage 폴백 키 접두사
  let dbPromise = null;

  function idbAvailable() {
    return (location.protocol === 'http:' || location.protocol === 'https:') && !!global.indexedDB;
  }
  function lsAvailable() {
    try {
      localStorage.setItem('panel-ls-test', '1');
      localStorage.removeItem('panel-ls-test');
      return true;
    } catch (e) { return false; }
  }

  P.autosaveAvailable = function () { return idbAvailable() || lsAvailable(); };
  // localStorage 폴백은 용량이 작으므로 보관 개수를 줄인다
  function recentMax() { return idbAvailable() ? 10 : 5; }
  function snapMax() { return idbAvailable() ? 20 : 6; }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB 미지원')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  // key 값 읽기/쓰기/삭제 — 환경에 맞는 저장소로
  function dbGet(key) {
    if (idbAvailable()) {
      return openDB().then(function (db) {
        return new Promise(function (resolve) {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        });
      }).catch(function () { return null; });
    }
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) { return Promise.resolve(null); }
  }
  function dbPut(key, val) {
    if (idbAvailable()) {
      return openDB().then(function (db) {
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
        return true;
      }).catch(function () { return false; });
    }
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
      return Promise.resolve(true);
    } catch (e) {
      // 용량 초과: 목록이면 뒤에서부터 줄여가며 재시도 (최신 것 우선 보존)
      if (Array.isArray(val)) {
        const trimmed = val.slice();
        while (trimmed.length > 1) {
          trimmed.pop();
          try {
            localStorage.setItem(LS_PREFIX + key, JSON.stringify(trimmed));
            return Promise.resolve(true);
          } catch (e2) { /* 더 줄여서 재시도 */ }
        }
      }
      return Promise.resolve(false);
    }
  }
  function dbDel(key) {
    if (idbAvailable()) {
      return openDB().then(function (db) {
        db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
        return true;
      }).catch(function () { return false; });
    }
    try { localStorage.removeItem(LS_PREFIX + key); } catch (e) {}
    return Promise.resolve(true);
  }

  // --- 최근 프로젝트 목록 (저장/불러오기 시 기록) ---
  P.pushRecent = function (state) {
    if (!P.autosaveAvailable()) return;
    const name = (state.panel && state.panel.title) || state.name || '제목 없음';
    dbGet(RECENT_KEY).then(function (list) {
      list = Array.isArray(list) ? list : [];
      list = list.filter(function (r) { return r.name !== name; }); // 같은 이름은 최신으로 교체
      list.unshift({ name: name, ts: Date.now(), data: App.clone(state) });
      if (list.length > recentMax()) list.length = recentMax();
      dbPut(RECENT_KEY, list);
    });
  };

  P.listRecent = function () {
    return dbGet(RECENT_KEY).then(function (list) { return Array.isArray(list) ? list : []; });
  };

  // --- 버전 히스토리 (자동 스냅샷) ---
  // 자동저장과 별개로 일정 간격마다 시점 스냅샷을 보관 → 실수해도 과거로 복원 가능
  const SNAP_INTERVAL = 5 * 60 * 1000; // 5분
  let lastSnapTs = 0;

  P.snapshotNow = function (state) {
    if (!P.autosaveAvailable()) return Promise.resolve(false);
    state = state || App.store.get();
    return dbGet(SNAPSHOTS_KEY).then(function (list) {
      list = Array.isArray(list) ? list : [];
      list.unshift({ ts: Date.now(), data: App.clone(state) });
      if (list.length > snapMax()) list.length = snapMax();
      return dbPut(SNAPSHOTS_KEY, list);
    });
  };

  function maybeSnapshot(state) {
    const now = Date.now();
    if (now - lastSnapTs < SNAP_INTERVAL) return;
    lastSnapTs = now;
    P.snapshotNow(state);
  }

  P.listSnapshots = function () {
    return dbGet(SNAPSHOTS_KEY).then(function (list) { return Array.isArray(list) ? list : []; });
  };

  let saveTimer = null;
  P.scheduleAutosave = function (state) {
    if (!P.autosaveAvailable()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      dbPut(AUTOSAVE_KEY, App.clone(state));
      maybeSnapshot(state); // 버전 히스토리도 주기적으로 적재
    }, 800);
  };

  P.loadAutosave = function () {
    if (!P.autosaveAvailable()) return Promise.resolve(null);
    return dbGet(AUTOSAVE_KEY);
  };

  P.clearAutosave = function () {
    if (!P.autosaveAvailable()) return;
    dbDel(AUTOSAVE_KEY);
  };

  // --- 저장 안 된 변경 추적 + 창 닫기 경고 ---
  // 자동저장이 없는 file:// 환경에서 실수로 닫아 작업을 잃지 않도록 경고한다.
  let dirty = false;
  P.markDirty = function () { dirty = true; };
  P.markSaved = function () { dirty = false; };
  P.isDirty = function () { return dirty; };
  global.addEventListener('beforeunload', function (e) {
    // 자동저장이 켜져 있으면(http/https) 복원 가능하므로 경고 생략
    if (!dirty || P.autosaveAvailable()) return;
    e.preventDefault();
    e.returnValue = '';
  });
})(window);
