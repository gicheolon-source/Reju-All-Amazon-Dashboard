// /api/data — Google Sheets(RAW Amazon exports) → 주간 집계 대시보드 JSON  [WEEKLY INTL]
//
// 다국가판. 한 배포에서 US / CA / UK / AU / AE 를 전환한다 (`/api/data?country=CA`).
// 집계 로직은 US 경량판과 동일하고, 달라진 것은 "어느 시트를 읽을지"뿐이다.
// US 는 시트 좌표가 COUNTRIES.US.sheets 에 박혀 있어 환경변수 없이도 동작한다.
//
// 주간 보고 전용 경량판. 광고 심층분석(키워드/서치텀/네거티브)은 별도 대시보드가 담당한다.
//   · Search term / Targeting 리포트 → 미사용 (표시 지표에 기여하지 않음 — 검증 완료)
//
// 국가별 소스: 스프레드시트 최대 2개 / 탭 3개
//   MAIN  시트: ASIN 일별 통합(매출/제품/일별) · Campaign(캠페인 성과)
//   NOTES 시트: 주간 특이사항 코멘트 (없어도 대시보드는 정상 동작)
//
// 필요 환경변수 (Vercel → Settings → Environment Variables):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY    (필수 — 없으면 전체 demo)
//   국가별 (XX = US | CA | UK | AU | AE):
//     SHEET_XX_MAIN_ID     필수 — ASIN·Campaign 탭이 있는 시트 ID
//     GID_XX_ASIN          필수 — ASIN 탭 gid
//     GID_XX_CAMPAIGN      필수 — Campaign 탭 gid
//     SHEET_XX_NOTES_ID    선택 — 미설정 시 SHEET_XX_MAIN_ID 를 씀
//     GID_XX_NOTES         선택 — 없으면 코멘트만 빈 상태
//     ※ US 는 코드 기본값이 있어 위 전부 생략 가능 (넣으면 환경변수가 이긴다)
//   DEFAULT_COUNTRY        선택 — 최초 진입 국가 (기본 US)
//   WEEKS_SHOWN            선택 — 표시 주차 수 (기본 16)
//
// ※ 국가마다 시트를 따로 쓰든, 한 시트에 국가별 탭을 두든 모두 지원된다.
//    후자는 SHEET_CA_MAIN_ID 와 SHEET_UK_MAIN_ID 에 같은 ID 를 넣고 gid 만 다르게 준다.
//
// 출력: { demo, country, countries:[...], currency:{...}, updatedAt, weeks:[...], adPeriods:[...] }

import { GoogleAuth } from 'google-auth-library';

/* ── 국가(마켓플레이스) 설정 ─────────────────────────────────────
   국가를 추가·제거할 때 손대는 곳은 여기 하나다.
   나열 순서가 화면 셀렉터의 버튼 순서다.
   ⚠ dec/symbol 을 바꿔도 집계는 그대로다 — 표시 형식만 바뀐다.

   sheets 는 선택 사항인 코드 기본값이다. 있으면 환경변수 없이도 동작하고,
   환경변수가 있으면 그쪽이 이긴다. US 는 이미 운영 중인 시트가 있어 박아 두었다
   (이 ID 들은 저장소 README 에도 이미 적혀 있고, 실제 접근 권한은 시트 공유가
    통제하므로 ID 자체는 비밀이 아니다). */
export const COUNTRIES = {
  US: { label: 'United States', short: 'US', flag: '🇺🇸', symbol: '$',    iso: 'USD', dec: 2,
        sheets: {
          mainId:      '1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao',
          gidAsin:     952475532,
          gidCampaign: 1710166971,
          notesId:     '1GOClg8wNjUOJAQzcu2dGbENoMWrMCMd4vzx-LLqkFqA',
          gidNotes:    119883587,
        } },
  CA: { label: 'Canada',        short: 'CA', flag: '🇨🇦', symbol: 'C$',   iso: 'CAD', dec: 2 },
  UK: { label: 'United Kingdom', short: 'UK', flag: '🇬🇧', symbol: '£',   iso: 'GBP', dec: 2 },
  AU: { label: 'Australia',     short: 'AU', flag: '🇦🇺', symbol: 'A$',   iso: 'AUD', dec: 2 },
  AE: { label: 'Middle East',   short: 'AE', flag: '🇦🇪', symbol: 'AED ', iso: 'AED', dec: 2 },
};
/* 최초 진입 국가는 US — 유일하게 실데이터가 있는 마켓이라, 처음 열었을 때
   데모 화면이 아니라 실제 숫자가 보이는 게 낫다. DEFAULT_COUNTRY 로 바꿀 수 있다. */
const DEFAULT_COUNTRY = (() => {
  const c = String(process.env.DEFAULT_COUNTRY || 'US').toUpperCase();
  return COUNTRIES[c] ? c : 'US';
})();

/* 국가별 시트 좌표: 환경변수 > COUNTRIES[cc].sheets 기본값.
   둘 다 없으면 빈 문자열/NaN 이 되고, handler 가 이를 "미설정"으로 판정해
   500 대신 안내용 demo 응답을 준다. */
const num = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : NaN; };
function sheetCfg(cc) {
  const d = (COUNTRIES[cc] && COUNTRIES[cc].sheets) || {};
  const pick    = (env, def) => process.env[env] || def || '';
  const pickNum = (env, def) => {
    const n = num(process.env[env]);
    return Number.isFinite(n) ? n : (Number.isFinite(def) ? def : NaN);
  };
  const mainId = pick(`SHEET_${cc}_MAIN_ID`, d.mainId);
  return {
    mainId,
    gidAsin:     pickNum(`GID_${cc}_ASIN`,     d.gidAsin),
    gidCampaign: pickNum(`GID_${cc}_CAMPAIGN`, d.gidCampaign),
    // NOTES 는 별도 시트도 되고 같은 시트도 된다
    notesId:  pick(`SHEET_${cc}_NOTES_ID`, d.notesId) || mainId,
    gidNotes: pickNum(`GID_${cc}_NOTES`, d.gidNotes),
  };
}
/* 프런트엔드 국가 셀렉터는 이 목록으로 그린다 (설정된 국가만 활성).
   → 국가 추가 시 index.html 을 고칠 필요가 없다. */
function countryList() {
  return Object.entries(COUNTRIES).map(([cc, m]) => {
    const s = sheetCfg(cc);
    return { code: cc, label: m.label, short: m.short, flag: m.flag,
             currency: { symbol: m.symbol, iso: m.iso, dec: m.dec },
             ready: !!(s.mainId && Number.isFinite(s.gidAsin)) };
  });
}

const WEEKS_SHOWN = +(process.env.WEEKS_SHOWN ?? 16);
const AD_TYPE = { 'Sponsored Products':'SP', 'Sponsored Brands':'SB', 'Sponsored Display':'SD' };

export default async function handler(req, res) {
  /* 국가별로 응답이 다르므로 CDN 캐시가 섞이지 않게 country 를 캐시 키에 포함시킨다.
     Vercel 은 쿼리스트링을 캐시 키에 넣으므로 ?country=CA 와 ?country=UK 는 자동 분리되지만,
     Vary 를 명시해 프록시 단계에서도 섞이지 않게 한다. */
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.setHeader('Vary', 'Accept-Encoding');

  /* ?country=CA — 미지정/오타면 기본 국가로 폴백한다 (400 을 내지 않는다:
     북마크된 옛 URL 이 대시보드를 깨뜨리면 안 되므로) */
  const raw = String((req.query && req.query.country) || '').toUpperCase().trim();
  const country = COUNTRIES[raw] ? raw : DEFAULT_COUNTRY;
  const meta = COUNTRIES[country];
  const countries = countryList();
  const base = {
    country,
    countries,
    currency: { symbol: meta.symbol, iso: meta.iso, dec: meta.dec },
    countryLabel: meta.label,
  };

  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(200).json({ ...base, demo: true, reason: 'env vars not set' });

  /* 해당 국가의 시트 좌표가 아직 안 채워진 상태 — 500 이 아니라 안내를 준다.
     4개국을 순차적으로 온보딩하는 동안 나머지 국가가 에러를 뿜지 않도록. */
  /* ASIN 탭만 있으면 대시보드는 성립한다 — 매출·유닛·세션·Spend·Ad Sales·ACOS·
     TACOS·ROAS 가 전부 ASIN 탭 출처다. Campaign 탭은 캠페인 표와 노출/클릭 전용이라
     없는 국가도 있다 (CA 는 캠페인 리포트를 안 받고 포트폴리오 단위로만 쌓는다).
     그래서 GID_XX_CAMPAIGN 은 필수가 아니다. */
  const CFG = sheetCfg(country);
  if (!CFG.mainId || !Number.isFinite(CFG.gidAsin))
    return res.status(200).json({ ...base, demo: true,
      reason: `${country} not configured — SHEET_${country}_MAIN_ID / GID_${country}_ASIN 를 설정하세요` });

  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;
    const H = { Authorization: `Bearer ${token}` };

    const titleCache = {};   // 요청 단위 — 탭 이름 변경이 즉시 반영되도록
    const [asin, camp, notes] = await Promise.all([
      readTab(CFG.mainId, CFG.gidAsin, H, titleCache),
      // Campaign 탭 미설정 국가는 [] — 캠페인 표만 비고 KPI 는 정상 표시된다
      Number.isFinite(CFG.gidCampaign)
        ? readTab(CFG.mainId, CFG.gidCampaign, H, titleCache) : Promise.resolve([]),
      readNotes(CFG, H, titleCache),   // 코멘트 시트 접근 불가여도 [] 반환 → 대시보드는 정상 동작
    ]);

    const out = buildDashboard({ asin, camp, notes });
    return res.status(200).json({ ...base, demo: false,
      updatedAt: new Date().toISOString(), ...out });
  } catch (err) {
    /* 어느 국가에서 터졌는지 응답에 남긴다 — 4개국이 한 배포를 공유하므로
       국가 표시가 없으면 로그만 보고는 원인을 못 찾는다. */
    return res.status(500).json({ ...base, error: String(err && err.stack || err) });
  }
}

/* ── gid → 탭 제목 해석 후 값 읽기 ─────────────────────────────
   A1 표기법에서 탭 이름은 작은따옴표로 감싼다. 공백·하이픈이 있거나
   숫자로 시작하는 이름("6-1 캠페인" 등)은 감싸지 않으면
   `Unable to parse range` 400 이 나서 대시보드 전체가 죽는다.
   이름 안의 ' 는 '' 로 이스케이프한다 (Sheets 규칙). */
const qTitle = t => `'${String(t).replace(/'/g, "''")}'`;

/* 탭 제목 캐시는 요청 단위로 만든다. 모듈 전역에 두면 Vercel 의 warm 컨테이너가
   재사용돼서, 시트에서 탭 이름을 바꾼 뒤에도 옛 이름을 계속 써 400 이 난다.
   (컨테이너마다 상태가 달라 "어떤 요청은 되고 어떤 요청은 안 되는" 증상) */
async function gidToTitle(sheetId, gid, H, cache) {
  /* 값(map)이 아니라 Promise 를 캐시한다 — Promise.all 로 같은 시트의 탭 2개를
     동시에 읽을 때 메타데이터 요청이 중복되지 않도록. */
  if (!cache[sheetId]) cache[sheetId] = (async () => {
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`,
      { headers: H });
    if (!r.ok) throw new Error(`meta ${sheetId} ${r.status} ${await r.text()}`);
    const j = await r.json();
    return Object.fromEntries(
      (j.sheets || []).map(s => [s.properties.sheetId, s.properties.title]));
  })();
  const map = await cache[sheetId];
  const t = map[gid];
  if (!t) throw new Error(
    `gid ${gid} not found in ${sheetId} — 있는 탭: ${Object.entries(map)
      .map(([g, n]) => `${n}(${g})`).join(', ')}`);
  return t;
}
async function readTab(sheetId, gid, H, cache) {
  const title = await gidToTitle(sheetId, gid, H, cache);
  const range = encodeURIComponent(`${qTitle(title)}!A1:BZ100000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}` +
              `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`values ${title} ${r.status} ${await r.text()}`);
  return (await r.json()).values || [];
}
/* 주간 코멘트 시트 읽기 — 실패해도 절대 대시보드를 깨뜨리지 않는다.
   (시트 미공유/삭제/헤더 변경 등 어떤 이유든 [] 반환 → 코멘트만 비워짐) */
async function readNotes(CFG, H, cache) {
  if (!CFG.notesId || !Number.isFinite(CFG.gidNotes)) return [];   // 코멘트 미설정 국가
  try {
    const title = await gidToTitle(CFG.notesId, CFG.gidNotes, H, cache);
    const range = encodeURIComponent(`${qTitle(title)}!A1:Z2000`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.notesId}/values/${range}` +
                `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
    const r = await fetch(url, { headers: H });
    if (!r.ok) return [];
    return (await r.json()).values || [];
  } catch { return []; }
}

/* ── 파싱 헬퍼 ──────────────────────────────────────────────── */
/* 통화 문자열 → 숫자.
   대상 4개국(CA/UK/AU/AE)은 모두 소수점 '.' + 천단위 ',' 를 쓰므로,
   콤마를 지운 뒤 숫자·부호·소수점만 남기면 C$ · £ · A$ · AED 가 전부 처리된다.
   ⚠ 유럽식(1.234,56)을 쓰는 마켓(DE/FR/IT/ES)을 추가할 때는 이 함수를 먼저
      고쳐야 한다. 그대로 두면 1.234,56 → 1.23456 이 되어 1000배 작아진다. */
const money = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};
const str = v => String(v ?? '').trim();

/* 날짜 파싱 — 시트마다 구분자와 공백이 다르다. 실측된 형태:
     "2026-07-15" (UK/AU)  "2026- 8- 2" (US/CA)  "2026/7/8"
     "2026. 8. 2" (AE)  ← 마침표 구분. 로케일이 다른 환경에서 붙여넣으면 이렇게 된다.
   ⚠ 마침표를 안 받아주면 해당 행이 조용히 버려진다. AE 시트에서 실제로 238행
     (2026-06-26 ~ 2026-08-02, 매출 109,600)이 통째로 누락되어 최근 5주가
     대시보드에서 사라져 있었다. 파싱 실패는 에러가 아니라 '행 스킵'이라 조용하다.
   반환 null 인 행은 스킵된다 — 데이터 중간에 섞인 머리글("Date") 같은 잡행 처리용. */
function pdate(s) {
  const t = String(s ?? '').replace(/\s+/g, '').replace(/\.$/, '');   // "2026.8.2." 도 허용
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
  const mdy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;
  const m = t.match(ymd) ||
            (t.match(mdy) && (() => { const x = t.match(mdy); return [null, x[3], x[1], x[2]]; })());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}
const dayMs = 86400000;
const weekSun = d => new Date(d.getTime() - d.getUTCDay() * dayMs);   // Sunday of d's week
const iso = d => d.toISOString().slice(0, 10);
function wkLabel(sun) {
  const jan1 = Date.UTC(sun.getUTCFullYear(), 0, 1);
  const doy = Math.round((sun.getTime() - jan1) / dayMs);            // 0-based
  return 'W' + String(Math.floor((doy + 6) / 7)).padStart(2, '0');
}
function wkRange(sun) {
  const sat = new Date(sun.getTime() + 6 * dayMs);
  return `${sun.getUTCMonth() + 1}/${sun.getUTCDate()}\u2013${sat.getUTCMonth() + 1}/${sat.getUTCDate()}`;
}
const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
function parseRange(s) {                  // "Jun 01, 2026 - Jun 30, 2026"
  const m = [...String(s ?? '').matchAll(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/g)];
  if (m.length < 2) return [null, null];
  const mk = g => new Date(Date.UTC(+g[3], MON[g[1]], +g[2]));
  return [mk(m[0]), mk(m[1])];
}
/* 헤더 이름으로 컬럼 찾기 — 마켓플레이스마다 표기가 미묘하게 다르다.
   실제로 US 와 CA 시트에서 확인된 차이:
     "Units Ordered"    (US) vs "Units ordered"    (CA)  ← 대소문자
     "Sessions - Total" (US) vs "Sessions – Total"  (CA)  ← 하이픈 vs EN DASH(U+2013)
   정확 일치만 하면 전 행이 스킵되어 Units·Sessions 가 조용히 0 이 된다(에러도 안 난다).
   그래서 대소문자 · 대시 종류 · 연속 공백을 무시하고 비교한다.

   ⚠ 부분 일치(includes)는 쓰지 않는다 — "Sessions - Total" 이
     "Sessions - Total - B2B" 를 잡아버리면 B2B 수치가 섞인다.
     정규화 후에도 '완전 일치' 여야 한다. */
const normHdr = s => String(s ?? '').trim().toLowerCase()
  .replace(/[‐-―−]/g, '-')   // ‐‑‒–—―− → -
  .replace(/\s+/g, ' ');
const idxOf = (header, name) => {
  const i = header.indexOf(name);           // 정확 일치가 있으면 그대로 (가장 빠름)
  if (i >= 0) return i;
  const want = normHdr(name);
  return header.findIndex(h => normHdr(h) === want);
};

/* ── NOTES 탭 파싱 → { 정규화된 주차키: {overview, sales, ads} } ──
   헤더(1행): Week | Overview | Sales | Advertising  (한글 별칭도 허용)
   Week 값은 주차 라벨(W28) 또는 일요일 날짜(2026-07-12) 둘 다 인식 */
const normKey = s => String(s ?? '').toUpperCase().replace(/\s+/g, '');
function parseNotes(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return {};
  const h = rows[0].map(x => String(x ?? '').trim().toLowerCase());
  const find = (...alts) => h.findIndex(x => alts.some(a => x.includes(a)));
  const ci = {
    wk: find('week', '주차', '주'),
    ov: find('overview', '경영', '요약', '오버뷰'),
    sl: find('sales', '매출', '세일'),
    ad: find('advertis', '광고', '애드'),
  };
  if (ci.wk < 0) return {};
  const map = {};
  for (const x of rows.slice(1)) {
    if (!x || !x.length) continue;
    const k = str(x[ci.wk]); if (!k) continue;
    const rec = {
      overview: ci.ov >= 0 ? str(x[ci.ov]) : '',
      sales:    ci.sl >= 0 ? str(x[ci.sl]) : '',
      ads:      ci.ad >= 0 ? str(x[ci.ad]) : '',
    };
    if (rec.overview || rec.sales || rec.ads) map[normKey(k)] = rec;
  }
  return map;
}

/* ── 광고 리포트 라우팅: 일~토 7일 pull = 주간, 20일↑ = 월간, 그 외 무시 ── */
function routeRange(dr) {
  const [a, b] = parseRange(dr);
  if (!a) return [null, null];
  const span = Math.round((b - a) / dayMs);
  if (a.getUTCDay() === 0 && span === 6) return ['week', iso(a)];
  if (span >= 20) return ['month', `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}`];
  return [null, null];
}

/* ══════════════════════════════════════════════════════════════
   메인 집계
══════════════════════════════════════════════════════════════ */
export function buildDashboard({ asin, camp, notes }) {
  const noteMap = parseNotes(notes);
  /* ---- ASIN 일별 통합 → 주간 매출/제품/일별 ---- */
  const aHead = asin[1] || [];            // 1행은 배너, 2행이 헤더
  const aRows = asin.slice(2);
  const c = {
    date: idxOf(aHead, 'Date'),
    asin: idxOf(aHead, '(Child) ASIN'),
    pname: idxOf(aHead, 'Product Name'),
    title: idxOf(aHead, 'Title'),
    units: idxOf(aHead, 'Units Ordered'),
    sales: idxOf(aHead, 'Ordered Product Sales'),
    spend: idxOf(aHead, 'Spend'),
    adsales: idxOf(aHead, 'Ad Sales'),
    sess: idxOf(aHead, 'Sessions - Total'),
  };

  const names = {};
  for (const x of aRows) {
    const a = str(x[c.asin]); if (!a) continue;
    const pn = str(x[c.pname]);
    if (!(a in names) || names[a] === a)
      names[a] = pn || (str(x[c.title]).slice(0, 38) || a);
  }

  const weeks = {};
  const wk = key => (weeks[key] ||= {
    totalSales: 0, units: 0, sessions: 0, spend: 0, sales: 0,
    daily: {}, products: {},
  });
  for (const x of aRows) {
    const a = str(x[c.asin]); if (!a) continue;
    const d = pdate(x[c.date]); if (!d) continue;
    const w = wk(iso(weekSun(d)));
    const ts = money(x[c.sales]), un = money(x[c.units]),
          sp = money(x[c.spend]), asl = money(x[c.adsales]), se = money(x[c.sess]);
    w.totalSales += ts; w.units += un; w.sessions += se; w.spend += sp; w.sales += asl;
    const dk = iso(d);
    const dd = (w.daily[dk] ||= [0, 0, 0]); dd[0] += ts; dd[1] += asl; dd[2] += un;
    const pr = (w.products[a] ||= [0, 0, 0]); pr[0] += un; pr[1] += ts; pr[2] += se;
  }

  /* ---- Campaign → 주간/월간 광고 ----
     경량판은 Campaign 리포트만 사용한다.
     (Search term / Targeting 은 추천 패널 전용이었으므로 제거) */
  const adWeeks = {}, adMonths = {};
  const bucket = (kind, key) => kind === 'week'
    ? (adWeeks[key] ||= { spend: 0, sales: 0, impr: 0, clicks: 0, campaigns: [], range: '' })
    : (adMonths[key] ||= { spend: 0, sales: 0, impr: 0, clicks: 0, campaigns: [], range: '' });

  const classify = rows => {
    const h = rows && rows[0] || [];
    if (idxOf(h, 'Campaign name') >= 0) return 'campaign';
    return 'unknown';
  };

  const procCampaign = rows => {
    const h = rows[0] || [], ci = {
      dr: idxOf(h, 'Date range'), name: idxOf(h, 'Campaign name'),
      prod: idxOf(h, 'Ad product'), cost: idxOf(h, 'Total cost'),
      sales: idxOf(h, 'Sales'), clicks: idxOf(h, 'Clicks'), pur: idxOf(h, 'Purchases'),
      impr: idxOf(h, 'Impressions'),    // 노출수 (Viewable impressions 아님)
      pf: idxOf(h, 'Portfolio name'),   // 있으면 포트폴리오, 없으면 미지정
    };
    for (const x of rows.slice(1)) {
      if (!x || !x.length) continue;
      const [kind, key] = routeRange(x[ci.dr]); if (!kind) continue;
      const t = bucket(kind, key);
      const spend = money(x[ci.cost]), sales = money(x[ci.sales]), clk = money(x[ci.clicks]);
      const imp = ci.impr >= 0 ? money(x[ci.impr]) : 0;
      t.spend += spend; t.sales += sales; t.impr += imp; t.clicks += clk;
      t.campaigns.push({
        name: str(x[ci.name]), type: AD_TYPE[str(x[ci.prod])] || 'SP',
        portfolio: (ci.pf >= 0 && str(x[ci.pf])) ? str(x[ci.pf]) : '미지정',
        spend, sales, impr: imp, clicks: clk,
        cvr: clk ? +(money(x[ci.pur]) / clk * 100).toFixed(1) : 0,
      });
      if (kind === 'month') t.range = str(x[ci.dr]);
    }
  };

  const PROC = { campaign: procCampaign };
  for (const rows of [camp]) {
    const proc = PROC[classify(rows)];
    if (proc) proc(rows);
  }

  /* ---- 조립 ---- */
  const skeys = Object.keys(weeks).sort().slice(-WEEKS_SHOWN);
  const outWeeks = skeys.map(key => {
    const w = weeks[key], sun = new Date(key + 'T00:00:00Z');
    const daily = Object.keys(w.daily).sort().map(dk => {
      const d = new Date(dk + 'T00:00:00Z'), v = w.daily[dk];
      return { date: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
               totalSales: Math.round(v[0]), adSales: Math.round(v[1]), units: Math.round(v[2]) };
    });
    const products = Object.entries(w.products)
      .map(([a, v]) => ({ asin: a, name: names[a] || a,
        units: Math.round(v[0]), sales: Math.round(v[1]), sessions: Math.round(v[2]) }))
      .sort((p, q) => q.sales - p.sales);
    const aw = adWeeks[key];
    const has = !!(aw && aw.spend > 0);
    const lbl = wkLabel(sun);
    const note = noteMap[normKey(lbl)] || noteMap[normKey(key)] || null;
    /* Ad Spend·Ad Sales 는 원래 ASIN 탭 출처다. 그런데 마켓에 따라 ASIN 탭의
       Spend·Ad Sales 열이 비어 있고 Campaign 리포트만 있는 경우가 있다
       (CA: ASIN 탭 광고열이 2026-05-06 에서 끊겼는데 Campaign 탭에 W30 이 있음).
       이때 0 을 그대로 내보내면 ACOS 가 0.0% 로 찍혀 '효율 완벽' 이라는 정반대
       신호를 준다 — 실제로는 C$10,667 을 써서 38.6% 였다. 단순 누락이 아니라
       거짓 신호이므로, ASIN 쪽이 비었고 Campaign 쪽에 값이 있으면 Campaign 을 쓴다.

       ⚠ 두 출처는 집계 기준이 달라 값이 다르다 (US 실측: ASIN $33,592 vs
         Campaign $42,152, 약 25% 차이). 그래서 어느 쪽을 썼는지 adSrc 로 내려보내
         화면에 밝힌다. ASIN 탭에 값이 있는 마켓(US 등)은 기존 동작 그대로다. */
    let spend = Math.round(w.spend), sales = Math.round(w.sales), adSrc = 'asin';
    if (!spend && !sales && has) {
      spend = Math.round(aw.spend);
      sales = Math.round(aw.sales);
      adSrc = 'campaign';
    }
    return {
      key, label: lbl, range: wkRange(sun),
      totalSales: Math.round(w.totalSales), units: Math.round(w.units),
      sessions: Math.round(w.sessions), spend, sales, adSrc,
      daily, products, notes: [], note,
      ads: {
        hasAds: has,
        spend: has ? Math.round(aw.spend) : 0,
        sales: has ? Math.round(aw.sales) : 0,
        impr: has ? Math.round(aw.impr) : 0,
        clicks: has ? Math.round(aw.clicks) : 0,
        campaigns: has ? [...aw.campaigns].sort((a, b) => b.spend - a.spend) : [],
      },
    };
  });

  const adPeriods = Object.keys(adMonths).sort().map(key => {
    const m = adMonths[key];
    return {
      key, label: `${key} (\uc6d4\uac04)`, range: m.range,
      spend: Math.round(m.spend), sales: Math.round(m.sales),
      impr: Math.round(m.impr), clicks: Math.round(m.clicks),
      campaigns: [...m.campaigns].sort((a, b) => b.spend - a.spend),
    };
  });

  return { weeks: outWeeks, adPeriods };
}
