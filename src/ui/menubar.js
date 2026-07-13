/* CAD식 메뉴바: 파일/편집/뷰/삽입/형식/도구 드롭다운 */
(function () {
  'use strict';
  window.App = window.App || {};

  // ── 도구막대 표시/숨김 (CAD처럼 그룹별 온오프, localStorage 유지) ──
  var TBARS = [
    { key: 'draw', label: '그리기 도구' },
    { key: 'edit', label: '편집 도구' },
    { key: 'place', label: '배치 옵션' },
    { key: 'align', label: '정렬 옵션' },
    { key: 'wire', label: '배선 옵션' },
  ];
  var TB_LS = 'panel-hidden-toolbars';

  function tbHidden() {
    try { return new Set(JSON.parse(localStorage.getItem(TB_LS) || '[]')); }
    catch (err) { return new Set(); }
  }

  function tbApply() {
    var hid = tbHidden();
    document.querySelectorAll('[data-tbar]').forEach(function (el) {
      el.style.display = hid.has(el.getAttribute('data-tbar')) ? 'none' : '';
    });
  }

  function tbVisible(key) { return !tbHidden().has(key); }

  function tbToggle(key) {
    var hid = tbHidden();
    if (hid.has(key)) hid.delete(key); else hid.add(key);
    try { localStorage.setItem(TB_LS, JSON.stringify(Array.from(hid))); } catch (err) {}
    tbApply();
  }

  // item 형식:
  //  { id: 'act-save', label: '저장' }            → getElementById(id).click()
  //  { check: 'show-names', label: '품명 표시' }   → 체크박스 토글 + ✓ 표시
  //  { tbar: 'draw', label: '그리기 도구' }        → 도구막대 그룹 표시/숨김
  //  { fn: function(){}, label: '단축키 설정' }    → 직접 실행
  //  { sep: true }                                 → 구분선
  //  key: 정적 단축키 힌트 (keymap 있으면 keymap이 우선)
  var MENUS = [
    {
      title: '파일',
      items: [
        { id: 'act-new', label: '새 프로젝트' },
        { sep: true },
        { id: 'act-save', label: '저장 (JSON)', key: 'Ctrl+S' },
        { id: 'act-load', label: '불러오기' },
        { sep: true },
        { id: 'act-edz', label: 'EDZ 부품 가져오기' },
        { sep: true },
        { id: 'act-dxf', label: 'DXF 내보내기' },
        { id: 'act-png', label: 'PNG 내보내기' },
        { id: 'act-print', label: '인쇄 / PDF', key: 'Ctrl+P' },
        { sep: true },
        { id: 'act-plist', label: '파츠 리스트 (XLSX)' },
        { id: 'act-bom', label: 'BOM (CSV)' },
        { id: 'act-wlist', label: '배선표' },
        { id: 'act-io', label: 'I/O 리스트' },
        { id: 'act-cable', label: '케이블 스케줄' },
      ],
    },
    {
      title: '편집',
      items: [
        { id: 'act-undo', label: '실행 취소', key: 'Ctrl+Z' },
        { id: 'act-redo', label: '다시 실행', key: 'Ctrl+Shift+Z' },
        { sep: true },
        { fn: function () { copySel(); }, label: '복사', key: 'Ctrl+C' },
        { fn: function () { pasteSel(); }, label: '붙여넣기', key: 'Ctrl+V' },
        { id: 'act-dup', label: '복제', key: 'Ctrl+D' },
        { id: 'act-delete', label: '삭제', key: 'Del' },
        { sep: true },
        { fn: function () { selectAll(); }, label: '전체 선택', key: 'Ctrl+A' },
        { id: 'act-rotate', label: '회전' },
        { id: 'act-lock', label: '잠금 / 해제' },
        { id: 'act-matchprop', label: '속성 복사' },
      ],
    },
    {
      title: '뷰',
      items: [
        { id: 'zoom-fit', label: '화면 맞춤' },
        { id: 'zoom-in', label: '확대', key: '+' },
        { id: 'zoom-out', label: '축소', key: '-' },
        { sep: true },
        { tbar: 'draw', label: '도구막대: 그리기' },
        { tbar: 'edit', label: '도구막대: 편집' },
        { tbar: 'place', label: '도구막대: 배치' },
        { tbar: 'align', label: '도구막대: 정렬' },
        { tbar: 'wire', label: '도구막대: 배선' },
        { sep: true },
        { id: 'act-3d', label: '3D 입체 보기' },
        { sep: true },
        { check: 'show-names', label: '품명 표시' },
        { check: 'show-stickers', label: '스티커 표시' },
        { check: 'wire-acdc-show', label: '전원(AC/DC) 표시' },
        { check: 'wire-dest-show', label: '행선지 튜브 표시' },
        { check: 'wire-spread', label: '겹선 분리' },
        { check: 'panel-frame', label: '도면 프레임' },
        { check: 'panel-field', label: '기계 영역 표시' },
        { sep: true },
        { id: 'wire-vis', label: '배선 프리셋 표시 (레이어)…' },
      ],
    },
    {
      title: '삽입',
      items: [
        { id: 'act-custom', label: '커스텀 부품 만들기…' },
        { sep: true },
        { id: 'tool-duct-h', label: '가로 덕트' },
        { id: 'tool-duct-v', label: '세로 덕트' },
        { id: 'tool-rail-h', label: '가로 레일' },
        { id: 'tool-rail-v', label: '세로 레일' },
      ],
    },
    {
      title: '그리기',
      items: [
        { id: 'tool-select', label: '선택 / 이동' },
        { sep: true },
        { id: 'tool-wire', label: '배선 (단자 연결)' },
        { id: 'tool-dim', label: '치수' },
        { id: 'tool-text', label: '텍스트' },
        { id: 'tool-cline', label: '센터선' },
      ],
    },
    {
      title: '형식',
      items: [
        { id: 'al-left', label: '왼쪽 정렬' },
        { id: 'al-vcenter', label: '세로 중앙 정렬' },
        { id: 'al-right', label: '오른쪽 정렬' },
        { id: 'al-top', label: '위 정렬' },
        { id: 'al-hcenter', label: '가로 중앙 정렬' },
        { id: 'al-bottom', label: '아래 정렬' },
        { sep: true },
        { id: 'al-disth', label: '가로 균등 배분' },
        { id: 'al-distv', label: '세로 균등 배분' },
        { id: 'al-packh', label: '가로 간격 배열' },
        { id: 'al-packv', label: '세로 간격 배열' },
        { id: 'al-between', label: '사이 센터' },
        { sep: true },
        { id: 'act-walign', label: '선 정렬 (기준선 → 상대선)' },
        { id: 'wire-preset-manage', label: '배선 프리셋 관리…' },
      ],
    },
    {
      title: '도구',
      items: [
        { id: 'wire-renum', label: '라인 번호 재부여' },
        { sep: true },
        { fn: function () { if (App.keymap) App.keymap.open(); }, label: '단축키 설정…' },
        { id: 'act-help', label: '도움말 / 단축키', key: 'F1' },
      ],
    },
  ];

  function selectAll() {
    var s = App.store.get();
    App.ui.selected = new Set(
      [].concat(s.components, s.ducts, s.rails, s.wires, s.dimensions || [])
        .map(function (it) { return it.id; })
    );
    App.render.all();
    if (App.inspector) App.inspector.update();
  }
  function copySel() { if (App.interact && App.interact.copySelected) App.interact.copySelected(); }
  function pasteSel() { if (App.interact && App.interact.paste) App.interact.paste(); }

  var openRoot = null; // 현재 열린 루트 버튼

  function keyHint(item) {
    if (item.id && App.keymap) {
      var k = App.keymap.keyOf(item.id);
      if (k) return k.toUpperCase();
    }
    return item.key || '';
  }

  function buildDropdown(menu) {
    var dd = document.createElement('div');
    dd.className = 'menu-dd';
    menu.items.forEach(function (item) {
      if (item.sep) {
        var sep = document.createElement('div');
        sep.className = 'menu-sep';
        dd.appendChild(sep);
        return;
      }
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'menu-item';
      var check = '';
      if (item.check) {
        var cb = document.getElementById(item.check);
        check = '<span class="menu-check">' + (cb && cb.checked ? '✓' : '') + '</span>';
      } else if (item.tbar) {
        check = '<span class="menu-check">' + (tbVisible(item.tbar) ? '✓' : '') + '</span>';
      } else {
        check = '<span class="menu-check"></span>';
      }
      var hint = keyHint(item);
      el.innerHTML = check + '<span class="menu-label">' + item.label + '</span>' +
        (hint ? '<span class="menu-key">' + hint + '</span>' : '');
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        closeAll();
        if (item.fn) { item.fn(); return; }
        if (item.tbar) { tbToggle(item.tbar); return; }
        var target = document.getElementById(item.check || item.id);
        if (target) target.click();
      });
      dd.appendChild(el);
    });
    return dd;
  }

  function closeAll() {
    document.querySelectorAll('#menubar .menu-dd').forEach(function (d) { d.remove(); });
    document.querySelectorAll('#menubar .menu-root.open').forEach(function (b) { b.classList.remove('open'); });
    openRoot = null;
  }

  function openMenu(rootBtn, menu) {
    closeAll();
    var dd = buildDropdown(menu);
    rootBtn.appendChild(dd);
    rootBtn.classList.add('open');
    openRoot = rootBtn;
  }

  function init() {
    var bar = document.getElementById('menubar');
    if (!bar) return;
    MENUS.forEach(function (menu) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-root';
      btn.textContent = menu.title;
      btn.setAttribute('data-menu', menu.title);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (openRoot === btn) closeAll();
        else openMenu(btn, menu);
      });
      btn.addEventListener('pointerenter', function () {
        if (openRoot && openRoot !== btn) openMenu(btn, menu); // 열려있으면 호버로 전환
      });
      bar.appendChild(btn);
    });
    document.addEventListener('pointerdown', function (e) {
      if (openRoot && !(e.target.closest && e.target.closest('#menubar'))) closeAll();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openRoot) closeAll();
    });
    tbApply(); // 저장된 도구막대 표시 상태 복원
  }

  App.menubar = {
    init: init,
    closeAll: closeAll,
    MENUS: MENUS,
    TBARS: TBARS,
    toolbarVisible: tbVisible,
    toolbarToggle: tbToggle,
  };
})();
