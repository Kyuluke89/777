/* 명령 팔레트 (Ctrl+K) — 이름으로 아무 기능이나 검색해 즉시 실행 */
(function () {
  'use strict';
  window.App = window.App || {};

  var overlay = null;
  var input = null;
  var listEl = null;
  var results = [];
  var sel = 0;

  function keyHintOf(id) {
    if (App.keymap) {
      var k = App.keymap.keyOf(id);
      if (k) return k.toUpperCase();
    }
    var cmd = App.commands && App.commands.get(id);
    return (cmd && cmd.hint) || '';
  }

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'cmd-palette';
    overlay.className = 'fixed inset-0 z-50 hidden bg-black/20';
    overlay.innerHTML =
      '<div class="cmdp-box">' +
      '<input id="cmdp-input" type="text" placeholder="명령 검색… (예: 저장, 재부여, 덕트)" autocomplete="off" />' +
      '<div id="cmdp-list"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('#cmdp-input');
    listEl = overlay.querySelector('#cmdp-list');

    overlay.addEventListener('pointerdown', function (e) {
      if (e.target === overlay) close();
    });
    input.addEventListener('input', function () { sel = 0; refresh(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); refresh(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); refresh(); return; }
      if (e.key === 'Enter') { e.preventDefault(); runSel(sel); return; }
      e.stopPropagation(); // 팔레트 입력 중 캔버스 단축키 차단
    });
  }

  function refresh() {
    results = App.commands ? App.commands.search(input.value).slice(0, 12) : [];
    if (sel >= results.length) sel = Math.max(0, results.length - 1);
    var html = '';
    results.forEach(function (c, i) {
      var hint = keyHintOf(c.id);
      html +=
        '<div class="cmdp-item' + (i === sel ? ' active' : '') + '" data-i="' + i + '">' +
        '<span class="cmdp-group">' + App.esc(c.group) + '</span>' +
        '<span class="cmdp-name">' + App.esc(c.name) + '</span>' +
        (hint ? '<span class="cmdp-key">' + App.esc(hint) + '</span>' : '') +
        '</div>';
    });
    if (!results.length) html = '<div class="cmdp-empty">일치하는 명령 없음</div>';
    listEl.innerHTML = html;
    listEl.querySelectorAll('.cmdp-item').forEach(function (el) {
      el.addEventListener('click', function () { runSel(+el.getAttribute('data-i')); });
      el.addEventListener('pointerenter', function () {
        sel = +el.getAttribute('data-i');
        listEl.querySelectorAll('.cmdp-item').forEach(function (x) { x.classList.remove('active'); });
        el.classList.add('active');
      });
    });
  }

  function runSel(i) {
    var c = results[i];
    close();
    if (c && App.commands) App.commands.run(c.id);
  }

  function open() {
    if (!overlay) build();
    sel = 0;
    input.value = '';
    overlay.classList.remove('hidden');
    refresh();
    input.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    input.blur();
  }

  function isOpen() { return !!overlay && !overlay.classList.contains('hidden'); }

  function init() {
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen()) close(); else open();
      }
    }, true);
  }

  App.cmdPalette = { init: init, open: open, close: close, isOpen: isOpen };
})();
