/* 시트(도면 여러 장) 관리 — 활성 시트는 최상위 상태, 나머지는 state.sheets 에 보관.
   전환/추가/이름변경/삭제 모두 commit 이므로 undo 가능. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const SH = (App.sheetsMgr = {});

  // 시트로 저장/복원되는 필드
  const FIELDS = ['panel', 'ducts', 'rails', 'components', 'wires', 'dimensions', 'fonts', 'titleBlock'];

  function packCurrent(s) {
    const d = {};
    FIELDS.forEach(function (k) { d[k] = App.clone(s[k] != null ? s[k] : (k === 'panel' ? s.panel : [])); });
    return d;
  }
  function unpack(s, d) {
    FIELDS.forEach(function (k) {
      if (d && d[k] != null) s[k] = App.clone(d[k]);
      else if (k === 'panel') s.panel = { widthMM: 600, heightMM: 800, gridMM: 10 };
      else if (k === 'fonts') s.fonts = {};
      else if (k === 'titleBlock') s.titleBlock = null;
      else s[k] = [];
    });
  }

  // 시트 배열 보장 (구버전 프로젝트 호환)
  SH.ensure = function (s) {
    if (!s.sheets || !s.sheets.length) {
      s.sheets = [{ name: 'Sheet1', data: null }]; // data=null → 활성(최상위) 상태가 내용
      s.activeSheet = 0;
    }
    if (s.activeSheet == null || s.activeSheet >= s.sheets.length) s.activeSheet = 0;
  };

  SH.list = function () {
    const s = App.store.get();
    return { sheets: s.sheets || [{ name: 'Sheet1' }], active: s.activeSheet || 0 };
  };

  SH.switchTo = function (i) {
    App.store.commit(function (s) {
      SH.ensure(s);
      if (i === s.activeSheet || i < 0 || i >= s.sheets.length) return;
      s.sheets[s.activeSheet].data = packCurrent(s); // 현재 내용 보관
      unpack(s, s.sheets[i].data);                    // 대상 시트 로드
      s.sheets[i].data = null;                        // 활성 시트 내용은 최상위가 원본
      s.activeSheet = i;
    });
    App.ui.selected.clear();
    const p = App.store.get().panel;
    App.viewport.fitTo(p.widthMM, p.heightMM);
    App.render.all();
    if (App.inspector) App.inspector.update();
    if (App.toolbar) { App.toolbar.syncFromState(); if (App.toolbar.updateZoomPct) App.toolbar.updateZoomPct(); }
    SH.renderTabs();
  };

  SH.add = function (name) {
    App.store.commit(function (s) {
      SH.ensure(s);
      s.sheets.push({ name: name || ('Sheet' + (s.sheets.length + 1)), data: {} }); // 빈 시트
    });
    SH.switchTo(App.store.get().sheets.length - 1);
  };

  SH.rename = function (i, name) {
    if (!name) return;
    App.store.commit(function (s) { SH.ensure(s); if (s.sheets[i]) s.sheets[i].name = name; });
    SH.renderTabs();
  };

  SH.remove = function (i) {
    const s0 = App.store.get();
    if (!s0.sheets || s0.sheets.length <= 1) return; // 마지막 시트는 삭제 불가
    const wasActive = (i === s0.activeSheet);
    if (wasActive) SH.switchTo(i === 0 ? 1 : 0); // 먼저 다른 시트로 전환
    App.store.commit(function (s) {
      s.sheets.splice(i, 1);
      if (s.activeSheet > i) s.activeSheet -= 1;
    });
    SH.renderTabs();
  };

  // 탭 바 렌더
  SH.renderTabs = function () {
    const bar = document.getElementById('sheet-tabs');
    if (!bar) return;
    const info = SH.list();
    bar.innerHTML = '';
    info.sheets.forEach(function (sh, i) {
      const tab = document.createElement('button');
      const on = i === info.active;
      tab.className = 'px-2 py-0.5 text-[11px] rounded-t border border-b-0 ' +
        (on ? 'bg-white text-slate-800 font-semibold border-slate-300' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-50');
      tab.textContent = sh.name;
      tab.title = '클릭: 전환 · 더블클릭: 이름변경';
      tab.onclick = function () { SH.switchTo(i); };
      tab.ondblclick = function () {
        const nm = prompt('시트 이름', sh.name);
        if (nm && nm.trim()) SH.rename(i, nm.trim());
      };
      bar.appendChild(tab);
      if (info.sheets.length > 1) {
        const x = document.createElement('button');
        x.className = 'text-[10px] text-slate-400 hover:text-red-500 -ml-1 mr-0.5';
        x.textContent = '✕';
        x.title = '시트 삭제';
        x.onclick = function () {
          if (confirm('시트 "' + sh.name + '"를 삭제할까요? (내용도 삭제됩니다)')) SH.remove(i);
        };
        bar.appendChild(x);
      }
    });
    const add = document.createElement('button');
    add.className = 'px-2 py-0.5 text-[11px] text-slate-500 hover:text-blue-600';
    add.textContent = '＋ 시트';
    add.onclick = function () {
      const nm = prompt('새 시트 이름', 'Sheet' + (info.sheets.length + 1));
      if (nm != null) SH.add(nm.trim() || undefined);
    };
    bar.appendChild(add);
  };

  SH.init = function () {
    App.store.commit(function (s) { SH.ensure(s); }, { history: false });
    App.store.subscribe(function () { SH.renderTabs(); }); // 로드/새로 등에도 탭 동기화
    SH.renderTabs();
  };
})(window);
