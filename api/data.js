// /api/data — Google Sheets(RAW Amazon exports) → 주간 집계 대시보드 JSON  [WEEKLY LITE]
//
// 주간 보고 전용 경량판. 광고 심층분석(키워드/서치텀/네거티브)은 별도 대시보드가 담당한다.
//   · Search term 리포트 → 제거 (추천 패널 삭제로 불필요, 주당 3,200행 절감)
//   · Targeting 리포트   → 제거 (추천용 keywords 만 채우던 소스)
//   ※ 위 둘은 화면 표시 지표(매출/지출/캠페인/제품)에 전혀 기여하지 않음 — 검증 완료
//
// 소스: 2개 스프레드시트 / 3개 탭
//   MAIN  시트: ASIN 일별 통합(매출/제품/일별) · Campaign(캠페인 성과)
//   NOTES 시트: 주간 특이사항 코멘트
//
// 필요 환경변수 (Vercel → Settings → Environment Variables):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY   (필수 — 없으면 demo)
//   SHEET_MAIN_ID, SHEET_NOTES_ID                      (선택 — 기본값 내장)
//   GID_ASIN, GID_CAMPAIGN, GID_NOTES                  (선택 — 기본값 내장)
//
// 출력: { demo, updatedAt, weeks:[...], adPeriods:[...] }

import { GoogleAuth } from 'google-auth-library';

const CFG = {
  mainId:   process.env.SHEET_MAIN_ID   || '1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao',
  gidAsin:     +(process.env.GID_ASIN     ?? 952475532),
  gidCampaign: +(process.env.GID_CAMPAIGN ?? 1710166971),
  // 주간 특이사항 코멘트 (별도 스프레드시트)
  notesId:  process.env.SHEET_NOTES_ID || '1GOClg8wNjUOJAQzcu2dGbENoMWrMCMd4vzx-LLqkFqA',
  gidNotes: +(process.env.GID_NOTES ?? 119883587),
};
const WEEKS_SHOWN = +(process.env.WEEKS_SHOWN ?? 16);
const AD_TYPE = { 'Sponsored Products':'SP', 'Sponsored Brands':'SB', 'Sponsored Display':'SD' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(200).json({ demo: true, reason: 'env vars not set' });

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
      readTab(CFG.mainId, CFG.gidCampaign, H, titleCache),
      readNotes(H, titleCache),   // 코멘트 시트 접근 불가여도 [] 반환 → 대시보드는 정상 동작
    ]);

    const out = buildDashboard({ asin, camp, notes });
    return res.status(200).json({ demo: false, updatedAt: new Date().toISOString(), ...out });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.stack || err) });
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
async function readNotes(H, cache) {
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
const money = v => {
  const n = parseFloat(String(v ?? '').replace(/[$,%\s]/g, ''));
  return isNaN(n) ? 0 : n;
};
const str = v => String(v ?? '').trim();

function pdate(s) {                       // "2026-07-15", "2026- 7- 8", "2026/7/8"
  const t = String(s ?? '').replace(/\s+/g, '');
  const m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/) ||
            (t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/) && (() => {
              const x = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
              return [null, x[3], x[1], x[2]];
            })());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
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
const idxOf = (header, name) => header.indexOf(name);

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
    return {
      key, label: lbl, range: wkRange(sun),
      totalSales: Math.round(w.totalSales), units: Math.round(w.units),
      sessions: Math.round(w.sessions), spend: Math.round(w.spend), sales: Math.round(w.sales),
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
