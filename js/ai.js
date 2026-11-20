/* ai.js — 자동 진단·예측·브리핑·로컬 Q&A (+ 선택적 Gemini)
   서버 없이 폰 안에서 계산합니다. */
(function (global) {
  'use strict';
  const C = global.CORE;
  const N = () => global.DB;
  const MAN = () => global.MANUALS;
  const CONS = () => global.SEED.CONSUMABLES;

  /* ---------- 주유·연비 ---------- */
  function fuelStats(vehicleId) {
    const db = N();
    const v = db.vehicle(vehicleId);
    const logs = db.fuelLogs(vehicleId).slice();
    const rows = [];
    let prev = null;
    logs.forEach(l => {
      let km = null, eco = null, costPerKm = null;
      if (l.odometer != null && prev && prev.odometer != null) {
        km = Number(l.odometer) - Number(prev.odometer);
        if (km <= 0) km = null;
        if (km && prev.liters) eco = km / Number(prev.liters);
        if (km && l.amount) costPerKm = Number(l.amount) / km;
      }
      rows.push(Object.assign({}, l, { intervalKm: km, eco, costPerKm }));
      prev = l;
    });

    const totalAmount = C.sum(logs, l => l.amount);
    const totalLiters = C.sum(logs, l => l.liters);
    const valid = rows.filter(r => r.eco != null);
    const kmSum = C.sum(valid, r => r.intervalKm);
    const literSum = C.sum(valid.filter(r => r.intervalKm != null), r => (r.intervalKm != null ? prevLiters(rows, r) : 0));
    const avgEco = literSum > 0 ? kmSum / literSum : null;
    const lastEco = valid.length ? valid[valid.length - 1].eco : null;
    const priorEcos = valid.slice(-5, -1).map(r => r.eco);
    const baselineEco = priorEcos.length ? C.sum(priorEcos) / priorEcos.length : avgEco;

    const daily = dailyKm(logs, v);
    const intervals = rows.filter(r => r.intervalKm != null).map(r => r.intervalKm);
    const avgIntervalKm = intervals.length ? C.sum(intervals) / intervals.length : null;

    // 다음 주유 예측
    let nextFuel = null;
    const lastLog = logs.length ? logs[logs.length - 1] : null;
    if (lastLog && daily && avgIntervalKm) {
      const intervalDays = avgIntervalKm / daily;
      const nextDate = C.addDays(lastLog.date, Math.max(0, Math.round(intervalDays)));
      let remainingKm = null, sinceKm = null;
      if (lastLog.odometer != null && v && v.odometer) {
        sinceKm = v.odometer - Number(lastLog.odometer);
        remainingKm = avgIntervalKm - sinceKm;
      } else {
        const elapsed = C.daysBetween(lastLog.date, C.todayISO());
        remainingKm = avgIntervalKm - daily * (elapsed || 0);
      }
      nextFuel = {
        date: nextDate, days: C.dday(nextDate), remainingKm: Math.round(remainingKm),
        avgIntervalKm: Math.round(avgIntervalKm), intervalDays: Math.round(intervalDays),
        odometerAtLastFill: lastLog.odometer != null ? lastLog.odometer : null,
        sinceKm
      };
    }

    const monthKey = C.monthKey(C.todayISO());
    const monthAmount = C.sum(logs.filter(l => C.monthKey(l.date) === monthKey), l => l.amount);
    const monthKm = C.sum(rows.filter(r => C.monthKey(r.date) === monthKey), r => r.intervalKm || 0);

    return {
      vehicle: v, logs, rows,
      count: logs.length, totalAmount, totalLiters,
      avgEco, lastEco, baselineEco,
      avgUnitPrice: totalLiters ? totalAmount / totalLiters : null,
      dailyKm: daily, avgIntervalKm,
      monthAmount, monthKm,
      nextFuel,
      firstDate: logs.length ? logs[0].date : null,
      lastDate: logs.length ? logs[logs.length - 1].date : null
    };
  }

  function prevLiters(rows, row) {
    const i = rows.indexOf(row);
    return i > 0 ? Number(rows[i - 1].liters) || 0 : 0;
  }

  function dailyKm(logs, v) {
    const withKm = logs.filter(l => l.odometer != null).map(l => ({ date: l.date, odometer: Number(l.odometer) }));
    if (v && v.odometer && v.odometerDate) {
      const has = withKm.some(x => x.date === v.odometerDate && x.odometer === Number(v.odometer));
      if (!has) withKm.push({ date: v.odometerDate, odometer: Number(v.odometer) });
    }
    withKm.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    if (withKm.length >= 2) {
      const a = withKm[0], b = withKm[withKm.length - 1];
      const days = C.daysBetween(a.date, b.date);
      const km = Number(b.odometer) - Number(a.odometer);
      if (days > 0 && km > 0) return Math.round((km / days) * 10) / 10;
    }
    return null;
  }

  /* ---------- 소모품 진행률 ---------- */
  function consumables(vehicleId) {
    const db = N();
    const v = db.vehicle(vehicleId);
    const today = C.todayISO();
    const out = [];
    db.schedules(vehicleId).forEach(s => {
      const meta = CONS()[s.item] || { label: s.item, icon: '•' };
      let kmProgress = null, monthProgress = null, remainKm = null, nextDate = null;
      if (s.km && s.lastKm != null && v && v.odometer != null) {
        kmProgress = (v.odometer - s.lastKm) / s.km;
        remainKm = (s.lastKm + s.km) - v.odometer;
      } else if (s.km) {
        remainKm = null;
      }
      const baseDate = s.lastDate || null;
      if (s.months) {
        if (baseDate) {
          nextDate = C.addMonths(baseDate, s.months);
          const total = C.daysBetween(baseDate, nextDate);
          const used = C.daysBetween(baseDate, today);
          if (total > 0) monthProgress = used / total;
        } else {
          nextDate = null;
        }
      }
      const progs = [kmProgress, monthProgress].filter(x => x != null && isFinite(x));
      const progress = progs.length ? Math.max.apply(null, progs) : null;
      let status = 'unknown';
      if (progress != null) status = progress >= 1 ? 'overdue' : progress >= 0.85 ? 'soon' : 'ok';
      out.push({
        item: s.item, label: meta.label, icon: meta.icon, order: meta.order,
        km: s.km, months: s.months, lastKm: s.lastKm, lastDate: s.lastDate, lastShop: s.lastShop,
        remainKm, nextDate, progress, status, note: s.note || ''
      });
    });
    return out.sort((a, b) => {
      const rank = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return (b.progress || 0) - (a.progress || 0);
    });
  }

  /* ---------- D-day · 보증 ---------- */
  function dues(vehicleId) {
    const db = N();
    const v = db.vehicle(vehicleId);
    const today = C.todayISO();
    const list = [];
    if (v.inspectionEnd) {
      list.push({ kind: 'inspection', icon: '🅿️', title: '정기검사', date: v.inspectionEnd, days: C.dday(v.inspectionEnd), note: '검사기간 ' + (v.inspectionWindow || '-') });
    }
    if (v.insurance && v.insurance.end) {
      list.push({ kind: 'insurance', icon: '🛡️', title: '보험 만기', date: v.insurance.end, days: C.dday(v.insurance.end), note: v.insurance.company + ' ' + v.insurance.policy });
    }
    const wGroups = {};
    db.maintLogs(vehicleId).forEach(m => {
      if (!m.warrantyUntil) return;
      (wGroups[m.warrantyUntil] = wGroups[m.warrantyUntil] || []).push(m);
    });
    Object.keys(wGroups).forEach(date => {
      const d = C.dday(date);
      if (d == null || d < -3 || d > 45) return;
      const ms = wGroups[date];
      const names = ms.map(m => m.item);
      list.push({
        kind: 'warranty', icon: '🧾',
        title: names.length > 1 ? '정비 무상보증 만료 (' + names.length + '건)' : '무상보증 만료',
        date, days: d,
        note: (ms[0].shop || '') + ' · ' + names[0] + (names.length > 1 ? ' 외 ' + (names.length - 1) + '건' : '')
      });
    });
    db.reminders(vehicleId).forEach(r => {
      const d = C.dday(r.due);
      if (d != null && d <= 60) list.push({ kind: r.kind || 'task', icon: '📌', title: r.title, date: r.due, days: d, note: r.note, id: r.id });
    });
    return list.sort((a, b) => a.days - b.days);
  }

  /* ---------- 연비 이상 진단 ---------- */
  function fuelAnomaly(vehicleId) {
    const s = fuelStats(vehicleId);
    if (s.lastEco == null || s.baselineEco == null) {
      return { flagged: false, reason: 'no-data', text: '구간 연비를 계산하려면 주행거리가 있는 주유 기록이 3건 이상 필요합니다.' };
    }
    const drop = (s.baselineEco - s.lastEco) / s.baselineEco;
    const flagged = drop >= 0.15;
    return {
      flagged, drop, lastEco: s.lastEco, baselineEco: s.baselineEco,
      text: flagged
        ? '최근 구간 연비 ' + C.round1(s.lastEco) + 'km/L가 평균 ' + C.round1(s.baselineEco) + 'km/L보다 ' + Math.round(drop * 100) + '% 낮습니다.'
        : '최근 구간 연비 ' + C.round1(s.lastEco) + 'km/L는 평균 ' + C.round1(s.baselineEco) + 'km/L 대비 정상 범위입니다.'
    };
  }

  const ECO_CAUSES = [
    '타이어 공기압 저하(10% 낮으면 연비 2~3% 손실) — 겨울철 첫 점검 항목',
    '에어클리너 막힘 — 1.5만km 이상 교환 이력이 없으면 점검',
    '점화플러그 마모 — 7만km 이상이면 교환 검토',
    '엔진오일 점도·오염 — 교환 시기를 넘겼는지 확인',
    '브레이크 캘리퍼 고착 — 주행 후 바퀴 허브 온도가 한쪽만 뜨거우면 의심',
    '짧은 거리 반복 주행·공회전 대기 — 이 차의 일평균 32km 페이스에선 흔한 원인',
    '적재·루프박스·트레일러 — 공기저항과 무게 증가'
  ];

  /* ---------- 오늘의 브리핑 ---------- */
  function briefing(vehicleId) {
    const db = N();
    const v = db.vehicle(vehicleId);
    const items = [];
    const push = (o) => { if (o) items.push(o); };

    const cons = consumables(vehicleId);
    const dueList = dues(vehicleId);
    const stats = fuelStats(vehicleId);
    const anom = fuelAnomaly(vehicleId);

    // 1) 마감이 임박한 일정
    dueList.forEach(d => {
      if (d.days > 60) return;
      let level = 'low', pri = 70;
      if (d.days <= 7) { level = 'hi'; pri = 100; }
      else if (d.days <= 30) { level = 'mid'; pri = 85; }
      const label = d.days < 0 ? '기한 ' + Math.abs(d.days) + '일 지남' : (d.days === 0 ? '오늘까지' : 'D-' + d.days);
      push({
        icon: d.icon, priority: pri, level,
        title: d.title + ' ' + label,
        detail: (d.note || '') + ' · ' + C.fmtDate(d.date),
        kind: d.kind
      });
    });

    // 2) 소모품 긴급
    cons.filter(c => c.status === 'overdue' || c.status === 'soon').slice(0, 2).forEach(c => {
      push({
        icon: c.icon, priority: c.status === 'overdue' ? 90 : 72,
        level: c.status === 'overdue' ? 'hi' : 'mid',
        title: c.label + (c.status === 'overdue' ? ' 교환 시기 지남' : ' 교환 임박'),
        detail: (c.remainKm != null ? '남은 주행 ' + C.num(Math.max(0, c.remainKm)) + 'km · ' : '') +
          (c.nextDate ? '예정 ' + C.fmtDate(c.nextDate) : '기록 기준 ' + Math.round((c.progress || 0) * 100) + '%'),
        kind: 'consumable'
      });
    });

    // 3) 연비 이상
    if (anom.flagged) {
      push({
        icon: '📉', priority: 88, level: 'hi', title: '연비 이상 감지',
        detail: anom.text + ' 원인 후보를 확인해 보세요.', kind: 'eco'
      });
    }

    // 4) 다음 주유
    if (stats.nextFuel) {
      const n = stats.nextFuel;
      push({
        icon: '⛽', priority: 60, level: n.days != null && n.days <= 5 ? 'mid' : 'low',
        title: '다음 주유 예상 ' + C.fmtDate(n.date) + ' (' + C.ddayLabel(n.date) + ')',
        detail: '평균 ' + C.num(n.avgIntervalKm) + 'km마다 주유 · 하루 ' + C.round1(stats.dailyKm || 0) + 'km 기준',
        kind: 'fuel'
      });
    }

    // 5) 주행거리 미입력 → 연비 계산 불가
    const lastLog = stats.logs[stats.logs.length - 1];
    if (lastLog && lastLog.odometer == null) {
      push({
        icon: '✍️', priority: 74, level: 'mid',
        title: C.fmtDateShort(lastLog.date) + ' 주유의 주행거리가 비어 있습니다',
        detail: '주행거리만 넣으면 그 구간 연비가 바로 계산됩니다.',
        kind: 'fill-odometer'
      });
    }
    if (v.odometerStale && v.odometerDate) {
      const stale = C.daysBetween(v.odometerDate, C.todayISO());
      if (stale > 120) {
        push({
          icon: '📏', priority: 55, level: 'low',
          title: '주행거리 기준일이 ' + stale + '일 전입니다',
          detail: C.fmtDate(v.odometerDate) + ' ' + C.num(v.odometer) + 'km 기록 · 주유할 때 한 번 넣어 주세요.',
          kind: 'odometer'
        });
      }
    }

    items.sort((a, b) => b.priority - a.priority);
    const seen = {};
    const unique = items.filter(it => {
      const key = it.kind + '|' + it.title;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
    return unique.slice(0, 6);
  }

  /* ---------- 로컬 Q&A ---------- */
  const INTENTS = [
    { id: 'oil', words: ['엔진오일', '오일 몇', '오일 용량', '오일 리터', '엔진 오일', '오일양'], cats: ['유체·오일'] },
    { id: 'pressure', words: ['공기압', '타이어 압력', 'psi', '몇 psi', '바람'], cats: ['타이어·휠'] },
    { id: 'warning', words: ['경고등', '경고 표시', '계기판 불', '표시등', '램프'], cats: ['경고등·계기판'] },
    { id: '4wd', words: ['4h', '4l', '4륜', '사륜', '4wd', '구동모드', '오토모드', 'auto mode'], cats: ['주행·기능'] },
    { id: 'jump', words: ['점프', '방전', '배터리 안', '시동이 안', '시동 안'], cats: ['긴급조치'] },
    { id: 'tow', words: ['견인', '끌고', '구난'], cats: ['긴급조치'] },
    { id: 'fuse', words: ['퓨즈', '전구', '전조등', '라이트 안'], cats: ['전기·퓨즈'] },
    { id: 'warranty', words: ['보증', '무상', '워런티'], cats: [] },
    { id: 'nextmaint', words: ['다음 정비', '언제 갈', '언제 교체', '교체 시기', '오일 언제', '정비 시기', '소모품'], cats: ['점검·주기'] },
    { id: 'eco', words: ['연비', '기름값', '주유비', '유류비'], cats: [] },
    { id: 'cost', words: ['얼마 썼', '총비용', '지출', '유지비', '총 얼마'], cats: [] },
    { id: 'inspection', words: ['검사', '정기검사', '과태료'], cats: ['점검·주기'] },
    { id: 'insurance', words: ['보험', '만기', '마일리지'], cats: [] },
    { id: 'odometer', words: ['주행거리', '몇 km', '키로수', '거리'], cats: [] },
    { id: 'camping', words: ['차박', '캠핑', '숙박', '취침'], cats: ['계절·차박'] },
    { id: 'winter', words: ['겨울', '한파', '부동액', '언 땅', '스노'], cats: ['계절·차박'] },
    { id: 'status', words: ['내 차 상태', '상태', '요약', '브리핑', '점검할 것', '뭐 해야'], cats: [] },
    { id: 'brake', words: ['브레이크'], cats: [] }
  ];

  function detectIntent(q) {
    const t = q.toLowerCase();
    let best = null, bestScore = 0;
    INTENTS.forEach(it => {
      let s = 0;
      it.words.forEach(w => { if (t.indexOf(w) >= 0) s += w.length >= 3 ? 3 : 2; });
      if (s > bestScore) { bestScore = s; best = it; }
    });
    return bestScore > 0 ? best : null;
  }

  function answer(question, vehicleId) {
    const db = N();
    const q = String(question || '').trim();
    const ql = q.toLowerCase();
    if (!q) return { text: '질문을 입력해 주세요.', refs: [] };

    // 질문에 차량 이름이 있으면 그 차로 전환
    let vId = vehicleId;
    db.vehicles().forEach(v => {
      if (ql.indexOf(v.name) >= 0 || ql.indexOf(String(v.plate).replace('/', '')) >= 0) vId = v.id;
    });
    const v = db.vehicle(vId);
    const intent = detectIntent(q);
    const stats = fuelStats(vId);
    const cons = consumables(vId);
    const health = dues(vId);
    const refs = [];

    const ref = (id) => { const m = MAN().get(id); if (m && refs.indexOf(id) < 0) refs.push(id); return m; };

    if (!intent) {
      // 키워드 검색 폴백
      const res = MAN().search(q, { vehicleId: vId });
      if (res.length) {
        res.slice(0, 3).forEach(r => ref(r.item.id));
        const top = res[0].item;
        return {
          text: v.name + '(' + v.plate + ') 기준으로 설명서에서 찾았습니다.\n\n📖 ' + top.title + '\n' + top.body.slice(0, 420) + (top.body.length > 420 ? '…' : ''),
          refs
        };
      }
      return {
        text: '질문을 이렇게 바꿔 보시면 정확합니다.\n· "레이 엔진오일 몇 리터야?"\n· "콜로라도 4H 언제 써?"\n· "연비 왜 떨어졌지?"\n· "다음 정비 뭐 있어?"',
        refs: []
      };
    }

    const which = v.name + '(' + v.plate + ')';
    let t = '';

    switch (intent.id) {
      case 'oil': {
        const m = vId === 'ray' ? ref('r1') : vId === 'colorado' ? ref('k1') : ref('i1');
        const spec = vId === 'ray' ? '2.9L · API SM/GF-4 이상 (점도는 연식 점도표 확인)'
          : vId === 'colorado' ? '5.7L · 5W-30 dexos1(Gen2/Gen3) · 필터 ACDelco PF2257G'
            : '4.7L · 5W-20 dexos1 (0W-20 대체 가능)';
        const engineSchedule = cons.find(c => c.item === 'engine_oil');
        const lastOil = db.maintLogs(vId).find(x => x.itemKey === 'engine_oil');
        t = '🔧 ' + which + ' 엔진오일은 ' + spec + ' 입니다.\n\n';
        t += '· 엔진: ' + v.engine + '\n';
        t += '· 교환 기준: ' + (vId === 'colorado' ? '오일 수명 모니터(최대 12개월)' : '10,000~15,000km 또는 12개월') + '\n';
        if (lastOil) {
          t += '· 마지막 교환 기록: ' + C.fmtDate(lastOil.date) + (lastOil.odometer ? ' (' + C.num(lastOil.odometer) + 'km)' : '') + '\n';
        } else {
          t += '· 이 차의 엔진오일 교환 기록이 아직 없습니다' + (engineSchedule && engineSchedule.progress != null ? ' (기록 기준 ' + Math.round(engineSchedule.progress * 100) + '% 경과)' : '') + '.\n';
        }
        if (v.odometer) t += '· 현재 주행거리 ' + C.num(v.odometer) + 'km (' + C.fmtDate(v.odometerDate) + ')\n';
        t += '\n넣을 때는 용량을 다 붓지 말고 레벨 게이지로 F선을 넘지 않게 맞추세요.';
        break;
      }
      case 'pressure': {
        ref(vId === 'ray' ? 'r4' : vId === 'colorado' ? 'k7' : 'i3');
        ref('x2');
        const spec = vId === 'ray'
          ? '165/60R14 또는 175/50R15 · 앞 260kPa(38psi)/뒤 230kPa(33psi) — 5인승 2023년형 이후 기준. 2012~2013년형은 앞뒤 33psi 표기'
          : vId === 'colorado' ? '255/65R17 · 35psi(240kPa) 안팎'
            : '235/50R18(LT) 또는 245/45R19(LTZ) · 35psi(240kPa), 160km/h 이상은 39psi';
        t = '🛞 ' + which + ' 권장 공기압은 ' + spec + ' 입니다.\n\n';
        t += '정확한 값은 운전석 문을 열면 보이는 공기압 라벨이 우선입니다. 타이어가 차가운 상태(3시간 이상 주행 없음)에서 맞추고, 주행 직후엔 4~6psi 높게 나오는 게 정상입니다.\n\n지금 기온이 낮아지면 공기압이 1~2psi씩 빠집니다 — 첫 한파에 경고등이 켜지는 이유입니다.';
        break;
      }
      case 'warning': {
        const m = vId === 'ray' ? ref('r6') : vId === 'colorado' ? ref('k11') : ref('i12');
        ref('c3');
        t = '⚠️ ' + which + ' 계기판 경고등 기준입니다.\n\n';
        t += '빨강(엔진오일 압력·제동·냉각수·배터리)은 즉시 정차, 노랑(엔진·ABS·ESC·타이어 공기압)은 가까운 정비소 점검입니다.\n\n';
        if (m) t += m.title + '\n' + m.body.split('\n').slice(0, 4).join('\n');
        break;
      }
      case '4wd': {
        ref('k3'); ref('k4');
        if (vId !== 'colorado') {
          t = which + '는 ' + v.drive + '입니다. 4WD 모드는 콜로라도에만 있습니다.\n\n';
          const c = db.vehicle('colorado');
          t += '콜로라도(91머4445)는 AUTO / 2H / 4H / 4L 4가지 모드가 있고, 비·눈길은 AUTO, 눈길·비포장은 4H, 진흙·급경사 탈출은 정차 후 N에서 4L입니다.';
          break;
        }
        t = '🚙 콜로라도 4WD 모드 사용법\n\n';
        t += '· 2H — 마른 포장도로·연비. 평소 주행 기본.\n';
        t += '· AUTO — 노면에 따라 앞바퀴 구동 자동 분배. 비·눈·젖은 길 일상 주행에 가장 무난.\n';
        t += '· 4H — 눈길·비포장·모래. 60km/h 이하에서 주행 중 전환 가능.\n';
        t += '· 4L — 진흙·모래·급경사 탈출. 반드시 정차 → 기어 N → 다이얼 4L → 계기판 표시 확인 후 D/R.\n\n';
        t += '마른 포장도로에서 4H·4L로 오래 달리면 구동계에 무리가 갑니다. 4WD 표시등이 깜빡이면 전환이 안 된 상태이니 정차 후 다시 시도하세요.';
        break;
      }
      case 'jump': {
        ref(vId === 'ray' ? 'r7' : vId === 'colorado' ? 'k8' : 'i7');
        t = '🔋 ' + which + ' 점프 시동 순서\n\n';
        t += '① 방전차 (+) → ② 충전차 (+) → ③ 충전차 (−) → ④ 방전차 엔진룸 금속 볼트(접지)\n';
        t += '충전차를 2~3분 공회전한 뒤 방전차 시동, 성공하면 역순으로 분리합니다.\n\n';
        t += '배터리 (−) 단자에 직접 연결하지 말고 반드시 차체 접지점을 쓰세요. 배터리 수명은 ' + (vId === 'ray' ? '3~5년, 이 차는 짧은 주행이 많아 겨울에 약해지기 쉽습니다.' : '3~5년입니다.') ;
        break;
      }
      case 'tow': {
        ref(vId === 'ray' ? 'r10' : vId === 'colorado' ? 'k9' : 'i7');
        t = '🚛 ' + which + ' 견인\n\n';
        t += vId === 'colorado' ? '4WD이므로 반드시 4륜을 다 들어 올리는 구난차(플랫베드)를 요청하세요. 앞바퀴만 들고 끌면 트랜스퍼 케이스가 손상됩니다.'
          : vId === 'impala' ? '전륜구동(FF)이라 앞바퀴를 들어 올리는 견인차로 이동합니다.'
            : '앞쪽 견인고리에 아이볼트를 끼우고, 시동을 켠 채 N으로 40km/h 이하·20km 이내로 이동합니다.';
        break;
      }
      case 'fuse': {
        ref(vId === 'ray' ? 'r8' : vId === 'colorado' ? 'k10' : 'i8');
        t = '🔌 ' + which + ' 퓨즈박스는 실내(운전석 무릎 아래 또는 조수석 발치)와 엔진룸 두 곳입니다. 커버 안쪽 배열도에서 번호·용량을 확인하고, 시동을 끈 뒤 같은 암페어의 예비퓨즈로 교환하세요. 더 큰 용량을 넣으면 안 됩니다.';
        break;
      }
      case 'warranty': {
        const ms = db.maintLogs(vId).filter(m => m.warrantyUntil);
        t = '🧾 ' + which + ' 보증 현황\n\n';
        if (!ms.length) t += '등록된 무상보증 기록이 없습니다.\n';
        ms.forEach(m => {
          const d = C.dday(m.warrantyUntil);
          t += '· ' + m.item + ' — ' + C.fmtDate(m.date) + ' ' + (m.shop || '') + ', 보증 ' + C.fmtDate(m.warrantyUntil) + '까지 (' + C.ddayLabel(m.warrantyUntil) + ')\n';
        });
        const brake = ms.find(m => m.itemKey === 'brake_pad');
        if (brake) {
          t += '\n브레이크 정비(2026-10-26, 421,344원)는 30일 무상보증이라 ' + C.fmtDate(brake.warrantyUntil) + '까지입니다. 그 안에 소음·떨림이 생기면 서부산서비스 기아오토큐에 무상 재점검을 요청하세요.';
        }
        break;
      }
      case 'nextmaint': {
        ref('c7');
        const over = cons.filter(c => c.status === 'overdue');
        const soon = cons.filter(c => c.status === 'soon');
        const unknown = cons.filter(c => c.status === 'unknown').slice(0, 4);
        t = '🛠 ' + which + ' 정비 우선순위\n\n';
        if (over.length) t += '🔴 시기 지남: ' + over.map(c => c.label).join(', ') + '\n';
        if (soon.length) t += '🟠 임박: ' + soon.map(c => c.label + (c.remainKm != null ? '(' + C.num(c.remainKm) + 'km)' : '')).join(', ') + '\n';
        if (unknown.length) t += '⚪ 기록 없음: ' + unknown.map(c => c.label).join(', ') + ' — 마지막 교환일을 등록하면 자동으로 계산됩니다.\n';
        if (!over.length && !soon.length && !unknown.length) t += '지금은 교환 임박 항목이 없습니다.\n';
        t += '\n주행거리 ' + (v.odometer ? C.num(v.odometer) + 'km' : '미확인') + ' 기준입니다.';
        break;
      }
      case 'eco': {
        ref('c2');
        if (vId === 'colorado' && !stats.count) {
          t = '콜로라도는 주유 기록이 아직 없습니다. 주유할 때 주행거리를 함께 넣으면 다음부터 구간 연비와 일평균을 계산해 드립니다. 공식 복합연비는 4WD 7.9km/L입니다.';
          break;
        }
        t = '⛽ ' + which + ' 연비\n\n';
        t += '· 평균 실연비 ' + (stats.avgEco ? C.round1(stats.avgEco) + 'km/L' : '계산 전') + ' (' + stats.count + '회 주유)\n';
        t += '· 최근 구간 ' + (stats.lastEco ? C.round1(stats.lastEco) + 'km/L' : '-') + '\n';
        t += '· 누적 주유비 ' + C.won(stats.totalAmount) + ' / ' + C.round1(stats.totalLiters) + 'L\n';
        t += '· 평균 단가 ' + (stats.avgUnitPrice ? Math.round(stats.avgUnitPrice) + '원/L' : '-') + '\n';
        t += '· 일평균 ' + (stats.dailyKm ? C.round1(stats.dailyKm) + 'km' : '-') + ' · 이번 달 ' + C.won(stats.monthAmount) + '\n';
        const anom = fuelAnomaly(vId);
        if (anom.flagged) {
          t += '\n📉 ' + anom.text + '\n원인 후보:\n' + ECO_CAUSES.slice(0, 4).map(c => '· ' + c).join('\n');
        }
        break;
      }
      case 'cost': {
        const maintTotal = C.sum(db.maintLogs(vId), m => m.total);
        t = '💰 ' + which + ' 지출 요약\n\n';
        t += '· 주유 ' + stats.count + '회 ' + C.won(stats.totalAmount) + ' (' + C.round1(stats.totalLiters) + 'L)\n';
        t += '· 정비 ' + db.maintLogs(vId).length + '건 ' + C.won(maintTotal) + '\n';
        t += '· 합계 ' + C.won(stats.totalAmount + maintTotal) + '\n';
        if (stats.avgEco) t += '\n1km당 연료비 약 ' + Math.round(stats.totalAmount / Math.max(1, kmCovered(stats))) + '원입니다.';
        break;
      }
      case 'inspection': {
        ref('c1');
        const d = C.dday(v.inspectionEnd);
        t = '🅿️ ' + which + ' 정기검사\n\n';
        t += '· 유효기간 만료 ' + C.fmtDate(v.inspectionEnd) + ' (' + C.ddayLabel(v.inspectionEnd) + ')\n';
        t += '· 검사 가능 기간 ' + (v.inspectionWindow || '-') + '\n';
        t += '미수검 과태료는 1개월 4만원부터 최대 60만원입니다. 12월은 예약이 몰리니 미리 잡으세요.';
        break;
      }
      case 'insurance': {
        ref('x3');
        t = '🛡️ ' + which + ' 보험\n\n';
        if (v.insurance) {
          t += '· ' + v.insurance.company + ' ' + (v.insurance.product || '') + ' · ' + v.insurance.policy + '\n';
          t += '· 기간 ' + (v.insurance.start ? C.fmtDate(v.insurance.start) : '미확인') + ' ~ ' + (v.insurance.end ? C.fmtDate(v.insurance.end) + ' (' + C.ddayLabel(v.insurance.end) + ')' : '미확인') + '\n';
          t += '· 보험료 ' + C.won(v.insurance.premium) + ' / ' + (v.insurance.note || '') + '\n';
        }
        if (v.mileageDeal) t += '\n마일리지 특약 최초 ' + C.num(v.mileageDeal.baseKm) + 'km. 현재 ' + (v.odometer ? C.num(v.odometer) + 'km' : '미확인') + (v.odometer ? ' (+' + C.num(v.odometer - v.mileageDeal.baseKm) + 'km)' : '') + '. 보험사 앱에 주행거리 사진을 등록해야 환급됩니다.';
        break;
      }
      case 'odometer': {
        t = '📏 ' + which + ' 주행거리\n\n';
        t += '· ' + C.num(v.odometer) + 'km (' + C.fmtDate(v.odometerDate) + ' 기준, ' + (v.odometerSource || '') + ')\n';
        if (stats.dailyKm) t += '· 일평균 ' + C.round1(stats.dailyKm) + 'km · 월 약 ' + C.num(Math.round(stats.dailyKm * 30.4)) + 'km\n';
        if (stats.nextFuel) t += '· 다음 주유 예상 ' + C.fmtDate(stats.nextFuel.date) + ' (' + C.ddayLabel(stats.nextFuel.date) + ')\n';
        if (v.odometerStale) t += '\n⚠️ 이 기록은 ' + C.daysBetween(v.odometerDate, C.todayISO()) + '일 전 것이라 지금은 더 주행했을 수 있습니다. 주유·정비 기록을 넣으면 자동 갱신됩니다.';
        break;
      }
      case 'camping': {
        ref(vId === 'ray' ? 'r16' : vId === 'colorado' ? 'k13' : 'i10');
        ref('c5');
        const m = MAN().get(vId === 'ray' ? 'r16' : vId === 'colorado' ? 'k13' : 'i10');
        t = '🏕 ' + which + ' 차박\n\n' + (m ? m.body : '');
        t += '\n\n가장 중요한 건 환기와 일산화탄소입니다. 시동을 켠 채로 자지 말고, 창을 2cm 열어 두세요.';
        break;
      }
      case 'winter': {
        ref('c6'); ref(vId === 'ray' ? 'r18' : vId === 'colorado' ? 'k17' : 'i14');
        t = '❄️ ' + which + ' 겨울철\n\n';
        t += '· 타이어 공기압: 기온 10도 하락에 1~2psi 감소 → 첫 한파에 경고등\n';
        t += '· 배터리: 영하에서 출력 30~50% 저하, 3~5년 차면 점검\n';
        t += '· 부동액/냉각수: 규격 맞춰 보충, 수위 확인\n';
        t += '· 워셔액: -25도용으로 교체, 와이퍼는 세워 주차\n';
        if (vId === 'colorado') t += '· 눈길은 AUTO 또는 4H, 겨울 타이어가 4WD보다 우선입니다.';
        break;
      }
      case 'brake': {
        ref(vId === 'ray' ? 'r20' : vId === 'impala' ? 'i16' : 'k3');
        const bs = db.maintLogs(vId).filter(m => m.itemKey === 'brake_pad' || m.itemKey === 'brake_fluid');
        t = '🛑 ' + which + ' 브레이크\n\n';
        if (bs.length) {
          t += '최근 브레이크 정비:\n' + bs.map(m => '· ' + C.fmtDate(m.date) + ' ' + m.item + ' ' + (m.total ? C.won(m.total) : '')).join('\n');
          const w = bs[0].warrantyUntil;
          if (w) t += '\n무상보증 ' + C.fmtDate(w) + '까지 (' + C.ddayLabel(w) + ') — 소음·떨림이 있으면 기한 안에 무상 재점검을 요청하세요.';
        } else {
          t += '브레이크 정비 기록이 없습니다. 패드 마모·디스크 휨·액 교환(2년/4만km)을 점검하세요.';
        }
        break;
      }
      default: {
        t = '🤖 ' + which + ' 요약\n\n';
        t += '· 주행거리 ' + C.num(v.odometer) + 'km (' + C.fmtDate(v.odometerDate) + ')\n';
        t += '· 검사 ' + C.ddayLabel(v.inspectionEnd) + ' · 보험 ' + (v.insurance.end ? C.ddayLabel(v.insurance.end) : '미확인') + '\n';
        t += '· 평균 연비 ' + (stats.avgEco ? C.round1(stats.avgEco) + 'km/L' : '기록 없음') + ' · 누적 주유비 ' + C.won(stats.totalAmount) + '\n';
        const urgent = health.filter(d => d.days <= 30);
        if (urgent.length) t += '\n지금 챙길 일:\n' + urgent.map(d => '· ' + d.title + ' (' + C.ddayLabel(d.date) + ')').join('\n');
      }
    }

    let text = String(t || '').trim();
    if (!text) text = '답변을 만들지 못했습니다. 질문을 조금 더 구체적으로 적어 주세요.';
    return { text, refs, vehicleId: vId, intent: intent.id };
  }

  function kmCovered(stats) {
    const first = stats.rows.find(r => r.odometer != null);
    const last = stats.rows.slice().reverse().find(r => r.odometer != null);
    if (!first || !last) return 0;
    return Number(last.odometer) - Number(first.odometer);
  }

  /* ---------- Gemini (선택) ---------- */
  function geminiKey() { const s = N().settings(); return (s.geminiKey || '').trim(); }
  function geminiModel() { const s = N().settings(); return (s.geminiModel || 'gemini-2.5-flash').trim(); }

  function vehContext(vehicleId) {
    const db = N();
    const v = db.vehicle(vehicleId);
    const stats = fuelStats(vehicleId);
    const cons = consumables(vehicleId).filter(c => c.status !== 'unknown').slice(0, 6);
    const maint = db.maintLogs(vehicleId).slice(0, 6);
    return [
      '차량: ' + v.fullName + ' (' + v.plate + ', ' + v.yearLabel + '), 엔진 ' + v.engine + ', ' + v.transmission + ', ' + v.drive,
      '주행거리: ' + v.odometer + 'km (' + v.odometerDate + ')',
      '검사 만료: ' + v.inspectionEnd + ' / 보험: ' + (v.insurance.company + ' ' + (v.insurance.end || '기간 미확인')),
      '최근 주유 기록: ' + stats.logs.slice(-5).map(l => l.date + ' ' + (l.odometer || '?') + 'km ' + l.liters + 'L ' + l.amount + '원').join(' | '),
      '평균 실연비: ' + (stats.avgEco ? stats.avgEco.toFixed(2) : '없음') + 'km/L',
      '최근 정비: ' + maint.map(m => m.date + ' ' + m.item + ' ' + (m.total || '')).join(' | '),
      '소모품: ' + cons.map(c => c.label + ' ' + (c.progress != null ? Math.round(c.progress * 100) + '%' : '')).join(', ')
    ].join('\n');
  }

  async function geminiChat(question, vehicleId) {
    const key = geminiKey();
    if (!key) throw new Error('no-key');
    const ctx = vehContext(vehicleId);
    const manuals = MAN().search(question, { vehicleId }).slice(0, 3).map(r => r.item.title + ': ' + r.item.body).join('\n---\n');
    const prompt = '너는 한국의 차계부 앱 안에서 동작하는 정비 도우미다. 아래 [내 차 데이터]와 [취급설명서 발췌]만 근거로 한국어로 간결하게(400자 이내) 답한다. 숫자는 데이터에 있는 값만 쓰고, 없는 내용은 추정이라고 밝힌다. 마지막에 할 일을 한 줄로 제안한다.\n\n[내 차 데이터]\n' + ctx + '\n\n[취급설명서 발췌]\n' + (manuals || '(없음)') + '\n\n[질문] ' + question;
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiModel()) + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 700 } })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error('Gemini 오류 ' + res.status + ' ' + t.slice(0, 160));
    }
    const j = await res.json();
    const cand = j.candidates && j.candidates[0];
    const text = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
    return { text: text.trim() || 'Gemini가 빈 답변을 보냈습니다.', refs: MAN().search(question, { vehicleId }).slice(0, 2).map(r => r.item.id) };
  }

  async function geminiOCR(dataUrl) {
    const key = geminiKey();
    if (!key) throw new Error('no-key');
    const m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error('이미지 형식을 읽지 못했습니다');
    const prompt = '이 이미지는 주유 영수증 또는 자동차 정비 영수증이다. 아래 JSON만 출력해라. 값이 없으면 null.\n' +
      '{"type":"fuel|maint","date":"YYYY-MM-DD","station":"주유소/정비소","amount":숫자,"unitPrice":숫자,"liters":숫자,"odometer":숫자,"item":"정비항목","parts":숫자,"labor":숫자}\n숫자는 콤마·원 없는 정수로. 날짜는 영수증에 적힌 그대로.';
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiModel()) + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: 'application/json' }
      })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error('Gemini 오류 ' + res.status + ' ' + t.slice(0, 160));
    }
    const j = await res.json();
    const txt = (j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(p => p.text || '').join('')) || '';
    const json = JSON.parse(txt.replace(/```json|```/g, '').trim());
    return json;
  }

  const AI = {
    fuelStats, dailyKm, consumables, dues, fuelAnomaly, ECO_CAUSES, briefing, answer,
    detectIntent, vehContext, geminiChat, geminiOCR, geminiKey, geminiModel
  };
  global.AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
