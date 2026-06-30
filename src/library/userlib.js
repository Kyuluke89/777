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

  U.remove = function (partNo) {
    const arr = U.load().filter(function (p) { return p.partNo !== partNo; });
    U.saveAll(arr);
    return arr;
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
          const arr = U.load();
          list.forEach(function (p) {
            if (!p.partNo) return;
            const i = arr.findIndex(function (x) { return x.partNo === p.partNo; });
            p.custom = true;
            if (i >= 0) arr[i] = p; else arr.push(p);
          });
          U.saveAll(arr);
          if (onDone) onDone(arr);
        } catch (e) { alert('가져오기 실패: ' + e.message); }
      };
      r.readAsText(f);
    };
    input.click();
  };
})(window);
