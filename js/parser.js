/* parser.js — 스마트 자동 입력 (카드 문자·메모·정비 메모 → 기록 초안)
   외부 API 없이 브라우저 안에서 규칙 기반으로 동작합니다. */
(function (global) {
  'use strict';

  const C = global.CORE || (typeof require !== 'undefined' ? require('./core.js') : null);

  const CARD_BRANDS = ['삼성카드', 'KB국민카드', '국민카드', '신한카드', '현대카드', '롯데카드', '우리카드', '하나카드', 'NH카드', '농협카드', 'BC카드', '카카오뱅크', '토스뱅크', '비씨카드', '삼성', '신한', '현대', '롯데', '하나', '국민'];
  const FUEL_BRANDS = ['GS칼텍스', 'GS', 'SK에너지', 'SK', 'S-OIL', '에쓰오일', 'SOIL', '현대오일뱅크', '오일뱅크', '알뜰주유소', '이마트24', '농협주유소', 'NC주유소'];

  const FUEL_WORDS = ['주유', '주유소', '리터', '휘발유', '가솔린', '셀프', '충전', '단가', 'L '];
  const MAINT_MAP = [
    { key: 'engine_oil', words: ['엔진오일', '오일교환', '오일 교환', '오일필터', '오일 필터'] },
    { key: 'air_filter', words: ['에어클리너', '에어필터', '에어 필터'] },
    { key: 'cabin_filter', words: ['에어컨필터', '에어컨 필터', '실내필터', '캐빈필터'] },
    { key: 'brake_fluid', words: ['브레이크오일', '브레이크 오일', '브레이크액', '브레이크 액', 'dot-4', 'dot4'] },
    { key: 'brake_pad', words: ['브레이크패드', '브레이크 패드', '브레이크', '패드', '디스크', '캘리퍼', '라이닝'] },
    { key: 'coolant', words: ['냉각수', '부동액', '라디에이터'] },
    { key: 'trans_fluid', words: ['미션오일', '미션 오일', '변속기오일', '변속기 오일', 'atf'] },
    { key: 'spark_plug', words: ['점화플러그', '플러그', 'spark'] },
    { key: 'diff_fluid', words: ['디퍼', '데프', '트랜스퍼'] },
    { key: 'tire', words: ['타이어', '타이어교환', '공기압', '휠얼라인', '얼라인먼트', '위치교환'] },
    { key: 'battery', words: ['배터리', '밧데리'] },
    { key: 'wiper', words: ['와이퍼', '블레이드'] }
  ];
  const MAINT_WORDS = ['교환', '교체', '정비', '수리', '점검', '오일', '필터', '패드', '디스크', '타이어', '배터리', '브레이크', '냉각수', '미션', '와이퍼', '플러그', '부품', '공임', '공업사', '오토큐', '서비스센터', '카센터'];

  function normalizeText(s) {
    return String(s || '')
      .replace(/\r/g, '\n')
      .replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0))
      .replace(/[，]/g, ',')
      .replace(/\u00a0/g, ' ')
      .replace(/[ℓ]/g, 'L')
      .replace(/[–—~]/g, '-');
  }

  /* 금액·수량·주행거리 후보 수집 */
  function moneyCandidates(text) {
    const out = [];
    const push = (raw, value, kind, index) => {
      if (value == null || !isFinite(value)) return;
      out.push({ raw, value, kind, index });
    };
    let m;
    // 6만원 / 6.5만원 / 6만
    const reMan = /(\d+(?:\.\d+)?)\s*만\s*(원)?/g;
    while ((m = reMan.exec(text))) push(m[0], parseFloat(m[1]) * 10000, 'man', m.index);
    // 60,000원
    const reWon = /(\d{1,3}(?:,\d{3})+|\d+)\s*원/g;
    while ((m = reWon.exec(text))) push(m[0], Number(m[1].replace(/,/g, '')), 'won', m.index);
    // L 수량 (33.04L / 33L / 33.04 리터)
    const reL = /(\d+(?:\.\d+)?)\s*(?:L|리터)(?![a-zA-Z])/gi;
    while ((m = reL.exec(text))) push(m[0], parseFloat(m[1]), 'liter', m.index);
    // km 주행거리
    const reKm = /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:km|KM|키로|킬로)/g;
    while ((m = reKm.exec(text))) push(m[0], Number(m[1].replace(/,/g, '')), 'km', m.index);
    return out;
  }

  function extractDate(text, baseISO) {
    const base = baseISO || C.todayISO();
    let m = text.match(/(20\d{2})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    if (m) return { iso: m[1] + '-' + C.pad(m[2]) + '-' + C.pad(m[3]), matched: m[0] };
    m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (m) {
      const y = base.slice(0, 4);
      let iso = y + '-' + C.pad(m[1]) + '-' + C.pad(m[2]);
      if (!C.toDate(iso)) return null;
      if (C.daysBetween(iso, base) < -200) iso = (Number(y) - 1) + '-' + C.pad(m[1]) + '-' + C.pad(m[2]);
      return { iso, matched: m[0] };
    }
    m = text.match(/(?:^|[^\d])(\d{1,2})\s*[\/.]\s*(\d{1,2})(?:[^\d]|$)/);
    if (m) {
      const mm = Number(m[1]), dd = Number(m[2]);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const y = base.slice(0, 4);
        let iso = y + '-' + C.pad(mm) + '-' + C.pad(dd);
        const diff = C.daysBetween(iso, base);
        if (diff != null && diff < -200) iso = (Number(y) - 1) + '-' + C.pad(mm) + '-' + C.pad(dd);
        return { iso, matched: m[0].trim() };
      }
    }
    if (/어제/.test(text)) return { iso: C.addDays(base, -1), matched: '어제' };
    if (/그저께|그제/.test(text)) return { iso: C.addDays(base, -2), matched: '그제' };
    return { iso: base, matched: null };
  }

  function detectVehicle(text, vehicles) {
    const t = text.replace(/\s/g, '');
    const hit = (vehicles || []).find(v => t.indexOf(String(v.plate).replace('/', '')) >= 0);
    if (hit) return { vehicleId: hit.id, by: '번호판' };
    const byName = (vehicles || []).find(v => t.indexOf(v.name) >= 0 || t.indexOf(v.fullName.replace(/\s/g, '')) >= 0);
    if (byName) return { vehicleId: byName.id, by: '차명' };
    return { vehicleId: null, by: null };
  }

  function stripNoise(text) {
    let s = ' ' + text + ' ';
    s = s.replace(/\[[^\]]*\]/g, ' ');          // [삼성카드]
    s = s.replace(/\([^)]*\)/g, ' ');
    CARD_BRANDS.forEach(b => { s = s.replace(new RegExp(b, 'g'), ' '); });
    s = s.replace(/(승인|결제|일시불|할부|취소|정상|누적|잔액|포인트|알림|문자|web|WEB|안내)/g, ' ');
    s = s.replace(/[|>·•:]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function findStation(text) {
    const clean = stripNoise(text);
    const tokens = clean.split(' ').filter(Boolean);
    // 1) '주유소'가 들어간 토큰 (+ 앞 토큰 결합)
    for (let i = 0; i < tokens.length; i++) {
      if (/주유소/.test(tokens[i])) {
        const prev = tokens[i - 1] || '';
        if (prev && /^[가-힣A-Za-z]{2,8}$/.test(prev) && !/원|km|L$/.test(prev) && !FUEL_WORDS.some(w => prev.indexOf(w.trim()) >= 0) && prev !== '알뜰') {
          return { station: prev + ' ' + tokens[i], confidence: 'high' };
        }
        return { station: tokens[i], confidence: 'high' };
      }
    }
    // 2) 브랜드명
    for (const b of FUEL_BRANDS) {
      const re = new RegExp('([가-힣A-Za-z0-9]{0,8}\\s*' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[가-힣A-Za-z0-9]*)', 'i');
      const m = clean.match(re);
      if (m) return { station: m[1].replace(/\s+/g, ' ').trim(), confidence: 'mid' };
    }
    // 3) 금액 뒤에 남은 한글 상호 (카드 문자 형태)
    const m2 = clean.match(/(?:원|만원)\s*([가-힣A-Za-z0-9]{2,12}(?:\s*[가-힣]{1,6})?)\s*$/);
    if (m2 && !/교환|교체|정비|수리|점검/.test(m2[1])) return { station: m2[1].trim(), confidence: 'mid' };
    return { station: '', confidence: 'none' };
  }

  function detectType(text) {
    const t = text.toLowerCase();
    let fuelScore = 0, maintScore = 0;
    if (/주유|주유소|리터|\d(?:\.\d+)?\s*l\b|단가|휘발유|가솔린|셀프/.test(t)) fuelScore += 3;
    if (FUEL_BRANDS.some(b => text.indexOf(b) >= 0)) fuelScore += 2;
    MAINT_WORDS.forEach(w => { if (text.indexOf(w) >= 0) maintScore += 1; });
    if (/부품|공임|정비|수리|교환|교체/.test(text)) maintScore += 2;
    if (maintScore >= 3 && maintScore > fuelScore) return 'maint';
    if (fuelScore >= 2) return 'fuel';
    if (maintScore > 0) return 'maint';
    return 'unknown';
  }

  function detectItem(text) {
    const t = text.toLowerCase();
    for (const m of MAINT_MAP) {
      for (const w of m.words) {
        if (t.indexOf(w) >= 0) return { itemKey: m.key, word: w };
      }
    }
    return { itemKey: null, word: null };
  }

  function pickNumbers(cands, text) {
    const money = cands.filter(c => c.kind === 'won' || c.kind === 'man');
    const km = cands.filter(c => c.kind === 'km');
    const liters = cands.filter(c => c.kind === 'liter');

    let odometer = null, odometerGuess = false;
    if (km.length) {
      odometer = km[0].value;
    } else {
      // 5~6자리 단독 숫자 (금액/수량 문맥이 아닌 것)
      const plain = [];
      const re = /(?:^|[^\d.,])(\d{4,6})(?![\d.,])/g;
      let m;
      while ((m = re.exec(text))) {
        const v = Number(m[1]);
        if (v >= 1000 && v <= 999999) plain.push({ value: v, index: m.index });
      }
      const big = plain.filter(p => p.value >= 20000 && !money.some(x => x.value === p.value));
      if (big.length) { odometer = big[0].value; odometerGuess = true; }
    }

    const amounts = money.map(c => c.value).filter(v => v > 0);
    let unitPrice = null, amount = null, litersOut = liters.length ? liters[0].value : null;

    // 단가: 1,200~2,600 사이의 '원' 값 (또는 명시적 '단가')
    const unitCands = amounts.filter(v => v >= 1200 && v <= 2600);
    const bigAmounts = amounts.filter(v => v > 5000);
    if (/단가/.test(text) && unitCands.length) {
      unitPrice = unitCands[0];
      amount = bigAmounts.filter(v => v !== unitPrice).sort((a, b) => b - a)[0] || null;
    } else if (unitCands.length && bigAmounts.length) {
      unitPrice = unitCands[0];
      amount = bigAmounts.filter(v => v !== unitPrice).sort((a, b) => b - a)[0];
    } else if (bigAmounts.length) {
      amount = Math.max.apply(null, bigAmounts);
    } else if (amounts.length) {
      amount = Math.max.apply(null, amounts);
    }

    if (!litersOut && amount && unitPrice) litersOut = Math.round((amount / unitPrice) * 1000) / 1000;
    if (!amount && litersOut && unitPrice) amount = Math.round(litersOut * unitPrice);
    if (unitPrice == null && amount && litersOut) unitPrice = Math.round(amount / litersOut);

    return { odometer, odometerGuess, unitPrice, amount, liters: litersOut };
  }

  function parse(input, opts) {
    const o = opts || {};
    const baseISO = o.today || C.todayISO();
    const vehicles = o.vehicles || (global.SEED ? global.SEED.VEHICLES : []);
    const raw = String(input || '').trim();
    const text = normalizeText(raw);
    if (!text) return { ok: false, type: 'unknown', raw, missing: ['내용'], confidence: 'low' };

    const type = detectType(text);
    const dateInfo = extractDate(text, baseISO);
    const veh = detectVehicle(text, vehicles);
    const nums = pickNumbers(moneyCandidates(text) || [], text);
    const missing = [];
    const notes = [];
    let confidence = 'mid';

    if (type === 'maint') {
      const item = detectItem(text);
      const partsM = text.match(/부품\s*([\d,]+)\s*원?/);
      const laborM = text.match(/공임\s*([\d,]+)\s*원?/);
      let parts = partsM ? Number(partsM[1].replace(/,/g, '')) : null;
      let labor = laborM ? Number(laborM[1].replace(/,/g, '')) : null;
      let total = nums.amount;
      if (parts != null && labor != null) {
        const supply = parts + labor;
        if (total == null || Math.abs(total - supply * 1.1) < 5) total = Math.round(supply * 1.1);
      }
      const shopM = text.match(/([가-힣A-Za-z0-9]{2,14}(?:오토큐|서비스센터|카센터|공업사|정비소|타이어|모터스))/);
      const itemLabel = item.itemKey && global.SEED ? (global.SEED.CONSUMABLES[item.itemKey] || {}).label : null;
      if (!item.itemKey) missing.push('정비 항목');
      if (total == null) missing.push('금액');
      if (!dateInfo.matched) notes.push('날짜가 없어 오늘로 채웠습니다');
      if (!shopM) missing.push('정비소');
      return {
        ok: true, type: 'maint', raw, original: raw,
        date: dateInfo.iso, dateMatched: dateInfo.matched,
        vehicleId: veh.vehicleId, vehicleBy: veh.by,
        itemKey: item.itemKey, item: itemLabel || (item.word ? item.word + ' 교환' : ''),
        itemText: pickItemText(text) || itemLabel,
        shop: shopM ? shopM[1] : '',
        parts, labor, total,
        odometer: nums.odometer,
        note: '',
        missing, notes, confidence: missing.length > 1 ? 'low' : 'mid'
      };
    }

    if (type === 'fuel') {
      const st = findStation(text);
      if (!nums.amount) missing.push('금액');
      if (!st.station) missing.push('주유소');
      if (nums.liters == null && !(nums.amount && nums.unitPrice)) missing.push('수량 또는 단가');
      if (nums.odometer == null) missing.push('주행거리');
      if (!dateInfo.matched) notes.push('날짜가 없어 오늘로 채웠습니다');
      if (nums.odometerGuess) notes.push('주행거리는 숫자 추정값입니다');
      if (nums.amount && nums.unitPrice && nums.liters) {
        const calc = Math.round((nums.amount / nums.unitPrice) * 1000) / 1000;
        if (Math.abs(calc - nums.liters) > 0.05) notes.push('금액÷단가와 적힌 수량이 조금 다릅니다');
      }
      const conf = missing.length === 0 ? 'high' : (missing.length <= 1 ? 'mid' : 'low');
      return {
        ok: true, type: 'fuel', raw, original: raw,
        date: dateInfo.iso, dateMatched: dateInfo.matched,
        vehicleId: veh.vehicleId, vehicleBy: veh.by,
        station: st.station, stationConfidence: st.confidence,
        unitPrice: nums.unitPrice, liters: nums.liters, amount: nums.amount,
        odometer: nums.odometer, odometerGuess: nums.odometerGuess,
        note: '', missing, notes, confidence: conf
      };
    }

    // 알 수 없음 → 숫자만 있으면 주유 초안으로 제안
    const st = findStation(text);
    return {
      ok: !!nums.amount, type: 'fuel', raw, original: raw,
      date: dateInfo.iso, dateMatched: dateInfo.matched,
      vehicleId: veh.vehicleId, vehicleBy: veh.by,
      station: st.station, stationConfidence: st.confidence,
      unitPrice: nums.unitPrice, liters: nums.liters, amount: nums.amount,
      odometer: nums.odometer, odometerGuess: nums.odometerGuess,
      note: raw,
      missing: nums.amount ? ['항목 확인'] : ['금액'],
      notes: ['주유/정비를 확실히 알 수 없어 주유 초안으로 만들었습니다'],
      confidence: 'low'
    };
  }

  function pickItemText(text) {
    const m = text.match(/([가-힣A-Za-z0-9\s]{2,24}?(?:교환|교체|정비|수리|점검))/);
    return m ? m[1].trim() : null;
  }

  /* 주행거리 자동 추정: 차량의 최근 기록 + 일평균 주행거리 */
  function estimateOdometer(vehicle, logs, targetISO) {
    if (!vehicle) return null;
    const base = vehicle.odometer;
    if (!base) return null;
    const date = targetISO || C.todayISO();
    const daily = dailyAverageFromLogs(logs, vehicle);
    const from = vehicle.odometerDate || date;
    const gap = C.daysBetween(from, date);
    if (daily == null || gap == null) return null;
    return Math.round(base + daily * gap);
  }

  function dailyAverageFromLogs(logs, vehicle) {
    if (!logs || !logs.length) return null;
    const withKm = logs.filter(l => l.odometer != null).sort((a, b) => a.date < b.date ? -1 : 1);
    if (withKm.length < 2) return null;
    const first = withKm[0], last = withKm[withKm.length - 1];
    const km = Number(last.odometer) - Number(first.odometer);
    const days = C.daysBetween(first.date, last.date);
    if (!(km > 0) || !days || days <= 0) return null;
    return Math.round((km / days) * 10) / 10;
  }

  const PARSER = { parse, detectType, findStation, extractDate, detectVehicle, estimateOdometer, dailyAverageFromLogs, normalizeText, moneyCandidates };
  global.PARSER = PARSER;
  if (typeof module !== 'undefined' && module.exports) module.exports = PARSER;
})(typeof window !== 'undefined' ? window : globalThis);
