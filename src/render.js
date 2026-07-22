/* state → SVG 렌더링. 상태 변경 시 레이어를 다시 그린다. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Render = (App.render = {});

  const TYPE_COLORS = {
    MCCB: '#1d4ed8', MCB: '#2563eb', ELCB: '#1e40af',
    MC: '#0d9488', CP: '#7c3aed', SMPS: '#ea580c',
    PLC: '#15803d', TB: '#64748b', RELAY: '#db2777', STOP: '#0f766e', NF: '#0e7490', ETC: '#475569'
  };
  App.typeColor = function (t) { return App.types ? App.types.color(t) : (TYPE_COLORS[t] || TYPE_COLORS.ETC); };

  const LABEL_BASE = 5; // 부품 이름 기본 글씨 크기(mm) — 모든 부품 동일

  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }

  // 잠금 표시(자물쇠) — 좌상단 모서리
  function lockBadge(grp, x, y) {
    const t = App.el('text', { x: x, y: y, 'font-size': 6, fill: '#64748b', 'pointer-events': 'none' }, grp);
    t.textContent = '🔒';
  }

  // 글씨 크기 배율(종류별)
  function fonts(state) {
    const f = state.fonts || {};
    const comp = f.comp || 1; // 구버전 호환(부품 글씨 통합 배율)
    return {
      comp: comp,
      ctype: f.ctype || comp,  // 카테고리(타입 배지)
      ctag: f.ctag || comp,    // 호기번호
      cname: f.cname || comp,  // 부품 이름
      term: f.term || 1, wire: f.wire || 1, dim: f.dim || 1,
      wireMM: f.wireMM || 4,   // 라인번호 크기(mm, 도면 고정 — 줌과 함께 스케일)
      dimMM: f.dimMM || 5      // 치수 문자 크기(mm, 도면 고정 — 줌해도 안 바뀜)
    };
  }

  function isSelected(id) {
    return App.ui && App.ui.selected && App.ui.selected.has(id);
  }

  function renderPanel(state) {
    const g = App.viewport.layers().panel;
    clear(g);
    const p = state.panel;
    App.el('rect', {
      x: 0, y: 0, width: p.widthMM, height: p.heightMM,
      fill: '#ffffff', stroke: '#334155', 'stroke-width': 2,
      'data-kind': 'panel'
    }, g);
    // 제목(한 줄 위) — 입력 시에만 표시, 위치 이동 가능
    if (p.title) {
      const ti = App.el('text', {
        x: p.widthMM / 2 + (p.titleDx || 0), y: -34 + (p.titleDy || 0), 'text-anchor': 'middle',
        'font-size': 26, 'font-weight': 'bold', fill: '#1e293b', 'pointer-events': 'none'
      }, g);
      ti.textContent = p.title;
    }
    // 치수 라벨
    const t = App.el('text', {
      x: p.widthMM / 2, y: -12, 'text-anchor': 'middle',
      'font-size': 18, fill: '#334155', 'pointer-events': 'none'
    }, g);
    t.textContent = p.widthMM + ' × ' + p.heightMM + ' mm';
    renderTitleBlock(state, g);
    // 도면 프레임(2중 테두리) — 전장+표제란(+기계영역) 감싸는 도곽
    if (p.frame) {
      const topEx = p.fieldZone ? ((p.fieldH || 220) + 60) : 0;
      const fx = -22, fy = -52 - topEx, fw = p.widthMM + 44, fh = p.heightMM + 52 + topEx + 52;
      const fr = App.el('g', { id: 'sheet-frame', 'pointer-events': 'none' }, g);
      App.el('rect', { x: fx, y: fy, width: fw, height: fh, fill: 'none', stroke: '#334155', 'stroke-width': 1.6 }, fr);
      App.el('rect', { x: fx + 5, y: fy + 5, width: fw - 10, height: fh - 10, fill: 'none', stroke: '#334155', 'stroke-width': 0.6 }, fr);
      // 구역 참조(EPLAN식): 상하 열번호 1..8, 좌우 행문자 A..
      const NC = 8, NR = Math.max(3, Math.round(fh / (fw / NC)));
      for (let i = 1; i < NC; i++) {
        const zx = fx + (fw / NC) * i;
        App.el('line', { x1: zx, y1: fy, x2: zx, y2: fy + 5, stroke: '#334155', 'stroke-width': 0.5 }, fr);
        App.el('line', { x1: zx, y1: fy + fh - 5, x2: zx, y2: fy + fh, stroke: '#334155', 'stroke-width': 0.5 }, fr);
      }
      for (let i = 0; i < NC; i++) {
        const zx = fx + (fw / NC) * (i + 0.5);
        [fy + 2.6, fy + fh - 2.6].forEach(function (zy) {
          const tt = App.el('text', { x: zx, y: zy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 3.4, fill: '#334155' }, fr);
          tt.textContent = String(i + 1);
        });
      }
      for (let i = 1; i < NR; i++) {
        const zy = fy + (fh / NR) * i;
        App.el('line', { x1: fx, y1: zy, x2: fx + 5, y2: zy, stroke: '#334155', 'stroke-width': 0.5 }, fr);
        App.el('line', { x1: fx + fw - 5, y1: zy, x2: fx + fw, y2: zy, stroke: '#334155', 'stroke-width': 0.5 }, fr);
      }
      for (let i = 0; i < NR; i++) {
        const zy = fy + (fh / NR) * (i + 0.5);
        [fx + 2.6, fx + fw - 2.6].forEach(function (zx) {
          const tt = App.el('text', { x: zx, y: zy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 3.4, fill: '#334155' }, fr);
          tt.textContent = String.fromCharCode(65 + i);
        });
      }
    }
    // 기계(필드) 영역 — 전장 위쪽에 센서/모터 등 기계측 기기 배치 구역
    if (p.fieldZone) {
      const fh = p.fieldH || 220, gap = 60;
      App.el('rect', {
        x: 0, y: -gap - fh, width: p.widthMM, height: fh,
        fill: '#f0fdf4', 'fill-opacity': 0.5, stroke: '#16a34a', 'stroke-width': 1,
        'stroke-dasharray': '8 5', 'pointer-events': 'none'
      }, g);
      const ft = App.el('text', {
        x: 6, y: -gap - fh + 12, 'font-size': 9, fill: '#15803d', 'font-weight': 'bold', 'pointer-events': 'none'
      }, g);
      ft.textContent = '기계장치 영역 (센서·모터 등 필드 기기)';
    }
  }

  // 표제란 — 전장 우하단 바깥에 도번/작성자/날짜/리비전 (인쇄·PNG에 포함)
  function renderTitleBlock(state, g) {
    const tb = state.titleBlock;
    if (!tb || tb.show === false) return;
    if (!(tb.docNo || tb.author || tb.date || tb.rev || state.panel.title)) return;
    const p = state.panel;
    const W = 170, H = 34, X = p.widthMM - W, Y = p.heightMM + 6;
    const grp = App.el('g', { 'pointer-events': 'none' }, g);
    App.el('rect', { x: X, y: Y, width: W, height: H, fill: '#ffffff', stroke: '#334155', 'stroke-width': 0.8 }, grp);
    // 칸: 제목(위 전체) / 도번·작성자·날짜·리비전(아래 4칸)
    App.el('line', { x1: X, y1: Y + H / 2, x2: X + W, y2: Y + H / 2, stroke: '#334155', 'stroke-width': 0.5 }, grp);
    const cw = W / 4;
    for (let i = 1; i < 4; i++) App.el('line', { x1: X + cw * i, y1: Y + H / 2, x2: X + cw * i, y2: Y + H, stroke: '#334155', 'stroke-width': 0.5 }, grp);
    function txt(x, y, s, size, bold, anchor) {
      if (!s) return;
      const e = App.el('text', { x: x, y: y, 'font-size': size, fill: '#1e293b', 'text-anchor': anchor || 'middle', 'dominant-baseline': 'central', 'font-weight': bold ? 'bold' : null }, grp);
      e.textContent = s;
    }
    txt(X + W / 2, Y + H / 4, p.title || '', 7, true);
    // 시트명 · 페이지 (여러 시트일 때)
    if (state.sheets && state.sheets.length > 1) {
      const i = state.activeSheet || 0;
      txt(X + W - 3, Y + H / 4, (state.sheets[i] ? state.sheets[i].name : '') + ' (' + (i + 1) + '/' + state.sheets.length + ')', 3.4, false, 'end');
    }
    const labels = ['도번', '작성자', '날짜', 'REV'];
    const vals = [tb.docNo, tb.author, tb.date, tb.rev];
    for (let i = 0; i < 4; i++) {
      txt(X + cw * i + cw / 2, Y + H * 0.62, labels[i], 3.2);
      txt(X + cw * i + cw / 2, Y + H * 0.85, vals[i] || '-', 4.2);
    }
  }

  function renderDucts(state) {
    const g = App.viewport.layers().ducts;
    clear(g);
    state.ducts.forEach(function (d) {
      const w = d.orient === 'h' ? d.lengthMM : d.widthMM;
      const h = d.orient === 'h' ? d.widthMM : d.lengthMM;
      const grp = App.el('g', { 'data-id': d.id, 'data-kind': 'ducts' }, g);
      App.el('rect', {
        x: d.x, y: d.y, width: w, height: h,
        fill: '#fde68a', 'fill-opacity': 0.55,
        stroke: isSelected(d.id) ? '#d97706' : '#b45309',
        'stroke-width': isSelected(d.id) ? 2 : 1
      }, grp);
      // 덕트 빗금 표현 (슬롯 느낌)
      App.el('rect', {
        x: d.x + 2, y: d.y + 2, width: Math.max(0, w - 4), height: Math.max(0, h - 4),
        fill: 'none', stroke: '#f59e0b', 'stroke-width': 0.6,
        'stroke-dasharray': '3 3', 'pointer-events': 'none'
      }, grp);
      if (d.locked) lockBadge(grp, d.x + 1, d.y + 6);
      // 라벨 스티커 (24mm 라벨테이프, 세로 3줄) — panel.showStickers=false 면 숨김
      if (state.panel.showStickers !== false) {
        (d.stickers || []).forEach(function (st) { drawSticker(grp, d, w, h, st, state); });
      }
    });
  }

  // 선 스타일 → SVG dasharray (부품 도형·부품 편집기 공용)
  App.dashOf = function (style) {
    if (style === 'dash') return '4 2';
    if (style === 'dashdot') return '8 2 2 2';
    if (style === 'dot') return '1.2 2';
    return null; // solid
  };

  // 덕트 라벨 스티커 — 세로 3줄(기본 30×24mm), 크기 조절 가능. 세로 덕트에선 90° 회전.
  // 1줄=유형, 2줄=품명(부품 연동 시 자동), 3줄=직접 작성. 'cols'는 구버전 호환 렌더만.
  App.STICKER = { W: 30, H: 24 };
  App.stickerDims = function (st) {
    const cw = st.cellW || App.STICKER.W, ch = st.cellH || App.STICKER.H;
    if (st.mode === 'cols') { // 구버전 호환
      const n = Math.max(1, Math.min(8, st.n || 3));
      return { mode: 'cols', n: n, cw: cw, ch: ch, len: n * cw, th: ch };
    }
    return { mode: 'rows', n: 3, cw: cw, ch: ch, len: cw, th: ch };
  };
  // 스티커 표시 줄 — 부품 연동 시 1줄=유형, 2줄=라이브러리 타이틀(품번) 자동, 3줄=사용자 작성
  App.stickerLines = function (state, st) {
    const lines = (st.lines || []).slice();
    if (st.linkId) {
      const c = (state.components || []).find(function (x) { return x.id === st.linkId; });
      if (c) {
        lines[0] = c.type || '';
        lines[1] = c.partNo || '';
      }
    }
    return lines;
  };
  function drawSticker(parent, d, w, h, st, state) {
    const dm = App.stickerDims(st);
    const off = st.off || 0;
    let cx, cy, rot;
    if (d.orient === 'h') { cx = d.x + off + dm.len / 2; cy = d.y + h / 2; rot = 0; }
    else { cx = d.x + w / 2; cy = d.y + off + dm.len / 2; rot = 90; }
    const g = App.el('g', {
      transform: 'translate(' + cx + ' ' + cy + ')' + (rot ? ' rotate(' + rot + ')' : ''),
      'data-sticker': st.id, 'data-duct': d.id, style: 'cursor:move'
    }, parent);
    const L = dm.len, T = dm.th;
    App.el('rect', { x: -L / 2, y: -T / 2, width: L, height: T, fill: '#111827', stroke: '#1f2937', 'stroke-width': 0.5, rx: 0.8 }, g);
    App.el('rect', { x: -L / 2 + 0.9, y: -T / 2 + 0.9, width: L - 1.8, height: T - 1.8, fill: 'none', stroke: '#f8fafc', 'stroke-width': 0.55, 'pointer-events': 'none' }, g);
    const lines = App.stickerLines(state || App.store.get(), st);
    if (dm.mode === 'cols') {
      // 가로 칸 나열 — 칸 구분 세로선 + 칸별 텍스트
      for (let i = 1; i < dm.n; i++) {
        const lx = -L / 2 + dm.cw * i;
        App.el('line', { x1: lx, y1: -T / 2 + 0.9, x2: lx, y2: T / 2 - 0.9, stroke: '#f8fafc', 'stroke-width': 0.45, 'pointer-events': 'none' }, g);
      }
      for (let i = 0; i < dm.n; i++) {
        const s = lines[i] || '';
        if (!s) continue;
        const fs = Math.max(1.8, Math.min(T * 0.34, (dm.cw - 3) / (String(s).length * 0.62)));
        const t = App.el('text', {
          x: -L / 2 + dm.cw * (i + 0.5), y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': fs, fill: '#ffffff', 'font-family': 'Arial, sans-serif', 'pointer-events': 'none'
        }, g);
        t.textContent = s;
      }
    } else {
      // 한 칸에 3줄 (사진 양식)
      const rowH = (T - 1.8) / 3, top = -T / 2 + 0.9;
      for (let i = 1; i < 3; i++) {
        App.el('line', { x1: -L / 2 + 0.9, y1: top + rowH * i, x2: L / 2 - 0.9, y2: top + rowH * i, stroke: '#f8fafc', 'stroke-width': 0.45, 'pointer-events': 'none' }, g);
      }
      for (let i = 0; i < 3; i++) {
        const s = lines[i] || '';
        if (!s) continue;
        const fs = Math.max(1.8, Math.min(4.3, (L - 4) / (String(s).length * 0.62)));
        const t = App.el('text', {
          x: 0, y: top + rowH * i + rowH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': fs, fill: '#ffffff', 'font-family': 'Arial, sans-serif', 'pointer-events': 'none'
        }, g);
        t.textContent = s;
      }
    }
  }

  function renderRails(state) {
    const g = App.viewport.layers().rails;
    clear(g);
    state.rails.forEach(function (r) {
      const w = r.orient === 'h' ? r.lengthMM : (r.widthMM || 35);
      const h = r.orient === 'h' ? (r.widthMM || 35) : r.lengthMM;
      const grp = App.el('g', { 'data-id': r.id, 'data-kind': 'rails' }, g);
      App.el('rect', {
        x: r.x, y: r.y, width: w, height: h,
        fill: '#cbd5e1',
        stroke: isSelected(r.id) ? '#0ea5e9' : '#64748b',
        'stroke-width': isSelected(r.id) ? 2 : 1
      }, grp);
      // DIN 레일 중앙 홈
      if (r.orient === 'h') {
        App.el('line', { x1: r.x, y1: r.y + h / 2, x2: r.x + w, y2: r.y + h / 2, stroke: '#94a3b8', 'stroke-width': 0.8, 'pointer-events': 'none' }, grp);
      } else {
        App.el('line', { x1: r.x + w / 2, y1: r.y, x2: r.x + w / 2, y2: r.y + h, stroke: '#94a3b8', 'stroke-width': 0.8, 'pointer-events': 'none' }, grp);
      }
      if (r.locked) lockBadge(grp, r.x + 1, r.y + 6);
    });
  }

  // 겹치는 부품 id 집합 (배치 실수 경고용)
  function overlappingIds(state) {
    const set = new Set();
    const cs = state.components;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        if (a.x < b.x + b.widthMM && a.x + a.widthMM > b.x &&
            a.y < b.y + b.heightMM && a.y + a.heightMM > b.y) {
          set.add(a.id); set.add(b.id);
        }
      }
    }
    return set;
  }

  // 계통도 심볼 지오메트리 — 렌더와 DXF 내보내기가 공용 사용
  App.symGeo = function (c) {
    const w = c.widthMM, h = c.heightMM, m = w / 2, s = c.sym;
    const LS = [], CS = [], TS = [];
    function L(x1, y1, x2, y2) { LS.push([x1, y1, x2, y2]); }
    function C(cx, cy, r0) { CS.push([cx, cy, r0]); }
    function T(tx, ty, str, size) { TS.push([tx, ty, str, size || 8]); }
    if (s === 'mccb' || s === 'elcb') {
      // IEC 60617 차단기: 개방 접점 + 고정접점의 X 표시
      L(m, 2, m, h * 0.32);
      L(m, h * 0.32, w * 0.88, h * 0.6);
      L(m, h * 0.62, m, h - 2);
      const xr = w * 0.09;
      L(m - xr, h * 0.32 - xr, m + xr, h * 0.32 + xr);
      L(m - xr, h * 0.32 + xr, m + xr, h * 0.32 - xr);
      if (s === 'elcb') { C(m, h * 0.47, w * 0.16); T(m, h * 0.47, 'E', w * 0.24); }
    } else if (s === 'fuse') {
      L(m, 2, m, h - 2);
      L(w * 0.3, h * 0.25, w * 0.7, h * 0.25); L(w * 0.7, h * 0.25, w * 0.7, h * 0.75);
      L(w * 0.7, h * 0.75, w * 0.3, h * 0.75); L(w * 0.3, h * 0.75, w * 0.3, h * 0.25);
    } else if (s === 'mc') {
      L(m, 2, m, h * 0.3);
      L(m, h * 0.3, w * 0.88, h * 0.58);
      L(m, h * 0.62, m, h - 2);
      C(m, h * 0.3, w * 0.07); C(m, h * 0.62, w * 0.07);
    } else if (s === 'thr') {
      L(m, 2, m, h * 0.22);
      L(m, h * 0.22, w * 0.75, h * 0.22); L(w * 0.75, h * 0.22, w * 0.75, h * 0.5);
      L(w * 0.75, h * 0.5, w * 0.25, h * 0.5); L(w * 0.25, h * 0.5, w * 0.25, h * 0.78);
      L(w * 0.25, h * 0.78, m, h * 0.78);
      L(m, h * 0.78, m, h - 2);
    } else if (s === 'tr') {
      L(m, 2, m, h * 0.22);
      C(m, h * 0.38, w * 0.24); C(m, h * 0.62, w * 0.24);
      L(m, h * 0.78, m, h - 2);
    } else if (s === 'motor') {
      L(m, 2, m, h * 0.3);
      C(m, h * 0.62, w * 0.36); T(m, h * 0.62, 'M', w * 0.4);
    } else if (s === 'lamp') {
      L(m, 2, m, h * 0.28);
      C(m, h * 0.55, w * 0.3);
      const r0 = w * 0.3 * 0.7;
      L(m - r0, h * 0.55 - r0, m + r0, h * 0.55 + r0); L(m - r0, h * 0.55 + r0, m + r0, h * 0.55 - r0);
      L(m, h * 0.82, m, h - 2);
    } else if (s === 'sw') {
      L(m, 2, m, h * 0.32); L(m, h * 0.32, w * 0.85, h * 0.62); L(m, h * 0.65, m, h - 2);
    } else if (s === 'earth') {
      L(m, 2, m, h * 0.55);
      L(w * 0.15, h * 0.55, w * 0.85, h * 0.55);
      L(w * 0.28, h * 0.7, w * 0.72, h * 0.7);
      L(w * 0.4, h * 0.85, w * 0.6, h * 0.85);
    } else if (s === 'ct') {
      L(m, 2, m, h - 2);
      C(m, h * 0.5, w * 0.3);
    } else if (s === 'meter') {
      L(m, 2, m, h * 0.25);
      C(m, h * 0.55, w * 0.32); T(m, h * 0.55, 'A', w * 0.34);
      L(m, h * 0.87, m, h - 2);
    } else if (s === 'auxa') {
      L(m, 2, m, h * 0.32);
      L(m, h * 0.32, w * 0.85, h * 0.6);
      L(m, h * 0.64, m, h - 2);
    } else if (s === 'auxb') {
      L(m, 2, m, h * 0.32);
      L(m, h * 0.32, w * 0.85, h * 0.6);
      L(w * 0.32, h * 0.3, w * 0.72, h * 0.3);
      L(m, h * 0.64, m, h - 2);
    } else if (s === 'coil') {
      L(m, 2, m, h * 0.28);
      C(m, h * 0.5, w * 0.28);
      L(m, h * 0.72, m, h - 2);
    } else if (s === 'pb') {
      L(m, 2, m, h * 0.4); L(m, h * 0.6, m, h - 2);
      L(w * 0.28, h * 0.45, w * 0.72, h * 0.45);
      L(m, h * 0.45, m, h * 0.24);
      L(w * 0.36, h * 0.24, w * 0.64, h * 0.24);
    } else if (s === 'ph3') {
      L(m, 2, m, h - 2);
      for (let i = 0; i < 3; i++) L(w * 0.3, h * (0.32 + i * 0.14), w * 0.7, h * (0.22 + i * 0.14));
    } else if (s === 'bus') {
      // 굵은 바(사각) — DXF에선 외곽선
      L(1, h * 0.25, w - 1, h * 0.25); L(w - 1, h * 0.25, w - 1, h * 0.75);
      L(w - 1, h * 0.75, 1, h * 0.75); L(1, h * 0.75, 1, h * 0.25);
    } else if (s === 'rail2') {
      // AC 전원 모선 2선(L/N) — 계통도 시작 라인
      L(0, h * 0.25, w, h * 0.25);
      L(0, h * 0.75, w, h * 0.75);
      T(-7, h * 0.25, 'L', 7); T(-7, h * 0.75, 'N', 7);
    } else if (s === 'rail3') {
      // 3상 전원 모선(R/S/T)
      L(0, h * 0.17, w, h * 0.17); L(0, h * 0.5, w, h * 0.5); L(0, h * 0.83, w, h * 0.83);
      T(-7, h * 0.17, 'R', 6.5); T(-7, h * 0.5, 'S', 6.5); T(-7, h * 0.83, 'T', 6.5);
    } else if (s === 'm3') {
      L(m, 2, m, h * 0.28);
      C(m, h * 0.6, w * 0.38); T(m, h * 0.52, 'M', w * 0.32); T(m, h * 0.74, '3~', w * 0.22);
    } else if (s === 'gen') {
      L(m, 2, m, h * 0.28);
      C(m, h * 0.6, w * 0.38); T(m, h * 0.6, 'G', w * 0.36);
    } else if (s === 'vmeter') {
      L(m, 2, m, h * 0.25);
      C(m, h * 0.55, w * 0.32); T(m, h * 0.55, 'V', w * 0.34);
      L(m, h * 0.87, m, h - 2);
    } else if (s === 'tona') {
      // 한시동작 a접점: 접점 + 지연 반원(∪)
      L(m, 2, m, h * 0.3);
      L(m, h * 0.3, w * 0.85, h * 0.55);
      L(m, h * 0.6, m, h - 2);
      L(w * 0.3, h * 0.72, w * 0.42, h * 0.8); L(w * 0.42, h * 0.8, w * 0.58, h * 0.8); L(w * 0.58, h * 0.8, w * 0.7, h * 0.72);
    } else if (s === 'inv') {
      // 인버터(VFD): 사각 + 대각선 + V/f
      L(3, 5, w - 3, 5); L(w - 3, 5, w - 3, h - 5); L(w - 3, h - 5, 3, h - 5); L(3, h - 5, 3, 5);
      L(3, h - 5, w - 3, 5);
      T(w * 0.32, h * 0.32, '~', 7); T(w * 0.68, h * 0.7, '=', 7);
      L(m, 2, m, 5); L(m, h - 5, m, h - 2);
    }
    return { lines: LS, circles: CS, texts: TS };
  };

  // 계통도 심볼(단선도) 벡터 렌더 — symGeo 지오메트리를 SVG 로 그림
  function drawSym(grp, c) {
    const x = c.x, y = c.y;
    const g = App.el('g', { 'class': 'part-sym', 'pointer-events': 'none' }, grp);
    const isRail = (c.sym === 'rail2' || c.sym === 'rail3');
    const SW = isRail ? 2.6 : 1.4, COL = '#0f172a';
    const geo = App.symGeo(c);
    if (c.sym === 'bus') { // 버스바는 채운 바로
      App.el('rect', { x: x + 1, y: y + c.heightMM * 0.25, width: c.widthMM - 2, height: c.heightMM * 0.5, fill: COL, rx: 1 }, g);
    } else {
      geo.lines.forEach(function (l) {
        App.el('line', { x1: x + l[0], y1: y + l[1], x2: x + l[2], y2: y + l[3], stroke: COL, 'stroke-width': SW, 'stroke-linecap': 'round' }, g);
      });
    }
    geo.circles.forEach(function (ci) {
      App.el('circle', { cx: x + ci[0], cy: y + ci[1], r: ci[2], fill: '#fff', stroke: COL, 'stroke-width': SW }, g);
    });
    geo.texts.forEach(function (t) {
      const e = App.el('text', { x: x + t[0], y: y + t[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': t[3], 'font-weight': 'bold', fill: COL }, g);
      e.textContent = t[2];
    });
  }

  // 타입별 실물풍 앞면 디테일(벡터) — 사진(img) 없을 때만. 저작권 무관 자체 그래픽.
  function renderComponents(state) {
    const g = App.viewport.layers().components;
    clear(g);
    const overlaps = overlappingIds(state);
    const F = fonts(state);
    // 선택된 배선의 양끝 부품 강조(어디서 어디로 가는지 표시)
    const wireEnds = new Set();
    (state.wires || []).forEach(function (w) {
      if (isSelected(w.id)) { wireEnds.add(w.fromComp); wireEnds.add(w.toComp); }
    });
    state.components.forEach(function (c) {
      const cx = c.x + c.widthMM / 2;
      const cy = c.y + c.heightMM / 2;
      const over = overlaps.has(c.id);
      const grp = App.el('g', {
        'data-id': c.id, 'data-kind': 'components',
        transform: c.rotation ? ('rotate(' + c.rotation + ' ' + cx + ' ' + cy + ')') : null
      }, g);
      const color = App.typeColor(c.type);
      // 불투명 흰 배경(뒤 레일/덕트 가림) + 타입색 옅은 틴트
      App.el('rect', { x: c.x, y: c.y, width: c.widthMM, height: c.heightMM, rx: 2, fill: '#ffffff' }, grp);
      // 부품 외형 이미지(있으면 실물 사진처럼 표시)
      if (c.img) {
        const isc = c.imgS || 1;
        let clipId = null;
        if (c.imgCW) { // 자르기: 부품 로컬 클립을 절대좌표로
          clipId = 'imclip_' + c.id;
          const cp = App.el('clipPath', { id: clipId }, grp);
          App.el('rect', { x: c.x + c.imgCX, y: c.y + c.imgCY, width: c.imgCW, height: c.imgCH }, cp);
        }
        const imW = c.widthMM * isc;
        const imH = c.imgAR ? imW / c.imgAR : c.heightMM * isc; // 이미지 실제 비율 유지
        const im = App.el('image', {
          x: c.x + (c.imgX || 0), y: c.y + (c.imgY || 0),
          width: imW, height: imH,
          preserveAspectRatio: 'xMidYMid meet', 'pointer-events': 'none',
          opacity: c.imgO != null ? c.imgO : 1,
          'clip-path': clipId ? ('url(#' + clipId + ')') : null
        }, grp);
        im.setAttribute('href', c.img);
      }
      App.el('rect', {
        x: c.x, y: c.y, width: c.widthMM, height: c.heightMM,
        rx: 2, fill: over ? '#ef4444' : color,
        'fill-opacity': (c.img || c.sym) ? 0 : (over ? 0.22 : 0.16),
        stroke: over ? '#dc2626' : (isSelected(c.id) ? '#111827' : (c.sym ? '#94a3b8' : color)),
        'stroke-width': isSelected(c.id) || over ? 2 : (c.sym ? 0.8 : 1.2),
        'stroke-dasharray': (over || (c.sym && isSelected(c.id))) ? '4 2' : null
      }, grp);
      // 단자 커버(날개, 엔드 플레이트) — 좌/우 개별 on/off
      if (c.coverL || c.coverR) {
        const covW = 2.5;
        function cover(cxr) {
          App.el('rect', {
            x: cxr, y: c.y - 1.2, width: covW, height: c.heightMM + 2.4, rx: 0.6,
            fill: '#94a3b8', 'fill-opacity': 0.9, stroke: '#64748b', 'stroke-width': 0.5,
            'pointer-events': 'none'
          }, grp);
        }
        if (c.coverL) cover(c.x - covW);
        if (c.coverR) cover(c.x + c.widthMM);
      }
      if (wireEnds.has(c.id)) { // 선택 배선의 연결 부품 — 하늘색 점선 강조
        App.el('rect', {
          x: c.x - 2.5, y: c.y - 2.5, width: c.widthMM + 5, height: c.heightMM + 5, rx: 2,
          fill: 'none', stroke: '#0ea5e9', 'stroke-width': App.viewport.pxToMM(2),
          'stroke-dasharray': App.viewport.pxToMM(5) + ' ' + App.viewport.pxToMM(3), 'pointer-events': 'none'
        }, grp);
      }
      if (c.sym && !over) drawSym(grp, c);                 // 계통도 심볼
      // 부품 도형(라이브러리 편집기에서 그린 글쓰기·사각 라인)
      (c.shapes || []).forEach(function (sh) {
        if (sh.kind === 'rect') {
          App.el('rect', {
            x: c.x + sh.x, y: c.y + sh.y, width: sh.w, height: sh.h, fill: 'none',
            stroke: sh.color || '#334155', 'stroke-width': sh.sw || 0.6,
            'stroke-dasharray': App.dashOf(sh.style), 'pointer-events': 'none'
          }, grp);
        } else if (sh.kind === 'line') {
          App.el('line', {
            x1: c.x + sh.x1, y1: c.y + sh.y1, x2: c.x + sh.x2, y2: c.y + sh.y2,
            stroke: sh.color || '#334155', 'stroke-width': sh.sw || 0.6,
            'stroke-dasharray': App.dashOf(sh.style), 'stroke-linecap': 'round', 'pointer-events': 'none'
          }, grp);
        } else if (sh.kind === 'circle') {
          App.el('circle', {
            cx: c.x + sh.x, cy: c.y + sh.y, r: sh.r, fill: 'none',
            stroke: sh.color || '#334155', 'stroke-width': sh.sw || 0.6,
            'stroke-dasharray': App.dashOf(sh.style), 'pointer-events': 'none'
          }, grp);
        } else if (sh.kind === 'text') {
          const sT = App.el('text', {
            x: c.x + sh.x, y: c.y + sh.y, 'font-size': sh.size || 5,
            fill: sh.color || '#334155', 'pointer-events': 'none'
          }, grp);
          sT.textContent = sh.text || '';
        }
      });
      // (기본 실물풍 그래픽은 제거 — 이미지는 사용자가 직접 넣었을 때만 표시)
      // 글자 방향(가로/세로) — true면 텍스트를 -90° 회전(각 앵커 기준)
      // 글자 방향 — 품명/타입/호기 각각 분리 (미지정 시 기존 textVert 상속)
      function vertOf(spec) { return spec != null ? !!spec : !!c.textVert; }
      const vLabel = vertOf(c.labelVert), vType = vertOf(c.typeVert), vTag = vertOf(c.tagVert);
      function vrotIf(on, x, y) { return on ? ('rotate(-90 ' + x + ' ' + y + ')') : null; }
      // 호기번호(tag) — 가운데 크게 (장치 식별이 우선이라 유형과 자리 교체)
      if (c.tag) {
        const tx = cx + (c.tagDx || 0), ty = cy - 2 + (c.tagDy || 0);
        const tg = App.el('text', {
          x: tx, y: ty, 'text-anchor': 'middle',
          'font-size': Math.min(12, c.heightMM * 0.22) * F.ctag, fill: '#111827',
          'font-weight': 'bold', 'pointer-events': 'none', transform: vrotIf(vTag, tx, ty)
        }, grp);
        tg.textContent = c.tag;
      }
      // 타입 배지(카테고리) — 상단에 작게. 위치 이동 가능(계통도 심볼은 생략, showTypes=false 면 숨김)
      if (!c.sym && state.panel.showTypes !== false) {
        const bx = cx + (c.typeDx || 0), by = c.y + Math.min(8, c.heightMM * 0.12) + (c.typeDy || 0);
        const badge = App.el('text', {
          x: bx, y: by, 'text-anchor': 'middle',
          'font-size': Math.min(8, c.heightMM * 0.14) * F.ctype, fill: color,
          'font-weight': 'bold', 'pointer-events': 'none', transform: vrotIf(vType, bx, by)
        }, grp);
        badge.textContent = c.type || '';
      }
      // 품명 — 기본 크기 × 배율, 선택 시 드래그로 위치 이동. panel.showNames=false 면 숨김
      if (state.panel.showNames !== false) {
        // 표시 글씨 = 라이브러리 타이틀(품번). 라벨이 품명 그대로면(구버전 기본) 타이틀로 대체.
        const txt = c.sym ? (c.label || c.partName || c.partNo || '')
          : ((c.label && c.label !== c.partName) ? c.label : (c.partNo || c.partName || ''));
        const fit = LABEL_BASE * F.cname;
        const lx = c.sym ? (c.x + c.widthMM + 3 + (c.labelDx || 0)) : (cx + (c.labelDx || 0));
        const ly = c.sym ? (cy + (c.labelDy || 0)) : (cy + Math.min(14, c.heightMM * 0.26) + (c.labelDy || 0));
        const lab = App.el('text', {
          x: lx, y: ly, 'text-anchor': c.sym ? 'start' : 'middle',
          'dominant-baseline': c.sym ? 'central' : null,
          'font-size': fit, fill: '#334155',
          'pointer-events': 'none', transform: vrotIf(vLabel, lx, ly)
        }, grp);
        lab.textContent = txt;
      }
      if (c.locked) lockBadge(grp, c.x + 1, c.y + 6);
      // 단자 점 (원형/사각형, 로컬 좌표 — 그룹 회전 적용됨) + 단자 번호
      App.terminals.local(c).forEach(function (t) {
        if (t.shape === 'rect') {
          App.el('rect', {
            x: t.x - t.w / 2, y: t.y - t.h / 2, width: t.w, height: t.h,
            fill: '#ffffff', stroke: color, 'stroke-width': 0.8,
            'data-comp': c.id, 'data-term': t.index
          }, grp);
        } else {
          App.el('circle', {
            cx: t.x, cy: t.y, r: (t.w || 3.6) / 2,
            fill: '#ffffff', stroke: color, 'stroke-width': 0.8,
            'data-comp': c.id, 'data-term': t.index
          }, grp);
        }
        if (t.name) {
          const pos = t.lp || (t.side === 'top' ? 'top' : 'bottom');
          const gw = (t.w || 3.6) / 2 + 1.6, gh = (t.h || 3.6) / 2 + 1.6;
          let a;
          if (pos === 'left') a = { x: t.x - gw, y: t.y, 'text-anchor': 'end', 'dominant-baseline': 'central' };
          else if (pos === 'right') a = { x: t.x + gw, y: t.y, 'text-anchor': 'start', 'dominant-baseline': 'central' };
          else if (pos === 'bottom') a = { x: t.x, y: t.y + gh, 'text-anchor': 'middle', 'dominant-baseline': 'hanging' };
          else a = { x: t.x, y: t.y - gh, 'text-anchor': 'middle' };
          a['font-size'] = 3.4 * F.term; a.fill = '#475569'; a['pointer-events'] = 'none';
          const tn = App.el('text', a, grp);
          tn.textContent = t.name;
        }
      });
    });
  }

  function renderWires(state) {
    const g = App.viewport.layers().wires;
    clear(g);
    const off = (App.ui && App.ui.spreadWires === false) ? null : App.wires.spreadOffsets(state);
    state.wires.forEach(function (w) {
      if (App.ui && App.ui.hiddenWirePresets && App.ui.hiddenWirePresets.has(w.preset || '')) return; // 레이어 숨김
      const pts = App.wires.displayRoute(state, w, off);
      if (!pts) return;
      const sel = isSelected(w.id);
      const grp = App.el('g', { 'data-id': w.id, 'data-kind': 'wires' }, g);
      const round = (App.ui && App.ui.wireRound) || 0;
      const dStr = round > 0 ? App.wires.roundedPath(pts, round) : null;
      let line;
      if (dStr) {
        // 클릭 영역 (투명 굵은 경로)
        App.el('path', { d: dStr, fill: 'none', stroke: 'transparent', 'stroke-width': 6 }, grp);
        line = App.el('path', {
          d: dStr, fill: 'none',
          stroke: sel ? '#111827' : (w.color || '#dc2626'),
          'stroke-width': (w.width || 1.2) + (sel ? 0.8 : 0),
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          'pointer-events': 'none'
        }, grp);
      } else {
        // 클릭 영역 (투명 굵은 선)
        App.el('polyline', {
          points: App.wires.pointsStr(pts), fill: 'none',
          stroke: 'transparent', 'stroke-width': 6
        }, grp);
        line = App.el('polyline', {
          points: App.wires.pointsStr(pts), fill: 'none',
          stroke: sel ? '#111827' : (w.color || '#dc2626'),
          'stroke-width': (w.width || 1.2) + (sel ? 0.8 : 0),
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          'pointer-events': 'none'
        }, grp);
      }
      // AC/DC 전원구분 + 흐름 애니메이션 대상 표시
      if (w.acdc) {
        line.setAttribute('data-acdc', w.acdc);
        if (App.ui && App.ui.flow) {
          line.style.strokeDasharray = (w.acdc === 'DC' ? '12 6' : '8 5');
        }
        // 정지 상태에서도 라인 중간에 AC/DC 뱃지 표시 (전원 표시 꺼짐이면 생략)
        const mp = (App.ui && App.ui.showAcdc === false) ? null : App.wires.midPoint(pts);
        if (mp) {
          const fMM = App.viewport.pxToMM(8);
          const bg = (w.acdc === 'DC') ? '#1d4ed8' : '#b45309';
          const pw = fMM * 2.4, ph = fMM * 1.5;
          App.el('rect', {
            x: mp.x - pw / 2, y: mp.y - ph / 2, width: pw, height: ph, rx: ph * 0.32,
            fill: bg, stroke: '#ffffff', 'stroke-width': fMM * 0.14, 'pointer-events': 'none'
          }, grp);
          const tb = App.el('text', {
            x: mp.x, y: mp.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-size': fMM, fill: '#ffffff', 'font-weight': 'bold', 'pointer-events': 'none'
          }, grp);
          tb.textContent = w.acdc;
        }
      }
      // 양 끝 라인번호 — 선에서 30mm 안쪽, 선에 정렬(마킹튜브), 흰 테두리로 가독성
      const ends = App.wires.endLabels(state, w, pts);
      if (ends && w.label && !w.hideTube) {
        const FW = fonts(state);
        const fontMM = FW.wireMM * FW.wire; // 도면(mm) 고정 — 선에 붙어 줌과 함께
        [['a', ends.a, w.lblA], ['b', ends.b, w.lblB]].forEach(function (pair) {
          const key = pair[0], e = pair[1], off = pair[2] || { dx: 0, dy: 0 };
          const x = e.x + off.dx, y = e.y + off.dy;
          const showNum = !App.ui || App.ui.showWireNum !== false; // 전체 번호 표시 토글
          // 실제 넘버링 튜브처럼: 선 위에 끼워진 흰 캡슐(둥근 사각) + 검정 글씨
          const tw = Math.max(fontMM * 1.6, String(w.label).length * fontMM * 0.62 + fontMM * 0.9); // 튜브 길이
          const th = fontMM * 1.45;                                                                  // 튜브 굵기
          if (showNum) {
            const tg = App.el('g', {
              transform: 'rotate(' + e.ang + ' ' + x + ' ' + y + ')', 'pointer-events': 'none'
            }, grp);
            App.el('rect', {
              x: x - tw / 2, y: y - th / 2, width: tw, height: th, rx: th * 0.42,
              fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': fontMM * 0.08
            }, tg);
            // 튜브 양 끝 살짝 어두운 단면(끼워진 느낌)
            App.el('rect', { x: x - tw / 2, y: y - th / 2, width: fontMM * 0.18, height: th, rx: fontMM * 0.09, fill: '#cbd5e1' }, tg);
            App.el('rect', { x: x + tw / 2 - fontMM * 0.18, y: y - th / 2, width: fontMM * 0.18, height: th, rx: fontMM * 0.09, fill: '#cbd5e1' }, tg);
            const t = App.el('text', {
              x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
              'font-size': fontMM, fill: '#111827', 'font-weight': 'bold', 'font-family': 'Consolas, monospace'
            }, tg);
            t.textContent = w.label;
          }

          // 행선지 튜브 — 번호 튜브 바로 뒤에 상대 부품 호기번호-단자 표시 (토글 가능)
          if (App.ui && App.ui.showDest !== false) {
            const other = state.components.find(function (c2) { return c2.id === (key === 'a' ? w.toComp : w.fromComp); });
            const oIdx = key === 'a' ? w.toTerm : w.fromTerm;
            let dest = '';
            if (other) {
              const tl = App.terminals.world(other);
              const tn = (tl[oIdx] && tl[oIdx].name != null && tl[oIdx].name !== '') ? tl[oIdx].name : oIdx;
              dest = (other.tag || other.label || other.partNo || '') + '-' + tn;
            }
            if (dest) {
              const tw2 = Math.max(fontMM * 1.6, String(dest).length * fontMM * 0.58 + fontMM * 0.9);
              const gap = fontMM * 0.25;
              const rad = e.ang * Math.PI / 180;
              // 번호 튜브가 꺼져 있으면 그 자리(라벨 위치)에 표시
              const half = showNum ? (tw / 2 + tw2 / 2 + gap) : 0;
              const dxo = Math.cos(rad) * half;
              const dyo = Math.sin(rad) * half;
              // 단자에서 더 먼 쪽(번호 튜브 "뒤")을 선택
              const termPt = key === 'a' ? pts[0] : pts[pts.length - 1];
              const cA = { x: x + dxo, y: y + dyo }, cB = { x: x - dxo, y: y - dyo };
              const dA = (cA.x - termPt.x) * (cA.x - termPt.x) + (cA.y - termPt.y) * (cA.y - termPt.y);
              const dB = (cB.x - termPt.x) * (cB.x - termPt.x) + (cB.y - termPt.y) * (cB.y - termPt.y);
              const c = dA >= dB ? cA : cB;
              const dg = App.el('g', {
                transform: 'rotate(' + e.ang + ' ' + c.x + ' ' + c.y + ')', 'pointer-events': 'none',
                'data-dest': '1'
              }, grp);
              App.el('rect', {
                x: c.x - tw2 / 2, y: c.y - th / 2, width: tw2, height: th, rx: th * 0.42,
                fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': fontMM * 0.08
              }, dg);
              const dt = App.el('text', {
                x: c.x, y: c.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
                'font-size': fontMM * 0.9, fill: '#1d4ed8', 'font-weight': 'bold', 'font-family': 'Consolas, monospace'
              }, dg);
              dt.textContent = dest;
            }
          }
        });
      }
      // 세그먼트 이동 핸들은 최상위(tophit) 레이어에서 그린다(겹친 선에 안 가리게)
    });
  }

  // 자유 텍스트(주석) — 선택/드래그/편집 가능
  function renderTexts(state) {
    const g = App.viewport.layers().texts;
    clear(g);
    (state.texts || []).forEach(function (t) {
      const sel = isSelected(t.id);
      const e = App.el('text', {
        x: t.x, y: t.y, 'font-size': t.size || 8,
        fill: sel ? '#2563eb' : (t.color || '#0f172a'),
        'font-weight': t.bold ? 'bold' : null,
        'data-id': t.id, 'data-kind': 'texts', style: 'cursor:move'
      }, g);
      e.textContent = t.text || '';
    });
  }

  function renderOverlay(state) {
    const g = App.viewport.layers().overlay;
    clear(g);
    if (!App.ui || !App.ui.selected) return;
    const handle = App.viewport.pxToMM(4);
    App.ui.selected.forEach(function (id) {
      const found = App.store.findById(id);
      if (!found) return;
      const b = App.geom.bounds(found.kind, found.item);
      App.el('rect', {
        x: b.x - handle, y: b.y - handle,
        width: b.w + handle * 2, height: b.h + handle * 2,
        fill: 'none', stroke: '#2563eb', 'stroke-width': App.viewport.pxToMM(1.5),
        'stroke-dasharray': App.viewport.pxToMM(4) + ' ' + App.viewport.pxToMM(3)
      }, g);
    });
  }

  function arrow(grp, x, y, dirx, diry, sizeMM, color) {
    const s = sizeMM, a = 0.42;
    const bx = x + dirx * s, by = y + diry * s;
    const px = -diry, py = dirx;
    App.el('path', {
      d: 'M ' + x + ' ' + y + ' L ' + (bx + px * a * s) + ' ' + (by + py * a * s) +
         ' L ' + (bx - px * a * s) + ' ' + (by - py * a * s) + ' Z',
      fill: color, stroke: color, 'stroke-width': sizeMM * 0.1, 'pointer-events': 'none'
    }, grp);
  }

  function renderDims(state) {
    const g = App.viewport.layers().dims;
    clear(g);
    // 센터선(중심선) — 일점쇄선. 두 점 클릭으로 생성, 드래그로 이동
    (state.clines || []).forEach(function (cl) {
      const sel = isSelected(cl.id);
      const grp = App.el('g', { 'data-id': cl.id, 'data-kind': 'clines', style: 'cursor:move' }, g);
      App.el('line', { x1: cl.x1, y1: cl.y1, x2: cl.x2, y2: cl.y2, stroke: 'transparent', 'stroke-width': App.viewport.pxToMM(8) }, grp); // 클릭 영역
      App.el('line', {
        x1: cl.x1, y1: cl.y1, x2: cl.x2, y2: cl.y2,
        stroke: sel ? '#0ea5e9' : '#dc2626', 'stroke-width': App.viewport.pxToMM(sel ? 1.4 : 1),
        'stroke-dasharray': '12 3 3 3', 'pointer-events': 'none'
      }, grp);
    });
    const FD = fonts(state);
    const fontMM = FD.dimMM * FD.dim;   // 도면(mm) 고정 — 줌과 함께 스케일(넘버링 튜브와 동일 방식)
    const lw = App.viewport.pxToMM(1);
    state.dimensions.forEach(function (dim) {
      const m = App.dims.geom(dim);
      const sel = isSelected(dim.id);
      const col = sel ? '#0ea5e9' : '#7c3aed';
      const grp = App.el('g', { 'data-id': dim.id, 'data-kind': 'dimensions' }, g);
      const ux = (m.a2.x - m.a1.x) / m.L, uy = (m.a2.y - m.a1.y) / m.L; // 선 방향 단위
      // 클릭 영역
      App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: m.a2.x, y2: m.a2.y, stroke: 'transparent', 'stroke-width': App.viewport.pxToMM(8) }, grp);
      // 연장선 (측정점 → 치수선, 약간 연장) — 보조선 간격(extGap)만큼 측정점에서 띄움
      const ex = m.nx * fontMM * 0.4, ey = m.ny * fontMM * 0.4;
      const sOff = (dim.off || 0) >= 0 ? 1 : -1;
      const eg = (dim.extGap != null ? dim.extGap : 0) * sOff;
      const egx = m.nx * eg, egy = m.ny * eg;
      App.el('line', { x1: m.p1.x + egx, y1: m.p1.y + egy, x2: m.a1.x + ex, y2: m.a1.y + ey, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      App.el('line', { x1: m.p2.x + egx, y1: m.p2.y + egy, x2: m.a2.x + ex, y2: m.a2.y + ey, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      const label = String(App.dims.length(dim));
      const tpos = dim.textPos || 'mid';
      let tcx = m.mid.x, tcy = m.mid.y;
      if (tpos === 'mid') {
        // 치수선 — 가운데 글자 자리만큼 끊어서(걸리게) 두 토막
        const half = (label.length * fontMM * 0.32) + fontMM * 0.35; // 글자 폭 절반
        const gS = { x: m.mid.x - ux * half, y: m.mid.y - uy * half };
        const gE = { x: m.mid.x + ux * half, y: m.mid.y + uy * half };
        App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: gS.x, y2: gS.y, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
        App.el('line', { x1: gE.x, y1: gE.y, x2: m.a2.x, y2: m.a2.y, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      } else {
        // 문자 선 위/아래 — 치수선은 끊지 않고 한 줄, 글자를 법선 방향으로 띄움
        App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: m.a2.x, y2: m.a2.y, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
        // '위' = 화면에서 위쪽(수직 치수는 왼쪽) 이 되도록 법선 부호 선택
        let s2 = 1;
        if (Math.abs(m.ny) > 0.01) s2 = (m.ny < 0) ? 1 : -1;
        else s2 = (m.nx < 0) ? 1 : -1;
        if (tpos === 'dn') s2 = -s2;
        const td = fontMM * 0.95 + (dim.textOff || 0);
        tcx = m.mid.x + m.nx * s2 * td;
        tcy = m.mid.y + m.ny * s2 * td;
      }
      // 화살표 (안쪽)
      arrow(grp, m.a1.x, m.a1.y, ux, uy, fontMM * 0.55, col);
      arrow(grp, m.a2.x, m.a2.y, -ux, -uy, fontMM * 0.55, col);
      // 치수 텍스트 — 선과 정렬(수평/수직 모두 바로 읽히게)
      const tx = App.el('text', {
        x: tcx, y: tcy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': fontMM, fill: col, 'font-weight': 'bold', 'pointer-events': 'none',
        transform: 'rotate(' + m.textAng + ' ' + tcx + ' ' + tcy + ')'
      }, grp);
      tx.textContent = label;
      if (sel) {
        const hs = App.viewport.pxToMM(5);
        App.el('rect', {
          x: m.mid.x - hs, y: m.mid.y - hs, width: hs * 2, height: hs * 2, rx: hs * 0.4,
          fill: '#fff', stroke: '#0ea5e9', 'stroke-width': App.viewport.pxToMM(1.5),
          'data-dim': dim.id, style: 'cursor:move'
        }, grp);
      }
    });
  }

  Render.all = function (state) {
    state = state || App.store.get();
    if (App.wires && App.wires.beginRouteCache) App.wires.beginRouteCache(); // 배선 경로 1회 계산
    try {
      renderPanel(state);
      renderDucts(state);
      renderRails(state);
      renderComponents(state);
      renderWires(state);
      renderDims(state);
      renderTexts(state);
      renderOverlay(state);
      renderTopHandles(state);
    } finally {
      if (App.wires && App.wires.endRouteCache) App.wires.endRouteCache();
    }
    if (App.minimap) App.minimap.update(state); // 뷰포트 표시 동기화
  };

  // 선택된 항목의 라벨 위에 최상위 드래그 핸들(투명) — 선/도형 위에서도 잡히게
  function renderTopHandles(state) {
    const g = App.viewport.layers().tophit;
    clear(g);
    const F = fonts(state);
    function rotPt(x, y, cx, cy, deg) {
      if (!deg) return { x: x, y: y };
      const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      const dx = x - cx, dy = y - cy;
      return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
    }
    state.components.forEach(function (c) {
      if (!isSelected(c.id)) return;
      const cx = c.x + c.widthMM / 2, cy = c.y + c.heightMM / 2;
      const lx = c.sym ? (c.x + c.widthMM + 3 + (c.labelDx || 0)) : (cx + (c.labelDx || 0));
      const ly = c.sym ? (cy + (c.labelDy || 0)) : (cy + Math.min(14, c.heightMM * 0.26) + (c.labelDy || 0));
      const p = rotPt(lx, ly, cx, cy, c.rotation || 0);
      if (state.panel.showNames !== false) { // 품명 숨김 시 드래그 핸들도 생략
        const txt = c.sym ? (c.label || c.partName || c.partNo || '')
          : ((c.label && c.label !== c.partName) ? c.label : (c.partNo || c.partName || ''));
        const fit = LABEL_BASE * F.cname;
        const hw = Math.max(8, txt.length * fit * 0.6), hh = fit * 1.6;
        App.el('rect', { x: p.x - hw / 2, y: p.y - hh / 2, width: hw, height: hh, fill: 'transparent', 'pointer-events': 'all', 'data-labelfor': c.id, style: 'cursor:move' }, g);
      }
      // 호기번호(tag) 핸들 — 가운데(유형과 자리 교체)
      if (c.tag) {
        const tf = Math.min(12, c.heightMM * 0.22) * F.ctag;
        const tlx = cx + (c.tagDx || 0), tly = cy - 2 + (c.tagDy || 0);
        const tp = rotPt(tlx, tly, cx, cy, c.rotation || 0);
        const thw = Math.max(7, String(c.tag).length * tf * 0.6), thh = tf * 1.6;
        App.el('rect', { x: tp.x - thw / 2, y: tp.y - thh / 2, width: thw, height: thh, fill: 'transparent', 'pointer-events': 'all', 'data-tagfor': c.id, style: 'cursor:move' }, g);
      }
      // 타입 배지 핸들 — 상단 (표시 중일 때만)
      if (state.panel.showTypes !== false) {
        const bf = Math.min(8, c.heightMM * 0.14) * F.ctype;
        const blx = cx + (c.typeDx || 0), bly = c.y + Math.min(8, c.heightMM * 0.12) + (c.typeDy || 0);
        const bp = rotPt(blx, bly, cx, cy, c.rotation || 0);
        const bhw = Math.max(8, String(c.type || '').length * bf * 0.6), bhh = bf * 1.6;
        App.el('rect', { x: bp.x - bhw / 2, y: bp.y - bhh / 2, width: bhw, height: bhh, fill: 'transparent', 'pointer-events': 'all', 'data-typefor': c.id, style: 'cursor:move' }, g);
      }
    });
    // 덕트/레일 끝 리사이즈 핸들 — 선택 시 양 끝을 드래그해 길이 조절
    ['ducts', 'rails'].forEach(function (rk) {
      state[rk].forEach(function (d) {
        if (!isSelected(d.id) || d.locked) return;
        const hs = App.viewport.pxToMM(5);
        const w = d.orient === 'h' ? d.lengthMM : (d.widthMM || 35);
        const h = d.orient === 'h' ? (d.widthMM || 35) : d.lengthMM;
        const pts = d.orient === 'h'
          ? [{ e: 'start', x: d.x, y: d.y + h / 2 }, { e: 'end', x: d.x + w, y: d.y + h / 2 }]
          : [{ e: 'start', x: d.x + w / 2, y: d.y }, { e: 'end', x: d.x + w / 2, y: d.y + h }];
        pts.forEach(function (pt) {
          App.el('rect', {
            x: pt.x - hs, y: pt.y - hs, width: hs * 2, height: hs * 2, rx: hs * 0.4,
            fill: '#fff', stroke: '#f59e0b', 'stroke-width': App.viewport.pxToMM(1.5), 'pointer-events': 'all',
            'data-dresize': pt.e, 'data-dtarget': d.id,
            style: 'cursor:' + (d.orient === 'h' ? 'ew-resize' : 'ns-resize')
          }, g);
        });
      });
    });
    // 제목(타이틀) 이동 핸들
    const p = state.panel;
    if (p.title) {
      const tx = p.widthMM / 2 + (p.titleDx || 0), ty = -34 + (p.titleDy || 0);
      const hw = Math.max(20, String(p.title).length * 26 * 0.6), hh = 26 * 1.4;
      App.el('rect', { x: tx - hw / 2, y: ty - hh / 2, width: hw, height: hh, fill: 'transparent', 'pointer-events': 'all', 'data-titlemove': '1', style: 'cursor:move' }, g);
    }
    const woff = (App.ui && App.ui.spreadWires === false) ? null : App.wires.spreadOffsets(state);
    state.wires.forEach(function (w) {
      if (!isSelected(w.id)) return;
      if (App.ui && App.ui.hiddenWirePresets && App.ui.hiddenWirePresets.has(w.preset || '')) return; // 레이어 숨김
      // 세그먼트 이동 핸들 — 최상위 레이어라 겹친 선에 가려지지 않음
      const hs = App.viewport.pxToMM(5);
      App.wires.editSegments(state, w).forEach(function (s) {
        App.el('rect', {
          x: s.mid.x - hs, y: s.mid.y - hs, width: hs * 2, height: hs * 2, rx: hs * 0.4,
          fill: '#fff', stroke: '#2563eb', 'stroke-width': App.viewport.pxToMM(1.5), 'pointer-events': 'all',
          'data-wire': w.id, 'data-seg': s.i, 'data-orient': s.orient,
          'data-pterm': s.pTerm ? '1' : '0', 'data-qterm': s.qTerm ? '1' : '0',
          style: 'cursor:' + (s.orient === 'H' ? 'ns-resize' : 'ew-resize')
        }, g);
      });
      // 끝점(단자) 핸들 — 드래그해서 다른 단자로 연결 변경
      const RR = App.wires.route(state, w);
      if (RR && RR.length) {
        [['a', RR[0]], ['b', RR[RR.length - 1]]].forEach(function (pr) {
          App.el('circle', {
            cx: pr[1].x, cy: pr[1].y, r: App.viewport.pxToMM(6),
            fill: 'transparent', stroke: '#f59e0b', 'stroke-width': App.viewport.pxToMM(1.4),
            'pointer-events': 'all', 'data-wend': pr[0], 'data-wire': w.id, style: 'cursor:grab'
          }, g);
        });
      }
      // 양 끝 라인번호 이동 핸들
      if (!w.label) return;
      const wpts = App.wires.displayRoute(state, w, woff);
      const ends = App.wires.endLabels(state, w, wpts); if (!ends) return;
      const fontMM = F.wireMM * F.wire; // 도면(mm) 고정
      [['a', ends.a, w.lblA], ['b', ends.b, w.lblB]].forEach(function (pair) {
        const e = pair[1], off = pair[2] || { dx: 0, dy: 0 };
        const hw = Math.max(6, String(w.label).length * fontMM * 0.7), hh = fontMM * 1.5;
        App.el('rect', { x: e.x + off.dx - hw / 2, y: e.y + off.dy - hh / 2, width: hw, height: hh, fill: 'transparent', 'pointer-events': 'all', 'data-wirelabel': w.id, 'data-end': pair[0], style: 'cursor:move' }, g);
      });
    });
  }

  // 스마트 정렬 가이드선(드래그 중) — 분홍 점선, 전장 범위 관통
  Render.guides = function (lines) {
    const g = App.viewport.layers().overlay;
    let grp = g.querySelector('#smart-guides');
    if (grp) grp.remove();
    if (!lines || !lines.length) return;
    grp = App.el('g', { id: 'smart-guides', 'pointer-events': 'none' }, g);
    const p = App.store.get().panel;
    const lw = App.viewport.pxToMM(1);
    const dash = App.viewport.pxToMM(5) + ' ' + App.viewport.pxToMM(3);
    lines.forEach(function (l) {
      if (l.x != null) {
        App.el('line', { x1: l.x, y1: -30, x2: l.x, y2: p.heightMM + 30, stroke: '#ec4899', 'stroke-width': lw, 'stroke-dasharray': dash }, grp);
      } else {
        App.el('line', { x1: -30, y1: l.y, x2: p.widthMM + 30, y2: l.y, stroke: '#ec4899', 'stroke-width': lw, 'stroke-dasharray': dash }, grp);
      }
    });
  };

  // 미리보기(드래그 중 새 엔티티) 그리기 — overlay 사용
  Render.preview = function (rectMM) {
    const g = App.viewport.layers().overlay;
    let pv = g.querySelector('#preview');
    if (!rectMM) { if (pv) pv.remove(); return; }
    if (!pv) { pv = App.el('rect', { id: 'preview' }, g); }
    pv.setAttribute('x', rectMM.x);
    pv.setAttribute('y', rectMM.y);
    pv.setAttribute('width', Math.max(0, rectMM.w));
    pv.setAttribute('height', Math.max(0, rectMM.h));
    pv.setAttribute('fill', '#3b82f6');
    pv.setAttribute('fill-opacity', '0.2');
    pv.setAttribute('stroke', '#2563eb');
    pv.setAttribute('stroke-width', App.viewport.pxToMM(1.2));
  };

  // 와이어 그리는 중 미리보기 (고무줄)
  Render.wirePreview = function (pts) {
    const g = App.viewport.layers().overlay;
    let pv = g.querySelector('#wire-preview');
    if (!pts) { if (pv) pv.remove(); return; }
    if (!pv) { pv = App.el('polyline', { id: 'wire-preview' }, g); }
    pv.setAttribute('points', pts.map(function (p) { return p.x + ',' + p.y; }).join(' '));
    pv.setAttribute('fill', 'none');
    pv.setAttribute('stroke', '#dc2626');
    pv.setAttribute('stroke-width', App.viewport.pxToMM(1.5));
    pv.setAttribute('stroke-dasharray', App.viewport.pxToMM(4) + ' ' + App.viewport.pxToMM(3));
  };

  // 영역(마퀴) 선택 박스
  Render.marquee = function (rectMM) {
    const g = App.viewport.layers().overlay;
    let m = g.querySelector('#marquee');
    if (!rectMM) { if (m) m.remove(); return; }
    if (!m) { m = App.el('rect', { id: 'marquee' }, g); }
    m.setAttribute('x', rectMM.x);
    m.setAttribute('y', rectMM.y);
    m.setAttribute('width', Math.max(0, rectMM.w));
    m.setAttribute('height', Math.max(0, rectMM.h));
    m.setAttribute('fill', '#3b82f6');
    m.setAttribute('fill-opacity', '0.08');
    m.setAttribute('stroke', '#3b82f6');
    m.setAttribute('stroke-width', App.viewport.pxToMM(1));
    m.setAttribute('stroke-dasharray', App.viewport.pxToMM(3) + ' ' + App.viewport.pxToMM(2));
  };

  // 스냅 점 표시 (치수 도구)
  Render.snapMarker = function (pt) {
    const g = App.viewport.layers().overlay;
    let s = g.querySelector('#snap-marker');
    if (!pt) { if (s) s.remove(); return; }
    const r = App.viewport.pxToMM(4);
    if (!s) { s = App.el('path', { id: 'snap-marker' }, g); }
    s.setAttribute('d', 'M ' + (pt.x - r) + ' ' + (pt.y - r) + ' L ' + (pt.x + r) + ' ' + (pt.y + r) +
      ' M ' + (pt.x - r) + ' ' + (pt.y + r) + ' L ' + (pt.x + r) + ' ' + (pt.y - r));
    s.setAttribute('stroke', pt.snapped ? '#16a34a' : '#94a3b8');
    s.setAttribute('stroke-width', App.viewport.pxToMM(1.5));
    s.setAttribute('fill', 'none');
  };

  // 치수 미리보기 (그리는 중)
  // 센터선 미리보기 (첫 점 클릭 후)
  Render.clinePreview = function (l) {
    const g = App.viewport.layers().overlay;
    let p = g.querySelector('#cline-preview');
    if (!l) { if (p) p.remove(); return; }
    if (!p) p = App.el('line', { id: 'cline-preview' }, g);
    p.setAttribute('x1', l.x1); p.setAttribute('y1', l.y1);
    p.setAttribute('x2', l.x2); p.setAttribute('y2', l.y2);
    p.setAttribute('stroke', '#dc2626');
    p.setAttribute('stroke-width', App.viewport.pxToMM(1));
    p.setAttribute('stroke-dasharray', '12 3 3 3');
  };

  Render.dimPreview = function (dim) {
    const g = App.viewport.layers().overlay;
    let p = g.querySelector('#dim-preview');
    if (!dim) { if (p) p.remove(); return; }
    if (p) p.remove();
    p = App.el('g', { id: 'dim-preview' }, g);
    const m = App.dims.geom(dim);
    App.el('line', { x1: m.p1.x, y1: m.p1.y, x2: m.a1.x, y2: m.a1.y, stroke: '#7c3aed', 'stroke-width': 0.4, 'stroke-dasharray': '2 1' }, p);
    App.el('line', { x1: m.p2.x, y1: m.p2.y, x2: m.a2.x, y2: m.a2.y, stroke: '#7c3aed', 'stroke-width': 0.4, 'stroke-dasharray': '2 1' }, p);
    App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: m.a2.x, y2: m.a2.y, stroke: '#7c3aed', 'stroke-width': App.viewport.pxToMM(1) }, p);
    const FP = fonts(App.store.get());
    const fontMM = FP.dimMM * FP.dim; // 실제 치수와 같은 mm 고정 크기
    const t = App.el('text', {
      x: m.mid.x, y: m.mid.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': fontMM, fill: '#7c3aed', 'font-weight': 'bold',
      transform: 'rotate(' + m.textAng + ' ' + m.mid.x + ' ' + m.mid.y + ')'
    }, p);
    t.textContent = App.dims.length(dim);
  };

  // ── 전류 흐름 애니메이션 (AC=교류 맥동, DC=한 방향 정속) ──────────────
  let flowRAF = null, flowT0 = 0;
  function flowTick() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    const t = (now - flowT0) / 1000;
    const g = App.viewport.layers().wires;
    const lines = g.querySelectorAll('[data-acdc]');
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i], kind = p.getAttribute('data-acdc');
      let off;
      if (kind === 'DC') {
        off = -(t * 30) % 18;                       // 한 방향 연속 흐름
      } else {
        off = -(t * 26) + 6 * Math.sin(t * 6);      // 흐르되 맥동(교류 느낌)
      }
      p.style.strokeDashoffset = off;
    }
    flowRAF = requestAnimationFrame(flowTick);
  }
  function clearFlow() {
    const g = App.viewport.layers().wires;
    const lines = g.querySelectorAll('[data-acdc]');
    for (let i = 0; i < lines.length; i++) { lines[i].style.strokeDasharray = ''; lines[i].style.strokeDashoffset = ''; }
  }
  Render.setFlow = function (on) {
    App.ui.flow = !!on;
    Render.all();                                   // 점선 패턴 적용/제거
    if (on) {
      if (!flowRAF && typeof requestAnimationFrame === 'function') {
        flowT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
        flowTick();
      }
    } else {
      if (flowRAF) { cancelAnimationFrame(flowRAF); flowRAF = null; }
      clearFlow();
    }
  };
  Render.isFlowing = function () { return !!flowRAF; };
})(window);
