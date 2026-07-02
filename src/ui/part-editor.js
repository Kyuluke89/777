/* 커스텀 부품 / 단자 에디터 — 박스 크기 지정 + 단자 직접 배치, 라이브러리 저장.
   새 부품 만들기 + 기존 배치부품의 크기/단자 편집 모두 지원. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const PE = (App.partEditor = {});

  let modal, peSvg, st = null, peG = null;

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
      const seld = st.selSet && st.selSet.has(i);
      const stroke = seld ? '#dc2626' : color;
      const sw = seld ? 1.4 : 0.8;
      const w = t.w || 3.6, h = t.h || 3.6;
      if (t.shape === 'rect') {
        el('rect', { x: t.rx - w / 2, y: t.ry - h / 2, width: w, height: h, fill: '#fff', stroke: stroke, 'stroke-width': sw }, g);
      } else {
        el('circle', { cx: t.rx, cy: t.ry, r: w / 2, fill: '#fff', stroke: stroke, 'stroke-width': sw }, g);
      }
      const pos = t.lp || 'top';
      const gw = w / 2 + 1.6, gh = h / 2 + 1.6;
      let a;
      if (pos === 'left') a = { x: t.rx - gw, y: t.ry, 'text-anchor': 'end', 'dominant-baseline': 'central' };
      else if (pos === 'right') a = { x: t.rx + gw, y: t.ry, 'text-anchor': 'start', 'dominant-baseline': 'central' };
      else if (pos === 'bottom') a = { x: t.rx, y: t.ry + gh, 'text-anchor': 'middle', 'dominant-baseline': 'hanging' };
      else a = { x: t.rx, y: t.ry - gh, 'text-anchor': 'middle' };
      a['font-size'] = 4; a.fill = '#334155';
      const tx = el('text', a, g);
      tx.textContent = t.name;
    });
  }

  function renderList() {
    const box = $('pe-terms');
    box.innerHTML = '';
    if (!st.terms.length) { box.innerHTML = '<div class="text-[11px] text-slate-400 px-1 py-1">박스를 클릭해 단자를 추가하세요.</div>'; return; }
    st.terms.forEach(function (t, i) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1 py-0.5' + (st.selSet.has(i) ? ' bg-blue-50 rounded' : '');
      row.innerHTML =
        '<input data-ti="' + i + '" class="pe-name w-16 px-1 py-0.5 text-[11px] border border-slate-300 rounded" value="' + App.esc(t.name || '') + '"/>' +
        '<span class="text-[10px] text-slate-400 flex-1">(' + Math.round(t.rx) + ',' + Math.round(t.ry) + ')</span>' +
        '<button data-del="' + i + '" class="text-[11px] text-red-500 px-1">✕</button>';
      box.appendChild(row);
    });
    box.querySelectorAll('.pe-name').forEach(function (inp) {
      inp.onchange = function () { st.terms[+inp.getAttribute('data-ti')].name = inp.value; renderPreview(); };
    });
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () { removeTerms([+b.getAttribute('data-del')]); };
    });
  }

  // 단자 인덱스 배열 삭제(내림차순) + 선택 정리
  function removeTerms(idxs) {
    idxs.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { st.terms.splice(i, 1); });
    st.selSet = new Set(); st.sel = -1;
    refresh();
  }
  function selectedIdxs() { return Array.from(st.selSet); }

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
    $('pe-tlabel').value = st.termLabelPos;
    updateShapeUI();
  }
  // 컨트롤 → 기본값 + 선택된 단자에 적용
  function applyTermControls() {
    st.termShape = $('pe-tshape').value;
    st.termW = Math.max(0.5, parseFloat($('pe-tw').value) || 3.6);
    st.termH = st.termShape === 'rect' ? Math.max(0.5, parseFloat($('pe-th').value) || 3.6) : st.termW;
    st.termLabelPos = $('pe-tlabel').value;
    updateShapeUI();
    // 명시적으로 클릭/드래그로 선택한 단자(들)에 적용
    if (st.selExplicit) {
      selectedIdxs().forEach(function (i) {
        const t = st.terms[i];
        if (t) { t.shape = st.termShape; t.w = st.termW; t.h = st.termH; t.lp = st.termLabelPos; }
      });
    }
    refresh();
  }
  function loadControlsFrom(i) {
    const t = st.terms[i]; if (!t) return;
    st.termShape = t.shape || 'circle'; st.termW = t.w || 3.6; st.termH = t.h || 3.6; st.termLabelPos = t.lp || 'top';
    syncTermControls();
  }
  // 마퀴(선택 박스) 그리기
  function drawMarquee(r) {
    let m = peSvg.querySelector('#pe-marquee');
    if (!r) { if (m) m.remove(); return; }
    if (!m) m = el('rect', { id: 'pe-marquee' }, peSvg);
    m.setAttribute('x', r.x); m.setAttribute('y', r.y);
    m.setAttribute('width', r.w); m.setAttribute('height', r.h);
    m.setAttribute('fill', '#3b82f6'); m.setAttribute('fill-opacity', '0.1');
    m.setAttribute('stroke', '#2563eb'); m.setAttribute('stroke-width', 0.5);
    m.setAttribute('stroke-dasharray', '2 1.5');
  }

  function onDown(e) {
    const g = e.target.closest && e.target.closest('[data-ti]');
    const p = clientToMM(e);
    if (g) {
      const idx = +g.getAttribute('data-ti');
      if (!st.selSet.has(idx)) {
        if (!e.shiftKey) st.selSet.clear();
        st.selSet.add(idx);
      }
      st.sel = idx; st.selExplicit = true;
      loadControlsFrom(idx);
      // 선택된 단자 전체 이동 준비
      const orig = {};
      st.selSet.forEach(function (i) { orig[i] = { rx: st.terms[i].rx, ry: st.terms[i].ry }; });
      peG = { type: 'move', sp: p, orig: orig, moved: false };
      refresh();
    } else {
      // 빈 곳: 드래그하면 마퀴 선택, 그냥 클릭하면 단자 추가
      peG = { type: 'empty', sp: p, sc: { x: e.clientX, y: e.clientY }, moved: false, shift: e.shiftKey };
    }
  }
  function onMove(e) {
    if (!peG) return;
    const p = clientToMM(e);
    if (peG.type === 'move') {
      const dx = p.x - peG.sp.x, dy = p.y - peG.sp.y;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) peG.moved = true;
      for (const i in peG.orig) {
        st.terms[i].rx = clamp(snap(peG.orig[i].rx + dx), 0, st.w);
        st.terms[i].ry = clamp(snap(peG.orig[i].ry + dy), 0, st.h);
      }
      renderPreview();
      return;
    }
    if (peG.type === 'empty') {
      if (Math.hypot(e.clientX - peG.sc.x, e.clientY - peG.sc.y) > 4) peG.type = 'marquee';
    }
    if (peG.type === 'marquee') {
      const r = { x: Math.min(peG.sp.x, p.x), y: Math.min(peG.sp.y, p.y), w: Math.abs(peG.sp.x - p.x), h: Math.abs(peG.sp.y - p.y) };
      if (!peG.shift) st.selSet.clear();
      st.terms.forEach(function (t, i) {
        if (t.rx >= r.x && t.rx <= r.x + r.w && t.ry >= r.y && t.ry <= r.y + r.h) st.selSet.add(i);
      });
      st.selExplicit = true;
      renderPreview();
      drawMarquee(r);
    }
  }
  function onUp() {
    if (!peG) return;
    if (peG.type === 'empty' && !peG.moved) {
      // 클릭 → 단자 추가
      const rx = clamp(snap(peG.sp.x), 0, st.w), ry = clamp(snap(peG.sp.y), 0, st.h);
      st.terms.push({ name: st.nextName, rx: rx, ry: ry, shape: st.termShape, w: st.termW, h: st.termH, lp: st.termLabelPos });
      st.selSet = new Set([st.terms.length - 1]); st.sel = st.terms.length - 1; st.selExplicit = false;
      st.nextName = incName(st.nextName); $('pe-next').value = st.nextName;
    }
    drawMarquee(null);
    peG = null;
    refresh();
  }

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
      st = { mode: 'component', targetId: c.id, partNo: c.partNo || '', name: c.partName || c.label || '커스텀', type: c.type || 'TB', w: c.widthMM, h: c.heightMM, terms: terms, nextName: 'A1', sel: -1 };
    } else {
      st = { mode: 'new', partNo: '', name: '', type: 'TB', w: 60, h: 80, terms: [], nextName: 'A1', sel: -1 };
    }
    st.termShape = 'circle'; st.termW = 3.6; st.termH = 3.6; st.termLabelPos = 'top';
    st.selSet = new Set();
    $('pe-title').textContent = st.mode === 'component' ? '부품 크기·단자 편집' : '커스텀 부품 만들기';
    $('pe-name-in').value = st.name;
    if (App.types) App.types.add(st.type); // 커스텀 타입이면 선택지에 보장
    if (PE.fillTypes) PE.fillTypes(st.type);
    $('pe-type').value = st.type;
    $('pe-w').value = st.w;
    $('pe-h').value = st.h;
    $('pe-next').value = st.nextName;
    syncTermControls();
    // 컨텍스트별 버튼 하나만: 배치 편집=적용(배치+라이브러리), 신규=라이브러리 저장
    $('pe-apply').classList.toggle('hidden', st.mode !== 'component');
    $('pe-save').classList.toggle('hidden', st.mode === 'component');
    refresh();
    modal.style.display = 'flex';
  };
  PE.close = function () { modal.style.display = 'none'; st = null; };
  PE.isOpen = function () { return modal && modal.style.display !== 'none'; };

  function onKey(e) {
    if (!PE.isOpen()) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Escape') { e.preventDefault(); PE.close(); return; }
    if (tag === 'input' || tag === 'select') return; // 입력 중엔 무시
    if ((e.key === 'Delete' || e.key === 'Backspace') && st && st.selSet.size) {
      e.preventDefault(); removeTerms(selectedIdxs());
    }
  }

  function partNoOf() { return st.partNo || st.name || ('커스텀_' + App.uid('p')); }

  function buildPart() {
    return { partNo: partNoOf(), manufacturer: '커스텀', type: st.type,
      name: st.name || '커스텀 부품', w: st.w, h: st.h, d: 60, terminals: st.terms.length,
      term: App.clone(st.terms), custom: true };
  }

  // 배치된 동일 부품(같은 partNo) 전체를 새 정의로 갱신 (라벨/호기번호 등 인스턴스 값은 보존)
  function syncPlaced(s, partNo, def) {
    if (!partNo) return 0;
    let n = 0;
    s.components.forEach(function (c) {
      if (c.partNo !== partNo) return;
      c.widthMM = def.w; c.heightMM = def.h; c.term = App.clone(def.terms);
      c.terminals = def.terms.length; c.type = def.type;
      if (def.name) {
        // 표시 라벨이 기존 품명/품번 그대로면 새 이름 반영(사용자 지정 라벨은 보존)
        if (c.label === c.partName || c.label === c.partNo) c.label = def.name;
        c.partName = def.name;
      }
      n++;
    });
    return n;
  }

  // 라이브러리 + 배치된 동일 부품 모두 한 번에 갱신
  function saveAll(updateEditedId) {
    const partNo = partNoOf();
    const def = { w: st.w, h: st.h, terms: App.clone(st.terms), type: st.type, name: st.name };
    let cnt = 0;
    App.store.commit(function (s) {
      // 편집 중인 바로 그 부품(아직 partNo가 없을 수도 있음)도 확실히 반영
      if (updateEditedId) {
        const c = s.components.find(function (x) { return x.id === updateEditedId; });
        if (c) {
          c.widthMM = def.w; c.heightMM = def.h; c.term = App.clone(def.terms);
          c.terminals = def.terms.length; c.type = def.type;
          if (def.name) c.partName = def.name;
          if (!c.partNo) c.partNo = partNo; // partNo 없던 부품은 부여해 동기화 대상에 포함
        }
      }
      cnt = syncPlaced(s, partNo, def);
    });
    // 기본/사용자 라이브러리 업서트(부품번호 기준)
    App.userlib.add({ partNo: partNo, manufacturer: '커스텀', type: st.type,
      name: st.name || partNo, w: st.w, h: st.h, d: 60, terminals: st.terms.length, term: App.clone(st.terms) });
    if (App.palette) App.palette.reloadUser();
    return cnt;
  }

  function saveToLibrary() {
    readInputs();
    if (!st.name) { alert('품명을 입력하세요.'); return; }
    const cnt = saveAll(null);
    if (App.toolbar) App.toolbar.flash('라이브러리 저장' + (cnt ? ' · 배치 ' + cnt + '개 갱신' : ''));
    PE.close();
  }

  function applyToComponent() {
    readInputs();
    const cnt = saveAll(st.targetId);
    if (App.toolbar) App.toolbar.flash('배치 ' + cnt + '개 + 라이브러리에 적용');
    PE.close();
  }

  PE.init = function () {
    modal = $('part-editor');
    peSvg = $('pe-canvas');
    peSvg.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // 입력 포커스 해제
      onDown(e);
      try { peSvg.setPointerCapture(e.pointerId); } catch (x) {}
    });
    peSvg.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // 타입 선택을 동적(+새 타입)으로 채우고 __new__ 처리
    function fillTypes(sel) { $('pe-type').innerHTML = App.types.optionsHtml(sel); }
    PE.fillTypes = fillTypes;
    fillTypes('TB');
    $('pe-type').addEventListener('change', function () {
      if ($('pe-type').value === '__new__') {
        const nm = prompt('새 타입 이름(예: VFD, FUSE)', '');
        const v = (nm && nm.trim()) ? App.types.add(nm) : (st ? st.type : 'TB');
        fillTypes(v);
      }
      readInputs(); refresh();
    });
    ['pe-w', 'pe-h', 'pe-name-in', 'pe-next'].forEach(function (id) {
      const elx = $(id); if (elx) elx.addEventListener('change', function () { readInputs(); refresh(); });
    });
    ['pe-tshape', 'pe-tw', 'pe-th', 'pe-tlabel'].forEach(function (id) {
      const elx = $(id); if (elx) elx.addEventListener('change', applyTermControls);
    });
    window.addEventListener('keydown', onKey);
    $('pe-save').onclick = saveToLibrary;
    $('pe-apply').onclick = applyToComponent;
    $('pe-cancel').onclick = PE.close;
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) PE.close(); });
  };
})(window);
