/* 툴바 — 도구 선택, 전장 설정, 저장/불러오기, EDZ 가져오기, 줌 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Toolbar = (App.toolbar = {});

  const TOOLS = ['select', 'duct-h', 'duct-v', 'rail-h', 'rail-v', 'wire', 'dim'];

  function $(id) { return document.getElementById(id); }

  Toolbar.syncTool = function () {
    TOOLS.forEach(function (t) {
      const btn = $('tool-' + t);
      if (!btn) return;
      if (App.ui.tool === t && !App.ui.placing) {
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-white', 'text-slate-700');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-white', 'text-slate-700');
      }
    });
  };

  function setTool(t) {
    App.ui.tool = t;
    App.ui.placing = null;
    App.ui.wireStart = null;
    App.ui.dim = { stage: 0 };
    if (App.render) { App.render.dimPreview(null); App.render.snapMarker(null); App.render.wirePreview(null); }
    if (App.palette) App.palette.refresh();
    Toolbar.syncTool();
  }

  function flash(msg) {
    const el = $('status-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('opacity-0');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { el.classList.add('opacity-0'); }, 2500);
  }
  Toolbar.flash = flash;

  Toolbar.init = function () {
    TOOLS.forEach(function (t) {
      const btn = $('tool-' + t);
      if (btn) btn.onclick = function () { setTool(t); };
    });

    // 전장 설정
    function applyPanel() {
      const w = Math.max(50, parseInt($('panel-w').value, 10) || 600);
      const h = Math.max(50, parseInt($('panel-h').value, 10) || 800);
      const g = Math.max(1, parseInt($('panel-grid').value, 10) || 10);
      App.store.commit(function (s) {
        s.panel.widthMM = w; s.panel.heightMM = h; s.panel.gridMM = g;
      });
      App.render.all();
    }
    ['panel-w', 'panel-h', 'panel-grid'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('change', applyPanel);
    });
    $('panel-fit').onclick = function () {
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM);
      App.render.all();
    };

    // 글씨 크기 배율
    ['comp', 'term', 'wire', 'dim'].forEach(function (k) {
      const el = $('font-' + k);
      if (el) el.addEventListener('change', function () {
        const v = Math.max(0.3, Math.min(5, parseFloat(el.value) || 1));
        el.value = v;
        App.store.commit(function (s) { s.fonts = s.fonts || {}; s.fonts[k] = v; });
        App.render.all();
      });
    });

    // 덕트 폭
    $('duct-width').addEventListener('change', function () {
      App.ui.ductWidth = parseInt(this.value, 10) || 60;
    });

    // 액션
    $('act-new').onclick = function () {
      if (!confirm('새 프로젝트를 시작할까요? 저장하지 않은 변경은 사라집니다.')) return;
      App.store.replace(App.createEmptyProject());
      App.ui.selected.clear();
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM);
      App.render.all();
      App.inspector.update();
      flash('새 프로젝트');
    };
    $('act-save').onclick = function () { App.persistence.saveToFile(App.store.get()); flash('JSON 저장됨'); };
    $('act-load').onclick = function () {
      App.persistence.loadFromFile(function (data) {
        App.store.replace(data);
        App.ui.selected.clear();
        const p = data.panel;
        App.viewport.fitTo(p.widthMM, p.heightMM);
        App.render.all();
        App.inspector.update();
        Toolbar.syncFromState();
        flash('불러왔습니다');
      });
    };
    $('act-undo').onclick = function () { App.store.undo(); App.ui.selected.clear(); App.render.all(); App.inspector.update(); };
    $('act-redo').onclick = function () { App.store.redo(); App.render.all(); };
    $('act-delete').onclick = function () { App.interact.deleteSelected(); };
    $('act-rotate').onclick = function () { App.interact.rotateSelected(); };
    $('act-dup').onclick = function () { App.interact.duplicateSelected(); };

    // 커스텀 부품 만들기 + 내 부품 내보내기/가져오기
    $('act-custom').onclick = function () { App.partEditor.open(); };
    $('lib-export').onclick = function () { App.userlib.exportFile(); flash('내 부품 내보냄'); };
    $('lib-import').onclick = function () {
      App.userlib.importFile(function () { App.palette.reloadUser(); flash('내 부품 가져옴'); });
    };

    // EDZ 가져오기
    $('act-edz').onclick = function () { $('edz-file').click(); };
    $('edz-file').onchange = function () {
      const file = this.files && this.files[0];
      if (!file) return;
      flash('EDZ 분석 중…');
      App.edz.importFile(file).then(function (parts) {
        App.palette.addParts(parts);
        flash(parts.length + '개 부품 추가됨');
      }).catch(function (e) {
        alert('EDZ 가져오기 실패\n\n' + e.message);
        flash('EDZ 실패');
      });
      this.value = '';
    };

    // 내보내기
    $('act-bom').onclick = function () { const n = App.exporter.bom(); flash('BOM ' + n + '행 저장'); };
    $('act-wlist').onclick = function () { const n = App.exporter.wiringList(); flash('배선표 ' + n + '행 저장'); };
    $('act-png').onclick = function () { App.exporter.png(2); flash('PNG 내보내기'); };
    $('act-print').onclick = function () { App.exporter.print(); };

    Toolbar.syncTool();
    Toolbar.syncFromState();
  };

  // 상태값을 입력 필드에 반영
  Toolbar.syncFromState = function () {
    const s = App.store.get();
    const p = s.panel;
    if ($('panel-w')) $('panel-w').value = p.widthMM;
    if ($('panel-h')) $('panel-h').value = p.heightMM;
    if ($('panel-grid')) $('panel-grid').value = p.gridMM;
    const f = s.fonts || {};
    ['comp', 'term', 'wire', 'dim'].forEach(function (k) {
      if ($('font-' + k)) $('font-' + k).value = f[k] || 1;
    });
  };
})(window);
