/* 배선 프리셋 관리 모달 — 사전 생성 / 기존 수정(덮어쓰기) / 삭제 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const WP = (App.wirePresets = {});

  let modal, listEl, rows = null;

  function $(id) { return document.getElementById(id); }

  function sqOptions(sel) {
    let h = '<option value="">-</option>';
    (App.wires.SQ_LIST || []).forEach(function (s) {
      h += '<option value="' + s + '"' + (String(sel) === s ? ' selected' : '') + '>' + s + '</option>';
    });
    return h;
  }

  function rowHtml(p, i) {
    return '<div class="wp-row flex items-center gap-2 py-1" data-i="' + i + '">' +
      '<input class="wp-name px-1 py-0.5 text-xs border border-slate-300 rounded" style="width:120px" value="' + (p.name || '').replace(/"/g, '&quot;') + '" placeholder="이름"/>' +
      '<input class="wp-color border border-slate-300 rounded" type="color" style="width:36px;height:26px" value="' + (p.color || '#e11d2a') + '"/>' +
      '<input class="wp-width px-1 py-0.5 text-xs border border-slate-300 rounded text-right" type="number" step="0.2" min="0.2" style="width:56px" value="' + (p.width != null ? p.width : 1.2) + '"/>' +
      '<select class="wp-sq px-1 py-0.5 text-xs border border-slate-300 rounded" style="width:72px">' + sqOptions(p.sq) + '</select>' +
      '<input class="wp-awg px-1 py-0.5 text-xs border border-slate-300 rounded text-right" style="width:56px" value="' + (p.awg || '') + '" placeholder="자동"/>' +
      '<button class="wp-del text-red-400 hover:text-red-600 text-xs" title="삭제">✕</button>' +
      '</div>';
  }

  function renderRows() {
    listEl.innerHTML = rows.length ? rows.map(rowHtml).join('') : '<div class="text-xs text-slate-400 px-1 py-2">프리셋이 없습니다. "＋ 새 프리셋"으로 추가하세요.</div>';
    // SQ 변경 시 AWG 자동
    listEl.querySelectorAll('.wp-sq').forEach(function (sel) {
      sel.onchange = function () {
        const row = sel.closest('.wp-row');
        const awg = App.wires.SQ_AWG[sel.value];
        if (awg) row.querySelector('.wp-awg').value = awg;
      };
    });
    listEl.querySelectorAll('.wp-del').forEach(function (btn) {
      btn.onclick = function () { collect(); const i = +btn.closest('.wp-row').getAttribute('data-i'); rows.splice(i, 1); renderRows(); };
    });
  }

  // 화면 입력값을 rows 로 수거
  function collect() {
    const out = [];
    listEl.querySelectorAll('.wp-row').forEach(function (r) {
      out.push({
        name: r.querySelector('.wp-name').value.trim(),
        color: r.querySelector('.wp-color').value,
        width: Math.max(0.2, parseFloat(r.querySelector('.wp-width').value) || 1.2),
        sq: r.querySelector('.wp-sq').value,
        awg: r.querySelector('.wp-awg').value.trim()
      });
    });
    rows = out;
    return out;
  }

  WP.open = function () {
    rows = (App.userlib.presets() || []).map(function (p) { return Object.assign({}, p); });
    renderRows();
    modal.style.display = 'flex';
  };
  WP.close = function () { modal.style.display = 'none'; };

  WP.init = function () {
    modal = $('wp-editor');
    listEl = $('wp-list');
    if (!modal) return;

    $('wp-add').onclick = function () {
      collect();
      rows.push({ name: '새 프리셋' + (rows.length + 1), color: '#e11d2a', width: 1.2, sq: '', awg: '' });
      renderRows();
    };
    $('wp-from-wire').onclick = function () {
      collect();
      const sel = App.ui.selected;
      let w = null;
      if (sel && sel.size) w = App.store.get().wires.find(function (x) { return sel.has(x.id); });
      if (!w) { App.toolbar && App.toolbar.flash('배선을 먼저 선택하세요'); return; }
      rows.push({ name: (w.sq ? w.sq + 'SQ' : '배선') + (rows.length + 1), color: w.color || '#e11d2a', width: w.width != null ? w.width : 1.2, sq: w.sq || '', awg: w.awg || '' });
      renderRows();
    };
    $('wp-save').onclick = function () {
      collect();
      const clean = rows.filter(function (p) { return p.name; });
      // 이름 중복 제거(뒤쪽 우선)
      const seen = {}, fin = [];
      clean.forEach(function (p) { seen[p.name] = p; });
      Object.keys(seen).forEach(function (k) { fin.push(seen[k]); });
      App.userlib.savePresets(fin);
      if (App.toolbar) App.toolbar.refreshPresets();
      if (App.toolbar) App.toolbar.flash('프리셋 ' + fin.length + '개 저장');
      WP.close();
    };
    $('wp-close').onclick = WP.close;
    $('wp-cancel').onclick = WP.close;
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) WP.close(); });
  };
})(window);
