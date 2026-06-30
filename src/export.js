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
    return (state.name || 'panel').replace(/[^\w가-힣\-]+/g, '_');
  }

  // 부품 BOM 행 (테스트 가능)
  Ex.bomRows = function (state) {
    state = state || App.store.get();
    const map = {};
    state.components.forEach(function (c) {
      const k = c.partNo || '(미지정)';
      if (!map[k]) map[k] = { partNo: k, type: c.type || '', w: c.widthMM, h: c.heightMM, qty: 0 };
      map[k].qty += 1;
    });
    const rows = [['부품번호', '타입', '수량', '가로(mm)', '세로(mm)']];
    Object.keys(map).sort().forEach(function (k) {
      const r = map[k];
      rows.push([r.partNo, r.type, r.qty, r.w, r.h]);
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
    const rows = [['라인번호', '시작부품', '시작단자', '끝부품', '끝단자', '길이(mm)', 'SQ', 'AWG', '색상']];
    let total = 0;
    state.wires.slice().sort(function (a, b) {
      return String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric: true });
    }).forEach(function (w) {
      const len = App.wires.length(state, w);
      total += len;
      rows.push([w.label, label(w.fromComp), w.fromTerm, label(w.toComp), w.toTerm, len, w.sq || '', w.awg || '', w.color || '']);
    });
    rows.push(['합계', '', '', '', '', total, '', '', '']);
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
})(window);
