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

  // 모든 시트를 [{name, st}] 로 — 활성 시트는 현재 상태, 나머지는 보관 데이터
  Ex.allSheets = function (state) {
    state = state || App.store.get();
    if (!state.sheets || state.sheets.length <= 1) return [{ name: (state.sheets && state.sheets[0] && state.sheets[0].name) || 'Sheet1', st: state }];
    return state.sheets.map(function (sh, i) {
      if (i === (state.activeSheet || 0)) return { name: sh.name, st: state };
      const d = sh.data || {};
      return { name: sh.name, st: { panel: d.panel || state.panel, components: d.components || [], wires: d.wires || [], ducts: d.ducts || [], rails: d.rails || [], dimensions: d.dimensions || [] } };
    });
  };

  // 여러 시트 통합 여부 (시트 1장이면 항상 현재만)
  function wantAllSheets(state) {
    if (!state.sheets || state.sheets.length <= 1) return false;
    return confirm('모든 시트(' + state.sheets.length + '장)를 통합해서 내보낼까요?\n(취소 = 현재 시트만)');
  }

  // 부품 BOM — partNo 기준 집계 → CSV
  Ex.bom = function (state) {
    state = state || App.store.get();
    let rows;
    if (wantAllSheets(state)) {
      // 전체 시트 통합: 수량 합산 + 시트 목록
      const map = {};
      Ex.allSheets(state).forEach(function (sh) {
        (sh.st.components || []).forEach(function (c) {
          const k = c.partNo || '(미지정)';
          if (!map[k]) map[k] = { partNo: k, name: c.partName || c.label || '', type: c.type || '', w: c.widthMM, h: c.heightMM, qty: 0, tags: [], sheets: {} };
          map[k].qty += 1;
          if (c.tag) map[k].tags.push(c.tag);
          map[k].sheets[sh.name] = 1;
        });
      });
      rows = [['부품번호', '품명', '타입', '수량', '가로(mm)', '세로(mm)', '호기번호', '시트']];
      Object.keys(map).sort().forEach(function (k) {
        const r = map[k];
        rows.push([r.partNo, r.name, r.type, r.qty, r.w, r.h, r.tags.join(' '), Object.keys(r.sheets).join(' ')]);
      });
    } else rows = Ex.bomRows(state);
    download(baseName(state) + '_BOM.csv', toCsv(rows));
    return rows.length - 1;
  };

  // 배선표 → CSV
  Ex.wiringList = function (state) {
    state = state || App.store.get();
    let rows;
    if (wantAllSheets(state)) {
      rows = [['시트'].concat(Ex.wiringRows(state)[0])]; // 헤더에 시트 컬럼
      Ex.allSheets(state).forEach(function (sh) {
        const r = Ex.wiringRows(sh.st);
        for (let i = 1; i < r.length; i++) rows.push([sh.name].concat(r[i]));
      });
    } else rows = Ex.wiringRows(state);
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

  // PLC I/O 리스트 — PLC 단자별 연결 배선/기기 집계 (테스트 가능)
  Ex.ioRows = function (state) {
    state = state || App.store.get();
    const rows = [['PLC', '주소(단자)', '라인번호', '연결 기기', '기기 단자', '기기 타입']];
    state.components.filter(function (c) { return c.type === 'PLC'; }).forEach(function (plc) {
      const terms = App.terminals.world(plc);
      terms.forEach(function (t, idx) {
        const hits = state.wires.filter(function (w) {
          return (w.fromComp === plc.id && w.fromTerm === idx) || (w.toComp === plc.id && w.toTerm === idx);
        });
        if (!hits.length) {
          rows.push([plc.label || plc.partNo, t.name || idx, '', '', '', '']);
          return;
        }
        hits.forEach(function (w) {
          const otherId = w.fromComp === plc.id ? w.toComp : w.fromComp;
          const otherT = w.fromComp === plc.id ? w.toTerm : w.fromTerm;
          const o = state.components.find(function (x) { return x.id === otherId; });
          const oTerms = o ? App.terminals.world(o) : [];
          rows.push([plc.label || plc.partNo, t.name || idx, w.label || '',
            o ? (o.label || o.partNo) : '?', (oTerms[otherT] && oTerms[otherT].name) || otherT, o ? o.type : '']);
        });
      });
    });
    return rows;
  };
  Ex.ioList = function (state) {
    state = state || App.store.get();
    const rows = Ex.ioRows(state);
    download(baseName(state) + '_IO리스트.csv', toCsv(rows));
    return rows.length - 1;
  };

  // 케이블표 — 전장↔기계(필드) 배선만 집계 (테스트 가능)
  const FIELD_TYPES = { SENSOR: 1, MOTOR: 1, SOL: 1, LAMP: 1, SW: 1 };
  Ex.cableRows = function (state) {
    state = state || App.store.get();
    function comp(id) { return state.components.find(function (x) { return x.id === id; }); }
    const rows = [['케이블번호', '판넬측 부품', '판넬측 단자', '현장측 기기', '현장측 단자', '규격(SQ)', 'AWG', '길이(mm)', '색상']];
    let total = 0;
    state.wires.slice().sort(function (a, b) {
      return String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric: true });
    }).forEach(function (w) {
      const a = comp(w.fromComp), b = comp(w.toComp);
      if (!a || !b) return;
      const aF = FIELD_TYPES[a.type], bF = FIELD_TYPES[b.type];
      if (!aF && !bF) return;                       // 둘 다 판넬 내부면 제외
      const pnl = aF ? b : a, fld = aF ? a : b;     // 판넬측/현장측 정리
      const pnlT = aF ? w.toTerm : w.fromTerm, fldT = aF ? w.fromTerm : w.toTerm;
      const len = App.wires.length(state, w);
      total += len;
      rows.push([w.label, (pnl.label || pnl.partNo), pnlT, (fld.label || fld.partNo), fldT, w.sq || '', w.awg || '', len, w.color || '']);
    });
    rows.push(['합계', '', '', '', '', '', '', total, '']);
    return rows;
  };
  Ex.cableList = function (state) {
    state = state || App.store.get();
    const rows = Ex.cableRows(state);
    download(baseName(state) + '_케이블표.csv', toCsv(rows));
    return rows.length - 2; // 헤더·합계 제외
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
    if (p.frame) {
      const topEx = p.fieldZone ? ((p.fieldH || 220) + 60) : 0;
      rect('FRAME', -22, -52 - topEx, p.widthMM + 44, p.heightMM + 104 + topEx);
      rect('FRAME', -17, -47 - topEx, p.widthMM + 34, p.heightMM + 94 + topEx);
    }
    if (p.title) text('TEXT', p.widthMM / 2, -14, 10, p.title);
    (state.ducts || []).forEach(function (d) {
      const w = d.orient === 'h' ? d.lengthMM : d.widthMM;
      const h = d.orient === 'h' ? d.widthMM : d.lengthMM;
      rect('DUCTS', d.x, d.y, w, h);
      // 라벨 스티커 — cols(가로 칸)/rows(세로 3줄)
      (d.stickers || []).forEach(function (st) {
        const dm = App.stickerDims(st);
        const stLines = App.stickerLines(state, st); // 부품 연동 자동 줄 반영
        const off = st.off || 0, vert = d.orient !== 'h';
        let sx, sy;
        if (!vert) { sx = d.x + off; sy = d.y + (h - dm.th) / 2; rect('LABELS', sx, sy, dm.len, dm.th); }
        else { sx = d.x + (w - dm.th) / 2; sy = d.y + off; rect('LABELS', sx, sy, dm.th, dm.len); }
        if (dm.mode === 'cols') {
          for (let i = 1; i < dm.n; i++) {
            if (!vert) line('LABELS', sx + dm.cw * i, sy, sx + dm.cw * i, sy + dm.th);
            else line('LABELS', sx, sy + dm.cw * i, sx + dm.th, sy + dm.cw * i);
          }
          stLines.forEach(function (s, i) {
            if (!s || i >= dm.n) return;
            if (!vert) text('LABELS', sx + dm.cw * i + 2, sy + dm.th * 0.62, 3.2, s);
            else text('LABELS', sx + 2, sy + dm.cw * i + dm.cw * 0.62, 3.2, s);
          });
        } else {
          const rowH = dm.th / 3;
          for (let i = 1; i < 3; i++) {
            if (!vert) line('LABELS', sx, sy + rowH * i, sx + dm.len, sy + rowH * i);
            else line('LABELS', sx + rowH * i, sy, sx + rowH * i, sy + dm.len);
          }
          stLines.forEach(function (s, i) {
            if (!s) return;
            if (!vert) text('LABELS', sx + 2, sy + rowH * i + rowH * 0.72, 3.2, s);
            else text('LABELS', sx + rowH * i + rowH * 0.72, sy + dm.len - 2, 3.2, s);
          });
        }
      });
    });
    (state.rails || []).forEach(function (r) {
      const w = r.orient === 'h' ? r.lengthMM : (r.widthMM || 35);
      const h = r.orient === 'h' ? (r.widthMM || 35) : r.lengthMM;
      rect('RAILS', r.x, r.y, w, h);
      if (r.orient === 'h') line('RAILS', r.x, r.y + h / 2, r.x + w, r.y + h / 2);
      else line('RAILS', r.x + w / 2, r.y, r.x + w / 2, r.y + h);
    });
    (state.components || []).forEach(function (c) {
      if (c.sym && App.symGeo) { // 계통도 심볼: 실제 심볼 지오메트리로
        const geo = App.symGeo(c);
        geo.lines.forEach(function (l) { line('SYM', c.x + l[0], c.y + l[1], c.x + l[2], c.y + l[3]); });
        geo.circles.forEach(function (ci) { circle('SYM', c.x + ci[0], c.y + ci[1], ci[2]); });
        geo.texts.forEach(function (t) { text('SYM', c.x + t[0] - t[3] * 0.35, c.y + t[1] + t[3] * 0.35, t[3], t[2]); });
        text('TEXT', c.x + c.widthMM + 3, c.y + c.heightMM / 2, 4, c.label || c.partName || '');
        App.terminals.world(c).forEach(function (t) { circle('TERMS', t.x, t.y, (t.w || 3.6) / 2); });
        return;
      }
      // 90/270도 회전은 가로세로 스왑(중심 유지)
      const rot = ((c.rotation || 0) % 180 + 180) % 180;
      let bx = c.x, by = c.y, bw = c.widthMM, bh = c.heightMM;
      if (rot === 90) {
        const ccx = bx + bw / 2, ccy = by + bh / 2;
        bw = c.heightMM; bh = c.widthMM; bx = ccx - bw / 2; by = ccy - bh / 2;
      }
      rect('PARTS', bx, by, bw, bh);
      // 부품 도형(글쓰기·사각 라인) — 회전 미반영(0도 기준)
      (c.shapes || []).forEach(function (sh) {
        if (sh.kind === 'rect') rect('PARTS', c.x + sh.x, c.y + sh.y, sh.w, sh.h);
        else if (sh.kind === 'text' && sh.text) text('PARTS', c.x + sh.x, c.y + sh.y, sh.size || 5, sh.text);
      });
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
    (state.texts || []).forEach(function (t) {
      text('NOTES', t.x, t.y, t.size || 8, t.text);
    });
    (state.clines || []).forEach(function (cl) {
      line('CENTER', cl.x1, cl.y1, cl.x2, cl.y2);
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
