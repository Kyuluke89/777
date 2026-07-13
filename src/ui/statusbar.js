/* 하단 상태바 — 현재 도구/선택/격자/카운트 실시간 표시 (CAD식) */
(function () {
  'use strict';
  window.App = window.App || {};

  var TOOL_NAMES = {
    select: '↖ 선택', 'duct-h': '덕트 ─', 'duct-v': '덕트 │',
    'rail-h': '레일 ─', 'rail-v': '레일 │', wire: '⚯ 배선',
    dim: '↔ 치수', text: 'T 텍스트', cline: '╂ 센터선',
  };
  var KIND_NAMES = {
    components: '부품', ducts: '덕트', rails: '레일',
    wires: '배선', dimensions: '치수', texts: '텍스트', clines: '센터선',
  };

  function selSummary() {
    var sel = App.ui.selected;
    if (!sel || !sel.size) return '';
    var byKind = {};
    sel.forEach(function (id) {
      var f = App.store.findById(id);
      if (f) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
    });
    var parts = Object.keys(byKind).map(function (k) {
      return (KIND_NAMES[k] || k) + ' ' + byKind[k];
    });
    return '선택: ' + parts.join(' · ');
  }

  function update() {
    var toolEl = document.getElementById('sb-tool');
    var selEl = document.getElementById('sb-sel');
    var gridEl = document.getElementById('sb-grid');
    if (!toolEl) return;
    toolEl.textContent = TOOL_NAMES[App.ui.tool] || App.ui.tool;
    selEl.textContent = selSummary();
    var s = App.store.get();
    gridEl.textContent = '격자 ' + s.panel.gridMM + 'mm';
  }

  function bindFilter() {
    var box = document.getElementById('sb-filter');
    if (!box) return;
    box.querySelectorAll('.sf-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        App.ui.selFilter = btn.getAttribute('data-sf');
        box.querySelectorAll('.sf-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  function init() {
    App.ui.selFilter = App.ui.selFilter || 'all';
    bindFilter();
    // 렌더/도구 변경 시 자동 갱신 — 두 함수를 감싸 상태바를 뒤에 갱신
    var origRender = App.render.all;
    App.render.all = function () {
      origRender.apply(App.render, arguments);
      update();
    };
    if (App.toolbar && App.toolbar.setTool) {
      var origTool = App.toolbar.setTool;
      App.toolbar.setTool = function () {
        origTool.apply(App.toolbar, arguments);
        update();
      };
    }
    update();
  }

  App.statusbar = { init: init, update: update };
})();
