/* EDZ 가져오기 — EDZ(zip) 해제 후 part.xml 파싱 → 부품 레코드 변환.
   EDZ = EPLAN Data Zip. 대부분 ZIP, 일부 7z. 내부에 part.xml(부품 데이터)과
   매크로/이미지가 들어있다. ZIP 기반만 브라우저에서 직접 해제 가능. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const EDZ = (App.edz = {});

  // fflate 로드 확인
  function hasUnzip() {
    return global.fflate && typeof global.fflate.unzipSync === 'function';
  }

  // EPLAN 부품 타입코드 → 우리 타입 매핑 (대표 키워드 기반 추정)
  function guessType(text) {
    const s = (text || '').toUpperCase();
    if (/MCCB|배선용|MOLDED/.test(s)) return 'MCCB';
    if (/ELCB|RCD|누전|EARTH LEAK/.test(s)) return 'ELCB';
    if (/CONTACTOR|전자접촉|\bMC\b/.test(s)) return 'MC';
    if (/SMPS|POWER SUPPLY|전원/.test(s)) return 'SMPS';
    if (/PLC|XGB|XGI|XGK/.test(s)) return 'PLC';
    if (/RELAY|릴레이/.test(s)) return 'RELAY';
    if (/TERMINAL|단자/.test(s)) return 'TB';
    if (/CIRCUIT PROTECT|\bCP\b/.test(s)) return 'CP';
    if (/MCB|소형차단|MINIATURE/.test(s)) return 'MCB';
    return 'ETC';
  }

  function num(v) {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // part.xml(또는 유사 XML)에서 부품 추출
  function parsePartsXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('XML 파싱 오류');
    }
    const out = [];
    // EPLAN parts XML 은 버전마다 태그가 다양 → 여러 후보를 탐색
    let nodes = doc.querySelectorAll('part, Part, PARTS > *, ROW, Row');
    if (!nodes.length) nodes = doc.querySelectorAll('*');
    const seen = new Set();

    function attr(node, names) {
      for (let i = 0; i < names.length; i++) {
        const v = node.getAttribute && node.getAttribute(names[i]);
        if (v) return v;
        // 자식 요소 텍스트로도 탐색
        const child = node.querySelector && node.querySelector(names[i]);
        if (child && child.textContent) return child.textContent.trim();
      }
      return null;
    }

    nodes.forEach(function (node) {
      const partNo = attr(node, ['partNr', 'PARTNR', 'partNumber', 'P_ARTICLE_PARTNR', 'ORDERNR', 'number']);
      if (!partNo) return;
      if (seen.has(partNo)) return;
      const desc = attr(node, ['description', 'DESCR1', 'P_ARTICLE_DESCR1', 'typeNr', 'name']) || '';
      const w = num(attr(node, ['width', 'WIDTH', 'P_ARTICLE_MOUNT_SIZEX', 'sizeX', 'mountX']));
      const h = num(attr(node, ['height', 'HEIGHT', 'P_ARTICLE_MOUNT_SIZEY', 'sizeY', 'mountY']));
      const d = num(attr(node, ['depth', 'DEPTH', 'P_ARTICLE_MOUNT_SIZEZ', 'sizeZ', 'mountZ']));
      const manu = attr(node, ['manufacturer', 'MANUFACTURER', 'P_ARTICLE_MANUFACTURER']) || 'LS';
      seen.add(partNo);
      out.push({
        partNo: partNo,
        manufacturer: manu,
        type: guessType(partNo + ' ' + desc),
        name: desc || partNo,
        w: w || 45, h: h || 80, d: d || 70,
        terminals: 0,
        _fromEdz: true
      });
    });
    return out;
  }
  EDZ.parsePartsXml = parsePartsXml;

  // EDZ 파일(ArrayBuffer) → 부품 배열
  EDZ.parseArrayBuffer = function (buf) {
    if (!hasUnzip()) {
      throw new Error('압축 해제 라이브러리(fflate)를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
    }
    const bytes = new Uint8Array(buf);
    // 7z 시그니처 검사 (37 7A BC AF 27 1C)
    if (bytes[0] === 0x37 && bytes[1] === 0x7A && bytes[2] === 0xBC) {
      throw new Error('이 EDZ는 7z 압축입니다. EPLAN/7-Zip에서 ZIP 으로 다시 저장 후 올려주세요.');
    }
    let files;
    try {
      files = global.fflate.unzipSync(bytes);
    } catch (e) {
      throw new Error('ZIP 해제 실패: ' + e.message);
    }
    // part.xml 류 파일 탐색
    const xmlNames = Object.keys(files).filter(function (n) {
      return /\.xml$/i.test(n) && /part|article|eds/i.test(n);
    });
    const targets = xmlNames.length ? xmlNames : Object.keys(files).filter(function (n) { return /\.xml$/i.test(n); });
    if (!targets.length) throw new Error('EDZ 안에서 부품 XML(part.xml)을 찾지 못했습니다.');

    const dec = new TextDecoder('utf-8');
    let parts = [];
    targets.forEach(function (n) {
      try {
        const text = dec.decode(files[n]);
        parts = parts.concat(parsePartsXml(text));
      } catch (e) { /* 개별 파일 실패는 건너뜀 */ }
    });
    if (!parts.length) throw new Error('부품 데이터를 추출하지 못했습니다.');
    return parts;
  };

  // 파일 입력 → 부품 배열 (Promise)
  EDZ.importFile = function (file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        try { resolve(EDZ.parseArrayBuffer(reader.result)); }
        catch (e) { reject(e); }
      };
      reader.onerror = function () { reject(new Error('파일 읽기 실패')); };
      reader.readAsArrayBuffer(file);
    });
  };
})(window);
