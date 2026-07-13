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
        { id: 'act-save', label: '저장', key: 'Ctrl+S' },
        { fn: function () { App.persistence.saveToFile(App.store.get(), { as: true }); }, cmdId: 'act-saveas', label: '다른 이름으로 저장…', key: 'Ctrl+Shift+S' },
        { id: 'act-load', label: '불러오기' },
        { fn: function () { openRecentModal(); }, cmdId: 'recent-open', label: '최근 프로젝트…' },
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
        { id: 'act-undo', key: 'Ctrl+Z', label: function () {
          var l = App.store && App.store.undoLabel ? App.store.undoLabel() : '';
          return '실행 취소' + (l ? ': ' + l : '');
        } },
        { id: 'act-redo', key: 'Ctrl+Shift+Z', label: function () {
          var l = App.store && App.store.redoLabel ? App.store.redoLabel() : '';
          return '다시 실행' + (l ? ': ' + l : '');
        } },
        { sep: true },
        { fn: function () { copySel(); }, cmdId: 'edit-copy', label: '복사', key: 'Ctrl+C' },
        { fn: function () { pasteSel(); }, cmdId: 'edit-paste', label: '붙여넣기', key: 'Ctrl+V' },
        { id: 'act-dup', label: '복제', key: 'Ctrl+D' },
        { id: 'act-delete', label: '삭제', key: 'Del' },
        { sep: true },
        { fn: function () { selectAll(); }, cmdId: 'select-all', label: '전체 선택', key: 'Ctrl+A' },
        { fn: function () { selectSame('kind'); }, cmdId: 'select-same-kind', label: '같은 종류 모두 선택' },
        { fn: function () { selectSame('match'); }, cmdId: 'select-same-match', label: '같은 품번/프리셋 선택' },
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
        { fn: function () { if (App.keymap) App.keymap.open(); }, cmdId: 'keymap-open', label: '단축키 설정…' },
        { fn: function () { if (App.cmdPalette) App.cmdPalette.open(); }, cmdId: 'cmd-palette', label: '명령 팔레트…', key: 'Ctrl+K' },
        { id: 'act-help', label: '도움말 / 단축키', key: 'F1' },
      ],
    },
  ];

  function selectAll() {
    var s = App.store.get();
    var ids = [];
    ['components', 'ducts', 'rails', 'wires', 'dimensions'].forEach(function (k) {
      if (!App.interact || !App.interact.filterAllows || App.interact.filterAllows(k)) {
        (s[k] || []).forEach(function (it) { ids.push(it.id); });
      }
    });
    App.ui.selected = new Set(ids);
    App.render.all();
    if (App.inspector) App.inspector.update();
  }

  // 같은 종류 모두 선택 — 현재 선택의 종류(부품이면 같은 품번, 배선이면 같은 프리셋)를 확장
  function selectSame(mode) {
    var sel = Array.from(App.ui.selected);
    if (!sel.length) { if (App.toolbar) App.toolbar.flash('기준이 될 대상을 먼저 선택하세요'); return; }
    var f = App.store.findById(sel[0]);
    if (!f) return;
    var s = App.store.get();
    var ids = [];
    if (f.kind === 'wires' && mode === 'match') {
      var preset = f.item.preset || '';
      s.wires.forEach(function (w) { if ((w.preset || '') === preset) ids.push(w.id); });
    } else if (f.kind === 'components' && mode === 'match') {
      var pn = f.item.partNo || '';
      s.components.forEach(function (c) { if ((c.partNo || '') === pn) ids.push(c.id); });
    } else {
      (s[f.kind] || []).forEach(function (it) { ids.push(it.id); });
    }
    App.ui.selected = new Set(ids);
    App.render.all();
    if (App.inspector) App.inspector.update();
    if (App.toolbar) App.toolbar.flash(ids.length + '개 선택');
  }
  function copySel() { if (App.interact && App.interact.copySelected) App.interact.copySelected(); }
  function pasteSel() { if (App.interact && App.interact.paste) App.interact.paste(); }

  // 프로젝트 데이터 적용 (불러오기/최근/버전 복원 공용)
  function applyProject(data) {
    App.store.replace(App.clone(data));
    App.ui.selected.clear();
    var p = data.panel;
    App.viewport.fitTo(p.widthMM, p.heightMM);
    App.render.all();
    if (App.inspector) App.inspector.update();
    if (App.toolbar) App.toolbar.syncFromState();
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  // 목록 선택 모달 (최근 프로젝트/버전 복원 공용)
  function openListModal(title, rows, emptyMsg, onPick) {
    var old = document.getElementById('list-modal');
    if (old) old.remove();
    var modal = document.createElement('div');
    modal.id = 'list-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/30';
    var items = rows.length
      ? rows.map(function (r, i) {
          return '<button type="button" class="recent-item" data-i="' + i + '">' +
            '<span class="recent-name">' + App.esc(r.name) + '</span>' +
            '<span class="recent-date">' + fmtDate(r.ts) + '</span></button>';
        }).join('')
      : '<div class="text-xs text-slate-400 text-center py-6">' + App.esc(emptyMsg) + '</div>';
    modal.innerHTML =
      '<div class="bg-white rounded-lg shadow-xl w-[380px] max-h-[70vh] flex flex-col">' +
      '<div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">' +
      '<div class="text-sm font-bold text-slate-700">' + App.esc(title) + '</div>' +
      '<button id="lm-close" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">×</button>' +
      '</div><div class="flex-1 overflow-y-auto p-2">' + items + '</div></div>';
    document.body.appendChild(modal);
    function close() { modal.remove(); }
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) close(); });
    modal.querySelector('#lm-close').addEventListener('click', close);
    modal.querySelectorAll('.recent-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        close();
        onPick(rows[+btn.getAttribute('data-i')]);
      });
    });
  }

  function openRecentModal() {
    if (!App.persistence.autosaveAvailable()) {
      alert('최근 프로젝트 목록은 http(s) 환경(GitHub Pages 등)에서 사용할 수 있습니다.\nfile:// 로 열었을 때는 저장/불러오기를 사용하세요.');
      return;
    }
    App.persistence.listRecent().then(function (list) {
      openListModal('최근 프로젝트', list, '최근 항목이 없습니다', function (r) {
        if (!confirm('"' + r.name + '" 프로젝트를 불러올까요?\n(현재 작업은 저장하지 않으면 사라집니다)')) return;
        applyProject(r.data);
      });
    });
  }

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
      var labelText = typeof item.label === 'function' ? item.label() : item.label;
      el.innerHTML = check + '<span class="menu-label">' + labelText + '</span>' +
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

  // 모든 메뉴 항목을 명령 레지스트리에 등록 — 명령 팔레트/단축키가 공유
  function registerCommands() {
    if (!App.commands) return;
    MENUS.forEach(function (menu) {
      menu.items.forEach(function (item) {
        if (item.sep) return;
        var label = typeof item.label === 'function' ? item.label() : item.label;
        var id = item.cmdId || item.id || item.check || (item.tbar ? 'tbar-' + item.tbar : null);
        if (!id) return;
        App.commands.register({
          id: id,
          name: String(label).replace(/…$/, ''),
          group: menu.title,
          hint: item.key || '',
          run: item.fn ? item.fn
            : item.tbar ? (function (k) { return function () { tbToggle(k); }; })(item.tbar)
            : (function (target) {
                return function () {
                  var el = document.getElementById(target);
                  if (el) el.click();
                };
              })(item.check || item.id),
        });
      });
    });
  }

  function init() {
    var bar = document.getElementById('menubar');
    if (!bar) return;
    registerCommands();
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
    applyProject: applyProject,
    openListModal: openListModal,
    openRecentModal: openRecentModal,
  };
})();
