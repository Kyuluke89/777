/* 인스펙터 — 선택한 엔티티의 속성 표시/편집 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Inspector = (App.inspector = {});

  let root;

  function row(label, inputHtml) {
    return '<label class="flex items-center justify-between gap-2 py-1">' +
      '<span class="text-xs text-slate-500">' + label + '</span>' + inputHtml + '</label>';
  }
  function numInput(field, val) {
    return '<input data-field="' + field + '" type="number" value="' + (val == null ? '' : val) +
      '" class="w-24 px-2 py-1 text-xs border border-slate-300 rounded text-right" />';
  }

  function commitField(id, field, value) {
    App.store.commit(function (s) {
      const f = App.store.findById(id);
      if (!f) return;
      if (field === 'label') f.item.label = value;
      else f.item[field] = parseFloat(value);
    });
    App.render.all();
  }

  Inspector.update = function () {
    if (!root) return;
    const sel = App.ui.selected;
    if (!sel || sel.size === 0) {
      root.innerHTML = '<p class="text-xs text-slate-400 px-1 py-2">선택된 항목이 없습니다.<br>캔버스에서 항목을 클릭하세요.</p>';
      return;
    }
    if (sel.size > 1) {
      root.innerHTML = '<p class="text-xs text-slate-500 px-1 py-2">' + sel.size + '개 선택됨<br>' +
        '<span class="text-slate-400">R: 회전 · Del: 삭제</span></p>';
      return;
    }
    const id = Array.from(sel)[0];
    const f = App.store.findById(id);
    if (!f) { root.innerHTML = ''; return; }
    const it = f.item;
    let html = '<div class="text-xs font-semibold text-slate-600 mb-1 px-1">' +
      ({ ducts: '덕트', rails: '채널/레일', components: '부품' }[f.kind]) + '</div>';

    html += row('X (mm)', numInput('x', it.x));
    html += row('Y (mm)', numInput('y', it.y));

    if (f.kind === 'components') {
      html += row('가로', numInput('widthMM', it.widthMM));
      html += row('세로', numInput('heightMM', it.heightMM));
      html += row('회전', numInput('rotation', it.rotation || 0));
      html += row('라벨', '<input data-field="label" type="text" value="' + (it.label || '') +
        '" class="w-28 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">' + (it.type || '') + ' · ' + (it.partNo || '') + '</div>';
    } else {
      html += row('길이', numInput('lengthMM', it.lengthMM));
      html += row('폭', numInput('widthMM', it.widthMM));
      html += row('방향', '<span class="text-xs text-slate-600">' + (it.orient === 'h' ? '가로' : '세로') + '</span>');
    }

    root.innerHTML = html;
    root.querySelectorAll('[data-field]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        commitField(id, inp.getAttribute('data-field'), inp.value);
      });
    });
  };

  Inspector.init = function (el) { root = el; Inspector.update(); };
})(window);
