/* app.js — 화면 렌더링·이벤트 */
(function () {
  'use strict';
  const C = window.CORE, DB = window.DB, AI = window.AI, MAN = window.MANUALS, SEED = window.SEED, EXPORT = window.EXPORT;
  const $ = C.$, $$ = C.$$;
  const esc = C.esc, num = C.num, won = C.won, r1 = C.round1, fmtDate = C.fmtDate, fmtShort = C.fmtDateShort;

  const S = { tab: 'home', vid: null, catVeh: 'all', cat: '전체', query: '', chat: [], sw: 'none', installPrompt: null, editing: null };
  let deferredPrompt = null;

  /* ================= 부트 ================= */
  async function boot() {
    try {
      await DB.init();
    } catch (e) {
      document.querySelector('#boot .boot-text').textContent = '저장소를 열지 못했습니다: ' + e.message;
      return;
    }
    const vs = DB.vehicles();
    S.vid = DB.settings().activeVehicle && DB.vehicle(DB.settings().activeVehicle) ? DB.settings().activeVehicle : (vs[0] && vs[0].id);
    const d = new Date();
    $('#todayLabel').textContent = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + C.weekdayKo(C.todayISO()) + '요일 · ' + (vs.length) + '대 관리 중';
    // 첫 브리핑 인사
    if (!S.chat.length) {
      S.chat.push({ role: 'a', text: '안녕하세요. ' + vs.length + '대의 기록·설명서·정비 주기를 함께 보고 있습니다.\n\n예) "레이 엔진오일 몇 리터야?", "브레이크 소음 나는데 보증 남았어?", "콜로라도 4H 언제 써?"', refs: [] });
    }
    bindEvents();
    renderAll();
    $('#boot').hidden = true;
    $('#app').hidden = false;
    registerSW();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) { S.sw = 'unsupported'; return; }
    navigator.serviceWorker.register('sw.js', { scope: './' }).then(reg => {
      S.sw = reg.active ? 'active' : 'registered';
      navigator.serviceWorker.addEventListener('controllerchange', () => { S.sw = 'active'; });
    }).catch(err => {
      S.sw = 'error:' + err.message;
      console.warn('SW 등록 실패', err);
    });
  }

  /* ================= 이벤트 ================= */
  function bindEvents() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    $('#chatForm').addEventListener('submit', e => {
      e.preventDefault();
      const q = $('#chatInput').value.trim();
      if (!q) return;
      $('#chatInput').value = '';
      ask(q);
    });
    $('#btnQuickTop').addEventListener('click', () => openQuickInput());
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; S.installPrompt = true; });
    window.addEventListener('online', () => showToast('온라인 · 오프라인 기록도 그대로입니다', 'ok'));
  }

  function onClick(e) {
    const t = e.target.closest('[data-act]');
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      S.tab = tabBtn.dataset.tab;
      renderAll();
      window.scrollTo({ top: 0 });
      return;
    }
    if (e.target.closest('[data-close]')) { closeSheet(); return; }
    if (!t) return;
    const act = t.dataset.act, id = t.dataset.id;
    switch (act) {
      case 'vehicle': selectVehicle(id); break;
      case 'quick': openQuickInput(); break;
      case 'add-fuel': openFuelForm(); break;
      case 'edit-fuel': openFuelForm(DB.getState().fuelLogs.find(f => f.id === id)); break;
      case 'del-fuel': confirmDelete('주유 기록을 삭제할까요?', () => { DB.removeFuel(id); renderAll(); showToast('삭제했습니다'); }); break;
      case 'add-maint': openMaintForm(); break;
      case 'edit-maint': openMaintForm(DB.getState().maintLogs.find(m => m.id === id)); break;
      case 'del-maint': confirmDelete('정비 기록을 삭제할까요?', () => { DB.removeMaint(id); renderAll(); showToast('삭제했습니다'); }); break;
      case 'reg-consumable': openMaintForm({ itemKey: t.dataset.item }); break;
      case 'ask': ask(t.dataset.q); break;
      case 'ref': openManualDetail(id); break;
      case 'gemini': geminiDeep(t.dataset.q); break;
      case 'fill-odo': fillOdometerSuggestion(); break;
      case 'qi-sample': fillQuickSample(); break;
      case 'qi-photo': $('#fileReceipt').click(); break;
      case 'qi-analyze': analyzeQuick(); break;
      case 'qi-save': saveQuickDraft(); break;
      case 'filter-veh': S.catVeh = id; renderManual(); break;
      case 'filter-cat': S.cat = id; renderManual(); break;
      case 'manual-clear': $('#manualSearch').value = ''; S.query = ''; S.cat = '전체'; S.catVeh = 'all'; renderManual(); break;
      case 'export-xlsx': doExportXlsx(); break;
      case 'export-json': doExportJson(); break;
      case 'import-json': $('#fileImport').click(); break;
      case 'save-key': saveKey(); break;
      case 'clear-key': clearKey(); break;
      case 'add-vehicle': openVehicleForm(); break;
      case 'edit-vehicle': openVehicleForm(DB.vehicle(id)); break;
      case 'del-vehicle': confirmDelete('이 차량과 기록을 모두 삭제할까요?', () => { DB.removeVehicle(id); S.vid = DB.vehicles()[0] && DB.vehicles()[0].id; renderAll(); showToast('삭제했습니다'); }); break;
      case 'reset': confirmDelete('모든 기록을 기본 데이터로 되돌릴까요? (내가 추가한 기록은 사라집니다)', () => { DB.reset().then(() => { S.vid = DB.vehicles()[0].id; renderAll(); closeSheet(); showToast('기본 데이터로 되돌렸습니다', 'ok'); }); }); break;
      case 'install': promptInstall(); break;
      case 'save-fuel': saveFuelForm(); break;
      case 'save-maint': saveMaintForm(); break;
      case 'save-vehicle': saveVehicleForm(); break;
      default: break;
    }
  }

  function onInput(e) {
    if (e.target.id === 'manualSearch') {
      S.query = e.target.value;
      renderManualList();
    }
    if (e.target.id === 'geminiKey' || e.target.id === 'geminiModel') return;
    // 폼 자동 계산
    if (/^ff_(unit|liters|amount)$/.test(e.target.id)) autoCalcFuel();
    if (/^mf_(parts|labor|total)$/.test(e.target.id)) autoCalcMaint();
  }

  function selectVehicle(id) {
    S.vid = id;
    DB.setSetting('activeVehicle', id);
    renderAll();
  }

  /* ================= 렌더 ================= */
  function renderAll() {
    renderVehTabs();
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === S.tab));
    ['home', 'fuel', 'maint', 'manual', 'settings'].forEach(k => {
      const el = document.getElementById('view-' + k);
      if (el) el.hidden = (k !== S.tab);
    });
    if (S.tab === 'home') renderHome();
    if (S.tab === 'fuel') renderFuel();
    if (S.tab === 'maint') renderMaint();
    if (S.tab === 'manual') renderManual();
    if (S.tab === 'settings') renderSettings();
  }

  function renderVehTabs() {
    const vs = DB.vehicles();
    $('#vehTabs').innerHTML = vs.map(v => `
      <button class="veh-chip ${v.id === S.vid ? 'on' : ''}" data-act="vehicle" data-id="${esc(v.id)}" style="--c:${esc(v.color || '#7aa2ff')}">
        <span class="dot"></span>${esc(v.name)} ${esc(v.plate)}
      </button>`).join('');
  }

  function vehEmoji(v) { return (v && v.emoji) || '🚗'; }

  /* ---------- 홈 ---------- */
  function renderHome() {
    const v = DB.vehicle(S.vid);
    if (!v) { $('#briefingCard').innerHTML = '<div class="card empty">차량을 먼저 추가해 주세요.</div>'; return; }
    const items = AI.briefing(v.id);
    const stats = AI.fuelStats(v.id);

    $('#briefingCard').innerHTML = `
      <div class="brief">
        <div class="brief-head">
          <span style="font-size:16px">🤖</span>
          <div class="brief-title">오늘의 AI 차량 브리핑 · ${esc(v.name)}</div>
          <div class="brief-upd">${esc(C.nowStamp().slice(11))} 갱신</div>
        </div>
        ${items.length ? items.map(it => `
          <div class="brief-item ${it.level === 'hi' ? 'hi' : it.level === 'mid' ? 'mid' : ''}">
            <div class="brief-ic">${esc(it.icon)}</div>
            <div style="flex:1;min-width:0">
              <div class="t">${esc(it.title)}</div>
              <div class="d">${esc(it.detail)}</div>
            </div>
            <div class="p">${it.level === 'hi' ? '긴급' : it.level === 'mid' ? '주의' : '참고'}</div>
          </div>`).join('') : `<div class="brief-item"><div class="brief-ic">✅</div><div><div class="t">지금 급한 항목이 없습니다</div><div class="d">다음 주유 때 주행거리만 넣어 주세요.</div></div></div>`}
        <div class="brief-foot">
          <button class="btn small" data-act="quick" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.22);color:#fff">🤖 AI 빠른 입력</button>
          <button class="btn small" data-act="add-maint" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.22);color:#fff">🔧 정비 기록</button>
        </div>
      </div>`;

    const ins = C.dday(v.inspectionEnd);
    const insurance = v.insurance && v.insurance.end ? C.dday(v.insurance.end) : null;
    $('#homeStats').innerHTML = `
      <div class="stat">
        <div class="k">누적 주유비</div>
        <div class="v">${stats.totalAmount ? num(Math.round(stats.totalAmount)) : '-'}<small>원</small></div>
        <div class="s">${stats.count}회 · ${r1(stats.totalLiters)}L</div>
      </div>
      <div class="stat">
        <div class="k">평균 실연비</div>
        <div class="v">${stats.avgEco ? r1(stats.avgEco) : '-'}<small>km/L</small></div>
        <div class="s">${stats.lastEco ? '최근 ' + r1(stats.lastEco) + 'km/L' : '구간 기록 없음'}</div>
      </div>
      <div class="stat">
        <div class="k">정기검사</div>
        <div class="v" style="color:${ins != null && ins <= 30 ? '#dd3b3b' : ins != null && ins <= 60 ? '#d98300' : 'inherit'}">${C.ddayLabel(v.inspectionEnd)}</div>
        <div class="s">${fmtDate(v.inspectionEnd)} 만료</div>
      </div>
      <div class="stat">
        <div class="k">보험 만기</div>
        <div class="v" style="color:${insurance != null && insurance <= 30 ? '#dd3b3b' : 'inherit'}">${insurance != null ? C.ddayLabel(v.insurance.end) : '미확인'}</div>
        <div class="s">${v.insurance ? esc(v.insurance.company) : '-'}</div>
      </div>
      <div class="stat">
        <div class="k">주행거리</div>
        <div class="v">${v.odometer ? num(v.odometer) : '-'}<small>km</small></div>
        <div class="s">${fmtDate(v.odometerDate)} 기준</div>
      </div>
      <div class="stat">
        <div class="k">다음 주유</div>
        <div class="v">${stats.nextFuel ? C.ddayLabel(stats.nextFuel.date) : '-'}</div>
        <div class="s">${stats.nextFuel ? fmtDate(stats.nextFuel.date) + ' 예상' : '기록 부족'}</div>
      </div>`;

    const dues = AI.dues(v.id).slice(0, 6);
    $('#dueCard').innerHTML = `
      <div class="vhead">
        <div class="badge" style="--cbg:${esc(v.color)}22;--c:${esc(v.color)}">${vehEmoji(v)}</div>
        <div>
          <div class="nm">${esc(v.fullName || v.name)}</div>
          <div class="sub">${esc(v.yearLabel || '')} · ${esc(v.engine || '')} · ${esc(v.transmission || '')}</div>
        </div>
      </div>
      <h2 style="font-size:13px;margin:4px 0 8px">챙길 일정</h2>
      ${dues.length ? dues.map(d => `
        <div class="kv-row" style="padding:7px 0;border-top:1px solid var(--line)">
          <span>${esc(d.icon)} ${esc(d.title)}<div class="tiny" style="color:var(--ink3)">${esc(d.note || '')}</div></span>
          <b style="color:${d.days < 0 ? '#dd3b3b' : d.days <= 30 ? '#d98300' : 'var(--ink)'}">${C.ddayLabel(d.date)}</b>
        </div>`).join('') : '<div class="muted">등록된 일정이 없습니다.</div>'}
    `;

    const recent = recentRecords(v.id, 4);
    $('#recentCard').innerHTML = `
      <div class="row-split" style="margin-bottom:8px"><h2 style="font-size:13px">최근 기록</h2>
        <button class="mini" data-act="quick">＋ 빠른 입력</button></div>
      ${recent.length ? recent.map(recCard).join('') : '<div class="muted">아직 기록이 없습니다. 주유할 때 AI 빠른 입력을 써 보세요.</div>'}
    `;
  }

  function recentRecords(vid, n) {
    const f = DB.fuelLogs(vid).map(x => Object.assign({ _kind: 'fuel' }, x));
    const m = DB.maintLogs(vid).map(x => Object.assign({ _kind: 'maint' }, x));
    return f.concat(m).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, n);
  }

  function recCard(r) {
    if (r._kind === 'fuel') {
      return `<div class="rec" style="box-shadow:none;border:1px solid var(--line);padding:10px 11px">
        <div class="ric">⛽</div>
        <div class="rmain">
          <div class="rt"><div class="rname">${esc(r.station || '주유')}</div><div class="ramt">${won(r.amount)}</div></div>
          <div class="rsub"><span>${fmtDate(r.date)}</span><span>${r.odometer ? num(r.odometer) + 'km' : '주행거리 미입력'}</span><span>${r.liters ? r1(r.liters) + 'L' : ''}</span></div>
        </div>
      </div>`;
    }
    return `<div class="rec" style="box-shadow:none;border:1px solid var(--line);padding:10px 11px">
      <div class="ric">🔧</div>
      <div class="rmain">
        <div class="rt"><div class="rname">${esc(r.item || '정비')}</div><div class="ramt">${r.total ? won(r.total) : ''}</div></div>
        <div class="rsub"><span>${fmtDate(r.date)}</span><span>${esc(r.shop || '')}</span></div>
      </div>
    </div>`;
  }

  /* ---------- 주유 ---------- */
  function quickBoxHTML() {
    const lastQ = S.lastQuickType || '자동';
    return `<div class="card" style="border:1px solid #dbe6ff;background:linear-gradient(180deg,#f7faff,#fff)">
      <div class="row-split" style="margin-bottom:8px">
        <h2 style="font-size:13.5px">🤖 AI 빠른 입력</h2>
        <span class="pill b">오프라인 동작</span>
      </div>
      <p class="tiny muted" style="margin:0 0 8px">카드 결제 문자나 메모를 붙여넣으면 날짜·주유소·금액·단가·수량·주행거리를 자동으로 뽑아냅니다.</p>
      <button class="btn block primary" data-act="quick">문자·메모 붙여넣기</button>
    </div>`;
  }

  function renderFuel() {
    const v = DB.vehicle(S.vid);
    const st = AI.fuelStats(v.id);
    $('#quickBoxFuel').innerHTML = quickBoxHTML();
    $('#fuelSummary').innerHTML = `
      <div class="row-split"><h2 style="font-size:13px">${esc(v.name)} 주유 요약</h2>
        <button class="mini" data-act="add-fuel">＋ 직접 입력</button></div>
      <div class="stat-grid" style="margin:10px 0 0">
        <div class="stat" style="box-shadow:none;border:1px solid var(--line);min-height:66px">
          <div class="k">누적 주유비</div><div class="v" style="font-size:17px">${num(Math.round(st.totalAmount))}<small>원</small></div>
          <div class="s">${st.count}회 · ${r1(st.totalLiters)}L</div></div>
        <div class="stat" style="box-shadow:none;border:1px solid var(--line);min-height:66px">
          <div class="k">평균 실연비</div><div class="v" style="font-size:17px">${st.avgEco ? r1(st.avgEco) : '-'}<small>km/L</small></div>
          <div class="s">평균 단가 ${st.avgUnitPrice ? num(Math.round(st.avgUnitPrice)) + '원' : '-'}</div></div>
      </div>
      <div class="kv" style="margin:10px 0 0">
        <div class="kv-row"><span>이번 달</span><b>${won(st.monthAmount)}${st.monthKm ? ' · ' + num(Math.round(st.monthKm)) + 'km' : ''}</b></div>
        <div class="kv-row"><span>다음 주유 예상</span><b>${st.nextFuel ? fmtDate(st.nextFuel.date) + ' (' + C.ddayLabel(st.nextFuel.date) + ')' : '-'}</b></div>
        <div class="kv-row"><span>일평균 주행</span><b>${st.dailyKm ? r1(st.dailyKm) + 'km/일' : '-'}</b></div>
      </div>`;

    const rows = st.rows.slice().reverse();
    $('#fuelList').innerHTML = rows.length ? rows.map(r => {
      const ecoPill = r.eco ? `<span class="pill ${r.eco < (st.avgEco || 0) * 0.85 ? 'r' : 'b'}">${r1(r.eco)}km/L</span>` : '';
      return `<div class="rec">
        <div class="ric">⛽</div>
        <div class="rmain">
          <div class="rt"><div class="rname">${esc(r.station || '주유소 미입력')}</div><div class="ramt">${won(r.amount)}</div></div>
          <div class="rsub">
            <span>${fmtDate(r.date)}</span>
            <span>${r.odometer ? num(r.odometer) + 'km' : '<b style="color:#d98300">주행거리 미입력</b>'}</span>
            <span>${r.liters ? r1(r.liters) + 'L' : ''}</span>
            <span>${r.unitPrice ? num(r.unitPrice) + '원/L' : ''}</span>
            ${ecoPill}
            ${r.intervalKm ? `<span>+${num(r.intervalKm)}km</span>` : ''}
          </div>
          <div class="rec-actions">
            <button class="mini" data-act="edit-fuel" data-id="${esc(r.id)}">수정</button>
            <button class="mini" data-act="del-fuel" data-id="${esc(r.id)}">삭제</button>
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="card empty">주유 기록이 없습니다.<br>AI 빠른 입력으로 첫 기록을 남겨 보세요.</div>';
  }

  /* ---------- 정비 ---------- */
  function renderMaint() {
    const v = DB.vehicle(S.vid);
    const cons = AI.consumables(v.id);
    $('#consumableBox').innerHTML = `
      <div class="row-split" style="margin-bottom:10px">
        <h2 style="font-size:13px">소모품 진행률</h2>
        <span class="pill ${v.odometerStale ? 'a' : 'g'}">${v.odometerStale ? '주행거리 ' + fmtDate(v.odometerDate) : '주행 ' + num(v.odometer) + 'km'}</span>
      </div>
      <div class="cons">
        ${cons.map(c => {
          const pct = c.progress == null ? 0 : Math.max(0, Math.min(100, Math.round(c.progress * 100)));
          const cls = c.status === 'overdue' ? 'crit' : c.status === 'soon' ? 'warn' : '';
          const val = c.status === 'unknown' ? '<span style="color:#96600a">기록 없음</span>'
            : c.remainKm != null ? (c.remainKm >= 0 ? '남은 ' + num(Math.round(c.remainKm)) + 'km' : '초과 ' + num(Math.abs(Math.round(c.remainKm))) + 'km')
              : (c.nextDate ? '예정 ' + fmtDate(c.nextDate) : pct + '%');
          return `<div class="cons-item">
            <div class="cons-top">
              <span class="cons-name">${esc(c.icon)} ${esc(c.label)}</span>
              <span class="cons-val">${val}</span>
            </div>
            <div class="bar ${cls}"><i style="width:${c.status === 'unknown' ? 0 : Math.min(100, pct)}%"></i></div>
            <div class="row-split">
              <span class="cons-note">${c.km ? num(c.km) + 'km' : ''}${c.km && c.months ? ' / ' : ''}${c.months ? c.months + '개월' : ''}${c.lastDate ? ' · 최근 ' + fmtShort(c.lastDate) : ''}</span>
              ${c.status === 'unknown' || pct >= 85 ? `<button class="mini" data-act="reg-consumable" data-item="${esc(c.item)}">교환 등록</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;

    const ms = DB.maintLogs(v.id);
    $('#maintList').innerHTML = ms.length ? ms.map(m => {
      const wd = m.warrantyUntil ? C.dday(m.warrantyUntil) : null;
      return `<div class="rec">
        <div class="ric">🔧</div>
        <div class="rmain">
          <div class="rt"><div class="rname">${esc(m.item)}</div><div class="ramt">${m.total ? won(m.total) : '-'}</div></div>
          <div class="rsub">
            <span>${fmtDate(m.date)}</span>
            ${m.odometer ? `<span>${num(m.odometer)}km</span>` : ''}
            <span>${esc(m.shop || '')}</span>
            ${wd != null && wd >= -3 ? `<span class="pill ${wd <= 7 ? 'a' : 'g'}">보증 ${C.ddayLabel(m.warrantyUntil)}</span>` : ''}
          </div>
          ${(m.parts || m.labor) ? `<div class="rsub"><span>부품 ${m.parts ? num(m.parts) : '-'}</span><span>공임 ${m.labor ? num(m.labor) : '-'}</span>${m.vat ? `<span>부가세 ${num(m.vat)}</span>` : ''}</div>` : ''}
          ${m.note ? `<div class="rsub"><span>${esc(m.note)}</span></div>` : ''}
          <div class="rec-actions">
            <button class="mini" data-act="edit-maint" data-id="${esc(m.id)}">수정</button>
            <button class="mini" data-act="del-maint" data-id="${esc(m.id)}">삭제</button>
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="card empty">정비 기록이 없습니다.</div>';
  }

  /* ---------- 설명서 · AI ---------- */
  function renderManual() {
    const vs = DB.vehicles();
    $('#manualCatChips').innerHTML = MAN.CATS.map(c =>
      `<button class="chip ${S.cat === c ? 'on' : ''}" data-act="filter-cat" data-id="${esc(c)}">${esc(c)}</button>`).join('');
    // 차량 필터
    let vehChips = `<div class="chips" style="padding-top:0">
      <button class="chip ${S.catVeh === 'all' ? 'on' : ''}" data-act="filter-veh" data-id="all">전체</button>` +
      vs.map(v => `<button class="chip ${S.catVeh === v.id ? 'on' : ''}" data-act="filter-veh" data-id="${esc(v.id)}">${esc(v.name)}</button>`).join('') +
      `</div>`;
    if (!$('#vehFilterRow')) {
      const div = document.createElement('div');
      div.id = 'vehFilterRow';
      $('.search-wrap').insertBefore(div, $('#manualCatChips'));
    }
    $('#vehFilterRow').innerHTML = vehChips;
    renderChat();
    renderManualList();
  }

  function renderChat() {
    const log = $('#chatLog');
    log.innerHTML = S.chat.map((m, i) => {
      if (m.role === 'q') return `<div class="msg q">${esc(m.text)}</div>`;
      const refs = (m.refs || []).map(id => {
        const it = MAN.get(id);
        return it ? `<button data-act="ref" data-id="${esc(id)}">📖 ${esc(it.title.slice(0, 18))}</button>` : '';
      }).join('');
      const gem = (m.canGemini && AI.geminiKey()) ? `<button data-act="gemini" data-q="${esc(m.q || '')}">🔮 Gemini로 더 깊게</button>` : '';
      return `<div class="msg a">${esc(m.text)}${(refs || gem) ? `<div class="mref">${refs}${gem}</div>` : ''}</div>`;
    }).join('');
    log.scrollTop = log.scrollHeight;
    const chips = ['레이 엔진오일 몇 리터야?', '브레이크 소음 나는데 보증 남았어?', '콜로라도 4H 언제 써?', '연비 왜 떨어졌지?', '다음 정비 뭐 있어?', '차박 안전하게 자는 법'];
    $('#chatSuggest').innerHTML = chips.map(c => `<button data-act="ask" data-q="${esc(c)}">${esc(c)}</button>`).join('');
  }

  function renderManualList() {
    const res = MAN.search(S.query, { vehicleId: S.catVeh, cat: S.cat });
    const terms = S.query.trim().split(/\s+/).filter(Boolean);
    const label = S.catVeh === 'all' ? '전체 차량' : (DB.vehicle(S.catVeh) ? DB.vehicle(S.catVeh).name : '');
    $('#searchMeta').innerHTML = `${esc(label)} · ${res.length}건${S.query ? ' · "' + esc(S.query) + '" 검색' : ''}`;
    if (!res.length) {
      $('#manualList').innerHTML = '<div class="card empty">검색 결과가 없습니다.<br>예) 공기압, 엔진오일, 4H, 퓨즈, 견인, 겨울, 차박</div>';
      return;
    }
    $('#manualList').innerHTML = res.slice(0, 40).map(r => {
      const it = r.item;
      const vnames = it.v.indexOf('all') >= 0 ? '공통' : it.v.map(id => (DB.vehicle(id) || {}).name || id).join('·');
      return `<div class="mcard">
        <div class="mcard-top">
          <span class="mcat">${esc(it.cat)}</span>
          <span class="mveh">${esc(vnames)}</span>
          ${it.conf === 'official' ? '<span class="pill g" style="font-size:10px">설명서 확인</span>' : it.conf === 'ref' ? '<span class="pill b" style="font-size:10px">자료 정리</span>' : '<span class="pill a" style="font-size:10px">일반 기준</span>'}
        </div>
        <div class="mtitle">${C.highlight(it.title, terms)}</div>
        <div class="mbody">${C.highlight(it.body, terms)}</div>
        <div class="mtags">${it.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
        ${it.src ? `<div class="msrc"><a href="${esc(it.src.url)}" target="_blank" rel="noopener noreferrer">원문 보기 · ${esc(it.src.label)}</a></div>` : ''}
      </div>`;
    }).join('');
  }

  function openManualDetail(id) {
    const it = MAN.get(id);
    if (!it) return;
    openSheet(it.title, `
      <div class="mcard-top"><span class="mcat">${esc(it.cat)}</span><span class="mveh">${esc(it.v.indexOf('all') >= 0 ? '공통' : it.v.map(i => (DB.vehicle(i) || {}).name || i).join('·'))}</span></div>
      <div class="mbody" style="font-size:13.5px;white-space:pre-wrap">${esc(it.body)}</div>
      <div class="mtags">${it.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
      ${it.src ? `<div class="msrc" style="margin-top:12px"><a href="${esc(it.src.url)}" target="_blank" rel="noopener noreferrer">원문 보기 · ${esc(it.src.label)}</a></div>` : ''}
    `, '');
  }

  function ask(q) {
    S.chat.push({ role: 'q', text: q });
    const a = AI.answer(q, S.vid);
    S.chat.push({ role: 'a', text: a.text, refs: a.refs, canGemini: true, q });
    renderChat();
  }

  async function geminiDeep(q) {
    if (!AI.geminiKey()) { showToast('설정에서 Gemini 키를 먼저 넣어 주세요', 'err'); return; }
    S.chat.push({ role: 'a', text: '🔮 Gemini가 내 차 기록과 설명서를 함께 읽고 답변을 준비하고 있습니다…' });
    renderChat();
    try {
      const r = await AI.geminiChat(q, S.vid);
      S.chat.pop();
      S.chat.push({ role: 'a', text: '🔮 ' + r.text, refs: r.refs });
    } catch (e) {
      S.chat.pop();
      S.chat.push({ role: 'a', text: 'Gemini 호출에 실패했습니다: ' + e.message + '\n\n키와 모델명을 확인하거나, 위의 로컬 답변을 그대로 쓰셔도 됩니다.' });
    }
    renderChat();
  }

  /* ---------- 설정 ---------- */
  function renderSettings() {
    const s = DB.settings();
    $('#geminiKey').value = s.geminiKey || '';
    $('#geminiModel').value = s.geminiModel || 'gemini-2.5-flash';
    $('#keyState').innerHTML = s.geminiKey
      ? '<span class="pill g">키 저장됨 · 이 폰에만 보관</span> 영수증 사진 OCR과 심층 답변이 켜졌습니다.'
      : '<span class="pill">키 없음</span> 문자·메모 파서, 진단·예측, 매뉴얼 검색은 키 없이 모두 동작합니다.';
    $('#vehicleAdmin').innerHTML = DB.vehicles().map(v => `
      <div class="veh-admin-row">
        <div class="badge" style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:${esc(v.color)}22;color:${esc(v.color)}">${vehEmoji(v)}</div>
        <div style="flex:1"><div class="nm">${esc(v.name)} ${esc(v.plate)}</div><div class="sub">${esc(v.fullName || '')} · ${v.odometer ? num(v.odometer) + 'km' : '주행거리 미입력'}</div></div>
        <button class="mini" data-act="edit-vehicle" data-id="${esc(v.id)}">수정</button>
        ${DB.vehicles().length > 1 ? `<button class="mini" data-act="del-vehicle" data-id="${esc(v.id)}">삭제</button>` : ''}
      </div>`).join('');
    DB.storageEstimate().then(e => {
      const usedKb = e && e.usage ? (e.usage / 1024).toFixed(1) + 'KB' : null;
      $('#storageState').innerHTML = `
        <div class="kv-row"><span>저장 방식</span><b>${DB.mode() === 'idb' ? 'IndexedDB(폰 로컬)' : 'localStorage(폰 로컬)'}</b></div>
        <div class="kv-row"><span>차량 / 주유 / 정비</span><b>${DB.vehicles().length} / ${DB.getState().fuelLogs.length} / ${DB.getState().maintLogs.length}건</b></div>
        <div class="kv-row"><span>사용 용량</span><b>${usedKb || '-'}</b></div>
        <div class="kv-row"><span>기본 데이터</span><b>${esc((DB.getState().meta && DB.getState().meta.seededAt) || SEED.version)}</b></div>`;
    });
    const swTxt = { active: '<span class="pill g">동작 중</span> 오프라인에서도 열립니다.', registered: '<span class="pill b">등록됨</span>', unsupported: '<span class="pill a">지원 안 함</span>', none: '<span class="pill">확인 중</span>' }[S.sw] || `<span class="pill">${esc(S.sw)}</span>`;
    const inst = deferredPrompt || S.installPrompt ? '<button class="btn small" data-act="install">📲 홈 화면에 추가</button>' : '<span class="tiny muted">브라우저 메뉴 → "홈 화면에 추가"로 설치할 수 있습니다.</span>';
    $('#storageState').innerHTML += `<div class="kv-row" style="margin-top:8px"><span>서비스워커</span><b>${swTxt}</b></div><div class="kv-row"><span>설치</span><b>${inst}</b></div>`;
  }

  function doExportXlsx() {
    try {
      const r = EXPORT.exportFile();
      showToast('엑셀 생성 · ' + r.sheets.join(', ') + ' (' + Math.round(r.bytes / 1024) + 'KB)', 'ok');
    } catch (e) {
      showToast('엑셀 생성 실패: ' + e.message, 'err');
    }
  }
  function doExportJson() {
    const obj = DB.exportJSON();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '차계부_백업_' + C.todayISO() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => a.remove(), 800);
    showToast('JSON 백업 파일을 만들었습니다', 'ok');
  }

  function saveKey() {
    const k = $('#geminiKey').value.trim();
    const m = $('#geminiModel').value.trim() || 'gemini-2.5-flash';
    DB.setSetting('geminiKey', k);
    DB.setSetting('geminiModel', m);
    renderSettings();
    showToast(k ? 'Gemini 키를 이 폰에 저장했습니다' : '키를 비웠습니다', 'ok');
  }
  function clearKey() { DB.setSetting('geminiKey', ''); $('#geminiKey').value = ''; renderSettings(); showToast('키를 삭제했습니다'); }

  async function promptInstall() {
    if (!deferredPrompt) { showToast('브라우저 메뉴에서 "홈 화면에 추가"를 선택하세요'); return; }
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice;
    if (r.outcome === 'accepted') showToast('홈 화면에 추가했습니다', 'ok');
    deferredPrompt = null;
  }

  /* ================= 시트 ================= */
  function openSheet(title, body, foot, onMount) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = body;
    $('#sheetFoot').innerHTML = foot || '';
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    if (onMount) onMount();
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    document.body.style.overflow = '';
  }
  function confirmDelete(msg, fn) {
    openSheet('확인', `<p style="font-size:13.5px;line-height:1.6">${esc(msg)}</p>`,
      `<button class="btn ghost" data-close="1">취소</button><button class="btn danger" id="confirmYes">확인</button>`);
    $('#confirmYes').onclick = () => { closeSheet(); fn(); };
  }

  /* ================= 주유 폼 ================= */
  function fuelFields(d) {
    const rec = d || {};
    return `<div class="form-grid">
      <label class="field"><span>날짜</span><input type="date" id="ff_date" value="${esc(rec.date || C.todayISO())}"></label>
      <label class="field"><span>주행거리(km)</span><input type="number" inputmode="numeric" id="ff_odo" value="${rec.odometer != null ? rec.odometer : ''}" placeholder="예: 141545"></label>
      <label class="field full"><span>주유소</span><input type="text" id="ff_station" value="${esc(rec.station || '')}" placeholder="예: 송산주유소"></label>
      <label class="field"><span>단가(원/L)</span><input type="number" id="ff_unit" value="${rec.unitPrice || ''}" placeholder="1816"></label>
      <label class="field"><span>수량(L)</span><input type="number" step="0.001" id="ff_liters" value="${rec.liters || ''}" placeholder="33.04"></label>
      <label class="field"><span>금액(원)</span><input type="number" id="ff_amount" value="${rec.amount || ''}" placeholder="60000"></label>
      <label class="field"><span>메모</span><input type="text" id="ff_note" value="${esc(rec.note || '')}" placeholder="선택"></label>
    </div>
    <div class="form-note" id="ff_note_calc">단가·수량·금액 중 두 개만 넣으면 나머지를 자동 계산합니다.</div>`;
  }

  function odometerSuggestionHTML() {
    const v = DB.vehicle(S.vid);
    const est = window.PARSER.estimateOdometer(v, DB.fuelLogs(S.vid), C.todayISO());
    if (!est) return '';
    return `<div class="form-note">🤖 평소 일평균 <b>${r1(AI.fuelStats(S.vid).dailyKm || 0)}km</b> 기준 예상 주행거리 <b>${num(est)}km</b> <button class="mini" data-act="fill-odo" data-v="${est}">넣기</button></div>`;
  }

  function openFuelForm(rec) {
    const isEdit = !!(rec && rec.id);
    openSheet(isEdit ? '주유 기록 수정' : '주유 기록 추가',
      `<div class="form-note">${esc(DB.vehicle(S.vid).name)} · ${esc(DB.vehicle(S.vid).plate)}</div>` +
      fuelFields(rec || {}) + (isEdit ? '' : odometerSuggestionHTML()),
      `<button class="btn ghost" data-close="1">취소</button><button class="btn primary" data-act="save-fuel">${isEdit ? '저장' : '등록'}</button>`,
      () => { if (isEdit) S.editing = rec.id; else S.editing = null; });
  }

  function fillOdometerSuggestion() {
    const v = DB.vehicle(S.vid);
    const est = window.PARSER.estimateOdometer(v, DB.fuelLogs(S.vid), C.todayISO());
    const el = $('#ff_odo');
    if (el && est) { el.value = est; showToast('예상 주행거리 ' + num(est) + 'km를 넣었습니다', 'ok'); }
  }

  function autoCalcFuel() {
    const u = Number($('#ff_unit').value), l = Number($('#ff_liters').value), a = Number($('#ff_amount').value);
    let msg = '';
    if (u && l && !a) { $('#ff_amount').value = Math.round(u * l); msg = '금액 = 단가 × 수량'; }
    else if (u && a && !l) { $('#ff_liters').value = Math.round((a / u) * 1000) / 1000; msg = '수량 = 금액 ÷ 단가'; }
    else if (l && a && !u) { $('#ff_unit').value = Math.round(a / l); msg = '단가 = 금액 ÷ 수량'; }
    if (msg && $('#ff_note_calc')) $('#ff_note_calc').innerHTML = '자동 계산: ' + msg;
  }

  function readFuelForm() {
    const vId = S.editing ? (DB.getState().fuelLogs.find(f => f.id === S.editing) || {}).vehicleId || S.vid : S.vid;
    return {
      vehicleId: vId,
      date: $('#ff_date').value || C.todayISO(),
      odometer: $('#ff_odo').value ? Number($('#ff_odo').value) : null,
      station: $('#ff_station').value.trim(),
      unitPrice: $('#ff_unit').value ? Number($('#ff_unit').value) : null,
      liters: $('#ff_liters').value ? Number($('#ff_liters').value) : null,
      amount: $('#ff_amount').value ? Number($('#ff_amount').value) : null,
      note: $('#ff_note').value.trim()
    };
  }

  function saveFuelForm() {
    const r = readFuelForm();
    if (!r.amount) { showToast('금액을 넣어 주세요', 'err'); return; }
    if (!r.liters && r.unitPrice) r.liters = Math.round((r.amount / r.unitPrice) * 1000) / 1000;
    if (!r.unitPrice && r.liters) r.unitPrice = Math.round(r.amount / r.liters);
    if (S.editing) { DB.updateFuel(S.editing, r); showToast('주유 기록을 수정했습니다', 'ok'); }
    else { DB.addFuel(r); showToast('주유 기록을 등록했습니다', 'ok'); }
    S.editing = null;
    closeSheet();
    S.tab = 'fuel';
    renderAll();
  }

  /* ================= 정비 폼 ================= */
  function maintFields(d) {
    const rec = d || {};
    const opts = Object.keys(SEED.CONSUMABLES).map(k =>
      `<option value="${k}" ${rec.itemKey === k ? 'selected' : ''}>${esc(SEED.CONSUMABLES[k].label)}</option>`).join('');
    return `<div class="form-grid">
      <label class="field"><span>날짜</span><input type="date" id="mf_date" value="${esc(rec.date || C.todayISO())}"></label>
      <label class="field"><span>주행거리(km)</span><input type="number" id="mf_odo" value="${rec.odometer != null ? rec.odometer : ''}" placeholder="140895"></label>
      <label class="field full"><span>정비 항목</span><input type="text" id="mf_item" value="${esc(rec.item || '')}" placeholder="예: 엔진오일 교환"></label>
      <label class="field full"><span>소모품 연결(주기 자동 갱신)</span>
        <select id="mf_itemKey"><option value="">연결 안 함</option>${opts}</select></label>
      <label class="field full"><span>정비소</span><input type="text" id="mf_shop" value="${esc(rec.shop || '')}" placeholder="예: 서부산서비스 기아오토큐"></label>
      <label class="field"><span>부품비</span><input type="number" id="mf_parts" value="${rec.parts != null ? rec.parts : ''}"></label>
      <label class="field"><span>공임</span><input type="number" id="mf_labor" value="${rec.labor != null ? rec.labor : ''}"></label>
      <label class="field"><span>부가세</span><input type="number" id="mf_vat" value="${rec.vat != null ? rec.vat : ''}"></label>
      <label class="field"><span>합계</span><input type="number" id="mf_total" value="${rec.total != null ? rec.total : ''}"></label>
      <label class="field"><span>무상보증 만료</span><input type="date" id="mf_warranty" value="${esc(rec.warrantyUntil || '')}"></label>
      <label class="field"><span>다음 교체(km)</span><input type="number" id="mf_nextkm" value="${rec.nextKm || ''}"></label>
      <label class="field full"><span>메모</span><input type="text" id="mf_note" value="${esc(rec.note || '')}" placeholder="선택"></label>
    </div>
    <div class="form-note" id="mf_note_calc">부품비+공임을 넣으면 부가세·합계를 자동 계산합니다.</div>`;
  }

  function openMaintForm(rec) {
    const isEdit = !!(rec && rec.id);
    const draft = rec || {};
    openSheet(isEdit ? '정비 기록 수정' : '정비 기록 추가',
      `<div class="form-note">${esc(DB.vehicle(S.vid).name)} · ${esc(DB.vehicle(S.vid).plate)}</div>` + maintFields(draft),
      `<button class="btn ghost" data-close="1">취소</button><button class="btn primary" data-act="save-maint">${isEdit ? '저장' : '등록'}</button>`,
      () => {
        S.editing = isEdit ? rec.id : null;
        if (draft.itemKey) $('#mf_itemKey').value = draft.itemKey;
        if (draft.itemKey && !draft.item) $('#mf_item').value = (SEED.CONSUMABLES[draft.itemKey] || {}).label || '';
      });
  }

  function autoCalcMaint() {
    const p = Number($('#mf_parts').value), l = Number($('#mf_labor').value);
    if (!p && !l) return;
    const supply = (p || 0) + (l || 0);
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    if (!$('#mf_vat').value) $('#mf_vat').value = vat;
    if (!$('#mf_total').value) $('#mf_total').value = total;
    if ($('#mf_note_calc')) $('#mf_note_calc').innerHTML = '자동 계산: 공급가 ' + num(supply) + ' + 부가세 ' + num(vat) + ' = <b>' + num(total) + '원</b>';
  }

  function readMaintForm() {
    const vId = S.editing ? (DB.getState().maintLogs.find(m => m.id === S.editing) || {}).vehicleId || S.vid : S.vid;
    return {
      vehicleId: vId,
      date: $('#mf_date').value || C.todayISO(),
      item: $('#mf_item').value.trim() || (SEED.CONSUMABLES[$('#mf_itemKey').value] || {}).label || '정비',
      itemKey: $('#mf_itemKey').value || null,
      odometer: $('#mf_odo').value ? Number($('#mf_odo').value) : null,
      shop: $('#mf_shop').value.trim(),
      parts: $('#mf_parts').value ? Number($('#mf_parts').value) : null,
      labor: $('#mf_labor').value ? Number($('#mf_labor').value) : null,
      vat: $('#mf_vat').value ? Number($('#mf_vat').value) : null,
      total: $('#mf_total').value ? Number($('#mf_total').value) : null,
      warrantyUntil: $('#mf_warranty').value || null,
      nextKm: $('#mf_nextkm').value ? Number($('#mf_nextkm').value) : null,
      note: $('#mf_note').value.trim()
    };
  }

  function saveMaintForm() {
    const r = readMaintForm();
    if (S.editing) { DB.updateMaint(S.editing, r); showToast('정비 기록을 수정했습니다', 'ok'); }
    else { DB.addMaint(r); showToast('정비 기록을 등록했습니다 · 소모품 주기가 갱신됩니다', 'ok'); }
    S.editing = null;
    closeSheet();
    S.tab = 'maint';
    renderAll();
  }

  /* ================= 차량 폼 ================= */
  function openVehicleForm(v) {
    const isEdit = !!(v && v.id);
    const d = v || {};
    openSheet(isEdit ? '차량 정보 수정' : '차량 추가', `
      <div class="form-grid">
        <label class="field"><span>번호판</span><input type="text" id="vf_plate" value="${esc(d.plate || '')}" placeholder="예: 12가3456"></label>
        <label class="field"><span>이름</span><input type="text" id="vf_name" value="${esc(d.name || '')}" placeholder="예: 레이"></label>
        <label class="field full"><span>차종 전체 이름</span><input type="text" id="vf_full" value="${esc(d.fullName || '')}" placeholder="예: 기아 레이 VAN"></label>
        <label class="field"><span>연식</span><input type="number" id="vf_year" value="${d.year || ''}" placeholder="2012"></label>
        <label class="field"><span>연료탱크(L)</span><input type="number" step="0.1" id="vf_tank" value="${d.tankL || ''}"></label>
        <label class="field"><span>엔진</span><input type="text" id="vf_engine" value="${esc(d.engine || '')}" placeholder="1.0 가솔린"></label>
        <label class="field"><span>변속기</span><input type="text" id="vf_trans" value="${esc(d.transmission || '')}" placeholder="자동 4단"></label>
        <label class="field full"><span>차대번호</span><input type="text" id="vf_vin" value="${esc(d.vin || '')}"></label>
        <label class="field"><span>주행거리(km)</span><input type="number" id="vf_odo" value="${d.odometer || ''}"></label>
        <label class="field"><span>주행거리 기준일</span><input type="date" id="vf_ododate" value="${esc(d.odometerDate || '')}"></label>
        <label class="field"><span>검사 만료일</span><input type="date" id="vf_insp" value="${esc(d.inspectionEnd || '')}"></label>
        <label class="field"><span>보험 만료일</span><input type="date" id="vf_insend" value="${esc((d.insurance && d.insurance.end) || '')}"></label>
        <label class="field full"><span>보험 계약번호</span><input type="text" id="vf_inspolicy" value="${esc((d.insurance && d.insurance.policy) || '')}"></label>
      </div>`,
      `<button class="btn ghost" data-close="1">취소</button><button class="btn primary" data-act="save-vehicle">${isEdit ? '저장' : '추가'}</button>`,
      () => { S.editing = isEdit ? v.id : null; });
  }

  function saveVehicleForm() {
    const plate = $('#vf_plate').value.trim();
    if (!plate) { showToast('번호판을 넣어 주세요', 'err'); return; }
    const prev = S.editing ? DB.vehicle(S.editing) : {};
    const rec = {
      plate,
      name: $('#vf_name').value.trim() || plate,
      fullName: $('#vf_full').value.trim(),
      year: $('#vf_year').value ? Number($('#vf_year').value) : null,
      tankL: $('#vf_tank').value ? Number($('#vf_tank').value) : null,
      engine: $('#vf_engine').value.trim(),
      transmission: $('#vf_trans').value.trim(),
      vin: $('#vf_vin').value.trim(),
      odometer: $('#vf_odo').value ? Number($('#vf_odo').value) : null,
      odometerDate: $('#vf_ododate').value || null,
      inspectionEnd: $('#vf_insp').value || null,
      insurance: Object.assign({}, prev.insurance || {}, {
        end: $('#vf_insend').value || null,
        policy: $('#vf_inspolicy').value.trim()
      }),
      color: prev.color || '#2b57e6',
      emoji: prev.emoji || '🚗'
    };
    if (S.editing) { DB.updateVehicle(S.editing, rec); showToast('차량 정보를 저장했습니다', 'ok'); }
    else {
      const added = DB.addVehicle(rec);
      DB.getState().schedules.push(...defaultSchedules(added.id));
      S.vid = added.id;
      DB.setSetting('activeVehicle', added.id);
      showToast('차량을 추가했습니다', 'ok');
    }
    S.editing = null;
    closeSheet();
    renderAll();
  }

  function defaultSchedules(vid) {
    const base = [
      ['engine_oil', 10000, 12], ['air_filter', 20000, 24], ['cabin_filter', 12000, 12],
      ['brake_fluid', 40000, 24], ['brake_pad', 50000, 36], ['coolant', 60000, 48],
      ['trans_fluid', 80000, 60], ['spark_plug', 100000, 72], ['tire', 10000, 12],
      ['battery', null, 48], ['wiper', null, 12]
    ];
    return base.map(b => ({ vehicleId: vid, item: b[0], km: b[1], months: b[2], lastKm: null, lastDate: null }));
  }

  /* ================= AI 빠른 입력 ================= */
  const SAMPLES = [
    '[삼성카드] 60,000원 승인 송산주유소 11/19 일시불',
    '11/19 1816원 6만원 141545km 송산주유소',
    '10/26 레이 브레이크 디스크 교환 421344원 서부산서비스 기아오토큐',
    '엔진오일 교환 8만원 141000km 카센터'
  ];
  let sampleIdx = 0;

  function openQuickInput(prefill) {
    S.editing = null;
    openSheet('🤖 AI 빠른 입력', `
      <p class="tiny muted" style="margin-top:0">카드 결제 문자, 메모, 정비 영수증 내용을 그대로 붙여넣으세요. 이 폰 안에서 바로 분석합니다.</p>
      <textarea id="qiText" placeholder="예) [삼성카드] 60,000원 승인 송산주유소 11/19&#10;예) 11/19 1816원 6만원 141545km&#10;예) 10/26 브레이크 패드 교환 53350원 오토큐">${esc(prefill || '')}</textarea>
      <div class="chips" style="margin-top:8px">
        <button class="chip" data-act="qi-sample">예시 넣기</button>
        <button class="chip" data-act="qi-photo">📷 영수증 사진${AI.geminiKey() ? '' : ' (Gemini 키 필요)'}</button>
      </div>
      <input type="file" id="fileReceipt" accept="image/*" capture="environment" hidden>
      <div class="btn-row">
        <button class="btn primary" data-act="qi-analyze">AI 분석</button>
      </div>
      <div id="qiResult"></div>
    `, `<button class="btn ghost" data-close="1">닫기</button>`, () => {
      $('#fileReceipt').addEventListener('change', onReceiptFile);
    });
  }

  function fillQuickSample() {
    $('#qiText').value = SAMPLES[sampleIdx % SAMPLES.length];
    sampleIdx++;
    $('#qiResult').innerHTML = '';
  }

  function analyzeQuick() {
    const txt = $('#qiText').value.trim();
    if (!txt) { showToast('내용을 붙여넣어 주세요', 'err'); return; }
    const p = window.PARSER.parse(txt, { vehicles: DB.vehicles(), today: C.todayISO() });
    if (!p.ok) { $('#qiResult').innerHTML = '<div class="form-note">금액을 찾지 못했습니다. 금액을 포함해 다시 시도해 주세요.</div>'; return; }
    S.quickDraft = p;
    if (!p.vehicleId) p.vehicleId = S.vid;
    const v = DB.vehicle(p.vehicleId);
    const conf = p.confidence === 'high' ? '<span class="pill g">정확도 높음</span>' : p.confidence === 'mid' ? '<span class="pill b">확인 필요</span>' : '<span class="pill a">직접 확인</span>';
    const head = `<div class="form-note" style="border-style:solid;background:#f3f7ff">
      🤖 <b>${p.type === 'fuel' ? '주유' : '정비'}</b> 기록으로 읽었습니다 ${conf}<br>
      차량: <b>${esc(v.name)} ${esc(v.plate)}</b>${p.vehicleBy ? ' (번호판·차명에서 찾음)' : ' (현재 선택 차량)'}<br>
      ${p.missing && p.missing.length ? '비어 있는 항목: <b>' + p.missing.join(', ') + '</b> — 아래에서 채워 주세요.<br>' : ''}
      ${p.notes && p.notes.length ? p.notes.map(n => '· ' + esc(n)).join('<br>') : ''}
    </div>`;

    if (p.type === 'fuel') {
      const est = window.PARSER.estimateOdometer(v, DB.fuelLogs(v.id), p.date || C.todayISO());
      const draft = {
        date: p.date, odometer: p.odometer != null ? p.odometer : null, station: p.station,
        unitPrice: p.unitPrice, liters: p.liters, amount: p.amount, note: ''
      };
      $('#qiResult').innerHTML = head + fuelFields(draft) +
        (p.odometer == null && est ? `<div class="form-note">🤖 일평균 기준 예상 주행거리 <b>${num(est)}km</b> <button class="mini" data-act="fill-odo" data-v="${est}">넣기</button></div>` : '') +
        `<div class="btn-row"><button class="btn primary" data-act="qi-save">이대로 등록</button></div>`;
    } else {
      const draft = {
        date: p.date, item: p.itemText || p.item || '', itemKey: p.itemKey, odometer: p.odometer,
        shop: p.shop, parts: p.parts, labor: p.labor, total: p.total, note: ''
      };
      $('#qiResult').innerHTML = head + maintFields(draft) +
        `<div class="btn-row"><button class="btn primary" data-act="qi-save">이대로 등록</button></div>`;
    }
  }

  function saveQuickDraft() {
    const p = S.quickDraft;
    if (!p) return;
    if (p.type === 'fuel') {
      const r = readFuelForm();
      r.vehicleId = p.vehicleId || S.vid;
      if (!r.amount) { showToast('금액을 확인해 주세요', 'err'); return; }
      if (!r.liters && r.unitPrice) r.liters = Math.round((r.amount / r.unitPrice) * 1000) / 1000;
      if (!r.unitPrice && r.liters) r.unitPrice = Math.round(r.amount / r.liters);
      DB.addFuel(r);
      showToast('주유 등록 · ' + won(r.amount) + (r.liters ? ' / ' + r1(r.liters) + 'L' : ''), 'ok');
    } else {
      const r = readMaintForm();
      r.vehicleId = p.vehicleId || S.vid;
      DB.addMaint(r);
      showToast('정비 등록 · ' + (r.total ? won(r.total) : r.item), 'ok');
    }
    S.quickDraft = null;
    closeSheet();
    S.vid = p.vehicleId || S.vid;
    DB.setSetting('activeVehicle', S.vid);
    renderAll();
  }

  async function onReceiptFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!AI.geminiKey()) { showToast('설정에서 Gemini API 키를 먼저 넣으면 사진을 읽을 수 있습니다', 'err'); return; }
    $('#qiResult').innerHTML = '<div class="form-note">📷 영수증을 읽는 중…</div>';
    try {
      const dataUrl = await fileToDataUrl(file, 1400);
      const j = await AI.geminiOCR(dataUrl);
      const parts = [];
      if (j.date) parts.push(j.date);
      if (j.station) parts.push(j.station);
      if (j.amount) parts.push(String(j.amount) + '원');
      if (j.unitPrice) parts.push(String(j.unitPrice) + '원/L');
      if (j.liters) parts.push(String(j.liters) + 'L');
      if (j.odometer) parts.push(String(j.odometer) + 'km');
      if (j.item) parts.push(j.item);
      $('#qiText').value = parts.join(' ');
      showToast('영수증에서 ' + parts.length + '개 항목을 읽었습니다', 'ok');
      analyzeQuick();
    } catch (err) {
      $('#qiResult').innerHTML = '<div class="form-note">사진 분석 실패: ' + esc(err.message) + '</div>';
    }
  }

  function fileToDataUrl(file, maxW) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다'));
      img.onload = () => {
        const scale = Math.min(1, (maxW || 1400) / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('이미지를 열지 못했습니다'));
      reader.readAsDataURL(file);
    });
  }

  /* ================= 기타 ================= */
  let toastTimer;
  function showToast(msg, type) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (type ? ' ' + type : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // JSON 복원
  document.addEventListener('change', e => {
    if (e.target.id === 'fileImport') {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          DB.importJSON(obj).then(() => {
            S.chat = [];
            S.vid = DB.vehicles()[0].id;
            renderAll();
            showToast('백업을 복원했습니다 · 차량 ' + DB.vehicles().length + '대', 'ok');
          });
        } catch (err) {
          showToast('복원 실패: ' + err.message, 'err');
        }
      };
      reader.readAsText(f);
    }
  });

  // 노출 (테스트용)
  window.APP = { S, renderAll, ask, openQuickInput, analyzeQuick, saveQuickDraft, doExportXlsx, selectVehicle, boot };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
