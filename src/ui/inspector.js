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
      if (field === 'label' || field === 'color' || field === 'tag' || field === 'sq' || field === 'awg' || field === 'acdc' || field === 'text') {
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
      // 다중선택 일괄 편집 — 같은 종류끼리는 공통 속성 일괄 변경
      const finds = Array.from(sel).map(function (i) { return App.store.findById(i); }).filter(Boolean);
      const kinds = {};
      finds.forEach(function (f) { kinds[f.kind] = 1; });
      const kindList = Object.keys(kinds);
      let mh = '<div class="text-xs font-semibold text-slate-600 mb-1 px-1">' + sel.size + '개 선택 (일괄 편집)</div>';
      const onlyWires = kindList.length === 1 && kindList[0] === 'wires';
      const onlyComps = kindList.length === 1 && kindList[0] === 'components';
      if (onlyWires) {
        let sw2 = '<div class="flex flex-wrap gap-1 px-1 mb-1">';
        App.wires.COLORS.forEach(function (c) {
          sw2 += '<button type="button" class="mw-color" data-color="' + c.v + '" title="' + c.n + '" ' +
            'style="width:18px;height:18px;border-radius:4px;background:' + c.v + ';border:1px solid #cbd5e1;cursor:pointer;font-size:9px;color:' +
            (c.n === '흰' || c.n === '황' ? '#334155' : '#fff') + '">' + c.n + '</button>';
        });
        sw2 += '</div>';
        mh += row('색상 일괄', '') + sw2;
        let sqO = '<option value="">-</option>';
        App.wires.SQ_LIST.forEach(function (v) { sqO += '<option value="' + v + '">' + v + ' SQ</option>'; });
        mh += row('규격(SQ)', '<select data-mf="sq" class="w-24 px-1 py-1 text-xs border border-slate-300 rounded">' + sqO + '</select>');
        mh += row('두께(mm)', '<input data-mf="width" type="number" step="0.2" min="0.2" placeholder="유지" class="w-24 px-2 py-1 text-xs border border-slate-300 rounded text-right" />');
        mh += row('전원구분', '<select data-mf="acdc" class="w-24 px-1 py-1 text-xs border border-slate-300 rounded"><option value="__keep__">유지</option><option value="">없음</option><option value="AC">AC</option><option value="DC">DC</option></select>');
      } else if (onlyComps) {
        mh += row('타입 일괄', '<select data-mf="type" class="w-28 px-1 py-1 text-xs border border-slate-300 rounded"><option value="__keep__">유지</option>' + App.types.optionsHtml('').replace('<option value="__new__">＋ 새 타입…</option>', '') + '</select>');
        mh += row('글자 방향', '<select data-mf="textVert" class="w-28 px-1 py-1 text-xs border border-slate-300 rounded"><option value="__keep__">유지</option><option value="h">가로</option><option value="v">세로</option></select>');
        mh += '<label class="flex items-center gap-1 mt-1 text-xs text-slate-600"><input id="insp-lock-multi" type="checkbox" /> 전체 잠금</label>';
      } else {
        mh += '<div class="text-[10px] text-slate-400 px-1">서로 다른 종류가 섞여 있습니다.</div>';
      }
      mh += '<button id="insp-del-multi" class="mt-2 w-full px-2 py-1 text-xs rounded bg-red-500 text-white" style="background:#ef4444;color:#fff">🗑 선택 항목 모두 삭제</button>';
      root.innerHTML = mh;
      function applyAll(fn) {
        App.store.commit(function (s2) {
          Array.from(sel).forEach(function (i) {
            const f2 = App.store.findById(i);
            if (f2) fn(f2.item, f2.kind);
          });
        });
        App.render.all();
      }
      root.querySelectorAll('.mw-color').forEach(function (b) {
        b.onclick = function () { const v = b.getAttribute('data-color'); applyAll(function (it, k) { if (k === 'wires') it.color = v; }); };
      });
      root.querySelectorAll('[data-mf]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          const f3 = inp.getAttribute('data-mf');
          const v = inp.value;
          if (v === '__keep__') return;
          applyAll(function (it, k) {
            if (f3 === 'sq') { if (v) { it.sq = v; if (App.wires.SQ_AWG[v]) it.awg = App.wires.SQ_AWG[v]; } }
            else if (f3 === 'width') { const n = parseFloat(v); if (n) it.width = n; }
            else if (f3 === 'acdc') it.acdc = v;
            else if (f3 === 'type') it.type = v;
            else if (f3 === 'textVert') it.textVert = (v === 'v');
          });
        });
      });
      const lockM = root.querySelector('#insp-lock-multi');
      if (lockM) lockM.onchange = function () { const on = lockM.checked; applyAll(function (it) { it.locked = on; }); };
      const delM = root.querySelector('#insp-del-multi');
      if (delM) delM.onclick = function () { App.interact.deleteSelected(); };
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

    if (f.kind === 'clines') {
      const len = Math.round(Math.hypot(it.x2 - it.x1, it.y2 - it.y1));
      html = '<div class="text-xs font-semibold text-slate-600 mb-1 px-1">센터선(중심선)</div>';
      html += row('길이(mm)', '<span class="text-xs text-slate-700 font-semibold">' + len + '</span>');
      html += row('X1', numInput('x1', Math.round(it.x1)));
      html += row('Y1', numInput('y1', Math.round(it.y1)));
      html += row('X2', numInput('x2', Math.round(it.x2)));
      html += row('Y2', numInput('y2', Math.round(it.y2)));
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">드래그로 이동. 일점쇄선으로 표시되며 DXF의 CENTER 레이어로 나갑니다.</div>';
      root.innerHTML = html;
      root.querySelectorAll('[data-field]').forEach(function (inp) {
        inp.addEventListener('change', function () { commitField(id, inp.getAttribute('data-field'), inp.value); });
      });
      return;
    }

    if (f.kind === 'texts') {
      html = '<div class="text-xs font-semibold text-slate-600 mb-1 px-1">자유 텍스트</div>';
      html += row('내용', '<input data-field="text" type="text" value="' + App.esc(it.text || '') +
        '" class="w-32 px-2 py-1 text-xs border border-slate-300 rounded" />');
      html += row('크기(mm)', numInput('size', it.size || 8));
      html += row('색상', '<input data-field="color" type="color" value="' + (it.color || '#0f172a') +
        '" class="w-12 h-7 border border-slate-300 rounded" />');
      html += row('X (mm)', numInput('x', Math.round(it.x)));
      html += row('Y (mm)', numInput('y', Math.round(it.y)));
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">더블클릭으로도 내용을 바로 수정할 수 있습니다.</div>';
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
      // 계통도 심볼 ↔ 배치도 부품 연동
      if (it.sym) {
        let lopts = '<option value="">(연동 안함)</option>';
        const shs = App.exporter.allSheets(App.store.get());
        shs.forEach(function (sh, si) {
          (sh.st.components || []).forEach(function (c2) {
            if (c2.sym) return;
            const v = si + ':' + c2.id;
            const on = (it.linkSheet === si && it.linkId === c2.id);
            lopts += '<option value="' + v + '"' + (on ? ' selected' : '') + '>' +
              App.esc((sh.name ? sh.name + ' · ' : '') + (c2.label || c2.partNo)) + '</option>';
          });
        });
        html += row('배치 연동', '<select id="insp-link" class="w-28 px-1 py-1 text-xs border border-slate-300 rounded">' + lopts + '</select>');
        html += '<button id="insp-link-go" class="mt-1 w-full px-2 py-1 text-xs rounded bg-blue-600 text-white" style="background:#2563eb;color:#fff">↪ 연동 부품으로 이동</button>';
        // 크로스레퍼런스 — 같은 라벨의 심볼(코일↔접점 등)로 점프 (EPLAN 방식)
        if (it.label) {
          const xrefs = [];
          shs.forEach(function (sh2, si2) {
            (sh2.st.components || []).forEach(function (c5) {
              if (!c5.sym || c5.id === it.id || (c5.label || '') !== it.label) return;
              xrefs.push({ si: si2, cid: c5.id, name: (sh2.name ? sh2.name + ' · ' : '') + (c5.partNo || c5.sym) });
            });
          });
          if (xrefs.length) {
            html += '<div class="text-[10px] text-slate-500 px-1 mt-2 font-semibold">크로스레퍼런스 (' + App.esc(it.label) + ')</div>';
            xrefs.forEach(function (x) {
              html += '<button class="insp-xref mt-1 w-full px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-700 text-left" ' +
                'data-si="' + x.si + '" data-cid="' + App.esc(x.cid) + '">⇄ ' + App.esc(x.name) + '</button>';
            });
          }
        }
      }
      html += '<div class="text-[10px] text-slate-400 px-1 mt-1">' + App.esc(it.partNo || '') + '</div>';
      html += '<button id="insp-edit-part" class="mt-2 w-full px-2 py-1 text-xs rounded bg-teal-600 text-white">✎ 크기·단자 편집</button>';
      html += '<label class="flex items-center gap-1 mt-2 text-xs text-slate-600"><input id="insp-lock" type="checkbox" ' + (it.locked ? 'checked' : '') + '/> 잠금(이동 고정)</label>';
    } else {
      html += row('길이', numInput('lengthMM', it.lengthMM));
      html += row('폭', numInput('widthMM', it.widthMM));
      html += row('방향', '<span class="text-xs text-slate-600">' + (it.orient === 'h' ? '가로' : '세로') + '</span>');
      html += '<label class="flex items-center gap-1 mt-2 text-xs text-slate-600"><input id="insp-lock" type="checkbox" ' + (it.locked ? 'checked' : '') + '/> 잠금(이동 고정)</label>';
      // 덕트 라벨 스티커 (세로 3줄, 기본 30×24mm) — 1줄=유형·2줄=품명(부품 연동), 3줄=직접 작성
      if (f.kind === 'ducts') {
        const stComps = App.store.get().components.filter(function (c) { return !c.sym; });
        html += '<div class="text-[10px] text-slate-500 px-1 mt-3 font-semibold">라벨 스티커 (세로 3줄 · 기본 30×24mm)</div>';
        (it.stickers || []).forEach(function (st, si) {
          const dm = App.stickerDims(st);
          const ln = App.stickerLines(App.store.get(), st);
          const linked = !!st.linkId;
          html += '<div class="border border-slate-200 rounded p-1 mt-1" data-stbox="' + App.esc(st.id) + '">';
          // 부품 연동 — 1줄(유형)·2줄(품명) 자동 채움
          let lopt = '<option value="">(직접 입력)</option>';
          stComps.forEach(function (c2) {
            lopt += '<option value="' + App.esc(c2.id) + '"' + (st.linkId === c2.id ? ' selected' : '') + '>' +
              App.esc((c2.partNo || '') + (c2.partName || c2.label ? ' · ' + (c2.partName || c2.label) : '')) + '</option>';
          });
          html += '<div class="flex items-center gap-1 mb-1 text-[10px] text-slate-500">연동' +
            '<select data-stlink data-stid="' + App.esc(st.id) + '" class="px-1 py-0.5 text-[10px] border border-slate-300 rounded" style="flex:1;min-width:0">' + lopt + '</select></div>';
          // 크기
          html += '<div class="flex items-center gap-1 mb-1 text-[10px] text-slate-500">' +
            '너비 <input data-stcw data-stid="' + App.esc(st.id) + '" type="number" min="5" value="' + dm.cw +
            '" class="w-12 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-right" />' +
            '높이 <input data-stch data-stid="' + App.esc(st.id) + '" type="number" min="5" value="' + dm.ch +
            '" class="w-12 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-right" /></div>';
          // 3줄 텍스트 — 연동 시 1·2줄은 자동(잠금)
          const ph = ['1줄: 타이틀(품번)', '2줄: 품명', '3줄: 직접 작성'];
          for (let li = 0; li < 3; li++) {
            const auto = linked && li < 2;
            html += '<input data-stline="' + li + '" data-stid="' + App.esc(st.id) + '" type="text" value="' + App.esc(ln[li] || '') +
              '" placeholder="' + ph[li] + '"' + (auto ? ' disabled title="부품 연동으로 자동 입력"' : '') +
              ' class="w-full mb-0.5 px-2 py-0.5 text-xs border border-slate-300 rounded' + (auto ? ' bg-slate-50 text-slate-500' : '') + '" />';
          }
          html += '<div class="flex items-center justify-between mt-0.5">' +
            '<label class="text-[10px] text-slate-500">위치 <input data-stoff data-stid="' + App.esc(st.id) + '" type="number" value="' + Math.round(st.off || 0) +
            '" class="w-14 px-1 py-0.5 text-xs border border-slate-300 rounded text-right" /> mm</label>' +
            '<button class="insp-st-del text-[10px] text-red-500" data-stid="' + App.esc(st.id) + '">🗑 삭제</button></div></div>';
        });
        html += '<button id="insp-st-add" class="mt-1 w-full px-2 py-1 text-xs rounded bg-slate-700 text-white" style="background:#334155;color:#fff">＋ 스티커 추가</button>';
        html += '<div class="text-[10px] text-slate-400 px-1 mt-1">드래그: 이동 · Ctrl+드래그: 복사 · 더블클릭: 텍스트 편집. 연동하면 라이브러리 타이틀/품명이 자동 표시됩니다.</div>';
      }
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
    // 심볼 ↔ 배치 부품 연동
    const linkSel = root.querySelector('#insp-link');
    if (linkSel) linkSel.onchange = function () {
      const v = linkSel.value;
      App.store.commit(function () {
        const fnd = App.store.findById(id);
        if (!fnd) return;
        if (!v) { fnd.item.linkSheet = null; fnd.item.linkId = null; return; }
        const parts = v.split(':');
        fnd.item.linkSheet = parseInt(parts[0], 10);
        fnd.item.linkId = parts.slice(1).join(':');
        // 연동 시 심볼 라벨을 배치 부품 라벨(호기)로 동기화
        const shs = App.exporter.allSheets(App.store.get());
        const sh = shs[fnd.item.linkSheet];
        const tgt = sh && (sh.st.components || []).find(function (c3) { return c3.id === fnd.item.linkId; });
        if (tgt && tgt.label) fnd.item.label = tgt.label;
      });
      App.render.all();
      Inspector.update();
    };
    const linkGo = root.querySelector('#insp-link-go');
    if (linkGo) linkGo.onclick = function () {
      const fnd = App.store.findById(id);
      if (!fnd || fnd.item.linkId == null || fnd.item.linkSheet == null) {
        if (App.toolbar) App.toolbar.flash('먼저 "배치 연동"에서 부품을 선택하세요');
        return;
      }
      const ls = fnd.item.linkSheet, lid = fnd.item.linkId;
      if (App.store.get().activeSheet !== ls && App.sheetsMgr) App.sheetsMgr.switchTo(ls);
      const tgt = App.store.get().components.find(function (c4) { return c4.id === lid; });
      if (!tgt) { if (App.toolbar) App.toolbar.flash('연동 부품을 찾을 수 없습니다'); return; }
      App.ui.selected = new Set([tgt.id]);
      App.viewport.centerOn(tgt.x + tgt.widthMM / 2, tgt.y + tgt.heightMM / 2);
      App.render.all();
      Inspector.update();
      if (App.toolbar && App.toolbar.updateZoomPct) App.toolbar.updateZoomPct();
    };
    // 크로스레퍼런스 점프 — 같은 라벨 심볼로 이동
    root.querySelectorAll('.insp-xref').forEach(function (btn) {
      btn.onclick = function () {
        const si = parseInt(btn.getAttribute('data-si'), 10);
        const cid = btn.getAttribute('data-cid');
        if (App.store.get().activeSheet !== si && App.sheetsMgr) App.sheetsMgr.switchTo(si);
        const tgt = App.store.get().components.find(function (c6) { return c6.id === cid; });
        if (!tgt) { if (App.toolbar) App.toolbar.flash('대상 심볼을 찾을 수 없습니다'); return; }
        App.ui.selected = new Set([tgt.id]);
        App.viewport.centerOn(tgt.x + tgt.widthMM / 2, tgt.y + tgt.heightMM / 2);
        App.render.all();
        Inspector.update();
        if (App.toolbar && App.toolbar.updateZoomPct) App.toolbar.updateZoomPct();
      };
    });
    // 덕트 라벨 스티커: 추가/내용/위치/삭제
    function withSticker(stId, fn) {
      App.store.commit(function () {
        const fnd = App.store.findById(id);
        if (!fnd) return;
        fnd.item.stickers = fnd.item.stickers || [];
        fn(fnd.item);
      });
      App.render.all();
    }
    const stAdd = root.querySelector('#insp-st-add');
    if (stAdd) stAdd.onclick = function () {
      withSticker(null, function (duct) {
        const n = duct.stickers.length;
        const stNew = { id: App.uid('stk'), off: 0, cellW: 30, cellH: 24, linkId: null, lines: ['LABEL ' + (n + 1), '', ''] };
        const max = Math.max(0, duct.lengthMM - App.stickerDims(stNew).len);
        stNew.off = Math.min(max, 10 + n * (App.stickerDims(stNew).len + 10));
        duct.stickers.push(stNew);
      });
      Inspector.update();
    };
    function editSticker(inp, fn) {
      const sid = inp.getAttribute('data-stid');
      withSticker(sid, function (duct) {
        const st = duct.stickers.find(function (s) { return s.id === sid; });
        if (!st) return;
        fn(st, duct);
        // 크기/칸수 변경 후 위치가 덕트를 벗어나지 않게 재클램프
        st.off = Math.max(0, Math.min(Math.max(0, duct.lengthMM - App.stickerDims(st).len), st.off || 0));
      });
    }
    root.querySelectorAll('[data-stline]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        const li = parseInt(inp.getAttribute('data-stline'), 10);
        editSticker(inp, function (st) { st.lines = st.lines || []; st.lines[li] = inp.value; });
      });
    });
    root.querySelectorAll('[data-stlink]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        editSticker(inp, function (st) {
          st.linkId = inp.value || null;
          if (st.mode) st.mode = undefined; // 연동 시 세로 3줄 형식 보장
        });
        Inspector.update();
      });
    });
    root.querySelectorAll('[data-stcw]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        editSticker(inp, function (st) { st.cellW = Math.max(5, parseFloat(inp.value) || 30); });
      });
    });
    root.querySelectorAll('[data-stch]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        editSticker(inp, function (st) { st.cellH = Math.max(5, parseFloat(inp.value) || 24); });
      });
    });
    root.querySelectorAll('[data-stoff]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        editSticker(inp, function (st, duct) {
          st.off = Math.max(0, Math.min(Math.max(0, duct.lengthMM - App.stickerDims(st).len), parseFloat(inp.value) || 0));
        });
      });
    });
    root.querySelectorAll('.insp-st-del').forEach(function (btn) {
      btn.onclick = function () {
        const sid = btn.getAttribute('data-stid');
        withSticker(sid, function (duct) {
          duct.stickers = duct.stickers.filter(function (s) { return s.id !== sid; });
        });
        Inspector.update();
      };
    });
    // 글자 방향(가로/세로)
    const dirSel = root.querySelector('#insp-textdir');
    if (dirSel) dirSel.onchange = function () {
      App.store.commit(function () { const fnd = App.store.findById(id); if (fnd) fnd.item.textVert = (dirSel.value === 'v'); });
      App.render.all();
    };
  };

  Inspector.init = function (el) { root = el; Inspector.update(); };
})(window);
