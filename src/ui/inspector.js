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
      if (field === 'label' || field === 'color' || field === 'tag' || field === 'sq' || field === 'awg' || field === 'acdc') {
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
      html += row('라인번호', '<input data-field="label" type="text" value="' + App.esc(it.label || '') +
        '" class="w-24 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += row('라인 길이', '<span class="text-xs text-slate-700 font-semibold">' + App.wires.length(App.store.get(), it) + ' mm</span>');
      html += row('색상', '<input data-field="color" type="color" value="' + (it.color || '#dc2626') +
        '" class="w-12 h-7 border border-slate-300 rounded" />');
      let sw = '<div class="flex flex-wrap gap-1 px-1 mt-1">';
      App.wires.COLORS.forEach(function (c) {
        const on = (String(it.color || '').toLowerCase() === c.v);
        sw += '<button type="button" class="wire-sw" data-color="' + c.v + '" title="' + c.n + '" ' +
          'style="width:18px;height:18px;border-radius:4px;background:' + c.v + ';' +
          'border:' + (on ? '2px solid #2563eb' : '1px solid #cbd5e1') + ';cursor:pointer;font-size:9px;line-height:1;color:' +
          (c.n === '흰' || c.n === '황' ? '#334155' : '#fff') + '">' + c.n + '</button>';
      });
      sw += '</div>';
      html += sw;
      let sqOpts = '<option value="">-</option>';
      App.wires.SQ_LIST.forEach(function (s) { sqOpts += '<option value="' + s + '"' + (String(it.sq) === s ? ' selected' : '') + '>' + s + ' SQ</option>'; });
      html += row('규격(SQ)', '<select data-field="sq" class="w-24 px-1 py-1 text-xs border border-slate-300 rounded">' + sqOpts + '</select>');
      html += row('AWG', '<input data-field="awg" type="text" value="' + App.esc(it.awg || '') +
        '" class="w-24 px-2 py-1 text-xs border border-slate-300 rounded" placeholder="자동" />');
      html += row('두께(mm)', '<input data-field="width" type="number" step="0.2" min="0.2" value="' + (it.width || 1.2) +
        '" class="w-24 px-2 py-1 text-xs border border-slate-300 rounded text-right" />');
      const ad = it.acdc || '';
      html += row('전원구분', '<select data-field="acdc" class="w-24 px-1 py-1 text-xs border border-slate-300 rounded">' +
        '<option value=""' + (ad === '' ? ' selected' : '') + '>없음</option>' +
        '<option value="AC"' + (ad === 'AC' ? ' selected' : '') + '>AC (교류)</option>' +
        '<option value="DC"' + (ad === 'DC' ? ' selected' : '') + '>DC (직류)</option>' +
        '</select>');
      const fromC = App.store.get().components.find(function (c) { return c.id === it.fromComp; });
      const toC = App.store.get().components.find(function (c) { return c.id === it.toComp; });
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">' +
        App.esc((fromC && fromC.label) || '?') + ' #' + it.fromTerm + ' → ' +
        App.esc((toC && toC.label) || '?') + ' #' + it.toTerm + '</div>';
      root.innerHTML = html;
      root.querySelectorAll('[data-field]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          commitField(id, inp.getAttribute('data-field'), inp.value);
        });
      });
      root.querySelectorAll('.wire-sw').forEach(function (btn) {
        btn.addEventListener('click', function () {
          commitField(id, 'color', btn.getAttribute('data-color'));
          Inspector.update();
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
      html += row('품명', '<input data-field="label" type="text" value="' + App.esc(it.label || '') +
        '" class="w-28 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += row('호기번호', '<input data-field="tag" type="text" placeholder="예: Q1" value="' + App.esc(it.tag || '') +
        '" class="w-28 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += row('타입', '<select id="insp-type" class="w-28 px-1 py-1 text-xs border border-slate-300 rounded">' +
        App.types.optionsHtml(it.type) + '</select>');
      html += row('글자 방향', '<select id="insp-textdir" class="w-28 px-1 py-1 text-xs border border-slate-300 rounded">' +
        '<option value="h"' + (it.textVert ? '' : ' selected') + '>가로</option>' +
        '<option value="v"' + (it.textVert ? ' selected' : '') + '>세로</option></select>');
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">' + App.esc(it.partNo || '') + '</div>';
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
    // 타입 변경(+ 새 타입 추가)
    const typeSel = root.querySelector('#insp-type');
    if (typeSel) typeSel.onchange = function () {
      let v = typeSel.value;
      if (v === '__new__') {
        const nm = prompt('새 타입 이름(예: VFD, FUSE)', '');
        if (!nm || !nm.trim()) { Inspector.update(); return; }
        v = App.types.add(nm);
      }
      App.store.commit(function () { const fnd = App.store.findById(id); if (fnd) fnd.item.type = v; });
      App.render.all();
      Inspector.update();
    };
    // 글자 방향(가로/세로)
    const dirSel = root.querySelector('#insp-textdir');
    if (dirSel) dirSel.onchange = function () {
      App.store.commit(function () { const fnd = App.store.findById(id); if (fnd) fnd.item.textVert = (dirSel.value === 'v'); });
      App.render.all();
    };
  };

  Inspector.init = function (el) { root = el; Inspector.update(); };
})(window);
