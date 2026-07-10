/* 파츠리스트 XLSX 내보내기 — 실무 발주 양식(PARTS LIST) 그대로 생성.
   외부 서버 없이 fflate.zipSync 로 실제 .xlsx(Open XML) 파일을 만든다. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const X = (App.xlsx = {});

  function xesc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function colName(n) { // 1 → A
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // 셀 헬퍼 — {v, s, n:true(숫자)} 를 XML 로
  function cellXml(ref, c) {
    if (c == null) return '';
    const s = c.s ? ' s="' + c.s + '"' : '';
    if (c.v == null || c.v === '') return '<c r="' + ref + '"' + s + '/>';
    if (c.n) return '<c r="' + ref + '"' + s + '><v>' + c.v + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(c.v) + '</t></is></c>';
  }

  // 파츠리스트 행 집계 — 모든 시트, 심볼 제외, partNo(규격) 기준 수량 합산
  X.partsRows = function (state) {
    state = state || App.store.get();
    const lib = (App.palette && App.palette.getLibrary) ? App.palette.getLibrary() : [];
    const map = {}; const order = [];
    App.exporter.allSheets(state).forEach(function (sh) {
      (sh.st.components || []).forEach(function (c) {
        if (c.sym) return; // 계통도 심볼은 구매 리스트 제외
        const spec = c.partNo || '(미지정)';
        const name = c.partName || c.label || c.type || '';
        const k = name + '|' + spec;
        if (!map[k]) {
          const lp = lib.find(function (p) { return p.partNo === c.partNo; });
          map[k] = { name: name, spec: spec, qty: 0, maker: c.manufacturer || (lp && lp.manufacturer) || '' };
          order.push(k);
        }
        map[k].qty += 1;
      });
    });
    return order.map(function (k) { return map[k]; });
  };

  // TASCO 발주 양식 XLSX 생성 → 다운로드
  X.partsList = function (state) {
    state = state || App.store.get();
    if (typeof fflate === 'undefined' || !fflate.zipSync) { alert('압축 모듈(fflate)이 로드되지 않았습니다.'); return 0; }
    const items = X.partsRows(state);
    if (!items.length) { alert('배치된 부품이 없습니다.'); return 0; }
    const tb = state.titleBlock || {};
    const projNo = prompt('PROJECT NO', tb.docNo || '') ;
    if (projNo == null) return 0;
    const customer = prompt('CUSTOMER', tb.customer || '');
    if (customer == null) return 0;
    const product = prompt('PRODUCT (GROUP)', (state.panel && state.panel.title) || state.name || '');
    if (product == null) return 0;

    // ── 행 구성 (업로드 양식과 동일 배치) ──
    const rows = {}; // rowNum → {col → cell}
    function set(r, c, cell) { (rows[r] = rows[r] || {})[c] = cell; }
    // 2~4행: 좌측 헤더 / 중앙 타이틀 / 우측 결재란
    set(2, 1, { v: ' PROJECT  NO :', s: 1 }); set(2, 3, { v: projNo, s: 2 });
    set(2, 4, { v: 'PARTS LIST', s: 3 }); set(2, 5, { s: 3 }); set(2, 6, { s: 3 });
    set(3, 1, { v: 'CUSTOMER :', s: 1 }); set(3, 3, { v: customer, s: 2 });
    set(4, 1, { v: 'PRODUCT (GROUP) :', s: 1 }); set(4, 3, { v: product, s: 7 });
    set(2, 13, { v: 'Prepared by', s: 6 }); set(2, 14, { v: tb.author || '', s: 6 });
    set(3, 13, { v: 'Checked by', s: 6 }); set(3, 14, { s: 6 });
    set(4, 13, { v: 'Approved by', s: 6 }); set(4, 14, { s: 6 });
    // 5행: 표 머리글
    const heads = ['PART NO.', '', 'PART NAME', 'SPECIFICATION', '구매품수량', '재고품수량', '제조사', '총합', '구매요청일', '입고예정', '진행'];
    heads.forEach(function (h, i) { if (h) set(5, i + 1, { v: h, s: 4 }); });
    // 6행~: 데이터
    items.forEach(function (it, i) {
      const r = 6 + i;
      set(r, 1, { v: (projNo || 'A000000') + '-01-000-' + pad2(i + 1), s: 5 });
      set(r, 3, { v: it.name, s: 5 });
      set(r, 4, { v: it.spec, s: 5 });
      set(r, 5, { v: it.qty, s: 6, n: true });
      set(r, 6, { s: 6 });
      set(r, 7, { v: it.maker, s: 6 });
      set(r, 8, { v: it.qty, s: 6, n: true });
      set(r, 9, { s: 6 }); set(r, 10, { s: 6 }); set(r, 11, { s: 6 });
    });
    const lastRow = 5 + items.length;

    // ── sheet1.xml ──
    let sx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:N' + lastRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="16.5"/>' +
      '<cols>' +
      '<col min="1" max="1" width="42.875" customWidth="1"/>' +
      '<col min="2" max="2" width="11" hidden="1" customWidth="1"/>' +
      '<col min="3" max="3" width="30.75" customWidth="1"/>' +
      '<col min="4" max="4" width="31.375" customWidth="1"/>' +
      '<col min="5" max="6" width="17.125" customWidth="1"/>' +
      '<col min="7" max="7" width="17.5" customWidth="1"/>' +
      '<col min="8" max="8" width="13.625" customWidth="1"/>' +
      '<col min="9" max="9" width="16.625" customWidth="1"/>' +
      '<col min="10" max="10" width="14.5" customWidth="1"/>' +
      '<col min="11" max="11" width="9.375" customWidth="1"/>' +
      '<col min="12" max="12" width="15.875" customWidth="1"/>' +
      '<col min="13" max="14" width="15.625" customWidth="1"/>' +
      '</cols><sheetData>';
    const heights = { 2: 26, 3: 26, 4: 34, 5: 22 };
    Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      sx += '<row r="' + r + '"' + (heights[r] ? ' ht="' + heights[r] + '" customHeight="1"' : '') + '>';
      Object.keys(rows[r]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
        sx += cellXml(colName(c) + r, rows[r][c]);
      });
      sx += '</row>';
    });
    sx += '</sheetData>' +
      '<mergeCells count="4"><mergeCell ref="A2:B2"/><mergeCell ref="A3:B3"/><mergeCell ref="A4:B4"/><mergeCell ref="D2:F2"/></mergeCells>' +
      '<pageSetup orientation="landscape" paperSize="9"/></worksheet>';

    // ── styles.xml ──
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="4">' +
      '<font><sz val="11"/><name val="맑은 고딕"/></font>' +
      '<font><b/><sz val="11"/><name val="맑은 고딕"/></font>' +
      '<font><b/><sz val="20"/><name val="맑은 고딕"/></font>' +
      '<font><b/><sz val="12"/><name val="맑은 고딕"/></font>' +
      '</fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="8">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                        // 0 기본
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +   // 1 좌측 라벨(굵게 12)
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +   // 2 헤더 값
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 3 PARTS LIST 타이틀
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 4 표 머리글
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' +   // 5 데이터(좌)
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 6 데이터(중앙)
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' +     // 7 제품명(줄바꿈)
      '</cellXfs><cellStyles count="1"><cellStyle name="표준" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="파트리스트" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
    const cts = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';

    const zip = fflate.zipSync({
      '[Content_Types].xml': fflate.strToU8(cts),
      '_rels/.rels': fflate.strToU8(rootRels),
      'xl/workbook.xml': fflate.strToU8(wb),
      'xl/_rels/workbook.xml.rels': fflate.strToU8(wbRels),
      'xl/styles.xml': fflate.strToU8(styles),
      'xl/worksheets/sheet1.xml': fflate.strToU8(sx)
    }, { level: 6 });
    const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ((projNo || 'PARTSLIST').replace(/[^\w가-힣\-]+/g, '_') || 'PARTSLIST') + '_PARTSLIST.xlsx';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    return items.length;
  };
})(window);
