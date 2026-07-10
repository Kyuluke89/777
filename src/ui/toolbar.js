/* 툴바 — 도구 선택, 전장 설정, 저장/불러오기, EDZ 가져오기, 줌 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const Toolbar = (App.toolbar = {});

  const TOOLS = ['select', 'duct-h', 'duct-v', 'rail-h', 'rail-v', 'wire', 'dim', 'text', 'cline'];

  function $(id) { return document.getElementById(id); }

  Toolbar.syncTool = function () {
    TOOLS.forEach(function (t) {
      const btn = $('tool-' + t);
      if (!btn) return;
      if (App.ui.tool === t && !App.ui.placing) {
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-white', 'text-slate-700');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-white', 'text-slate-700');
      }
    });
  };

  Toolbar.setTool = setTool; // 단축키(V/W/D)에서 사용
  function setTool(t) {
    App.ui.tool = t;
    App.ui.placing = null;
    App.ui.wireStart = null;
    App.ui.dim = { stage: 0 };
    App.ui.cline = { stage: 0 };
    if (App.render) {
      App.render.dimPreview(null); App.render.snapMarker(null); App.render.wirePreview(null);
      if (App.render.clinePreview) App.render.clinePreview(null);
    }
    if (App.palette) App.palette.refresh();
    Toolbar.syncTool();
  }

  function flash(msg) {
    const el = $('status-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('opacity-0');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { el.classList.add('opacity-0'); }, 2500);
  }
  Toolbar.flash = flash;

  Toolbar.init = function () {
    TOOLS.forEach(function (t) {
      const btn = $('tool-' + t);
      if (btn) btn.onclick = function () { setTool(t); };
    });

    // 전장 설정
    function applyPanel() {
      const w = Math.max(50, parseInt($('panel-w').value, 10) || 600);
      const h = Math.max(50, parseInt($('panel-h').value, 10) || 800);
      const g = Math.max(1, parseInt($('panel-grid').value, 10) || 10);
      const title = ($('panel-title').value || '').trim();
      App.store.commit(function (s) {
        s.panel.widthMM = w; s.panel.heightMM = h; s.panel.gridMM = g; s.panel.title = title;
      });
      App.render.all();
    }
    ['panel-w', 'panel-h', 'panel-grid'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('change', applyPanel);
    });
    if ($('panel-field')) $('panel-field').addEventListener('change', function () {
      const on = this.checked;
      App.store.commit(function (s) { s.panel.fieldZone = on; });
      App.render.all();
    });
    if ($('panel-frame')) $('panel-frame').addEventListener('change', function () {
      const on = this.checked;
      App.store.commit(function (s) { s.panel.frame = on; });
      App.render.all();
    });
    // 품명 표시 온/오프
    if ($('show-names')) $('show-names').addEventListener('change', function () {
      const on = this.checked;
      App.store.commit(function (s) { s.panel.showNames = on; });
      App.render.all();
    });
    // 스티커 표시 온/오프
    if ($('show-stickers')) $('show-stickers').addEventListener('change', function () {
      const on = this.checked;
      App.store.commit(function (s) { s.panel.showStickers = on; });
      App.render.all();
    });
    // 제목은 입력 즉시 반영
    if ($('panel-title')) $('panel-title').addEventListener('input', applyPanel);
    $('panel-fit').onclick = function () {
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM);
      App.render.all();
    };

    // 글씨 크기 배율 (부품은 카테고리/호기/이름 분리)
    ['ctype', 'ctag', 'cname', 'term', 'wire', 'dim'].forEach(function (k) {
      const el = $('font-' + k);
      if (el) el.addEventListener('change', function () {
        const v = Math.max(0.3, Math.min(5, parseFloat(el.value) || 1));
        el.value = v;
        App.store.commit(function (s) { s.fonts = s.fonts || {}; s.fonts[k] = v; });
        App.render.all();
      });
    });

    // 덕트 폭 — "직접입력…" 선택 시 원하는 폭을 입력해 목록에 추가
    $('duct-width').addEventListener('change', function () {
      if (this.value === 'custom') {
        const v = parseInt(prompt('덕트 폭 (mm)', App.ui.ductWidth || 60), 10);
        if (v > 0) {
          let opt = Array.from(this.options).find(function (o) { return o.value === String(v); });
          if (!opt) {
            opt = document.createElement('option');
            opt.value = String(v); opt.textContent = String(v);
            this.insertBefore(opt, this.querySelector('option[value="custom"]'));
          }
          this.value = String(v);
          App.ui.ductWidth = v;
        } else {
          this.value = String(App.ui.ductWidth || 60);
        }
        return;
      }
      App.ui.ductWidth = parseInt(this.value, 10) || 60;
    });
    // 덕트 길이 사전 지정 — 입력 시 클릭 한 번으로 배치
    if ($('duct-len')) $('duct-len').addEventListener('input', function () {
      App.ui.ductLen = parseInt(this.value, 10) || 0;
    });

    // 다음 라인번호(배선)
    $('wire-next').addEventListener('input', function () {
      App.ui.nextWireLabel = this.value.trim();
    });

    // 겹선 분리(겹쳐 지나가는 배선 나란히 벌리기)
    const ws = $('wire-spread');
    if (ws) ws.addEventListener('change', function () {
      App.ui.spreadWires = this.checked;
      App.render.all();
    });

    // 전원(AC/DC) 뱃지 표시 온/오프 — localStorage 유지
    const wac = $('wire-acdc-show');
    try { App.ui.showAcdc = localStorage.getItem('panel-show-acdc') !== '0'; } catch (e) { App.ui.showAcdc = true; }
    if (wac) {
      wac.checked = App.ui.showAcdc !== false;
      wac.addEventListener('change', function () {
        App.ui.showAcdc = this.checked;
        try { localStorage.setItem('panel-show-acdc', this.checked ? '1' : '0'); } catch (e) {}
        App.render.all();
      });
    }

    // 배선 모서리 라운드(둥글기) — 전역 설정: 새로고침/시트 전환에도 유지(localStorage)
    const wr = $('wire-round');
    try {
      const savedRound = parseFloat(localStorage.getItem('panel-wire-round'));
      if (!isNaN(savedRound) && savedRound > 0) App.ui.wireRound = savedRound;
    } catch (e) { /* file:// 등 차단 시 무시 */ }
    if (wr) {
      wr.value = App.ui.wireRound || 0;
      wr.addEventListener('input', function () {
        App.ui.wireRound = Math.max(0, parseFloat(this.value) || 0);
        try { localStorage.setItem('panel-wire-round', String(App.ui.wireRound)); } catch (e) {}
        App.render.all();
      });
    }

    // 라인번호 위치(단자로부터 거리 mm) — 슬라이더, localStorage 유지
    const wli = $('wire-label-inset');
    try {
      const savedInset = parseFloat(localStorage.getItem('panel-wire-label-inset'));
      if (!isNaN(savedInset) && savedInset >= 0) App.ui.wireLabelInset = savedInset;
    } catch (e) { /* 무시 */ }
    if (wli) {
      if (App.ui.wireLabelInset != null) wli.value = App.ui.wireLabelInset;
      const wliVal = $('wire-label-inset-val');
      if (wliVal) wliVal.textContent = (App.ui.wireLabelInset != null ? App.ui.wireLabelInset : 30) + 'mm';
      wli.addEventListener('input', function () {
        App.ui.wireLabelInset = Math.max(0, parseFloat(this.value) || 0);
        if (wliVal) wliVal.textContent = App.ui.wireLabelInset + 'mm';
        try { localStorage.setItem('panel-wire-label-inset', String(App.ui.wireLabelInset)); } catch (e) {}
        App.render.all();
      });
    }

    // 라인번호 크기(전역 단일값, 화면 고정) — 모든 라인에 동일 적용
    const wlpx = $('wire-label-px');
    if (wlpx) wlpx.addEventListener('input', function () {
      const v = Math.max(4, Math.min(60, parseFloat(this.value) || 11));
      App.store.commit(function (s) { s.fonts = s.fonts || {}; s.fonts.wirePx = v; });
      App.render.all();
    });

    // 배선 프리셋(색상·두께·규격) 드롭다운
    Toolbar.refreshPresets();
    const ps = $('wire-preset');
    if (ps) ps.addEventListener('change', function () {
      const p = (App.userlib.presets() || []).find(function (x) { return x.name === ps.value; });
      if (!p) { App.ui.wireDefaults = null; return; }
      App.ui.wireDefaults = { color: p.color, width: p.width, sq: p.sq, awg: p.awg, acdc: p.acdc || '', preset: p.name };
      // 선택된 배선이 있으면 즉시 적용
      const sel = App.ui.selected;
      let n = 0;
      if (sel && sel.size) {
        App.store.commit(function (s) {
          s.wires.forEach(function (w) {
            if (!sel.has(w.id)) return;
            w.color = p.color; w.width = p.width; w.sq = p.sq; w.awg = p.awg; w.acdc = p.acdc || ''; w.preset = p.name; n++;
          });
        });
        App.render.all(); App.inspector.update();
      }
      flash('프리셋 "' + p.name + '"' + (n ? ' → ' + n + '개 적용' : ' 적용(다음 배선부터)'));
    });
    // 프리셋 관리(만들기·수정·삭제) 모달
    const pManage = $('wire-preset-manage');
    if (pManage) pManage.onclick = function () { App.wirePresets.open(); };

    // ── 프리셋 표시/숨김 (레이어처럼) ──────────────────────────
    try {
      const hp = JSON.parse(localStorage.getItem('panel-hidden-presets') || '[]');
      App.ui.hiddenWirePresets = new Set(Array.isArray(hp) ? hp : []);
    } catch (e) { App.ui.hiddenWirePresets = new Set(); }
    function saveHiddenPresets() {
      try { localStorage.setItem('panel-hidden-presets', JSON.stringify(Array.from(App.ui.hiddenWirePresets))); } catch (e) {}
    }
    const visBtn = $('wire-vis');
    let visPop = null;
    function closeVisPop() { if (visPop) { visPop.remove(); visPop = null; } }
    function openVisPop() {
      closeVisPop();
      const names = (App.userlib.presets() || []).map(function (p) { return p.name; });
      visPop = document.createElement('div');
      visPop.id = 'wire-vis-pop';
      const r = visBtn.getBoundingClientRect();
      visPop.style.cssText = 'position:fixed;left:' + Math.round(r.left) + 'px;top:' + Math.round(r.bottom + 4) +
        'px;z-index:70;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 8px 24px rgba(2,6,23,.15);padding:8px 10px;min-width:170px;';
      let hh = '<div style="font-size:10px;color:#64748b;font-weight:700;margin-bottom:4px">프리셋 표시 (레이어)</div>';
      names.concat(['']).forEach(function (nm) {
        const on = !App.ui.hiddenWirePresets.has(nm);
        hh += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#334155;padding:2px 0;cursor:pointer">' +
          '<input type="checkbox" class="vis-cb" data-preset="' + App.esc(nm) + '"' + (on ? ' checked' : '') + '/> ' +
          (nm ? App.esc(nm) : '(프리셋 미지정)') + '</label>';
      });
      visPop.innerHTML = hh;
      document.body.appendChild(visPop);
      visPop.querySelectorAll('.vis-cb').forEach(function (cb) {
        cb.addEventListener('change', function () {
          const nm = cb.getAttribute('data-preset');
          if (cb.checked) App.ui.hiddenWirePresets.delete(nm);
          else App.ui.hiddenWirePresets.add(nm);
          saveHiddenPresets();
          App.render.all();
        });
      });
      setTimeout(function () {
        document.addEventListener('pointerdown', function onDoc(e) {
          if (visPop && !visPop.contains(e.target) && e.target !== visBtn) { closeVisPop(); document.removeEventListener('pointerdown', onDoc); }
        });
      }, 0);
    }
    if (visBtn) visBtn.onclick = function () { if (visPop) closeVisPop(); else openVisPop(); };

    // 라인번호 일괄 재부여
    const renum = $('wire-renum');
    if (renum) renum.onclick = function () {
      const s = App.store.get();
      if (!s.wires.length) { flash('배선이 없습니다'); return; }
      const start = ($('wire-next') && $('wire-next').value.trim()) || 'W1';
      if (!confirm('모든 라인번호를 "' + start + '"부터 위→아래, 왼→오 순서로 재부여할까요?')) return;
      let n = 0;
      App.store.commit(function (ss) { n = App.wires.renumber(ss, start); });
      App.render.all();
      flash('라인번호 ' + n + '개 재부여');
    };

    // 도면 정보(표제란)
    function applyTitleBlock() {
      App.store.commit(function (s) {
        s.titleBlock = {
          show: $('tb-show') ? $('tb-show').checked : true,
          docNo: $('tb-docno') ? $('tb-docno').value.trim() : '',
          author: $('tb-author') ? $('tb-author').value.trim() : '',
          date: $('tb-date') ? $('tb-date').value.trim() : '',
          rev: $('tb-rev') ? $('tb-rev').value.trim() : ''
        };
      });
      App.render.all();
    }
    ['tb-docno', 'tb-author', 'tb-date', 'tb-rev', 'tb-show'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('change', applyTitleBlock);
    });

    // 정렬/균등 간격
    [['al-left', 'left'], ['al-right', 'right'], ['al-top', 'top'], ['al-bottom', 'bottom'],
     ['al-hcenter', 'hcenter'], ['al-vcenter', 'vcenter']].forEach(function (pair) {
      const btn = $(pair[0]);
      if (btn) btn.onclick = function () {
        const n = App.interact.alignSelected(pair[1]);
        flash(n ? '정렬 ' + n + '개' : '부품 2개 이상 선택하세요');
      };
    });
    [['al-disth', 'h'], ['al-distv', 'v']].forEach(function (pair) {
      const btn = $(pair[0]);
      if (btn) btn.onclick = function () {
        const n = App.interact.distributeSelected(pair[1]);
        flash(n ? '균등 간격 ' + n + '개' : '부품 3개 이상 선택하세요');
      };
    });
    // 간격 배열 — 겹친 부품을 지정 간격으로 나란히
    [['al-packh', 'h'], ['al-packv', 'v']].forEach(function (pair) {
      const btn = $(pair[0]);
      if (btn) btn.onclick = function () {
        const gap = Math.max(0, parseFloat($('al-gap') && $('al-gap').value) || 0);
        App.interact.packSelected(pair[1], gap);
      };
    });

    // 줌 컨트롤(캔버스 우하단)
    function zoomCenter(factor) {
      const svg = App.viewport.svg();
      const r = svg.getBoundingClientRect();
      App.viewport.zoomAt(r.x + r.width / 2, r.y + r.height / 2, factor);
      App.render.all();
      Toolbar.updateZoomPct();
    }
    if ($('zoom-in')) $('zoom-in').onclick = function () { zoomCenter(1.3); };
    if ($('zoom-out')) $('zoom-out').onclick = function () { zoomCenter(1 / 1.3); };
    if ($('zoom-fit')) $('zoom-fit').onclick = function () {
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM);
      App.render.all();
      Toolbar.updateZoomPct();
    };

    // 전류 흐름 애니메이션 재생/정지
    const flowBtn = $('wire-flow');
    if (flowBtn) flowBtn.onclick = function () {
      const on = !App.ui.flow;
      App.render.setFlow(on);
      flowBtn.textContent = on ? '⏸ 흐름' : '▶ 흐름';
      flowBtn.classList.toggle('bg-blue-600', on);
      flowBtn.classList.toggle('text-white', on);
      flowBtn.classList.toggle('bg-white', !on);
      if (on) {
        const has = App.store.get().wires.some(function (w) { return w.acdc; });
        if (!has) flash('AC/DC로 지정된 배선이 없습니다. 배선 선택 → 전원구분에서 AC/DC를 고르세요.');
      }
    };

    // 액션
    $('act-new').onclick = function () {
      if (!confirm('새 프로젝트를 시작할까요? 저장하지 않은 변경은 사라집니다.')) return;
      App.store.replace(App.createEmptyProject());
      App.ui.selected.clear();
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM);
      App.render.all();
      App.inspector.update();
      flash('새 프로젝트');
    };
    $('act-save').onclick = function () { App.persistence.saveToFile(App.store.get()); flash('JSON 저장됨'); };
    $('act-load').onclick = function () {
      App.persistence.loadFromFile(function (data) {
        App.store.replace(data);
        App.ui.selected.clear();
        const p = data.panel;
        App.viewport.fitTo(p.widthMM, p.heightMM);
        App.render.all();
        App.inspector.update();
        Toolbar.syncFromState();
        flash('불러왔습니다');
      });
    };
    $('act-undo').onclick = function () { App.store.undo(); App.ui.selected.clear(); App.render.all(); App.inspector.update(); };
    $('act-redo').onclick = function () { App.store.redo(); App.render.all(); };
    $('act-delete').onclick = function () { App.interact.deleteSelected(); };
    $('act-rotate').onclick = function () { App.interact.rotateSelected(); };
    $('act-dup').onclick = function () { App.interact.duplicateSelected(); };
    if ($('act-matchprop')) $('act-matchprop').onclick = function () { App.interact.startMatchProp(); };
    if ($('al-between')) $('al-between').onclick = function () { App.interact.startCenterBetween(); };
    if ($('act-walign')) $('act-walign').onclick = function () { App.interact.startWireAlign(); };
    $('act-lock').onclick = function () { App.interact.toggleLock(); };

    // 커스텀 부품 만들기 + 내 부품 내보내기/가져오기
    $('act-custom').onclick = function () { App.partEditor.open(); };
    $('lib-export').onclick = function () { App.userlib.exportFile(); flash('내 부품 내보냄'); };
    $('lib-import').onclick = function () {
      App.userlib.importFile(function () { App.palette.reloadUser(); flash('내 부품 가져옴'); });
    };

    // EDZ 가져오기
    $('act-edz').onclick = function () { $('edz-file').click(); };
    $('edz-file').onchange = function () {
      const file = this.files && this.files[0];
      if (!file) return;
      flash('EDZ 분석 중…');
      App.edz.importFile(file).then(function (parts) {
        App.palette.addParts(parts);
        flash(parts.length + '개 부품 추가됨');
      }).catch(function (e) {
        alert('EDZ 가져오기 실패\n\n' + e.message);
        flash('EDZ 실패');
      });
      this.value = '';
    };

    // 내보내기
    $('act-bom').onclick = function () { const n = App.exporter.bom(); flash('BOM ' + n + '행 저장'); };
    if ($('act-plist')) $('act-plist').onclick = function () {
      const n = App.xlsx.partsList();
      if (n) flash('파츠리스트 ' + n + '품목 저장 (.xlsx)');
    };
    $('act-wlist').onclick = function () { const n = App.exporter.wiringList(); flash('배선표 ' + n + '행 저장'); };
    $('act-png').onclick = function () { App.exporter.png(2); flash('PNG 내보내기'); };
    if ($('act-io')) $('act-io').onclick = function () { const n = App.exporter.ioList(); flash('I/O 리스트 ' + n + '행 저장'); };
    if ($('act-cable')) $('act-cable').onclick = function () { const n = App.exporter.cableList(); flash('케이블표 ' + n + '행 저장'); };
    if ($('act-dxf')) $('act-dxf').onclick = function () { App.exporter.dxf(); flash('DXF 내보내기'); };
    $('act-print').onclick = function () { App.exporter.print(); };
    if ($('act-3d')) $('act-3d').onclick = function () { if (App.view3d) App.view3d.open(); };

    // 좌/우 패널 접기 (모바일·좁은 화면용)
    function bindPanelToggle(btnId, panelId, openCh, closeCh) {
      const btn = $(btnId), panel = document.getElementById(panelId);
      if (!btn || !panel) return;
      btn.onclick = function () {
        const hidden = panel.style.display === 'none';
        panel.style.display = hidden ? '' : 'none';
        btn.textContent = hidden ? openCh : closeCh;
        App.render.all(); // 캔버스 폭 변경 반영(핸들 크기 등)
        Toolbar.updateZoomPct();
      };
    }
    bindPanelToggle('toggle-left', 'left-panel', '◀', '▶');
    bindPanelToggle('toggle-right', 'right-panel', '▶', '◀');

    // 도움말 모달
    const helpModal = document.getElementById('help-modal');
    function openHelp() { if (helpModal) helpModal.style.display = 'flex'; }
    function closeHelp() { if (helpModal) helpModal.style.display = 'none'; }
    if ($('act-help')) $('act-help').onclick = openHelp;
    if ($('help-close')) $('help-close').onclick = closeHelp;
    if (helpModal) helpModal.addEventListener('pointerdown', function (e) { if (e.target === helpModal) closeHelp(); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'F1') { e.preventDefault(); openHelp(); }
      else if (e.key === 'Escape' && helpModal && helpModal.style.display !== 'none') closeHelp();
    });

    Toolbar.syncTool();
    Toolbar.syncFromState();
  };

  // 현재 줌 배율 표시 갱신 (100% = 1px/mm)
  Toolbar.updateZoomPct = function () {
    const el = $('zoom-pct');
    if (!el || !App.viewport.svg()) return;
    el.textContent = Math.round(App.viewport.scale() * 100) + '%';
  };

  // 배선 프리셋 드롭다운 채우기
  Toolbar.refreshPresets = function (selectName) {
    const ps = $('wire-preset');
    if (!ps || !App.userlib) return;
    const list = App.userlib.presets() || [];
    let html = '<option value="">기본</option>';
    list.forEach(function (p) {
      html += '<option value="' + p.name + '"' + (p.name === selectName ? ' selected' : '') + '>' + p.name + '</option>';
    });
    ps.innerHTML = html;
  };

  // 상태값을 입력 필드에 반영
  Toolbar.syncFromState = function () {
    const s = App.store.get();
    const p = s.panel;
    if ($('panel-title')) $('panel-title').value = p.title || '';
    if ($('panel-w')) $('panel-w').value = p.widthMM;
    if ($('panel-h')) $('panel-h').value = p.heightMM;
    if ($('panel-grid')) $('panel-grid').value = p.gridMM;
    if ($('panel-field')) $('panel-field').checked = !!p.fieldZone;
    if ($('panel-frame')) $('panel-frame').checked = !!p.frame;
    if ($('show-names')) $('show-names').checked = p.showNames !== false;
    if ($('show-stickers')) $('show-stickers').checked = p.showStickers !== false;
    const f = s.fonts || {};
    ['ctype', 'ctag', 'cname', 'term', 'wire', 'dim'].forEach(function (k) {
      if ($('font-' + k)) $('font-' + k).value = f[k] || f.comp || 1;
    });
    if ($('wire-label-px')) $('wire-label-px').value = f.wirePx || 11;
    const tb = s.titleBlock || {};
    if ($('tb-docno')) $('tb-docno').value = tb.docNo || '';
    if ($('tb-author')) $('tb-author').value = tb.author || '';
    if ($('tb-date')) $('tb-date').value = tb.date || '';
    if ($('tb-rev')) $('tb-rev').value = tb.rev || '';
    if ($('tb-show')) $('tb-show').checked = tb.show !== false;
  };
})(window);
