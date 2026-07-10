/* 라이브러리 팔레트 — 부품 목록 표시, 검색, EDZ 가져오기, 배치 시작 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Palette = (App.palette = {});

  let listEl, searchEl, countEl;
  let library = [];
  let filter = '';
  let mode = 'parts'; // 'parts' | 'syms' — 부품/심볼 탭
  // 카테고리(type) 표시 순서
  const TYPE_ORDER = ['MCCB', 'MCB', 'ELCB', 'MC', 'NF', 'CP', 'SMPS', 'PLC', 'RELAY', 'TB', 'STOP', 'SENSOR', 'MOTOR', 'SOL', 'LAMP', 'SW', 'SYM', 'ETC'];
  const collapsed = {}; // type → 접힘 여부 (기본 접힘)

  Palette.getLibrary = function () { return library; };

  Palette.setLibrary = function (parts) {
    library = parts.slice();
    render();
  };

  // 부품 추가 (중복 partNo 는 갱신)
  Palette.addParts = function (parts) {
    parts.forEach(function (p) {
      const i = library.findIndex(function (x) { return x.partNo === p.partNo; });
      if (i >= 0) library[i] = p; else library.push(p);
    });
    render();
  };

  // 샘플(기본) 부품 표시 여부 — 기본 꺼짐. 사용자가 하단 버튼으로 켜고 끔.
  const SKEY = 'panel-sample-parts';
  let samplesOn = null;
  function useSamples() {
    if (samplesOn == null) {
      samplesOn = false;
      try { samplesOn = global.localStorage && localStorage.getItem(SKEY) === '1'; } catch (e) {}
    }
    return samplesOn;
  }
  Palette.loadSamples = function (on) {
    samplesOn = on !== false;
    try { if (global.localStorage) localStorage.setItem(SKEY, samplesOn ? '1' : '0'); } catch (e) {}
    Palette.reloadUser();
  };

  // 시드 + 사용자(커스텀) 라이브러리 재구성 (같은 부품번호는 사용자 버전 우선)
  Palette.reloadUser = function () {
    const base = (App.seedParts || []).concat(useSamples() ? (App.sampleParts || []) : []);
    const user = App.userlib ? App.userlib.load() : [];
    const order = [];
    const map = {};
    base.forEach(function (p) { if (!(p.partNo in map)) order.push(p.partNo); map[p.partNo] = p; });
    user.forEach(function (p) { if (!(p.partNo in map)) order.push(p.partNo); map[p.partNo] = p; }); // 덮어쓰기
    const hidden = (App.userlib && App.userlib.hidden()) || [];
    library = order.map(function (k) { return map[k]; })
      .filter(function (p) { return p.custom || hidden.indexOf(p.partNo) < 0; }); // 숨김은 기본부품에만 적용(내부품은 항상 표시)
    render();
  };

  function matches(p) {
    // 탭 필터: 심볼(SYM)은 심볼 탭에서만, 나머지는 부품 탭에서만
    if ((mode === 'syms') !== (p.type === 'SYM')) return false;
    if (!filter) return true;
    const s = (p.partNo + ' ' + p.name + ' ' + p.type).toLowerCase();
    return s.indexOf(filter) >= 0;
  }

  function typeRank(t) { const i = TYPE_ORDER.indexOf(t); return i < 0 ? TYPE_ORDER.length : i; }

  // 검색 필터 비우기(이름/품번 변경 후 결과가 안 사라지게)
  function clearFilter() { filter = ''; if (searchEl) searchEl.value = ''; }

  // 부품이 목록에서 보이도록 보장: 검색 초기화 + 해당 탭 전환 + 카테고리 펼침
  Palette.reveal = function (p) {
    clearFilter();
    if (p && p.type) {
      collapsed[p.type] = false;
      mode = (p.type === 'SYM') ? 'syms' : 'parts';
      Palette.setMode(mode);
      return;
    }
    render();
  };

  function makeItem(p) {
    const item = document.createElement('div');
    item.className = 'pal-item w-full px-2 py-1.5 rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50 flex items-center gap-2 transition cursor-pointer';
    const color = App.typeColor(p.type);
    const placing = App.ui && App.ui.placing && App.ui.placing.partNo === p.partNo;
    if (placing) item.className += ' ring-2 ring-blue-500 bg-blue-50';
    // 부품 미리보기 썸네일(외곽 + 단자 위치)
    let thumb = '<svg class="pal-thumb" viewBox="' + (-p.w * 0.06) + ' ' + (-p.h * 0.06) + ' ' + (p.w * 1.12) + ' ' + (p.h * 1.12) + '" preserveAspectRatio="xMidYMid meet">' +
      '<rect x="0" y="0" width="' + p.w + '" height="' + p.h + '" rx="' + (Math.min(p.w, p.h) * 0.05) + '" fill="' + color + '" fill-opacity="0.14" stroke="' + color + '" stroke-width="' + (Math.max(p.w, p.h) * 0.025 + 0.4) + '"/>';
    (p.term || []).slice(0, 24).forEach(function (t) {
      const tx = (t.fx != null) ? t.fx * p.w : t.rx;   // fx/fy: 크기 비율 단자(모선)
      const ty = (t.fy != null) ? t.fy * p.h : t.ry;
      thumb += '<circle cx="' + tx + '" cy="' + ty + '" r="' + Math.max(1.4, Math.min(p.w, p.h) * 0.05) + '" fill="#fff" stroke="' + color + '" stroke-width="' + (Math.max(p.w, p.h) * 0.02 + 0.3) + '"/>';
    });
    thumb += '</svg>';
    item.innerHTML =
      thumb +
      '<span class="flex-1 min-w-0">' +
      '<span class="block text-xs font-semibold text-slate-700 truncate">' + App.esc(p.partNo) + (p.custom ? ' <span class="text-[9px] text-teal-600">★내부품</span>' : '') + '</span>' +
      '<span class="block text-[10px] text-slate-400 truncate">' + App.esc(p.name || '') + ' · ' + (p.est ? '≈' : '') + p.w + '×' + p.h + 'mm' + (p.est ? ' (추정)' : '') + '</span>' +
      '</span>' +
      '<button class="pal-dup text-[11px] text-slate-400 hover:text-teal-600 flex-shrink-0" title="복제(같은 형태, 새 품번)">⎘</button>' +
      '<button class="pal-edit text-[11px] text-slate-400 hover:text-blue-600 flex-shrink-0" title="이름 수정">✎</button>' +
      '<button class="pal-del text-[11px] text-red-400 hover:text-red-600 flex-shrink-0" title="삭제">✕</button>';
    item.querySelector('.pal-dup').onclick = function (e) {
      e.stopPropagation();
      const def = p.partNo + '-사본';
      let pn = prompt('복제할 새 품번(고유)', def);
      if (pn == null) return;
      pn = pn.trim() || def;
      const exist = library.some(function (x) { return x.partNo === pn; });
      if (exist) { let i = 2; while (library.some(function (x) { return x.partNo === pn + '-' + i; })) i++; pn = pn + '-' + i; }
      App.userlib.add(Object.assign({}, p, { partNo: pn })); // 같은 형태, 새 품번
      if (App.toolbar) App.toolbar.flash('복제됨: ' + pn);
      Palette.reveal(p);       // 검색 초기화 + 카테고리 펼침(접혀 있어도 보이게)
      Palette.reloadUser();
    };
    item.querySelector('.pal-edit').onclick = function (e) {
      e.stopPropagation();
      let title = prompt('라이브러리 타이틀(품번) 수정', p.partNo);
      if (title == null) return;
      title = title.trim() || p.partNo;
      // 품번 중복 방지(다른 부품과 충돌 시 자동 번호)
      if (title !== p.partNo && library.some(function (x) { return x.partNo === title; })) {
        let i = 2; while (library.some(function (x) { return x.partNo === title + '-' + i; })) i++; title = title + '-' + i;
      }
      // 타이틀 = 품명 (별도 품명 입력 없음 — 이름을 타이틀로 통일)
      const nm = title;
      const oldPN = p.partNo;
      App.userlib.add(Object.assign({}, p, { partNo: title, name: nm })); // 시드면 사용자 오버라이드
      if (title !== oldPN) { if (p.custom) App.userlib.remove(oldPN); else App.userlib.hide(oldPN); }
      const oldName = p.name || '';
      App.store.commit(function (s) {              // 배치된 동일 부품 품번/품명(+표시 라벨) 동기화
        s.components.forEach(function (c) {
          if (c.partNo !== oldPN) return;
          // 표시 라벨이 기존 품명/품번 그대로면 새 이름으로 갱신(사용자가 바꾼 라벨은 보존)
          if (c.label === oldName || c.label === oldPN || c.label === c.partName) c.label = nm || title;
          c.partNo = title; c.partName = nm;
        });
      });
      if (App.ui.placing && App.ui.placing.partNo === oldPN) App.ui.placing = null;
      if (App.toolbar) App.toolbar.flash('수정됨: ' + title);
      Palette.reveal(p);
      Palette.reloadUser();
    };
    item.onclick = function () {
      if (App.ui.placing && App.ui.placing.partNo === p.partNo) {
        App.ui.placing = null;
      } else {
        App.ui.placing = p;
        App.ui.tool = 'select';
        if (App.toolbar) App.toolbar.syncTool();
      }
      render();
    };
    item.querySelector('.pal-del').onclick = function (e) {
      e.stopPropagation();
      if (p.custom) {
        if (!confirm('내 부품 "' + p.partNo + '" 삭제할까요?')) return;
        App.userlib.remove(p.partNo);
      } else {
        if (!confirm('기본 부품 "' + p.partNo + '" 목록에서 숨길까요?\n(하단 "기본 부품 복원"으로 되살릴 수 있습니다.)')) return;
        App.userlib.hide(p.partNo);
      }
      if (App.ui.placing && App.ui.placing.partNo === p.partNo) App.ui.placing = null;
      Palette.reloadUser();
    };
    return item;
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    const shown = library.filter(matches);
    const base = library.filter(function (q) { return (mode === 'syms') === (q.type === 'SYM'); });
    countEl.textContent = shown.length + ' / ' + base.length;

    // 카테고리(type)별 그룹화
    const groups = {};
    shown.forEach(function (p) { (groups[p.type] = groups[p.type] || []).push(p); });
    const types = Object.keys(groups).sort(function (a, b) { return typeRank(a) - typeRank(b) || (a < b ? -1 : 1); });
    const searching = !!filter;

    types.forEach(function (t) {
      const items = groups[t];
      const color = App.typeColor(t);
      const open = searching ? true : !collapsed[t]; // 검색 중엔 항상 펼침
      const head = document.createElement('div');
      head.className = 'sticky top-0 z-10 bg-white flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none border border-slate-100 hover:bg-slate-50';
      head.innerHTML =
        '<span class="text-[10px] w-3 text-slate-400">' + (open ? '▾' : '▸') + '</span>' +
        '<span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:' + color + '"></span>' +
        '<span class="flex-1 text-xs font-bold" style="color:' + color + '">' + App.esc(t) + '</span>' +
        '<span class="text-[10px] text-slate-400">' + items.length + '</span>';
      head.onclick = function () { collapsed[t] = open; render(); };
      listEl.appendChild(head);

      if (open) {
        const wrap = document.createElement('div');
        wrap.className = 'space-y-1 pl-1 mt-1 mb-1';
        items.forEach(function (p) { wrap.appendChild(makeItem(p)); });
        listEl.appendChild(wrap);
      }
    });

    // 샘플(기본) 부품 불러오기/제거 — 부품 탭에서만 표시
    if (mode === 'parts' && (App.sampleParts || []).length) {
      const smp = document.createElement('button');
      smp.className = 'w-full mt-2 px-2 py-1 text-[11px] text-slate-500 border border-dashed border-slate-300 rounded hover:bg-slate-50';
      if (useSamples()) {
        smp.textContent = '샘플 부품 감추기 (LS 차단기/PLC/단자대 등)';
        smp.onclick = function () { Palette.loadSamples(false); };
      } else {
        smp.textContent = '＋ 샘플 부품 불러오기 (' + App.sampleParts.length + '개 · LS 차단기/PLC/단자대 등)';
        smp.onclick = function () { Palette.loadSamples(true); };
      }
      listEl.appendChild(smp);
    }

    // 숨긴 기본 부품 복원
    const hidden = (App.userlib && App.userlib.hidden()) || [];
    if (hidden.length) {
      const restore = document.createElement('button');
      restore.className = 'w-full mt-2 px-2 py-1 text-[11px] text-slate-500 border border-dashed border-slate-300 rounded hover:bg-slate-50';
      restore.textContent = '기본 부품 복원 (' + hidden.length + '개 숨김)';
      restore.onclick = function () {
        if (!confirm('숨긴 기본 부품 ' + hidden.length + '개를 모두 되살릴까요?')) return;
        App.userlib.unhideAll();
        Palette.reloadUser();
      };
      listEl.appendChild(restore);
    }
  }
  Palette.refresh = render;

  Palette.setMode = function (m) {
    mode = m;
    const tp = document.getElementById('lib-tab-parts');
    const ts = document.getElementById('lib-tab-syms');
    [[tp, m === 'parts'], [ts, m === 'syms']].forEach(function (pr) {
      if (!pr[0]) return;
      pr[0].classList.toggle('bg-blue-600', pr[1]);
      pr[0].classList.toggle('text-white', pr[1]);
      pr[0].classList.toggle('bg-white', !pr[1]);
      pr[0].classList.toggle('text-slate-600', !pr[1]);
    });
    render();
  };

  Palette.init = function (opts) {
    listEl = opts.list;
    searchEl = opts.search;
    countEl = opts.count;
    const tp = document.getElementById('lib-tab-parts');
    const ts = document.getElementById('lib-tab-syms');
    if (tp) tp.onclick = function () { Palette.setMode('parts'); };
    if (ts) ts.onclick = function () { Palette.setMode('syms'); };
    searchEl.addEventListener('input', function () {
      filter = searchEl.value.trim().toLowerCase();
      render();
    });
    // 시드 + 사용자 커스텀 부품으로 초기화
    Palette.reloadUser();
  };
})(window);
