/* 커스텀 부품 / 단자 에디터 — 박스 크기 지정 + 단자 직접 배치, 라이브러리 저장.
   새 부품 만들기 + 기존 배치부품의 크기/단자 편집 모두 지원. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const PE = (App.partEditor = {});

  let modal, peSvg, st = null, peG = null;

  function $(id) { return document.getElementById(id); }
  // 단자 스냅 격자 — 기본 2.5mm, 편집기에서 조절 가능 (0 = 스냅 없음)
  function snap(v) {
    const g = (st && st.grid != null) ? st.grid : 2.5;
    if (!g || g <= 0) return Math.round(v * 10) / 10;
    return Math.round(v / g) * g;
  }

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
    // 격자 — 스냅 격자 크기에 맞춰 표시
    const gm = (st.grid != null && st.grid > 0) ? st.grid : 5;
    const defs = el('defs', {}, peSvg);
    const pat = el('pattern', { id: 'pe-grid', width: gm, height: gm, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M ' + gm + ' 0 H 0 V ' + gm, fill: 'none', stroke: '#eef2f7', 'stroke-width': 0.3 }, pat);
    el('rect', { x: -pad, y: -pad, width: st.w + pad * 2, height: st.h + pad * 2, fill: 'url(#pe-grid)' }, peSvg);
    const color = App.typeColor(st.type);
    el('rect', { x: 0, y: 0, width: st.w, height: st.h, rx: 2, fill: color, 'fill-opacity': 0.12, stroke: color, 'stroke-width': 1 }, peSvg);
    if (st.img) {
      const isc = st.imgS || 1;
      const ix = st.imgX || 0, iy = st.imgY || 0, iw = st.w * isc;
      const ih = st.imgAR ? iw / st.imgAR : st.h * isc;    // 이미지 실제 비율 유지
      if (st.imgCW) { // 자르기 클립
        const cp = el('clipPath', { id: 'pe-clip' }, defs);
        el('rect', { x: st.imgCX, y: st.imgCY, width: st.imgCW, height: st.imgCH }, cp);
      }
      const im = el('image', {
        x: ix, y: iy, width: iw, height: ih,
        preserveAspectRatio: 'xMidYMid meet', 'pointer-events': 'none',
        opacity: st.imgO != null ? st.imgO : 1,
        'clip-path': st.imgCW ? 'url(#pe-clip)' : null
      }, peSvg);
      im.setAttribute('href', st.img);
      if (st.mode2 === 'img') {
        // 조절 대상 = 보이는 영역(크롭이 있으면 크롭 사각형에 맞춤)
        const vx = st.imgCW ? st.imgCX : ix, vy = st.imgCW ? st.imgCY : iy;
        const vw = st.imgCW ? st.imgCW : iw, vh = st.imgCW ? st.imgCH : ih;
        el('rect', { x: vx, y: vy, width: vw, height: vh, fill: 'none', stroke: '#2563eb', 'stroke-width': 0.6, 'stroke-dasharray': '3 2', 'pointer-events': 'none' }, peSvg);
        [['tl', vx, vy], ['tr', vx + vw, vy], ['bl', vx, vy + vh], ['br', vx + vw, vy + vh]].forEach(function (hd) {
          el('rect', { x: hd[1] - 3, y: hd[2] - 3, width: 6, height: 6, fill: '#fff', stroke: '#2563eb', 'stroke-width': 0.8, 'data-ih': hd[0], style: 'cursor:nwse-resize' }, peSvg);
        });
      }
    }
    // 부품 도형 — 텍스트/사각 라인 (단자보다 아래에 그려 단자 클릭 우선)
    (st.shapes || []).forEach(function (sh, i) {
      const selSh = st.selShape === i;
      if (sh.kind === 'rect') {
        el('rect', {
          x: sh.x, y: sh.y, width: sh.w, height: sh.h, fill: 'none',
          stroke: selSh ? '#2563eb' : (sh.color || '#334155'), 'stroke-width': sh.sw || 0.6,
          'stroke-dasharray': App.dashOf(sh.style), 'data-si': i,
          'pointer-events': 'stroke', style: 'cursor:move'
        }, peSvg);
      } else {
        const tx = el('text', {
          x: sh.x, y: sh.y, 'font-size': sh.size || 5,
          fill: selSh ? '#2563eb' : (sh.color || '#334155'), 'data-si': i, style: 'cursor:move'
        }, peSvg);
        tx.textContent = sh.text || '';
      }
    });
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
        '<input data-ti="' + i + '" class="pe-name px-1.5 py-1 text-xs border border-slate-300 rounded" style="flex:1 1 auto;min-width:60px" value="' + App.esc(t.name || '') + '"/>' +
        '<span class="text-[9px] text-slate-400 flex-shrink-0">(' + Math.round(t.rx) + ',' + Math.round(t.ry) + ')</span>' +
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

  function refresh() { renderPreview(); renderList(); renderDrawList(); }

  // ── 부품 도형(글쓰기·사각 라인) ──────────────────────────────
  // 선 스타일 → SVG dasharray (App.dashOf 는 render.js 와 공유)
  const DASH_OPTS = [['solid', '─ 실선'], ['dash', '┄ 파선'], ['dashdot', '╌· 일점쇄선'], ['dot', '·· 점선']];
  function dashSelHtml(cur) {
    return DASH_OPTS.map(function (o) {
      return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
  }
  // 도형 목록(우측 패널) — 내용/스타일/색/굵기 편집 + 삭제
  function renderDrawList() {
    const box = $('pe-shapes');
    if (!box) return;
    const shapes = st.shapes || [];
    if (!shapes.length) { box.innerHTML = ''; return; }
    let html = '<div class="text-[10px] text-slate-500 font-semibold mb-1">그리기 (텍스트 · 사각 라인)</div>';
    shapes.forEach(function (sh, i) {
      html += '<div class="border border-slate-200 rounded p-1 mb-1' + (st.selShape === i ? ' ring-1 ring-blue-400' : '') + '">';
      if (sh.kind === 'text') {
        html += '<div class="flex items-center gap-1">' +
          '<input data-shtext="' + i + '" type="text" value="' + App.esc(sh.text || '') + '" class="px-1.5 py-0.5 text-xs border border-slate-300 rounded" style="flex:1;min-width:50px"/>' +
          '<input data-shsize="' + i + '" type="number" step="0.5" min="1" value="' + (sh.size || 5) + '" title="글자 크기(mm)" class="w-11 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-right"/>' +
          '<input data-shcolor="' + i + '" type="color" value="' + (sh.color || '#334155') + '" class="w-6 h-5 border border-slate-300 rounded"/>' +
          '<button data-shdel="' + i + '" class="text-[11px] text-red-500 px-1">✕</button></div>';
      } else {
        html += '<div class="flex items-center gap-1 flex-wrap">' +
          '<span class="text-[10px] text-slate-400">▭</span>' +
          '<select data-shstyle="' + i + '" title="선 스타일" class="px-1 py-0.5 text-[10px] border border-slate-300 rounded" style="flex:1">' + dashSelHtml(sh.style || 'solid') + '</select>' +
          '<input data-shsw="' + i + '" type="number" step="0.2" min="0.2" value="' + (sh.sw || 0.6) + '" title="선 굵기(mm)" class="w-11 px-1 py-0.5 text-[10px] border border-slate-300 rounded text-right"/>' +
          '<input data-shcolor="' + i + '" type="color" value="' + (sh.color || '#334155') + '" class="w-6 h-5 border border-slate-300 rounded"/>' +
          '<button data-shdel="' + i + '" class="text-[11px] text-red-500 px-1">✕</button></div>';
      }
      html += '</div>';
    });
    box.innerHTML = html;
    function bind(attr, fn) {
      box.querySelectorAll('[' + attr + ']').forEach(function (inp) {
        inp.addEventListener('change', function () {
          const sh = st.shapes[+inp.getAttribute(attr)];
          if (sh) { fn(sh, inp.value); renderPreview(); }
        });
      });
    }
    bind('data-shtext', function (sh, v) { sh.text = v; });
    bind('data-shsize', function (sh, v) { sh.size = Math.max(1, parseFloat(v) || 5); });
    bind('data-shstyle', function (sh, v) { sh.style = v; });
    bind('data-shsw', function (sh, v) { sh.sw = Math.max(0.2, parseFloat(v) || 0.6); });
    bind('data-shcolor', function (sh, v) { sh.color = v; });
    box.querySelectorAll('[data-shdel]').forEach(function (b) {
      b.onclick = function () {
        st.shapes.splice(+b.getAttribute('data-shdel'), 1);
        st.selShape = -1;
        refresh();
      };
    });
  }

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
    const p = clientToMM(e);
    // 이미지 모서리 리사이즈 핸들
    const ih = e.target.closest && e.target.closest('[data-ih]');
    if (ih && st.mode2 === 'img' && st.img) {
      const isc = st.imgS || 1;
      const fiw = st.w * isc, fih = st.imgAR ? fiw / st.imgAR : st.h * isc;
      const vx = st.imgCW ? st.imgCX : (st.imgX || 0), vy = st.imgCW ? st.imgCY : (st.imgY || 0);
      const vw = st.imgCW ? st.imgCW : fiw, vh = st.imgCW ? st.imgCH : fih;
      peG = { type: 'imgresize', corner: ih.getAttribute('data-ih'),
        vx: vx, vy: vy, vw: vw, vh: vh,
        ix: st.imgX || 0, iy: st.imgY || 0, s0: isc,
        cx: st.imgCX || 0, cy: st.imgCY || 0, cw: st.imgCW || 0, ch: st.imgCH || 0 };
      return;
    }
    if (st.cropping && st.img) { peG = { type: 'imgcrop', sp: p }; return; }
    // 사각 라인 그리기 모드: 드래그로 사각형
    if (st.mode2 === 'rect') { peG = { type: 'rectdraw', sp: p }; return; }
    // 글쓰기 모드: 클릭 위치에 텍스트
    if (st.mode2 === 'text') { peG = { type: 'textadd', sp: p }; return; }
    // 도형(텍스트/사각) 선택·이동
    const shEl = e.target.closest && e.target.closest('[data-si]');
    if (shEl) {
      const si = +shEl.getAttribute('data-si');
      const sh = st.shapes[si];
      if (sh) {
        st.selShape = si;
        peG = { type: 'shapemove', sp: p, si: si, ox: sh.x, oy: sh.y };
        renderPreview(); renderDrawList();
        return;
      }
    }
    const g = e.target.closest && e.target.closest('[data-ti]');
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
    } else if (st.mode2 === 'img' && st.img) {
      // 이미지 조절: 드래그로 위치 이동(크롭도 함께 이동)
      peG = { type: 'imgmove', sp: p, ox: st.imgX || 0, oy: st.imgY || 0, ocx: st.imgCX || 0, ocy: st.imgCY || 0 };
    } else {
      // 빈 곳: 드래그=마퀴 선택 · 클릭='단자 추가' 모드일 때만 단자 추가
      peG = { type: 'empty', sp: p, sc: { x: e.clientX, y: e.clientY }, moved: false, shift: e.shiftKey, allowAdd: st.mode2 === 'add' };
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
    if (peG.type === 'imgresize') {
      const c = peG.corner;
      const ax = (c === 'tl' || c === 'bl') ? peG.vx + peG.vw : peG.vx;  // 보이는 영역 반대 모서리 고정
      const ay = (c === 'tl' || c === 'tr') ? peG.vy + peG.vh : peG.vy;
      const k = Math.max(0.05, Math.min(10, Math.abs(p.x - ax) / Math.max(1, peG.vw)));
      st.imgS = Math.round(peG.s0 * k * 1000) / 1000;
      // 이미지·크롭 모두 앵커 기준 동일 배율로 변환 → 보이는 영역이 핸들을 따라감
      st.imgX = Math.round(ax + (peG.ix - ax) * k);
      st.imgY = Math.round(ay + (peG.iy - ay) * k);
      if (peG.cw) {
        st.imgCX = Math.round(ax + (peG.cx - ax) * k);
        st.imgCY = Math.round(ay + (peG.cy - ay) * k);
        st.imgCW = Math.round(peG.cw * k);
        st.imgCH = Math.round(peG.ch * k);
      }
      renderPreview();
      return;
    }
    if (peG.type === 'imgcrop') {
      drawMarquee({ x: Math.min(peG.sp.x, p.x), y: Math.min(peG.sp.y, p.y), w: Math.abs(p.x - peG.sp.x), h: Math.abs(p.y - peG.sp.y) });
      peG.last = p;
      return;
    }
    if (peG.type === 'imgmove') {
      const dx = p.x - peG.sp.x, dy = p.y - peG.sp.y;
      st.imgX = Math.round(peG.ox + dx);
      st.imgY = Math.round(peG.oy + dy);
      if (st.imgCW) { st.imgCX = Math.round(peG.ocx + dx); st.imgCY = Math.round(peG.ocy + dy); }
      renderPreview();
      return;
    }
    if (peG.type === 'shapemove') {
      const sh = st.shapes[peG.si];
      if (sh) {
        sh.x = Math.round(peG.ox + (p.x - peG.sp.x));
        sh.y = Math.round(peG.oy + (p.y - peG.sp.y));
        renderPreview();
      }
      return;
    }
    if (peG.type === 'rectdraw') {
      drawMarquee({ x: Math.min(peG.sp.x, p.x), y: Math.min(peG.sp.y, p.y), w: Math.abs(p.x - peG.sp.x), h: Math.abs(p.y - peG.sp.y) });
      peG.last = p;
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
      if (peG.allowAdd) {
        // '단자 추가' 모드: 클릭 → 단자 추가
        const rx = clamp(snap(peG.sp.x), 0, st.w), ry = clamp(snap(peG.sp.y), 0, st.h);
        st.terms.push({ name: st.nextName, rx: rx, ry: ry, shape: st.termShape, w: st.termW, h: st.termH, lp: st.termLabelPos });
        st.selSet = new Set([st.terms.length - 1]); st.sel = st.terms.length - 1; st.selExplicit = false;
        st.nextName = incName(st.nextName); $('pe-next').value = st.nextName;
      } else {
        st.selSet = new Set(); st.sel = -1; st.selExplicit = false; // 선택 모드: 빈 곳 클릭=해제
        st.selShape = -1;
      }
    }
    if (peG.type === 'rectdraw' && peG.last) {
      const x = Math.round(Math.min(peG.sp.x, peG.last.x)), y = Math.round(Math.min(peG.sp.y, peG.last.y));
      const w = Math.round(Math.abs(peG.last.x - peG.sp.x)), h = Math.round(Math.abs(peG.last.y - peG.sp.y));
      if (w >= 2 && h >= 2) {
        st.shapes = st.shapes || [];
        st.shapes.push({ kind: 'rect', x: x, y: y, w: w, h: h, style: st.shpStyle || 'solid', sw: st.shpSW || 0.6, color: st.shpColor || '#334155' });
        st.selShape = st.shapes.length - 1;
      }
    }
    if (peG.type === 'textadd') {
      const txt = prompt('텍스트 내용', '');
      if (txt != null && txt.trim()) {
        st.shapes = st.shapes || [];
        st.shapes.push({ kind: 'text', x: Math.round(peG.sp.x), y: Math.round(peG.sp.y), text: txt.trim(), size: st.shpTS || 5, color: st.shpColor || '#334155' });
        st.selShape = st.shapes.length - 1;
      }
    }
    if (peG.type === 'imgcrop' && peG.last) {
      st.imgCX = Math.round(Math.min(peG.sp.x, peG.last.x));
      st.imgCY = Math.round(Math.min(peG.sp.y, peG.last.y));
      st.imgCW = Math.round(Math.abs(peG.last.x - peG.sp.x));
      st.imgCH = Math.round(Math.abs(peG.last.y - peG.sp.y));
      if (st.imgCW < 3 || st.imgCH < 3) { st.imgCW = 0; } // 너무 작으면 취소
      st.cropping = false;
      if (PE.updateImgUI) PE.updateImgUI();
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
    st.grid = 2.5; // 단자 스냅 격자(mm)
    if ($('pe-grid-in')) $('pe-grid-in').value = '2.5';
    // 그리기(텍스트·사각 라인) — 배치 부품 편집이면 기존 도형 로드
    st.shapes = (opts.component && opts.component.shapes) ? App.clone(opts.component.shapes) : [];
    st.selShape = -1;
    st.shpStyle = 'solid'; st.shpSW = 0.6; st.shpColor = '#334155'; st.shpTS = 5;
    if ($('pe-shp-style')) { $('pe-shp-style').value = 'solid'; $('pe-shp-sw').value = '0.6'; $('pe-shp-color').value = '#334155'; $('pe-shp-ts').value = '5'; }
    st.img = (opts.component && opts.component.img) || null;
    st.imgX = (opts.component && opts.component.imgX) || 0;
    st.imgY = (opts.component && opts.component.imgY) || 0;
    st.imgS = (opts.component && opts.component.imgS) || 1;
    st.imgO = (opts.component && opts.component.imgO != null) ? opts.component.imgO : 1;
    st.imgAR = (opts.component && opts.component.imgAR) || 0;
    st.imgCX = (opts.component && opts.component.imgCX) || 0;
    st.imgCY = (opts.component && opts.component.imgCY) || 0;
    st.imgCW = (opts.component && opts.component.imgCW) || 0;
    st.imgCH = (opts.component && opts.component.imgCH) || 0;
    st.cropping = false;
    st.mode2 = 'select';
    if (PE.updateImgUI) PE.updateImgUI();
    if (PE.updateModeUI) PE.updateModeUI();
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
      term: App.clone(st.terms), img: st.img || undefined, imgX: st.imgX || 0, imgY: st.imgY || 0, imgS: st.imgS || 1, imgAR: st.imgAR || 0, imgO: st.imgO != null ? st.imgO : 1, imgCX: st.imgCX || 0, imgCY: st.imgCY || 0, imgCW: st.imgCW || 0, imgCH: st.imgCH || 0,
      shapes: (st.shapes && st.shapes.length) ? App.clone(st.shapes) : undefined, custom: true };
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
      c.img = def.img || null; c.imgX = def.imgX || 0; c.imgY = def.imgY || 0; c.imgS = def.imgS || 1; c.imgAR = def.imgAR || 0; c.imgO = def.imgO != null ? def.imgO : 1; c.imgCX = def.imgCX || 0; c.imgCY = def.imgCY || 0; c.imgCW = def.imgCW || 0; c.imgCH = def.imgCH || 0;
      c.shapes = def.shapes ? App.clone(def.shapes) : null;
      n++;
    });
    return n;
  }

  // 라이브러리 + 배치된 동일 부품 모두 한 번에 갱신
  function saveAll(updateEditedId) {
    const partNo = partNoOf();
    const def = { w: st.w, h: st.h, terms: App.clone(st.terms), type: st.type, name: st.name, img: st.img || null, imgX: st.imgX || 0, imgY: st.imgY || 0, imgS: st.imgS || 1, imgAR: st.imgAR || 0, imgO: st.imgO != null ? st.imgO : 1, imgCX: st.imgCX || 0, imgCY: st.imgCY || 0, imgCW: st.imgCW || 0, imgCH: st.imgCH || 0, shapes: (st.shapes && st.shapes.length) ? App.clone(st.shapes) : null };
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
      name: st.name || partNo, w: st.w, h: st.h, d: 60, terminals: st.terms.length, term: App.clone(st.terms), img: st.img || undefined, imgX: st.imgX || 0, imgY: st.imgY || 0, imgS: st.imgS || 1, imgAR: st.imgAR || 0, imgO: st.imgO != null ? st.imgO : 1, imgCX: st.imgCX || 0, imgCY: st.imgCY || 0, imgCW: st.imgCW || 0, imgCH: st.imgCH || 0,
      shapes: (st.shapes && st.shapes.length) ? App.clone(st.shapes) : undefined });
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
    // 이미지 업로드(최대 512px 자동 축소) / 제거
    function updateImgUI() {
      const del = $('pe-img-del');
      if (del) del.classList.toggle('hidden', !(st && st.img));
      const btn = $('pe-img-btn');
      if (btn) btn.textContent = (st && st.img) ? '📷 변경' : '📷 선택';
      const uc = $('pe-img-uncrop');
      if (uc) uc.classList.toggle('hidden', !(st && st.imgCW));
      if ($('pe-img-op') && st) $('pe-img-op').value = Math.round((st.imgO != null ? st.imgO : 1) * 100);
    }
    PE.updateImgUI = updateImgUI;
    if ($('pe-img-btn')) $('pe-img-btn').onclick = function () { $('pe-img-file').click(); };
    if ($('pe-img-del')) $('pe-img-del').onclick = function () { st.img = null; updateImgUI(); refresh(); };
    if ($('pe-img-file')) $('pe-img-file').onchange = function () {
      const f = this.files && this.files[0]; this.value = '';
      if (!f || !st) return;
      const r = new FileReader();
      r.onload = function () {
        const img = new Image();
        img.onload = function () {
          const MAX = 512;
          const k = Math.min(1, MAX / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          st.img = cv.toDataURL('image/png');
          st.imgAR = cv.width / cv.height;                 // 이미지 실제 비율
          const iw0 = Math.min(st.w, st.h * st.imgAR);     // 박스 안 최대 맞춤
          st.imgS = Math.round((iw0 / st.w) * 100) / 100;
          st.imgX = Math.round((st.w - iw0) / 2);
          st.imgY = Math.round((st.h - iw0 / st.imgAR) / 2);
          st.imgCW = 0; st.imgCH = 0;                      // 크롭 리셋
          updateImgUI(); refresh();
        };
        img.src = r.result;
      };
      r.readAsDataURL(f);
    };
    // 편집 모드 버튼(선택/단자추가/이미지조절)
    function updateModeUI() {
      [['pe-mode-select', 'select'], ['pe-mode-add', 'add'], ['pe-mode-img', 'img'], ['pe-mode-text', 'text'], ['pe-mode-rect', 'rect']].forEach(function (pr) {
        const b = $(pr[0]); if (!b) return;
        const on = st && st.mode2 === pr[1];
        b.classList.toggle('bg-blue-600', on); b.classList.toggle('text-white', on);
        b.classList.toggle('bg-white', !on); b.classList.toggle('text-slate-600', !on);
      });
      if (peSvg && st) peSvg.style.cursor =
        (st.mode2 === 'add' || st.mode2 === 'text' || st.mode2 === 'rect') ? 'crosshair'
          : (st.mode2 === 'img' ? 'move' : 'default');
    }
    PE.updateModeUI = updateModeUI;
    [['pe-mode-select', 'select'], ['pe-mode-add', 'add'], ['pe-mode-img', 'img'], ['pe-mode-text', 'text'], ['pe-mode-rect', 'rect']].forEach(function (pr) {
      const b = $(pr[0]);
      if (b) b.onclick = function () {
        if (!st) return;
        if (pr[1] === 'img' && !st.img) { alert('먼저 📷 이미지를 선택하세요.'); return; }
        st.mode2 = pr[1]; updateModeUI(); renderPreview();
      };
    });
    // 단자 스냅 격자 크기 조절
    if ($('pe-grid-in')) $('pe-grid-in').addEventListener('change', function () {
      if (!st) return;
      st.grid = Math.max(0, parseFloat(this.value) || 0);
      renderPreview(); // 격자 표시 갱신
    });
    // 그리기 기본값(선 스타일/굵기/색/글자 크기) — 선택된 도형이 있으면 즉시 반영
    function bindShapeCtl(id, key, apply) {
      const elc = $(id);
      if (!elc) return;
      elc.addEventListener('change', function () {
        if (!st) return;
        st[key] = apply(elc.value);
        if (st.selShape >= 0 && st.shapes && st.shapes[st.selShape]) {
          const sh = st.shapes[st.selShape];
          if (key === 'shpStyle' && sh.kind === 'rect') sh.style = st[key];
          else if (key === 'shpSW' && sh.kind === 'rect') sh.sw = st[key];
          else if (key === 'shpTS' && sh.kind === 'text') sh.size = st[key];
          else if (key === 'shpColor') sh.color = st[key];
          refresh();
        }
      });
    }
    bindShapeCtl('pe-shp-style', 'shpStyle', function (v) { return v; });
    bindShapeCtl('pe-shp-sw', 'shpSW', function (v) { return Math.max(0.2, parseFloat(v) || 0.6); });
    bindShapeCtl('pe-shp-color', 'shpColor', function (v) { return v; });
    bindShapeCtl('pe-shp-ts', 'shpTS', function (v) { return Math.max(1, parseFloat(v) || 5); });
    // 자르기/해제/투명도
    if ($('pe-img-cropbtn')) $('pe-img-cropbtn').onclick = function () {
      if (!st || !st.img) { alert('먼저 📷 이미지를 선택하세요.'); return; }
      st.mode2 = 'img'; if (PE.updateModeUI) PE.updateModeUI();
      st.cropping = true;
      if (App.toolbar) App.toolbar.flash('이미지 위를 드래그해 남길 영역을 지정하세요');
    };
    if ($('pe-img-uncrop')) $('pe-img-uncrop').onclick = function () {
      if (!st) return; st.imgCW = 0; st.imgCH = 0; refresh(); if (PE.updateImgUI) PE.updateImgUI();
    };
    if ($('pe-img-op')) $('pe-img-op').addEventListener('input', function () {
      if (!st) return; st.imgO = Math.max(0.1, Math.min(1, (parseFloat(this.value) || 100) / 100)); renderPreview();
    });
    // 이미지 조절 모드: 휠로 크기
    peSvg.addEventListener('wheel', function (e) {
      if (!st || st.mode2 !== 'img' || !st.img) return;
      e.preventDefault();
      st.imgS = Math.max(0.2, Math.min(5, (st.imgS || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
      renderPreview();
    }, { passive: false });
    window.addEventListener('keydown', onKey);
    $('pe-save').onclick = saveToLibrary;
    $('pe-apply').onclick = applyToComponent;
    $('pe-cancel').onclick = PE.close;
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) PE.close(); });
  };
})(window);
