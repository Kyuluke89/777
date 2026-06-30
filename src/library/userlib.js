/* 사용자(커스텀) 부품 라이브러리 — localStorage 저장 + JSON 내보내기/가져오기 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const U = (App.userlib = {});
  const KEY = 'panel-userparts';
  let mem = null; // 세션 메모리 캐시 (file:// 에서 localStorage 차단돼도 동작)

  U.load = function () {
    if (mem) return mem;
    let arr = [];
    try {
      const raw = global.localStorage && localStorage.getItem(KEY);
      if (raw) { const j = JSON.parse(raw); if (Array.isArray(j)) arr = j; }
    } catch (e) { /* file:// 등 차단 — 메모리만 사용 */ }
    mem = arr;
    return mem;
  };

  U.saveAll = function (arr) {
    mem = arr || [];
    try {
      if (global.localStorage) localStorage.setItem(KEY, JSON.stringify(mem));
    } catch (e) { /* 실패해도 세션 메모리에는 유지 — 영구 백업은 내보내기 사용 */ }
  };

  // 부품 추가/갱신 (partNo 기준). custom:true 표시.
  U.add = function (part) {
    const arr = U.load();
    part = Object.assign({}, part, { custom: true });
    const i = arr.findIndex(function (p) { return p.partNo === part.partNo; });
    if (i >= 0) arr[i] = part; else arr.push(part);
    U.saveAll(arr);
    return arr;
  };

  // 목록 병합 (불러오기/프로젝트 동봉 복원용)
  U.merge = function (list) {
    const arr = U.load();
    (list || []).forEach(function (p) {
      if (!p || !p.partNo) return;
      p.custom = true;
      const i = arr.findIndex(function (x) { return x.partNo === p.partNo; });
      if (i >= 0) arr[i] = p; else arr.push(p);
    });
    U.saveAll(arr);
    return arr;
  };

  U.remove = function (partNo) {
    const arr = U.load().filter(function (p) { return p.partNo !== partNo; });
    U.saveAll(arr);
    return arr;
  };

  // ── 기본(시드) 부품 숨김 목록 — 기본 라이브러리 부품도 삭제(숨김) 가능 ──
  const HKEY = 'panel-hidden-seed';
  let hmem = null;
  U.hidden = function () {
    if (hmem) return hmem;
    let a = [];
    try { const r = global.localStorage && localStorage.getItem(HKEY); if (r) { const j = JSON.parse(r); if (Array.isArray(j)) a = j; } } catch (e) {}
    hmem = a; return hmem;
  };
  U.saveHidden = function (a) {
    hmem = a || [];
    try { if (global.localStorage) localStorage.setItem(HKEY, JSON.stringify(hmem)); } catch (e) {}
  };
  U.hide = function (partNo) { const a = U.hidden(); if (a.indexOf(partNo) < 0) { a.push(partNo); U.saveHidden(a); } return a; };
  U.unhide = function (partNo) { U.saveHidden(U.hidden().filter(function (p) { return p !== partNo; })); };
  U.unhideAll = function () { U.saveHidden([]); };

  // ── 배선 프리셋(두께·색상·이름·규격) ──────────────────────────────────
  const PKEY = 'panel-wire-presets';
  const DEFAULT_PRESETS = [
    { name: '제어 0.75SQ', color: '#ffd400', width: 1.0, sq: '0.75', awg: '18' },
    { name: '제어 1.25SQ', color: '#1d4ed8', width: 1.2, sq: '1.25', awg: '16' },
    { name: '주회로 2.5SQ', color: '#1a1a1a', width: 1.8, sq: '2.5', awg: '14' },
    { name: '접지 GND', color: '#16a34a', width: 1.5, sq: '2.5', awg: '14' }
  ];
  let pmem = null;
  U.presets = function () {
    if (pmem) return pmem;
    let a = null;
    try { const r = global.localStorage && localStorage.getItem(PKEY); if (r) { const j = JSON.parse(r); if (Array.isArray(j)) a = j; } } catch (e) {}
    pmem = a || DEFAULT_PRESETS.slice();
    return pmem;
  };
  U.savePresets = function (a) {
    pmem = a || [];
    try { if (global.localStorage) localStorage.setItem(PKEY, JSON.stringify(pmem)); } catch (e) {}
  };
  U.addPreset = function (p) {
    const arr = U.presets();
    const i = arr.findIndex(function (x) { return x.name === p.name; });
    if (i >= 0) arr[i] = p; else arr.push(p);
    U.savePresets(arr);
    return arr;
  };
  U.removePreset = function (name) {
    U.savePresets(U.presets().filter(function (p) { return p.name !== name; }));
    return pmem;
  };

  U.exportFile = function () {
    const blob = new Blob([JSON.stringify(U.load(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'my-parts.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  U.importFile = function (onDone) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = function () {
      const f = input.files && input.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = function () {
        try {
          const list = JSON.parse(r.result);
          if (!Array.isArray(list)) throw new Error('형식 오류');
          const arr = U.merge(list);
          if (onDone) onDone(arr);
        } catch (e) { alert('가져오기 실패: ' + e.message); }
      };
      r.readAsText(f);
    };
    input.click();
  };
})(window);
