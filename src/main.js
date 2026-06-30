/* 부트스트랩 — 모든 모듈 초기화 및 연결 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  App.ui = {
    tool: 'select',
    placing: null,
    selected: new Set(),
    clipboard: [],
    dim: { stage: 0 },
    nextWireLabel: '',
    spreadWires: true,
    wireDefaults: null,
    flow: false,
    wireRound: 0,
    ductWidth: 60,
    railWidth: 35,
    spaceDown: false
  };

  function boot() {
    const svg = document.getElementById('canvas');
    App.viewport.init(svg);
    App.interact.init(svg);
    App.palette.init({
      list: document.getElementById('palette-list'),
      search: document.getElementById('palette-search'),
      count: document.getElementById('palette-count')
    });
    App.inspector.init(document.getElementById('inspector'));
    App.partEditor.init();
    App.toolbar.init();

    // 상태 변경 → 자동 재렌더 (반응형)
    App.store.subscribe(function () { App.render.all(); });

    // 상태 변경 → 자동저장 예약 + 카운트 갱신
    const countsEl = document.getElementById('counts');
    App.store.subscribe(function (state) {
      App.persistence.scheduleAutosave(state);
      if (countsEl) {
        const totLen = App.wires ? App.wires.totalLength(state) : 0;
        countsEl.textContent = '부품 ' + state.components.length +
          ' · 덕트 ' + state.ducts.length + ' · 레일 ' + state.rails.length +
          ' · 배선 ' + state.wires.length + '(' + totLen + 'mm)' +
          ' · 치수 ' + (state.dimensions || []).length;
      }
    });

    function start(state) {
      if (state) App.store.replace(state, { history: false });
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM);
      App.render.all();
      App.toolbar.syncFromState();
      App.inspector.update();
      // 자동저장 가능 여부 표시
      const badge = document.getElementById('autosave-badge');
      if (badge) {
        if (App.persistence.autosaveAvailable()) {
          badge.textContent = '자동저장 켜짐';
          badge.className = 'text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700';
        } else {
          badge.textContent = '자동저장 꺼짐 (파일로 저장하세요)';
          badge.className = 'text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700';
        }
      }
    }

    // 자동저장 복원 시도
    App.persistence.loadAutosave().then(function (saved) {
      if (saved && saved.panel && (saved.components.length || saved.ducts.length || saved.rails.length)) {
        if (confirm('이전 자동저장 작업을 복원할까요?')) { start(saved); return; }
      }
      start(null);
    }).catch(function () { start(null); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
