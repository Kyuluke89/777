/* 단축키 관리자: 액션 <-> 키 매핑 + 설정 모달 */
(function () {
  'use strict';
  window.App = window.App || {};

  var LS_KEY = 'panel-keymap';

  // id = 클릭할 버튼 id (menu-hidden 포함 어디에 있든 .click() 으로 실행)
  var ACTIONS = [
    { id: 'tool-select', name: '선택 도구', def: 'v', group: '도구' },
    { id: 'tool-wire', name: '배선 도구', def: 'w', group: '도구' },
    { id: 'tool-dim', name: '치수 도구', def: 'd', group: '도구' },
    { id: 'tool-text', name: '텍스트 도구', def: 't', group: '도구' },
    { id: 'tool-cline', name: '센터선 도구', def: 'c', group: '도구' },
    { id: 'tool-duct-h', name: '가로 덕트', def: '', group: '도구' },
    { id: 'tool-duct-v', name: '세로 덕트', def: '', group: '도구' },
    { id: 'tool-rail-h', name: '가로 레일', def: '', group: '도구' },
    { id: 'tool-rail-v', name: '세로 레일', def: '', group: '도구' },
    { id: 'act-rotate', name: '회전', def: 'r', group: '편집' },
    { id: 'act-dup', name: '복제', def: '', group: '편집' },
    { id: 'act-lock', name: '잠금', def: '', group: '편집' },
    { id: 'act-matchprop', name: '속성 복사', def: 'm', group: '편집' },
    { id: 'act-walign', name: '선 정렬', def: '', group: '편집' },
    { id: 'al-between', name: '사이 센터', def: '', group: '편집' },
    { id: 'zoom-fit', name: '화면 맞춤', def: 'f', group: '뷰' },
    { id: 'act-3d', name: '3D 보기', def: '', group: '뷰' },
  ];

  var map = null; // { key: actionId }

  function defaults() {
    var m = {};
    ACTIONS.forEach(function (a) { if (a.def) m[a.def] = a.id; });
    return m;
  }

  function load() {
    map = defaults();
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') map = saved;
      }
    } catch (err) { /* localStorage 불가 환경 */ }
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (err) {}
  }

  function actionFor(key) {
    if (!map) load();
    return map[key] || null;
  }

  // key 로 시작하는 더 긴 바인딩(두 글자)이 있는지 — 입력 대기 판단용
  function hasPrefix(key) {
    if (!map) load();
    for (var k in map) if (k.length > key.length && k.indexOf(key) === 0) return true;
    return false;
  }

  function keyOf(actionId) {
    if (!map) load();
    for (var k in map) if (map[k] === actionId) return k;
    return '';
  }

  function bind(key, actionId) {
    if (!map) load();
    // 같은 키가 다른 액션에 있으면 제거
    for (var k in map) if (map[k] === actionId) delete map[k];
    if (key) map[key] = actionId;
    save();
    syncHints();
  }

  function unbind(actionId) {
    if (!map) load();
    for (var k in map) if (map[k] === actionId) delete map[k];
    save();
    syncHints();
  }

  function reset() {
    map = defaults();
    save();
    syncHints();
  }

  // 버튼 툴팁의 단축키 표기를 현재 바인딩에 맞게 갱신 — 키를 바꿔도 툴팁이 거짓말하지 않게
  function syncHints() {
    ACTIONS.forEach(function (a) {
      var el = document.getElementById(a.id);
      if (!el) return;
      var base = el.getAttribute('data-basetitle');
      if (base == null) {
        // 원본 title 에서 끝의 " (V)" 같은 한 글자 키 표기는 떼고 보관
        base = (el.getAttribute('title') || '').replace(/\s*\([A-Z]\)\s*$/, '');
        el.setAttribute('data-basetitle', base);
      }
      var key = keyOf(a.id);
      el.setAttribute('title', base + (key ? ' (' + key.toUpperCase() + ')' : ''));
    });
  }

  // ---- 설정 모달 ----
  var modal = null;
  var capturing = null; // 캡처 중인 actionId
  var capBuf = '';      // 캡처 중 입력된 키 (최대 2글자)
  var capTimer = null;

  function keyLabel(k) {
    if (!k) return '';
    return k.toUpperCase();
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'keymap-modal';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/30';
    modal.innerHTML =
      '<div class="bg-white rounded-lg shadow-xl w-[440px] max-h-[80vh] flex flex-col">' +
      '<div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">' +
      '<div class="text-sm font-bold text-slate-700">⌨️ 단축키 설정</div>' +
      '<button id="km-close" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">×</button>' +
      '</div>' +
      '<div class="px-4 py-1.5 text-[11px] text-slate-400 border-b border-slate-100">변경 버튼을 누른 뒤 원하는 키를 누르세요. 두 글자 연속 입력(예: D→U)도 됩니다 — 잠시 기다리거나 Enter로 확정.</div>' +
      '<div id="km-list" class="flex-1 overflow-y-auto px-4 py-2"></div>' +
      '<div class="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-slate-200">' +
      '<button id="km-reset" class="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">기본값 복원</button>' +
      '<button id="km-done" class="text-xs px-3 py-1.5 rounded bg-slate-800 text-white hover:bg-slate-700">닫기</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    modal.addEventListener('pointerdown', function (e) {
      if (e.target === modal) close();
    });
    modal.querySelector('#km-close').addEventListener('click', close);
    modal.querySelector('#km-done').addEventListener('click', close);
    modal.querySelector('#km-reset').addEventListener('click', function () {
      reset(); stopCapTimer(); capturing = null; capBuf = ''; renderList();
    });

    window.addEventListener('keydown', onCaptureKey, true);
  }

  function stopCapTimer() {
    if (capTimer) { clearTimeout(capTimer); capTimer = null; }
  }

  function commitCapture() {
    stopCapTimer();
    if (capturing && capBuf) bind(capBuf, capturing);
    capturing = null;
    capBuf = '';
    renderList();
  }

  function onCaptureKey(e) {
    if (!capturing || !modal || modal.classList.contains('hidden')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stopCapTimer(); capturing = null; capBuf = ''; renderList(); return; }
    if (e.key === 'Enter') { commitCapture(); return; }
    var k = (e.key || '').toLowerCase();
    if (k.length !== 1) return; // 문자/숫자 키만
    capBuf += k;
    if (capBuf.length >= 2) { commitCapture(); return; } // 두 글자면 즉시 확정
    // 한 글자 입력 후 잠시 기다림 — 이어서 누르면 두 글자, 안 누르면 한 글자로 확정
    renderList();
    stopCapTimer();
    capTimer = setTimeout(commitCapture, 900);
  }

  function renderList() {
    var list = modal.querySelector('#km-list');
    var html = '';
    var lastGroup = null;
    ACTIONS.forEach(function (a) {
      if (a.group !== lastGroup) {
        lastGroup = a.group;
        html += '<div class="text-[10px] font-bold text-slate-400 mt-2 mb-1">' + a.group + '</div>';
      }
      var key = keyOf(a.id);
      var cap = capturing === a.id;
      html +=
        '<div class="flex items-center gap-2 py-1 border-b border-slate-50">' +
        '<div class="flex-1 text-xs text-slate-700">' + a.name + '</div>' +
        '<div class="w-16 text-center text-xs font-mono ' +
        (cap ? 'text-amber-600 animate-pulse' : key ? 'text-slate-800' : 'text-slate-300') + '">' +
        (cap ? (capBuf ? keyLabel(capBuf) + '…' : '키 입력…') : key ? keyLabel(key) : '없음') + '</div>' +
        '<button data-km-set="' + a.id + '" class="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">변경</button>' +
        '<button data-km-clear="' + a.id + '" class="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-400 hover:bg-slate-50">지움</button>' +
        '</div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('[data-km-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        stopCapTimer();
        capturing = btn.getAttribute('data-km-set');
        capBuf = '';
        renderList();
      });
    });
    list.querySelectorAll('[data-km-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        unbind(btn.getAttribute('data-km-clear'));
        if (capturing === btn.getAttribute('data-km-clear')) { stopCapTimer(); capturing = null; capBuf = ''; }
        renderList();
      });
    });
  }

  function open() {
    if (!modal) buildModal();
    stopCapTimer();
    capturing = null;
    capBuf = '';
    renderList();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function close() {
    if (!modal) return;
    stopCapTimer();
    capturing = null;
    capBuf = '';
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function init() {
    load();
    syncHints();
  }

  App.keymap = {
    init: init,
    open: open,
    close: close,
    actionFor: actionFor,
    hasPrefix: hasPrefix,
    keyOf: keyOf,
    bind: bind,
    unbind: unbind,
    reset: reset,
    syncHints: syncHints,
    ACTIONS: ACTIONS,
  };
})();
