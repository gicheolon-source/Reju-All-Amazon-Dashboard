/* 적재된 수치를 주차별로 대조한다.
   Campaign 리포트가 광고비/매출의 기준이고, Search term·Targeting 은 그 부분집합이므로
   비용 커버리지가 100% 를 넘으면 중복 적재, 너무 낮으면 리포트 누락이다. */
import '../lib/env.mjs';
import { db } from '../lib/db.mjs';
import { MARKETS, cleanMarket } from '../lib/sources.mjs';

const MARKET = cleanMarket(process.argv.find(a => a.startsWith('--market='))?.split('=')[1]);
console.log(`\n마켓: ${MARKET} (${MARKETS[MARKET].account})` +
  (MARKET === 'US' ? '   — 캐나다는 --market=ca' : ''));

const c = db();
const TABLES = ['campaigns', 'search_terms', 'targets', 'products'];

const byTable = {};
for (const t of TABLES) {
  const r = await c.execute({ sql:
    `SELECT week_start, COUNT(*) rows, SUM(clk) clk, SUM(cost) cost, SUM(pur) pur, SUM(sales) sales
     FROM ${t} WHERE market = ? GROUP BY week_start ORDER BY week_start`, args: [MARKET] });
  byTable[t] = new Map(r.rows.map(x => [x.week_start, x]));
}

const weeks = [...new Set(TABLES.flatMap(t => [...byTable[t].keys()]))].sort();
if (!weeks.length) { console.log('이 마켓에 적재된 데이터가 없습니다. npm run load 를 먼저 실행하세요.'); process.exit(0); }

/* 행사주로 지정된 주차는 광고비 급등이 정상이므로 WoW 경고를 띄우지 않는다 */
const meta = await c.execute({ sql: 'SELECT week_start, is_event, note FROM weeks WHERE market = ?', args: [MARKET] });
const events = new Map(meta.rows.map(r => [r.week_start, { on: !!r.is_event, note: r.note }]));

const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pad = (s, n) => String(s).padStart(n);

console.log('\n주차별 적재 현황 (행 수 / 광고비)\n');
console.log('  주차          Campaign            Search term          Targeting           Product');
console.log('  ' + '─'.repeat(88));

const warns = [];
for (const w of weeks) {
  const cp = byTable.campaigns.get(w);
  const cells = TABLES.map(t => {
    const r = byTable[t].get(w);
    if (!r) return pad('—', 19);
    const share = t !== 'campaigns' && cp?.cost ? ` ${Math.round(r.cost / cp.cost * 100)}%` : '';
    return pad(`${r.rows}행 ${money(r.cost)}${share}`, 19);
  });
  console.log(`  ${w}  ${cells.join(' ')}`);

  if (!cp) { warns.push(`${w}: Campaign 리포트가 없습니다 — KPI 기준값이 비어 있습니다.`); continue; }
  for (const t of ['search_terms', 'targets']) {
    const r = byTable[t].get(w);
    if (!r) { warns.push(`${w}: ${t} 없음 — 해당 주차 분석 불가.`); continue; }
    const share = r.cost / cp.cost;
    if (share > 1.01) warns.push(`${w}: ${t} 광고비가 Campaign 을 초과(${Math.round(share * 100)}%) — 중복 적재 의심.`);
    else if (share < 0.5) warns.push(`${w}: ${t} 광고비 커버리지 ${Math.round(share * 100)}% — 리포트가 일부만 뽑혔을 수 있습니다.`);
  }
}

console.log('\n주차별 KPI (Campaign 기준)\n');
console.log('  주차          클릭        광고비        주문      광고매출        ACOS');
console.log('  ' + '─'.repeat(72));
let prev = null;
for (const w of weeks) {
  const r = byTable.campaigns.get(w);
  if (!r) continue;
  const acos = r.sales ? r.cost / r.sales * 100 : null;
  const wow = prev ? (r.cost - prev.cost) / prev.cost * 100 : null;
  const ev = events.get(w);
  console.log(`  ${w}  ${pad(Number(r.clk).toLocaleString(), 9)}  ${pad(money(r.cost), 11)}` +
    `  ${pad(Number(r.pur).toLocaleString(), 8)}  ${pad(money(r.sales), 12)}  ${pad(acos ? acos.toFixed(1) + '%' : '—', 8)}` +
    (wow != null ? `   광고비 ${wow >= 0 ? '+' : ''}${wow.toFixed(0)}% WoW` : '') +
    (ev?.on ? `  [행사주${ev.note && ev.note !== '행사주' ? ' · ' + ev.note : ''}]` : ''));
  if (wow != null && Math.abs(wow) > 100 && !ev?.on)
    warns.push(`${w}: 광고비가 전주 대비 ${wow.toFixed(0)}% — 행사주라면 scripts/set-week.mjs 로 표시하고, 아니면 중복 적재를 확인하세요.`);
  prev = r;
}

const log = await c.execute(
  { sql: `SELECT ran_at, source, rows_in, rows_kept, rows_skipped FROM ingest_log WHERE market = ? ORDER BY id DESC LIMIT 5`, args: [MARKET] });
if (log.rows.length) {
  console.log('\n최근 적재 기록\n');
  for (const r of log.rows)
    console.log(`  ${String(r.ran_at).slice(0, 19)}  ${String(r.source).padEnd(13)}` +
      ` 읽음 ${pad(r.rows_in, 6)} → 적재 ${pad(r.rows_kept, 6)}  (조각기간 버림 ${r.rows_skipped})`);
}

if (warns.length) {
  console.log('\n⚠ 확인 필요\n');
  for (const w of [...new Set(warns)]) console.log(`  · ${w}`);
} else {
  console.log('\n이상 없음.');
}
