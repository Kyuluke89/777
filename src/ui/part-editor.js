/* 커스텀 부품 / 단자 에디터 — 박스 크기 지정 + 단자 직접 배치, 라이브러리 저장.
   새 부품 만들기 + 기존 배치부품의 크기/단자 편집 모두 지원. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const PE = (App.partEditor = {});

  let modal, peSvg, st = null, dragIdx = -1;

  function $(id) { return document.getElementById(id); }
  function snap(v) { return Math.round(v / 2.5) * 2.5; } // 단자 스냅 2.5mm

  // 단자 이름 자동 증가: A1→A2, 12→13, X→X1
  function incName(s) {
    const m = /^(.*?)(\d+)$/.exec(s || '');
    if (m) return m[1] + (parseInt(m[2], 10) + 1);
    return (s || 'T') + '1';
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function clientToMM(e) {
    const pt = peSvg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = peSvg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    const w = pt.matrixTransform(m.inverse());
    return { x: w.x, y: w.y };
  }

  function el(name, attrs, parent) {
    const n = document.createElementNS(App.SVGNS, name);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function renderPreview() {
    while (peSvg.firstChild) peSvg.removeChild(peSvg.firstChild);
    const pad = 14;
    peSvg.setAttribute('viewBox', (-pad) + ' ' + (-pad) + ' ' + (st.w + pad * 2) + ' ' + (st.h + pad * 2));
    // 격자
    const defs = el('defs', {}, peSvg);
    const pat = el('pattern', { id: 'pe-grid', width: 5, height: 5, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M 5 0 H 0 V 5', fill: 'none', stroke: '#eef2f7', 'stroke-width': 0.3 }, pat);
    el('rect', { x: -pad, y: -pad, width: st.w + pad * 2, height: st.h + pad * 2, fill: 'url(#pe-grid)' }, peSvg);
    const color = App.typeColor(st.type);
    el('rect', { x: 0, y: 0, width: st.w, height: st.h, rx: 2, fill: color, 'fill-opacity': 0.12, stroke: color, 'stroke-width': 1 }, peSvg);
    // 단자 (원형/사각형)
    st.terms.forEach(function (t, i) {
      const g = el('g', { 'data-ti': i, style: 'cursor:move' }, peSvg);
      const stroke = i === st.sel ? '#dc2626' : color;
      const sw = i === st.sel ? 1.4 : 0.8;
      const w = t.w || 3.6, h = t.h || 3.6;
      if (t.shape === 'rect') {
        el('rect', { x: t.rx - w / 2, y: t.ry - h / 2, width: w, height: h, fill: '#fff', stroke: stroke, 'stroke-width': sw }, g);
      } else {
        el('circle', { cx: t.rx, cy: t.ry, r: w / 2, fill: '#fff', stroke: stroke, 'stroke-width': sw }, g);
      }
      const tx = el('text', { x: t.rx, y: t.ry - h / 2 - 1.5, 'text-anchor': 'middle', 'font-size': 4, fill: '#334155' }, g);
      tx.textContent = t.name;
    });
  }

  function renderList() {
    const box = $('pe-terms');
    box.innerHTML = '';
    if (!st.terms.length) { box.innerHTML = '<div class="text-[11px] text-slate-400 px-1 py-1">박스를 클릭해 단자를 추가하세요.</div>'; return; }
    st.terms.forEach(function (t, i) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1 py-0.5' + (i === st.sel ? ' bg-blue-50 rounded' : '');
      row.innerHTML =
        '<input data-ti="' + i + '" class="pe-name w-16 px-1 py-0.5 text-[11px] border border-slate-300 rounded" value="' + (t.name || '').replace(/"/g, '&quot;') + '"/>' +
        '<span class="text-[10px] text-slate-400 flex-1">(' + Math.round(t.rx) + ',' + Math.round(t.ry) + ')</span>' +
        '<button data-del="' + i + '" class="text-[11px] text-red-500 px-1">✕</button>';
      box.appendChild(row);
    });
    box.querySelectorAll('.pe-name').forEach(function (inp) {
      inp.onchange = function () { st.terms[+inp.getAttribute('data-ti')].name = inp.value; renderPreview(); };
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () { st.terms.splice(+b.getAttribute('data-del'), 1); st.sel = -1; renderPreview(); renderList(); };
    });
  }

  function refresh() { renderPreview(); renderList(); }

  // 미리보기 상호작용
  function updateShapeUI() {
    const rect = st.termShape === 'rect';
    $('pe-th-row').style.display = rect ? 'flex' : 'none';
    $('pe-tw-label').textContent = rect ? '가로' : '지름';
  }
  function syncTermControls() {
    $('pe-tshape').value = st.termShape;
    $('pe-tw').value = st.termW;
    $('pe-th').value = st.termH;
    updateShapeUI();
  }
  // 컨트롤 → 기본값 + 선택된 단자에 적용
  function applyTermControls() {
    st.termShape = $('pe-tshape').value;
    st.termW = Math.max(0.5, parseFloat($('pe-tw').value) || 3.6);
    st.termH = st.termShape === 'rect' ? Math.max(0.5, parseFloat($('pe-th').value) || 3.6) : st.termW;
    updateShapeUI();
    // 명시적으로 클릭해 선택한 단자에만 적용(방금 놓은 단자는 건드리지 않음)
    if (st.sel >= 0 && st.selExplicit && st.terms[st.sel]) {
      const t = st.terms[st.sel];
      t.shape = st.termShape; t.w = st.termW; t.h = st.termH;
    }
    refresh();
  }

  function onDown(e) {
    const g = e.target.closest && e.target.closest('[data-ti]');
    const p = clientToMM(e);
    if (g) {
      dragIdx = +g.getAttribute('data-ti');
      st.sel = dragIdx; st.selExplicit = true; // 클릭으로 선택 → 컨트롤 변경이 이 단자에 적용
      // 선택 단자의 모양/크기를 컨트롤에 반영
      const t = st.terms[st.sel];
      if (t) { st.termShape = t.shape || 'circle'; st.termW = t.w || 3.6; st.termH = t.h || 3.6; syncTermControls(); }
      refresh();
    } else {
      // 빈 곳 클릭 → 단자 추가 (박스 범위로 클램프, 현재 모양/크기 적용)
      const rx = clamp(snap(p.x), 0, st.w), ry = clamp(snap(p.y), 0, st.h);
      st.terms.push({ name: st.nextName, rx: rx, ry: ry, shape: st.termShape, w: st.termW, h: st.termH });
      st.sel = st.terms.length - 1; st.selExplicit = false; // 자동 선택(모양 변경이 소급 적용되지 않게)
      st.nextName = incName(st.nextName);
      $('pe-next').value = st.nextName;
      refresh();
    }
  }
  function onMove(e) {
    if (dragIdx < 0) return;
    const p = clientToMM(e);
    st.terms[dragIdx].rx = clamp(snap(p.x), 0, st.w);
    st.terms[dragIdx].ry = clamp(snap(p.y), 0, st.h);
    renderPreview();
  }
  function onUp() { if (dragIdx >= 0) { dragIdx = -1; renderList(); } }

  function readInputs() {
    st.name = $('pe-name-in').value.trim();
    st.type = $('pe-type').value;
    st.w = Math.max(5, parseInt($('pe-w').value, 10) || 60);
    st.h = Math.max(5, parseInt($('pe-h').value, 10) || 80);
    st.nextName = $('pe-next').value || 'A1';
    // 박스 밖 단자 클램프
    st.terms.forEach(function (t) { t.rx = clamp(t.rx, 0, st.w); t.ry = clamp(t.ry, 0, st.h); });
  }

  PE.open = function (opts) {
    opts = opts || {};
    if (opts.component) {
      const c = opts.component;
      let terms = c.term ? App.clone(c.term)
        : App.terminals.local(c).map(function (t) { return { name: String(t.name || ''), rx: Math.round((t.x - c.x) * 10) / 10, ry: Math.round((t.y - c.y) * 10) / 10 }; });
      st = { mode: 'component', targetId: c.id, name: c.partName || c.label || '커스텀', type: c.type || 'TB', w: c.widthMM, h: c.heightMM, terms: terms, nextName: 'A1', sel: -1 };
    } else {
      st = { mode: 'new', name: '', type: 'TB', w: 60, h: 80, terms: [], nextName: 'A1', sel: -1 };
    }
    st.termShape = 'circle'; st.termW = 3.6; st.termH = 3.6;
    $('pe-title').textContent = st.mode === 'component' ? '부품 크기·단자 편집' : '커스텀 부품 만들기';
    $('pe-name-in').value = st.name;
    $('pe-type').value = st.type;
    $('pe-w').value = st.w;
    $('pe-h').value = st.h;
    $('pe-next').value = st.nextName;
    syncTermControls();
    $('pe-apply').classList.toggle('hidden', st.mode !== 'component');
    refresh();
    modal.style.display = 'flex';
  };
  PE.close = function () { modal.style.display = 'none'; st = null; };

  function buildPart() {
    return { partNo: st.name || ('커스텀_' + App.uid('p')), manufacturer: '커스텀', type: st.type,
      name: st.name || '커스텀 부품', w: st.w, h: st.h, d: 60, terminals: st.terms.length,
      term: App.clone(st.terms), custom: true };
  }

  function saveToLibrary() {
    readInputs();
    if (!st.name) { alert('품명을 입력하세요.'); return; }
    App.userlib.add(buildPart());
    if (App.palette) App.palette.reloadUser();
    if (App.toolbar) App.toolbar.flash('라이브러리에 저장됨: ' + st.name);
    PE.close();
  }

  function applyToComponent() {
    readInputs();
    const id = st.targetId, terms = App.clone(st.terms), w = st.w, h = st.h;
    App.store.commit(function (s) {
      const c = s.components.find(function (x) { return x.id === id; });
      if (!c) return;
      c.widthMM = w; c.heightMM = h; c.term = terms; c.terminals = terms.length;
      if (st.name) { c.partName = st.name; }
    });
    if (App.toolbar) App.toolbar.flash('부품에 적용됨');
    PE.close();
  }

  PE.init = function () {
    modal = $('part-editor');
    peSvg = $('pe-canvas');
    peSvg.addEventListener('pointerdown', function (e) { e.preventDefault(); onDown(e); try { peSvg.setPointerCapture(e.pointerId); } catch (x) {} });
    peSvg.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    ['pe-w', 'pe-h', 'pe-type', 'pe-name-in', 'pe-next'].forEach(function (id) {
      const elx = $(id); if (elx) elx.addEventListener('change', function () { readInputs(); refresh(); });
    });
    ['pe-tshape', 'pe-tw', 'pe-th'].forEach(function (id) {
      const elx = $(id); if (elx) elx.addEventListener('change', applyTermControls);
    });
    $('pe-save').onclick = saveToLibrary;
    $('pe-apply').onclick = applyToComponent;
    $('pe-cancel').onclick = PE.close;
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) PE.close(); });
  };
})(window);
