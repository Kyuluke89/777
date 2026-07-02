/* 출력 — BOM CSV, 배선표 CSV, PNG 이미지, 인쇄(PDF) */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Ex = (App.exporter = {});

  function download(filename, text, mime) {
    const blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  Ex.download = download;

  function csvCell(v) {
    v = v == null ? '' : String(v);
    if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  function toCsv(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  function baseName(state) {
    const base = (state.panel && state.panel.title) || state.name || 'panel';
    return String(base).replace(/[^\w가-힣\-]+/g, '_');
  }

  // 부품 BOM 행 (테스트 가능)
  Ex.bomRows = function (state) {
    state = state || App.store.get();
    const map = {};
    state.components.forEach(function (c) {
      const k = c.partNo || '(미지정)';
      if (!map[k]) map[k] = { partNo: k, name: c.partName || c.label || '', type: c.type || '', w: c.widthMM, h: c.heightMM, qty: 0, tags: [] };
      map[k].qty += 1;
      if (c.tag) map[k].tags.push(c.tag);
    });
    const rows = [['부품번호', '품명', '타입', '수량', '가로(mm)', '세로(mm)', '호기번호']];
    Object.keys(map).sort().forEach(function (k) {
      const r = map[k];
      rows.push([r.partNo, r.name, r.type, r.qty, r.w, r.h, r.tags.join(' ')]);
    });
    return rows;
  };

  // 배선표 행 (테스트 가능)
  Ex.wiringRows = function (state) {
    state = state || App.store.get();
    function label(id) {
      const c = state.components.find(function (x) { return x.id === id; });
      return (c && (c.label || c.partNo)) || '?';
    }
    const rows = [['라인번호', '시작부품', '시작단자', '끝부품', '끝단자', '길이(mm)', 'SQ', 'AWG', '전원', '색상']];
    let total = 0;
    state.wires.slice().sort(function (a, b) {
      return String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric: true });
    }).forEach(function (w) {
      const len = App.wires.length(state, w);
      total += len;
      rows.push([w.label, label(w.fromComp), w.fromTerm, label(w.toComp), w.toTerm, len, w.sq || '', w.awg || '', w.acdc || '', w.color || '']);
    });
    rows.push(['합계', '', '', '', '', total, '', '', '', '']);
    return rows;
  };

  // 부품 BOM — partNo 기준 집계 → CSV
  Ex.bom = function (state) {
    state = state || App.store.get();
    const rows = Ex.bomRows(state);
    download(baseName(state) + '_BOM.csv', toCsv(rows));
    return rows.length - 1;
  };

  // 배선표 → CSV
  Ex.wiringList = function (state) {
    state = state || App.store.get();
    const rows = Ex.wiringRows(state);
    download(baseName(state) + '_배선표.csv', toCsv(rows));
    return rows.length - 1;
  };

  // SVG → PNG
  Ex.png = function (scale) {
    scale = scale || 2;
    const state = App.store.get();
    const src = App.viewport.svg();
    const vb = App.viewport.getViewBox();
    const clone = src.cloneNode(true);
    // overlay(선택 핸들 등) 제거
    const ov = clone.querySelector('#layer-overlay');
    if (ov) ov.remove();
    clone.setAttribute('width', Math.round(vb.w * scale));
    clone.setAttribute('height', Math.round(vb.h * scale));
    // 흰 배경
    const bg = document.createElementNS(App.SVGNS, 'rect');
    bg.setAttribute('x', vb.x); bg.setAttribute('y', vb.y);
    bg.setAttribute('width', vb.w); bg.setAttribute('height', vb.h);
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vb.w * scale);
      canvas.height = Math.round(vb.h * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = baseName(state) + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }, 'image/png');
    };
    img.onerror = function () { alert('PNG 변환 실패'); };
    img.src = svg64;
  };

  // 인쇄 (브라우저 인쇄 → PDF 저장 가능)
  Ex.print = function () { global.print(); };

  // ── DXF 내보내기 (R12 ASCII, mm) — AutoCAD 등 CAD 에서 열기 ─────────────
  // DXF 는 y 축이 위로 증가 → y' = -y 로 뒤집어 화면과 같은 모양으로 출력.
  Ex.dxfString = function (state) {
    state = state || App.store.get();
    const L = [];
    function push() { for (let i = 0; i < arguments.length; i++) L.push(arguments[i]); }
    function line(layer, x1, y1, x2, y2) {
      push(0, 'LINE', 8, layer, 10, x1, 20, -y1, 11, x2, 21, -y2);
    }
    function rect(layer, x, y, w, h) {
      line(layer, x, y, x + w, y);
      line(layer, x + w, y, x + w, y + h);
      line(layer, x + w, y + h, x, y + h);
      line(layer, x, y + h, x, y);
    }
    function circle(layer, cx, cy, r) {
      push(0, 'CIRCLE', 8, layer, 10, cx, 20, -cy, 40, r);
    }
    function text(layer, x, y, h, s) {
      if (s == null || s === '') return;
      push(0, 'TEXT', 8, layer, 10, x, 20, -y, 40, h, 1, String(s));
    }
    push(0, 'SECTION', 2, 'ENTITIES');
    const p = state.panel;
    rect('PANEL', 0, 0, p.widthMM, p.heightMM);
    if (p.title) text('TEXT', p.widthMM / 2, -14, 10, p.title);
    (state.ducts || []).forEach(function (d) {
      const w = d.orient === 'h' ? d.lengthMM : d.widthMM;
      const h = d.orient === 'h' ? d.widthMM : d.lengthMM;
      rect('DUCTS', d.x, d.y, w, h);
    });
    (state.rails || []).forEach(function (r) {
      const w = r.orient === 'h' ? r.lengthMM : (r.widthMM || 35);
      const h = r.orient === 'h' ? (r.widthMM || 35) : r.lengthMM;
      rect('RAILS', r.x, r.y, w, h);
      if (r.orient === 'h') line('RAILS', r.x, r.y + h / 2, r.x + w, r.y + h / 2);
      else line('RAILS', r.x + w / 2, r.y, r.x + w / 2, r.y + h);
    });
    (state.components || []).forEach(function (c) {
      // 90/270도 회전은 가로세로 스왑(중심 유지)
      const rot = ((c.rotation || 0) % 180 + 180) % 180;
      let bx = c.x, by = c.y, bw = c.widthMM, bh = c.heightMM;
      if (rot === 90) {
        const ccx = bx + bw / 2, ccy = by + bh / 2;
        bw = c.heightMM; bh = c.widthMM; bx = ccx - bw / 2; by = ccy - bh / 2;
      }
      rect('PARTS', bx, by, bw, bh);
      const cy = by + bh / 2;
      text('TEXT', bx + 2, cy, 4, c.label || c.partName || c.partNo || '');
      if (c.tag) text('TEXT', bx + 2, by + 7, 4, c.tag);
      App.terminals.world(c).forEach(function (t) {
        circle('TERMS', t.x, t.y, (t.w || 3.6) / 2);
        if (t.name) text('TERMS', t.x + 2.4, t.y - 2.4, 2.5, t.name);
      });
    });
    (state.wires || []).forEach(function (w) {
      const pts = App.wires.route(state, w);
      if (!pts) return;
      for (let i = 0; i < pts.length - 1; i++) line('WIRES', pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (w.label) {
        const ends = App.wires.endLabels(state, w);
        if (ends) { text('WIRES', ends.a.x, ends.a.y - 2, 3.5, w.label); text('WIRES', ends.b.x, ends.b.y - 2, 3.5, w.label); }
      }
    });
    (state.dimensions || []).forEach(function (m) {
      const g = App.dims.geom(m);
      line('DIMS', g.p1.x, g.p1.y, g.a1.x, g.a1.y);
      line('DIMS', g.p2.x, g.p2.y, g.a2.x, g.a2.y);
      line('DIMS', g.a1.x, g.a1.y, g.a2.x, g.a2.y);
      text('DIMS', g.mid.x, g.mid.y - 2, 4, App.dims.length(m));
    });
    push(0, 'ENDSEC', 0, 'EOF');
    return L.join('\n') + '\n';
  };

  Ex.dxf = function () {
    const state = App.store.get();
    const s = Ex.dxfString(state);
    const blob = new Blob([s], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = baseName(state) + '.dxf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
})(window);
