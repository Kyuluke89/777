/* 저장/불러오기 — JSON 파일 + IndexedDB 자동저장 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const P = (App.persistence = {});

  // --- JSON 파일 저장 (다운로드) — 도면 + 내 부품 라이브러리 동봉 ---
  P.saveToFile = function (state) {
    state = state || App.store.get();
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
    const out = App.clone(state);
    out.userParts = App.userlib ? App.userlib.load() : []; // 커스텀 부품 라이브러리 포함
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (state.name || 'panel').replace(/[^\w가-힣\-]+/g, '_');
    a.href = url;
    a.download = safe + '.panel.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  // --- JSON 파일 불러오기 ---
  P.loadFromFile = function (onLoaded) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(reader.result);
          if (!data || !data.panel) throw new Error('패널 정보가 없는 파일입니다.');
          // 누락 필드 보정
          data.ducts = data.ducts || [];
          data.rails = data.rails || [];
          data.components = data.components || [];
          data.wires = data.wires || [];
          data.dimensions = data.dimensions || [];
          data.fonts = data.fonts || { comp: 1, term: 1, wire: 1, dim: 1 };
          data.labels = data.labels || [];
          data.meta = data.meta || {};
          // 동봉된 내 부품 라이브러리 복원 → 팔레트 반영 후 프로젝트에서 분리
          if (Array.isArray(data.userParts) && App.userlib) {
            App.userlib.merge(data.userParts);
            if (App.palette) App.palette.reloadUser();
          }
          delete data.userParts;
          if (onLoaded) onLoaded(data);
        } catch (e) {
          alert('불러오기 실패: ' + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // --- IndexedDB 자동저장 ---
  const DB_NAME = 'panel-designer';
  const STORE = 'projects';
  const AUTOSAVE_KEY = 'autosave';
  let dbPromise = null;

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

  P.autosaveAvailable = function () {
    // file:// 에서는 IndexedDB 가 불안정 → http(s) 에서만 사용
    return location.protocol === 'http:' || location.protocol === 'https:';
  };

  let saveTimer = null;
  P.scheduleAutosave = function (state) {
    if (!P.autosaveAvailable()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      openDB().then(function (db) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(App.clone(state), AUTOSAVE_KEY);
      }).catch(function () { /* 무시 */ });
    }, 800);
  };

  P.loadAutosave = function () {
    if (!P.autosaveAvailable()) return Promise.resolve(null);
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(AUTOSAVE_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  };

  P.clearAutosave = function () {
    if (!P.autosaveAvailable()) return;
    openDB().then(function (db) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(AUTOSAVE_KEY);
    }).catch(function () {});
  };
})(window);
