#!/usr/bin/env python3
"""E2E 검증 — 실제 브라우저(Chromium)에서 시드·연비·검색·엑셀·SW·오프라인을 확인한다.
실행: python3 tests/e2e.py [base_url]
"""
import json
import os
import subprocess
import sys
import time
import threading
import urllib.request
import http.server
import socketserver
import functools

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8899/'
RESULTS = []
FAILS = []
SHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'shots')
os.makedirs(SHOT_DIR, exist_ok=True)


def start_server(port):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', port), handler)
    th = threading.Thread(target=httpd.serve_forever, daemon=True)
    th.start()
    return httpd


def check(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail))
    if cond:
        print(f'  PASS  {name}' + (f'  ({detail})' if detail else ''), flush=True)
    else:
        print(f'  FAIL  {name}  {detail}', flush=True)
        FAILS.append(name + ' :: ' + str(detail))


def main():
    if '127.0.0.1' in BASE or 'localhost' in BASE:
        start_server(int(BASE.rsplit(':', 1)[1].strip('/')))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={'width': 390, 'height': 844},
            device_scale_factor=2,
            timezone_id='Asia/Seoul',
            locale='ko-KR',
            accept_downloads=True,
            is_mobile=True,
            has_touch=True,
        )
        page = ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))

        print('\n[1] 최초 로딩·시드', flush=True)
        page.goto(BASE, wait_until='networkidle')
        page.wait_for_selector('#app:not([hidden])', timeout=15000)
        check('앱 부팅', page.is_visible('#tabbar'))

        state = page.evaluate('() => JSON.parse(JSON.stringify(DB.getState()))')
        check('차량 3대 시드', len(state['vehicles']) == 3, [v['plate'] for v in state['vehicles']])
        plates = [v['plate'] for v in state['vehicles']]
        check('번호판 26라2388/91머4445/25거0986', plates == ['26라2388', '91머4445', '25거0986'], plates)
        ray = [v for v in state['vehicles'] if v['id'] == 'ray'][0]
        check('레이 주행거리 141,545km', ray['odometer'] == 141545, ray['odometer'])
        check('레이 검사 만료 2026-12-27', ray['inspectionEnd'] == '2026-12-27', ray['inspectionEnd'])
        col = [v for v in state['vehicles'] if v['id'] == 'colorado'][0]
        check('콜로라도 52,051km / 2027-03-09', col['odometer'] == 52051 and col['inspectionEnd'] == '2027-03-09')
        imp = [v for v in state['vehicles'] if v['id'] == 'impala'][0]
        check('임팔라 100,769km / 2027-12-15', imp['odometer'] == 100769 and imp['inspectionEnd'] == '2027-12-15')
        fuels = [f for f in state['fuelLogs'] if f['vehicleId'] == 'ray']
        check('레이 주유 8건', len(fuels) == 8, len(fuels))
        tot = sum(f['amount'] for f in fuels)
        liters = round(sum(f['liters'] for f in fuels), 3)
        check('주유 합계 471,192원', tot == 471192, tot)
        check('주유 합계 258.31L', abs(liters - 258.307) < 0.01, liters)
        mnt = [m for m in state['maintLogs'] if m['vehicleId'] == 'ray' and m['date'] == '2026-10-26']
        check('레이 브레이크 정비 4항목', len(mnt) == 4, len(mnt))
        check('브레이크 정비 합계 421,344원', sum(m['total'] for m in mnt) == 421344, sum(m['total'] for m in mnt))

        print('\n[2] 홈 · AI 브리핑', flush=True)
        brief = page.inner_text('#briefingCard')
        check('AI 브리핑 카드 노출', '오늘의 AI 차량 브리핑' in brief)
        check('브리핑에 검사/보증 항목', ('정기검사' in brief) or ('무상보증' in brief), brief[:160].replace('\n', ' / '))
        stats_txt = page.inner_text('#homeStats')
        check('누적 주유비 471,192', '471,192' in stats_txt, stats_txt.replace('\n', ' ')[:160])
        check('평균 실연비 표시', '12.39' in stats_txt or '12.4' in stats_txt, stats_txt.replace('\n', ' ')[:160])
        check('D-day 표시', 'D-' in stats_txt)
        eco = page.evaluate('() => AI.fuelStats("ray").avgEco')
        check('연비 계산 12.39km/L', eco is not None and abs(eco - 12.39) < 0.02, round(eco, 3) if eco else eco)
        daily = page.evaluate('() => AI.fuelStats("ray").dailyKm')
        check('일평균 31.9km', daily is not None and abs(daily - 31.9) < 0.2, daily)
        nextf = page.evaluate('() => AI.fuelStats("ray").nextFuel')
        check('다음 주유 예측 존재', bool(nextf and nextf.get('date')), nextf)
        page.screenshot(path=os.path.join(SHOT_DIR, '01_home.png'), full_page=True)

        print('\n[3] AI 빠른 입력 (카드 문자 파서)', flush=True)
        page.click('[data-act="quick"]')
        page.wait_for_selector('#qiText')
        page.fill('#qiText', '[삼성카드] 60,000원 승인 송산주유소 11/19 일시불')
        page.click('[data-act="qi-analyze"]')
        page.wait_for_selector('#qiResult .form-grid', timeout=5000)
        vals = page.evaluate('''() => ({
            date: document.querySelector('#ff_date').value,
            station: document.querySelector('#ff_station').value,
            amount: document.querySelector('#ff_amount').value,
            unit: document.querySelector('#ff_unit').value,
            liters: document.querySelector('#ff_liters').value
        })''')
        check('문자: 날짜 2026-11-19', vals['date'] == '2026-11-19', vals['date'])
        check('문자: 주유소 송산주유소', '송산' in vals['station'], vals['station'])
        check('문자: 금액 60000', vals['amount'] == '60000', vals['amount'])
        page.screenshot(path=os.path.join(SHOT_DIR, '02_quick_parse.png'), full_page=True)
        page.click('#sheetPanel .sheet-head [data-close]')

        print('\n[4] 메모 파서 + 주유 등록 + 연비 자동계산', flush=True)
        before = page.evaluate('() => DB.getState().fuelLogs.length')
        page.click('[data-act="quick"]')
        page.wait_for_selector('#qiText')
        page.fill('#qiText', '11/20 1819원 6만원 141545km 생곡 GS칼텍스')
        page.click('[data-act="qi-analyze"]')
        page.wait_for_selector('#qiResult .form-grid')
        vals2 = page.evaluate('''() => ({
            date: document.querySelector('#ff_date').value,
            station: document.querySelector('#ff_station').value,
            amount: document.querySelector('#ff_amount').value,
            unit: document.querySelector('#ff_unit').value,
            liters: document.querySelector('#ff_liters').value,
            odo: document.querySelector('#ff_odo').value
        })''')
        check('메모: 단가 1819', vals2['unit'] == '1819', vals2['unit'])
        check('메모: 금액 60000(6만원)', vals2['amount'] == '60000', vals2['amount'])
        check('메모: 수량 자동계산 32.985', abs(float(vals2['liters']) - 32.985) < 0.01, vals2['liters'])
        check('메모: 주행거리 141545', vals2['odo'] == '141545', vals2['odo'])
        page.click('[data-act="qi-save"]')
        page.wait_for_timeout(500)
        after = page.evaluate('() => DB.getState().fuelLogs.length')
        check('빠른 입력으로 1건 추가', after == before + 1, f'{before}→{after}')
        newlog = page.evaluate('() => DB.getState().fuelLogs[DB.getState().fuelLogs.length-1]')
        check('저장된 단가/수량/금액', newlog['unitPrice'] == 1819 and abs(newlog['liters'] - 32.985) < 0.01 and newlog['amount'] == 60000, newlog)
        # 방금 넣은 기록의 구간 연비 확인 (직전 11-19 기록 주유량 33.04L 기준)
        page.evaluate('() => { APP.S.tab="fuel"; APP.renderAll(); }')
        page.wait_for_timeout(300)
        fuel_txt = page.inner_text('#fuelList')
        check('주유 목록에 신규 기록', '11/20' in fuel_txt or '2026.11.20' in fuel_txt, fuel_txt[:120].replace('\n', ' '))
        page.screenshot(path=os.path.join(SHOT_DIR, '03_fuel.png'), full_page=True)

        print('\n[5] 정비 · 소모품 진행률', flush=True)
        page.evaluate('() => { APP.S.tab="maint"; APP.renderAll(); }')
        page.wait_for_timeout(300)
        cons = page.inner_text('#consumableBox')
        check('소모품 12종 표시', cons.count('교환') >= 1 and '엔진오일' in cons and '브레이크액' in cons, cons[:200].replace('\n', ' '))
        prog = page.evaluate('() => AI.consumables("ray")')
        bf = [c for c in prog if c['item'] == 'brake_fluid'][0]
        check('브레이크액 마지막 교환 140,895km 반영', bf['lastKm'] == 140895 and bf['status'] in ('ok', 'soon', 'overdue'), f"{bf['lastKm']} {bf['status']}")
        check('브레이크 진행률 계산됨', bf['progress'] is not None and bf['progress'] >= 0, bf['progress'])
        page.screenshot(path=os.path.join(SHOT_DIR, '04_maint.png'), full_page=True)

        print('\n[6] 정비 기록 자동 추가 (소모품 주기 갱신)', flush=True)
        page.evaluate('''() => {
            DB.addMaint({vehicleId:'ray', date:'2026-11-20', item:'엔진오일 교환', itemKey:'engine_oil',
                         odometer:141545, shop:'테스트 오토큐', parts:40000, labor:15000, vat:5500, total:60500});
            APP.S.tab='maint'; APP.renderAll();
        }''')
        page.wait_for_timeout(300)
        oil = page.evaluate('() => AI.consumables("ray").find(c=>c.item==="engine_oil")')
        check('엔진오일 주기 자동 갱신(lastKm)', oil['lastKm'] == 141545 and oil['lastDate'] == '2026-11-20', oil)
        check('엔진오일 진행률 0%대로', oil['progress'] is not None and oil['progress'] < 0.05, oil['progress'])

        print('\n[7] 설명서 검색 + AI 비서', flush=True)
        page.evaluate('() => { APP.S.tab="manual"; APP.renderAll(); }')
        page.wait_for_timeout(300)
        page.fill('#manualSearch', '엔진오일')
        page.wait_for_timeout(300)
        meta = page.inner_text('#searchMeta')
        n_hits = page.evaluate('() => document.querySelectorAll("#manualList .mcard").length')
        check('"엔진오일" 검색 결과', n_hits >= 4, f'{n_hits}건 · {meta}')
        check('검색어 하이라이트', page.evaluate('() => document.querySelectorAll("#manualList mark").length') > 0)
        page.click('[data-act="filter-veh"][data-id="ray"]')
        page.wait_for_timeout(250)
        titles = page.inner_text('#manualList')
        check('레이 필터 적용', '레이 엔진오일 용량은 2.9L' in titles, titles[:100].replace('\n', ' '))
        ray_cards = page.evaluate('() => document.querySelectorAll("#manualList .mcard").length')
        check('레이 필터 결과 수 축소', ray_cards < n_hits, f'{n_hits}→{ray_cards}')
        page.click('[data-act="filter-veh"][data-id="all"]')
        page.fill('#manualSearch', '4H')
        page.wait_for_timeout(250)
        check('"4H" 검색 → 4WD 항목', '4H' in page.inner_text('#manualList'))
        page.fill('#manualSearch', '공기압')
        page.wait_for_timeout(250)
        check('"공기압" 검색', page.evaluate('() => document.querySelectorAll("#manualList .mcard").length') >= 2)
        page.fill('#manualSearch', '퓨즈')
        page.wait_for_timeout(250)
        check('"퓨즈" 검색', '퓨즈' in page.inner_text('#manualList'))
        page.fill('#manualSearch', 'qqzzxx')
        page.wait_for_timeout(250)
        check('없는 검색어 → 결과 없음 안내', '검색 결과가 없습니다' in page.inner_text('#manualList'))
        page.fill('#manualSearch', '')
        page.wait_for_timeout(200)
        manual_total = page.evaluate('() => document.querySelectorAll("#manualList .mcard").length')
        check('전체 설명서 카드 40개 이상', manual_total >= 40, manual_total)

        print('\n[8] 채팅형 AI Q&A', flush=True)
        page.evaluate('() => { APP.S.chat=[]; APP.renderAll(); }')
        answers = {}
        for q in ['레이 엔진오일 몇 리터야?', '브레이크 소음 나는데 보증 남았어?', '콜로라도 4H 언제 써?', '연비 왜 떨어졌지?', '다음 정비 뭐 있어?']:
            page.fill('#chatInput', q)
            page.click('#chatForm button[type="submit"]')
            page.wait_for_timeout(350)
            msg = page.evaluate('() => APP.S.chat[APP.S.chat.length-1]')
            answers[q] = msg
        a1 = answers['레이 엔진오일 몇 리터야?']['text']
        check('Q&A: 레이 엔진오일 2.9L', '2.9L' in a1 and '레이' in a1, a1[:120].replace('\n', ' '))
        a2 = answers['브레이크 소음 나는데 보증 남았어?']['text']
        check('Q&A: 보증 2026-11-25 안내', '2026.11.25' in a2 or '2026-11-25' in a2, a2[:140].replace('\n', ' '))
        a3 = answers['콜로라도 4H 언제 써?']['text']
        check('Q&A: 4H 사용법', '4H' in a3 and 'AUTO' in a3, a3[:120].replace('\n', ' '))
        a4 = answers['연비 왜 떨어졌지?']['text']
        check('Q&A: 연비 답변에 실데이터', '12.39' in a4 or '12.4' in a4, a4[:160].replace('\n', ' '))
        a5 = answers['다음 정비 뭐 있어?']['text']
        check('Q&A: 정비 우선순위', ('레이' in a5) and ('시기' in a5 or '기록 없음' in a5), a5[:160].replace('\n', ' '))
        check('Q&A 참고 카드 링크', len(answers['레이 엔진오일 몇 리터야?']['refs']) > 0, answers['레이 엔진오일 몇 리터야?']['refs'])
        page.screenshot(path=os.path.join(SHOT_DIR, '05_assistant.png'))

        print('\n[9] 엑셀(.xlsx) 생성·다운로드·파싱', flush=True)
        page.evaluate('() => { APP.S.tab="settings"; APP.renderAll(); }')
        page.wait_for_timeout(300)
        with page.expect_download(timeout=20000) as dl_info:
            page.click('[data-act="export-xlsx"]')
        dl = dl_info.value
        out = os.path.join(SHOT_DIR, 'export.xlsx')
        dl.save_as(out)
        check('엑셀 다운로드 파일명', dl.suggested_filename.startswith('차계부_'), dl.suggested_filename)
        import openpyxl
        wb = openpyxl.load_workbook(out)
        check('시트 4개', wb.sheetnames == ['전체요약', '주유기록', '정비기록', '차량정보'], wb.sheetnames)
        ws = wb['주유기록']
        hdr = [c.value for c in ws[1]]
        check('주유기록 헤더', '구간 연비(km/L)' in hdr and '단가(원/L)' in hdr, hdr)
        rows = ws.max_row - 1
        check('주유기록 행 수(9건)', rows == 9, rows)
        ecos = [c.value for c in ws['I'][1:] if isinstance(c.value, (int, float))]
        check('엑셀에 구간연비 숫자', len(ecos) >= 6, ecos[:8])
        ws3 = wb['정비기록']
        check('정비기록 5건 이상', ws3.max_row - 1 >= 5, ws3.max_row - 1)
        ws4 = wb['차량정보']
        vals4 = [str(c.value) for row in ws4.iter_rows() for c in row if c.value]
        check('차량정보에 차대번호', any('KNAC**********2450' in v for v in vals4))
        check('차량정보에 콜로라도 제원', any('95kW' in v or '3.6' in v for v in vals4) or any('3.6L V6' in v for v in vals4))
        ws1 = wb['전체요약']
        by_plate = {row[0]: row for row in ws1.iter_rows(values_only=True) if row and row[0]}
        ray_row = by_plate.get('26라2388')
        check('전체요약 레이 행', bool(ray_row), list(by_plate.keys())[:3])
        check('전체요약 레이 누적주유비=주유기록합', ray_row and int(ray_row[6]) == int(sum(
            r[6] for r in wb['주유기록'].iter_rows(min_row=2, values_only=True) if r[1] and r[1].startswith('26라2388'))),
            ray_row[6] if ray_row else None)
        check('전체요약 평균연비 숫자', ray_row and isinstance(ray_row[8], (int, float)) and 10 < ray_row[8] < 14, ray_row[8] if ray_row else None)

        print('\n[10] JSON 백업 / 복원', flush=True)
        js = page.evaluate('() => JSON.stringify(DB.exportJSON())')
        check('백업 JSON 크기', len(js) > 3000, len(js))
        obj = json.loads(js)
        check('백업 구조(vehicles/data)', 'data' in obj and len(obj['data']['vehicles']) == 3)
        page.evaluate('''() => {
            const b = DB.exportJSON();
            b.data.fuelLogs = b.data.fuelLogs.slice(0,2);
            return DB.importJSON(b).then(()=>{ APP.renderAll(); });
        }''')
        page.wait_for_timeout(400)
        cnt = page.evaluate('() => DB.getState().fuelLogs.length')
        check('복원 후 주유 2건', cnt == 2, cnt)
        page.evaluate('(o) => DB.importJSON(o)', obj)
        page.wait_for_timeout(300)
        cnt2 = page.evaluate('() => DB.getState().fuelLogs.length')
        check('원복 후 주유 9건', cnt2 == 9, cnt2)

        print('\n[11] 새로고침 후 데이터 유지 (IndexedDB)', flush=True)
        page.reload(wait_until='networkidle')
        page.wait_for_selector('#app:not([hidden])')
        persisted = page.evaluate('() => ({ n: DB.getState().fuelLogs.length, mode: DB.mode(), v: DB.getState().vehicles.length })')
        check('IndexedDB 사용', persisted['mode'] == 'idb', persisted)
        check('새로고침 후 9건 유지', persisted['n'] == 9, persisted)

        print('\n[12] Service Worker · 오프라인', flush=True)
        page.wait_for_timeout(800)
        sw = page.evaluate('''async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            return { has: !!reg, active: !!(reg && reg.active), controller: !!navigator.serviceWorker.controller,
                     state: reg && reg.active ? reg.active.state : null };
        }''')
        check('서비스워커 등록·활성', sw['has'] and sw['active'] and sw['state'] == 'activated', sw)
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(600)
        ctrl = page.evaluate('() => !!navigator.serviceWorker.controller')
        check('서비스워커가 페이지 제어', ctrl)
        ctx.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_selector('#app:not([hidden])', timeout=15000)
        offline_state = page.evaluate('() => ({ v: DB.getState().vehicles.length, f: DB.getState().fuelLogs.length })')
        check('오프라인 재로딩 성공', offline_state['v'] == 3 and offline_state['f'] == 9, offline_state)
        offline_ans = page.evaluate('() => AI.answer("레이 엔진오일 몇 리터야?", "ray").text')
        check('오프라인 AI 답변', '2.9L' in offline_ans, offline_ans[:60])
        page.evaluate('() => { APP.S.tab="home"; APP.renderAll(); }')
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(SHOT_DIR, '06_offline_home.png'), full_page=True)
        xlsx_off = page.evaluate('() => { const r = window.EXPORT.buildWorkbook(); return r.SheetNames; }')
        check('오프라인 엑셀 생성', xlsx_off == ['전체요약', '주유기록', '정비기록', '차량정보'], xlsx_off)
        ctx.set_offline(False)

        print('\n[13] 콘솔 오류', flush=True)
        real_errors = [e for e in errors if 'favicon' not in e.lower()]
        check('콘솔 오류 없음', len(real_errors) == 0, real_errors[:3])

        print('\n[14] 화면 폭 430px 회귀', flush=True)
        page2 = ctx.new_page()
        page2.set_viewport_size({'width': 430, 'height': 900})
        page2.goto(BASE, wait_until='networkidle')
        page2.wait_for_selector('#app:not([hidden])')
        overflow = page2.evaluate('() => document.documentElement.scrollWidth - window.innerWidth')
        check('430px 가로 스크롤 없음', overflow <= 1, overflow)
        page2.screenshot(path=os.path.join(SHOT_DIR, '07_430.png'), full_page=True)
        page2.close()

        browser.close()

    print('\n=== 결과: %d/%d 통과 ===' % (len(RESULTS) - len(FAILS), len(RESULTS)))
    if FAILS:
        print('실패 항목:')
        for f in FAILS:
            print(' -', f)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
