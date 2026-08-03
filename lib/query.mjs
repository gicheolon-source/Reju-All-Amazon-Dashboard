import { db } from './db.mjs';
import { ACCOUNT } from './sources.mjs';

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanWeeks(input) {
  const list = (Array.isArray(input) ? input : String(input ?? '').split(','))
    .map(s => String(s).trim()).filter(w => WEEK_RE.test(w));
  return [...new Set(list)].sort();
}

export async function weeksMeta() {
  const c = db();
  const [w, cp, st, tg, ap] = await Promise.all([
    c.execute('SELECT week_start, week_end, label, is_event, note FROM weeks ORDER BY week_start'),
    c.execute('SELECT week_start, COUNT(*) n FROM campaigns GROUP BY week_start'),
    c.execute('SELECT week_start, COUNT(*) n FROM search_terms GROUP BY week_start'),
    c.execute('SELECT week_start, COUNT(*) n FROM targets GROUP BY week_start'),
    c.execute('SELECT week_start, COUNT(*) n FROM products GROUP BY week_start'),
  ]);
  const m = r => new Map(r.rows.map(x => [x.week_start, Number(x.n)]));
  const [mc, ms, mt, ma] = [m(cp), m(st), m(tg), m(ap)];
  return {
    account: ACCOUNT,
    weeks: w.rows.map(r => ({
      id: r.week_start,
      label: r.label,
      isEvent: !!r.is_event,
      note: r.note ?? null,
      counts: { cp: mc.get(r.week_start) ?? 0, st: ms.get(r.week_start) ?? 0,
                tg: mt.get(r.week_start) ?? 0, ap: ma.get(r.week_start) ?? 0 },
    })),
  };
}

/* 문자열을 사전(index) 으로 압축한다 — 포트폴리오/캠페인/광고그룹 이름이
   수만 행에 반복되므로 페이로드가 몇 배 줄어든다. */
function dict() {
  const list = [], idx = new Map();
  return {
    list,
    of(v) {
      const s = v ?? '';
      let i = idx.get(s);
      if (i === undefined) { i = list.length; list.push(s); idx.set(s, i); }
      return i;
    },
  };
}

const N = v => Number(v ?? 0);

/* 주차 여러 개를 하나의 기간으로 합산해 대시보드가 쓰는 압축 포맷으로 돌려준다. */
export async function snapshot(weeks) {
  const ws = cleanWeeks(weeks);
  if (!ws.length) throw new Error('유효한 주차가 없습니다 (YYYY-MM-DD)');
  const ph = ws.map(() => '?').join(', ');
  const c = db();

  const [st, tg, cp, ap, meta] = await Promise.all([
    c.execute({ sql: `
      SELECT MAX(portfolio) pf, campaign, ad_group, term,
             SUM(imp) imp, SUM(clk) clk, SUM(cost) cost, SUM(pur) pur,
             SUM(sales) sales, SUM(units) units, SUM(ntb_sales) ntb, SUM(dpv) dpv
      FROM search_terms WHERE week_start IN (${ph})
      GROUP BY campaign, ad_group, term`, args: ws }),

    /* bid/status 는 창 안에서 가장 최근 주차의 값을 쓴다.
       SQLite 는 MAX() 와 함께 쓰인 비집계 열을 그 최대값 행에서 가져온다. */
    c.execute({ sql: `
      SELECT MAX(portfolio) pf, campaign, ad_group, target, match_type,
             SUM(imp) imp, SUM(clk) clk, SUM(cost) cost, SUM(pur) pur,
             SUM(sales) sales, SUM(units) units,
             MAX(week_start) last_week, bid, status
      FROM targets WHERE week_start IN (${ph})
      GROUP BY campaign, ad_group, target, match_type`, args: ws }),

    /* 캠페인 리포트가 광고비·매출의 진짜 총액이다 — 대시보드 상단 KPI 의 기준.
       ntb_sales·dpv 까지 내려보내야 NTB 비중을 이 기준으로 계산할 수 있다. */
    c.execute({ sql: `
      SELECT MAX(portfolio) pf, campaign, MAX(ad_product) prod,
             SUM(imp) imp, SUM(clk) clk, SUM(cost) cost, SUM(pur) pur,
             SUM(sales) sales, SUM(ntb_pur) ntb_pur, SUM(ntb_sales) ntb_sales, SUM(dpv) dpv
      FROM campaigns WHERE week_start IN (${ph})
      GROUP BY campaign`, args: ws }),

    c.execute({ sql: `
      SELECT MAX(portfolio) pf, campaign, asin, MAX(title) title,
             SUM(imp) imp, SUM(clk) clk, SUM(cost) cost, SUM(pur) pur,
             SUM(sales) sales, SUM(units) units
      FROM products WHERE week_start IN (${ph})
      GROUP BY campaign, asin`, args: ws }),

    c.execute({ sql: `SELECT week_start, label, is_event, note FROM weeks
                      WHERE week_start IN (${ph}) ORDER BY week_start`, args: ws }),
  ]);

  const pfs = dict(), camps = dict(), ags = dict();
  const epoch = w => Date.parse(w + 'T00:00:00Z');

  return {
    weeks: ws,
    period: periodLabel(meta.rows),
    account: ACCOUNT,
    isEvent: meta.rows.some(r => r.is_event),
    notes: meta.rows.filter(r => r.note).map(r => ({ week: r.week_start, note: r.note })),
    st: st.rows.map(r => [pfs.of(r.pf), camps.of(r.campaign), ags.of(r.ad_group), r.term ?? '',
      N(r.imp), N(r.clk), N(r.cost), N(r.pur), N(r.sales), N(r.units), N(r.ntb), N(r.dpv)]),
    tg: tg.rows.map(r => [pfs.of(r.pf), camps.of(r.campaign), ags.of(r.ad_group), r.target ?? '',
      r.match_type ?? '', r.bid == null ? null : N(r.bid), r.status ?? '',
      N(r.imp), N(r.clk), N(r.cost), N(r.pur), N(r.sales), N(r.units), epoch(r.last_week)]),
    cp: cp.rows.map(r => [pfs.of(r.pf), camps.of(r.campaign), r.prod ?? '',
      N(r.imp), N(r.clk), N(r.cost), N(r.pur), N(r.sales), N(r.ntb_pur),
      N(r.ntb_sales), N(r.dpv)]),
    ap: ap.rows.map(r => [pfs.of(r.pf), camps.of(r.campaign), r.asin ?? '', r.title ?? '',
      N(r.imp), N(r.clk), N(r.cost), N(r.pur), N(r.sales), N(r.units)]),
    pfs: pfs.list, camps: camps.list, ags: ags.list,
  };
}

function periodLabel(rows) {
  if (!rows.length) return '';
  if (rows.length === 1) return rows[0].label;
  const first = String(rows[0].label).split(' – ')[0];
  return `${first} – ${String(rows[rows.length - 1].label).split(' – ')[1]}`;
}
