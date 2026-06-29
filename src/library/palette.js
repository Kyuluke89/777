/* 라이브러리 팔레트 — 부품 목록 표시, 검색, EDZ 가져오기, 배치 시작 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Palette = (App.palette = {});

  let listEl, searchEl, countEl;
  let library = [];
  let filter = '';

  Palette.getLibrary = function () { return library; };

  Palette.setLibrary = function (parts) {
    library = parts.slice();
    render();
  };

  // 부품 추가 (중복 partNo 는 갱신)
  Palette.addParts = function (parts) {
    parts.forEach(function (p) {
      const i = library.findIndex(function (x) { return x.partNo === p.partNo; });
      if (i >= 0) library[i] = p; else library.push(p);
    });
    render();
  };

  function matches(p) {
    if (!filter) return true;
    const s = (p.partNo + ' ' + p.name + ' ' + p.type).toLowerCase();
    return s.indexOf(filter) >= 0;
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    const shown = library.filter(matches);
    countEl.textContent = shown.length + ' / ' + library.length;
    shown.forEach(function (p) {
      const item = document.createElement('button');
      item.className = 'w-full text-left px-2 py-1.5 rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50 flex items-center gap-2 transition';
      const color = App.typeColor(p.type);
      const placing = App.ui && App.ui.placing && App.ui.placing.partNo === p.partNo;
      if (placing) item.className += ' ring-2 ring-blue-500 bg-blue-50';
      item.innerHTML =
        '<span class="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background:' + color + '"></span>' +
        '<span class="flex-1 min-w-0">' +
        '<span class="block text-xs font-semibold text-slate-700 truncate">' + p.partNo + '</span>' +
        '<span class="block text-[10px] text-slate-400 truncate">' + (p.name || '') + ' · ' + p.w + '×' + p.h + 'mm</span>' +
        '</span>' +
        '<span class="text-[10px] font-bold flex-shrink-0" style="color:' + color + '">' + p.type + '</span>';
      item.onclick = function () {
        if (App.ui.placing && App.ui.placing.partNo === p.partNo) {
          App.ui.placing = null;
        } else {
          App.ui.placing = p;
          App.ui.tool = 'select';
          if (App.toolbar) App.toolbar.syncTool();
        }
        render();
      };
      listEl.appendChild(item);
    });
  }
  Palette.refresh = render;

  Palette.init = function (opts) {
    listEl = opts.list;
    searchEl = opts.search;
    countEl = opts.count;
    searchEl.addEventListener('input', function () {
      filter = searchEl.value.trim().toLowerCase();
      render();
    });
    // 시드 부품으로 초기화
    Palette.setLibrary(App.seedParts || []);
  };
})(window);
