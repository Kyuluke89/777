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
    let refresh = false;
    App.store.commit(function (s) {
      const f = App.store.findById(id);
      if (!f) return;
      if (field === 'label' || field === 'color' || field === 'tag' || field === 'sq' || field === 'awg') {
        f.item[field] = value;
        // SQ 선택 시 AWG 자동 채움
        if (field === 'sq' && App.wires.SQ_AWG[value]) { f.item.awg = App.wires.SQ_AWG[value]; refresh = true; }
      } else f.item[field] = parseFloat(value);
    });
    App.render.all();
    if (refresh) Inspector.update();
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
      ({ ducts: '덕트', rails: '채널/레일', components: '부품', wires: '와이어(라인)' }[f.kind]) + '</div>';

    if (f.kind === 'dimensions') {
      html = '<div class="text-xs font-semibold text-slate-600 mb-1 px-1">치수</div>';
      html += row('길이(mm)', '<span class="text-xs text-slate-700 font-semibold">' + App.dims.length(it) + '</span>');
      html += row('오프셋(mm)', numInput('off', Math.round(it.off || 0)));
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">가운데 핸들을 드래그해 치수선을 이동할 수 있습니다.</div>';
      root.innerHTML = html;
      root.querySelectorAll('[data-field]').forEach(function (inp) {
        inp.addEventListener('change', function () { commitField(id, inp.getAttribute('data-field'), inp.value); });
      });
      return;
    }

    if (f.kind === 'wires') {
      html += row('라인번호', '<input data-field="label" type="text" value="' + (it.label || '') +
        '" class="w-24 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += row('라인 길이', '<span class="text-xs text-slate-700 font-semibold">' + App.wires.length(App.store.get(), it) + ' mm</span>');
      html += row('색상', '<input data-field="color" type="color" value="' + (it.color || '#dc2626') +
        '" class="w-12 h-7 border border-slate-300 rounded" />');
      let sqOpts = '<option value="">-</option>';
      App.wires.SQ_LIST.forEach(function (s) { sqOpts += '<option value="' + s + '"' + (String(it.sq) === s ? ' selected' : '') + '>' + s + ' SQ</option>'; });
      html += row('규격(SQ)', '<select data-field="sq" class="w-24 px-1 py-1 text-xs border border-slate-300 rounded">' + sqOpts + '</select>');
      html += row('AWG', '<input data-field="awg" type="text" value="' + (it.awg || '') +
        '" class="w-24 px-2 py-1 text-xs border border-slate-300 rounded" placeholder="자동" />');
      const fromC = App.store.get().components.find(function (c) { return c.id === it.fromComp; });
      const toC = App.store.get().components.find(function (c) { return c.id === it.toComp; });
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">' +
        ((fromC && fromC.label) || '?') + ' #' + it.fromTerm + ' → ' +
        ((toC && toC.label) || '?') + ' #' + it.toTerm + '</div>';
      root.innerHTML = html;
      root.querySelectorAll('[data-field]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          commitField(id, inp.getAttribute('data-field'), inp.value);
        });
      });
      return;
    }

    html += row('X (mm)', numInput('x', it.x));
    html += row('Y (mm)', numInput('y', it.y));

    if (f.kind === 'components') {
      html += row('가로', numInput('widthMM', it.widthMM));
      html += row('세로', numInput('heightMM', it.heightMM));
      html += row('회전', numInput('rotation', it.rotation || 0));
      html += row('품명', '<input data-field="label" type="text" value="' + (it.label || '').replace(/"/g, '&quot;') +
        '" class="w-28 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += row('호기번호', '<input data-field="tag" type="text" placeholder="예: Q1" value="' + (it.tag || '').replace(/"/g, '&quot;') +
        '" class="w-28 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">' + (it.type || '') + ' · ' + (it.partNo || '') + '</div>';
      html += '<button id="insp-edit-part" class="mt-2 w-full px-2 py-1 text-xs rounded bg-teal-600 text-white">✎ 크기·단자 편집</button>';
      html += '<label class="flex items-center gap-1 mt-2 text-xs text-slate-600"><input id="insp-lock" type="checkbox" ' + (it.locked ? 'checked' : '') + '/> 잠금(이동 고정)</label>';
    } else {
      html += row('길이', numInput('lengthMM', it.lengthMM));
      html += row('폭', numInput('widthMM', it.widthMM));
      html += row('방향', '<span class="text-xs text-slate-600">' + (it.orient === 'h' ? '가로' : '세로') + '</span>');
      html += '<label class="flex items-center gap-1 mt-2 text-xs text-slate-600"><input id="insp-lock" type="checkbox" ' + (it.locked ? 'checked' : '') + '/> 잠금(이동 고정)</label>';
    }

    root.innerHTML = html;
    root.querySelectorAll('[data-field]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        commitField(id, inp.getAttribute('data-field'), inp.value);
      });
    });
    const editBtn = root.querySelector('#insp-edit-part');
    if (editBtn) editBtn.onclick = function () {
      const found = App.store.findById(id);
      if (found && found.kind === 'components') App.partEditor.open({ component: found.item });
    };
    const lockBox = root.querySelector('#insp-lock');
    if (lockBox) lockBox.onchange = function () {
      App.store.commit(function () { const fnd = App.store.findById(id); if (fnd) fnd.item.locked = lockBox.checked; });
      App.render.all();
    };
  };

  Inspector.init = function (el) { root = el; Inspector.update(); };
})(window);
