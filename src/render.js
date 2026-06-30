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
      term: f.term || 1, wire: f.wire || 1, dim: f.dim || 1
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
    });
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

  function renderComponents(state) {
    const g = App.viewport.layers().components;
    clear(g);
    const overlaps = overlappingIds(state);
    const F = fonts(state);
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
      App.el('rect', {
        x: c.x, y: c.y, width: c.widthMM, height: c.heightMM,
        rx: 2, fill: over ? '#ef4444' : color, 'fill-opacity': over ? 0.22 : 0.16,
        stroke: over ? '#dc2626' : (isSelected(c.id) ? '#111827' : color),
        'stroke-width': isSelected(c.id) || over ? 2 : 1.2,
        'stroke-dasharray': over ? '4 2' : null
      }, grp);
      // 글자 방향(가로/세로) — true면 텍스트를 -90° 회전(각 앵커 기준)
      const vert = !!c.textVert;
      function vrot(x, y) { return vert ? ('rotate(-90 ' + x + ' ' + y + ')') : null; }
      // 호기번호(tag) — 입력 시 상단에 작게
      if (c.tag) {
        const tx = cx + (c.tagDx || 0), ty = c.y + Math.min(8, c.heightMM * 0.12) + (c.tagDy || 0);
        const tg = App.el('text', {
          x: tx, y: ty, 'text-anchor': 'middle',
          'font-size': Math.min(8, c.heightMM * 0.14) * F.ctag, fill: '#111827',
          'font-weight': 'bold', 'pointer-events': 'none', transform: vrot(tx, ty)
        }, grp);
        tg.textContent = c.tag;
      }
      // 타입 배지(카테고리) — 위치 이동 가능
      const bx = cx + (c.typeDx || 0), by = cy - 2 + (c.typeDy || 0);
      const badge = App.el('text', {
        x: bx, y: by, 'text-anchor': 'middle',
        'font-size': Math.min(12, c.heightMM * 0.22) * F.ctype, fill: color,
        'font-weight': 'bold', 'pointer-events': 'none', transform: vrot(bx, by)
      }, grp);
      badge.textContent = c.type || '';
      // 품명 — 기본 크기 × 배율, 선택 시 드래그로 위치 이동
      const txt = c.label || c.partName || c.partNo || '';
      const fit = LABEL_BASE * F.cname;
      const lx = cx + (c.labelDx || 0), ly = cy + Math.min(14, c.heightMM * 0.26) + (c.labelDy || 0);
      const lab = App.el('text', {
        x: lx, y: ly, 'text-anchor': 'middle', 'font-size': fit, fill: '#334155',
        'pointer-events': 'none', transform: vrot(lx, ly)
      }, grp);
      lab.textContent = txt;
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
        // 정지 상태에서도 라인 중간에 AC/DC 뱃지 표시
        const mp = App.wires.midPoint(pts);
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
      if (ends && w.label) {
        const fontMM = App.viewport.pxToMM(11) * fonts(state).wire;
        [['a', ends.a, w.lblA], ['b', ends.b, w.lblB]].forEach(function (pair) {
          const key = pair[0], e = pair[1], off = pair[2] || { dx: 0, dy: 0 };
          const x = e.x + off.dx, y = e.y + off.dy;
          const t = App.el('text', {
            x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-size': fontMM, fill: '#b91c1c', 'font-weight': 'bold', 'pointer-events': 'none',
            stroke: '#ffffff', 'stroke-width': fontMM * 0.22, 'paint-order': 'stroke',
            transform: 'rotate(' + e.ang + ' ' + x + ' ' + y + ')'
          }, grp);
          t.textContent = w.label;
        });
      }
      // 세그먼트 이동 핸들은 최상위(tophit) 레이어에서 그린다(겹친 선에 안 가리게)
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
    const fontMM = App.viewport.pxToMM(13) * fonts(state).dim;   // 화면 기준 일정 크기 × 배율
    const lw = App.viewport.pxToMM(1);
    state.dimensions.forEach(function (dim) {
      const m = App.dims.geom(dim);
      const sel = isSelected(dim.id);
      const col = sel ? '#0ea5e9' : '#7c3aed';
      const grp = App.el('g', { 'data-id': dim.id, 'data-kind': 'dimensions' }, g);
      const ux = (m.a2.x - m.a1.x) / m.L, uy = (m.a2.y - m.a1.y) / m.L; // 선 방향 단위
      // 클릭 영역
      App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: m.a2.x, y2: m.a2.y, stroke: 'transparent', 'stroke-width': App.viewport.pxToMM(8) }, grp);
      // 연장선 (측정점 → 치수선, 약간 연장)
      const ex = m.nx * fontMM * 0.4, ey = m.ny * fontMM * 0.4;
      App.el('line', { x1: m.p1.x, y1: m.p1.y, x2: m.a1.x + ex, y2: m.a1.y + ey, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      App.el('line', { x1: m.p2.x, y1: m.p2.y, x2: m.a2.x + ex, y2: m.a2.y + ey, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      // 치수선 — 가운데 글자 자리만큼 끊어서(걸리게) 두 토막
      const label = String(App.dims.length(dim));
      const half = (label.length * fontMM * 0.32) + fontMM * 0.35; // 글자 폭 절반
      const gS = { x: m.mid.x - ux * half, y: m.mid.y - uy * half };
      const gE = { x: m.mid.x + ux * half, y: m.mid.y + uy * half };
      App.el('line', { x1: m.a1.x, y1: m.a1.y, x2: gS.x, y2: gS.y, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      App.el('line', { x1: gE.x, y1: gE.y, x2: m.a2.x, y2: m.a2.y, stroke: col, 'stroke-width': lw, 'pointer-events': 'none' }, grp);
      // 화살표 (안쪽)
      arrow(grp, m.a1.x, m.a1.y, ux, uy, fontMM * 0.55, col);
      arrow(grp, m.a2.x, m.a2.y, -ux, -uy, fontMM * 0.55, col);
      // 치수 텍스트 — 선 가운데, 선과 정렬(수평/수직 모두 바로 읽히게)
      const tx = App.el('text', {
        x: m.mid.x, y: m.mid.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': fontMM, fill: col, 'font-weight': 'bold', 'pointer-events': 'none',
        transform: 'rotate(' + m.textAng + ' ' + m.mid.x + ' ' + m.mid.y + ')'
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
    renderPanel(state);
    renderDucts(state);
    renderRails(state);
    renderComponents(state);
    renderWires(state);
    renderDims(state);
    renderOverlay(state);
    renderTopHandles(state);
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
      const lx = cx + (c.labelDx || 0), ly = cy + Math.min(14, c.heightMM * 0.26) + (c.labelDy || 0);
      const p = rotPt(lx, ly, cx, cy, c.rotation || 0);
      const txt = c.label || c.partName || c.partNo || '';
      const fit = LABEL_BASE * F.cname;
      const hw = Math.max(8, txt.length * fit * 0.6), hh = fit * 1.6;
      App.el('rect', { x: p.x - hw / 2, y: p.y - hh / 2, width: hw, height: hh, fill: 'transparent', 'pointer-events': 'all', 'data-labelfor': c.id, style: 'cursor:move' }, g);
      // 호기번호(tag) 핸들
      if (c.tag) {
        const tf = Math.min(8, c.heightMM * 0.14) * F.ctag;
        const tlx = cx + (c.tagDx || 0), tly = c.y + Math.min(8, c.heightMM * 0.12) + (c.tagDy || 0);
        const tp = rotPt(tlx, tly, cx, cy, c.rotation || 0);
        const thw = Math.max(7, String(c.tag).length * tf * 0.6), thh = tf * 1.6;
        App.el('rect', { x: tp.x - thw / 2, y: tp.y - thh / 2, width: thw, height: thh, fill: 'transparent', 'pointer-events': 'all', 'data-tagfor': c.id, style: 'cursor:move' }, g);
      }
      // 타입 배지 핸들
      const bf = Math.min(12, c.heightMM * 0.22) * F.ctype;
      const blx = cx + (c.typeDx || 0), bly = cy - 2 + (c.typeDy || 0);
      const bp = rotPt(blx, bly, cx, cy, c.rotation || 0);
      const bhw = Math.max(8, String(c.type || '').length * bf * 0.6), bhh = bf * 1.6;
      App.el('rect', { x: bp.x - bhw / 2, y: bp.y - bhh / 2, width: bhw, height: bhh, fill: 'transparent', 'pointer-events': 'all', 'data-typefor': c.id, style: 'cursor:move' }, g);
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
      // 양 끝 라인번호 이동 핸들
      if (!w.label) return;
      const wpts = App.wires.displayRoute(state, w, woff);
      const ends = App.wires.endLabels(state, w, wpts); if (!ends) return;
      const fontMM = App.viewport.pxToMM(11) * F.wire;
      [['a', ends.a, w.lblA], ['b', ends.b, w.lblB]].forEach(function (pair) {
        const e = pair[1], off = pair[2] || { dx: 0, dy: 0 };
        const hw = Math.max(6, String(w.label).length * fontMM * 0.7), hh = fontMM * 1.5;
        App.el('rect', { x: e.x + off.dx - hw / 2, y: e.y + off.dy - hh / 2, width: hw, height: hh, fill: 'transparent', 'pointer-events': 'all', 'data-wirelabel': w.id, 'data-end': pair[0], style: 'cursor:move' }, g);
      });
    });
  }

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
    const fontMM = App.viewport.pxToMM(13);
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
