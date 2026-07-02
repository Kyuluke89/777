/* 배선 목록 패널 — 전체 라인(번호·규격·길이) 나열, 클릭 시 선택+화면 이동 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const WL = (App.wireList = {});

  let listEl, countEl;

  WL.render = function (state) {
    if (!listEl) return;
    state = state || App.store.get();
    const wires = state.wires || [];
    if (countEl) countEl.textContent = wires.length + '개';
    if (!wires.length) {
      listEl.innerHTML = '<div class="text-[11px] text-slate-400 px-1 py-1">배선이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = '';
    wires.forEach(function (w) {
      const len = App.wires.length(state, w);
      const sel = App.ui.selected && App.ui.selected.has(w.id);
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer text-[11px] ' +
        (sel ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50');
      row.innerHTML =
        '<span class="inline-block rounded-sm flex-shrink-0" style="width:9px;height:9px;background:' + (w.color || '#e11d2a') + ';border:1px solid #cbd5e1"></span>' +
        '<span class="font-semibold text-slate-700 truncate" style="min-width:38px">' + App.esc(w.label || '-') + '</span>' +
        '<span class="text-slate-400 flex-shrink-0">' + App.esc(w.sq ? w.sq + 'SQ' : '') + (w.acdc ? ' ' + w.acdc : '') + '</span>' +
        '<span class="ml-auto text-slate-500 flex-shrink-0">' + len + 'mm</span>';
      row.onclick = function () {
        App.ui.selected = new Set([w.id]);
        // 라인 중간으로 화면 이동
        const pts = App.wires.route(App.store.get(), w);
        const mp = pts && App.wires.midPoint(pts);
        if (mp && App.viewport.centerOn) App.viewport.centerOn(mp.x, mp.y);
        App.render.all();
        if (App.inspector) App.inspector.update();
        if (App.toolbar && App.toolbar.updateZoomPct) App.toolbar.updateZoomPct();
      };
      listEl.appendChild(row);
    });
  };

  WL.init = function () {
    listEl = document.getElementById('wire-list');
    countEl = document.getElementById('wl-count');
    // 상태 변경 시 자동 갱신
    App.store.subscribe(function (state) { WL.render(state); });
    WL.render();
  };
})(window);
