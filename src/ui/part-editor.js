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
    // 단자
    st.terms.forEach(function (t, i) {
      const g = el('g', { 'data-ti': i, style: 'cursor:move' }, peSvg);
      el('circle', { cx: t.rx, cy: t.ry, r: 2.4, fill: '#fff', stroke: i === st.sel ? '#dc2626' : color, 'stroke-width': i === st.sel ? 1.4 : 0.8 }, g);
      const tx = el('text', { x: t.rx, y: t.ry - 3.5, 'text-anchor': 'middle', 'font-size': 4, fill: '#334155' }, g);
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
  function onDown(e) {
    const g = e.target.closest && e.target.closest('[data-ti]');
    const p = clientToMM(e);
    if (g) {
      dragIdx = +g.getAttribute('data-ti');
      st.sel = dragIdx; refresh();
    } else {
      // 빈 곳 클릭 → 단자 추가 (박스 범위로 클램프)
      const rx = clamp(snap(p.x), 0, st.w), ry = clamp(snap(p.y), 0, st.h);
      st.terms.push({ name: st.nextName, rx: rx, ry: ry });
      st.sel = st.terms.length - 1;
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
    $('pe-title').textContent = st.mode === 'component' ? '부품 크기·단자 편집' : '커스텀 부품 만들기';
    $('pe-name-in').value = st.name;
    $('pe-type').value = st.type;
    $('pe-w').value = st.w;
    $('pe-h').value = st.h;
    $('pe-next').value = st.nextName;
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
    $('pe-save').onclick = saveToLibrary;
    $('pe-apply').onclick = applyToComponent;
    $('pe-cancel').onclick = PE.close;
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) PE.close(); });
  };
})(window);
