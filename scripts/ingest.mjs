/* 구글 시트의 아마존 광고 리포트를 읽어 SQLite/Turso 에 적재한다.

   사용법:
     node scripts/ingest.mjs                     전체 소스
     node scripts/ingest.mjs --only=search_terms  일부만
     node scripts/ingest.mjs --weeks=2026-07-19   특정 주차만
     node scripts/ingest.mjs --dry                읽고 집계만, DB 쓰기 없음

   핵심 규칙: 시트에는 같은 주의 부분 기간 조각행이 섞여 있다
   (예: 'Jun 01 - Jun 01', 'May 31 - Jun 03'). 함께 합산하면 수치가 오염되므로
   일요일 시작 + 정확히 7일인 행만 한 주차로 인정하고 나머지는 버린다. */
import '../lib/env.mjs';
import { SOURCES, SHEETS } from '../lib/sources.mjs';
import { pullTab } from '../lib/sheets.mjs';
import { db, insertRows } from '../lib/db.mjs';
import { colMap, parseRange, fullWeek, weekEnd, weekLabel, txt } from '../lib/normalize.mjs';

const args = process.argv.slice(2);
const flag = n => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = n => args.includes(`--${n}`);

const only = flag('only')?.split(',').map(s => s.trim()).filter(Boolean);
const weekFilter = flag('weeks')?.split(',').map(s => s.trim()).filter(Boolean);
const dry = has('dry');

const money = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => String(s).padStart(n);

const summary = [];

for (const [name, src] of Object.entries(SOURCES)) {
  if (only && !only.includes(name)) continue;

  console.log(`\n━━ ${src.label} (${name}) ━━`);
  if (!src.gid) {
    console.log(`   건너뜀 — 시트에 탭이 없습니다. lib/sources.mjs 의 ${name}.gid 를 채우면 적재됩니다.`);
    continue;
  }

  const { title, rows } = await pullTab(SHEETS[src.sheet], src.gid);
  console.log(`   시트 "${title}"  ${rows.length} 행 읽음`);
  if (rows.length < 2) { console.log('   데이터 없음'); continue; }

  const { idx, missing } = colMap(rows[0], src.spec);
  if (missing.length) {
    console.error(`   ✗ 필요한 열을 찾지 못했습니다: ${missing.join(', ')}`);
    console.error(`     실제 헤더: ${rows[0].map(h => txt(h)).join(' | ')}`);
    process.exitCode = 1;
    continue;
  }

  const agg = new Map();           // week \u0000 key… → row
  const skipped = new Map();       // 버린 Date range → 행 수
  let invalid = 0, filtered = 0;

  for (let n = 1; n < rows.length; n++) {
    const r = rows[n];
    if (!r || r.length === 0) continue;
    const rangeTxt = txt(r[idx.range]);
    if (!rangeTxt) continue;

    const ws = fullWeek(parseRange(rangeTxt));
    if (!ws) { skipped.set(rangeTxt, (skipped.get(rangeTxt) || 0) + 1); continue; }
    if (weekFilter && !weekFilter.includes(ws)) { filtered++; continue; }

    const row = src.map(r, idx);
    if (!src.valid(row)) { invalid++; continue; }

    const k = ws + '\u0000' + src.key.map(c => row[c]).join('\u0000');
    const prev = agg.get(k);
    if (!prev) { agg.set(k, { week_start: ws, ...row }); continue; }
    for (const m of src.metrics) prev[m] += row[m];
    for (const m of src.meta) if (row[m] !== '' && row[m] != null) prev[m] = row[m];
  }

  const skipRows = [...skipped.values()].reduce((a, b) => a + b, 0);
  console.log(`   인정 ${agg.size} 행 (집계 후)   조각기간 버림 ${skipRows} 행 / ${skipped.size} 종류` +
    (invalid ? `   무효 ${invalid}` : '') + (filtered ? `   주차필터 제외 ${filtered}` : ''));
  if (skipped.size) {
    const top = [...skipped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`     버린 기간 예: ${top.map(([k, v]) => `${k}(${v})`).join(', ')}${skipped.size > 5 ? ' …' : ''}`);
  }

  // 주차별 집계 결과
  const byWeek = new Map();
  for (const row of agg.values()) {
    const w = byWeek.get(row.week_start) ?? { rows: 0, clk: 0, cost: 0, pur: 0, sales: 0 };
    w.rows++; w.clk += row.clk ?? 0; w.cost += row.cost ?? 0;
    w.pur += row.pur ?? 0; w.sales += row.sales ?? 0;
    byWeek.set(row.week_start, w);
  }
  console.log(`   주차 ${byWeek.size}개:`);
  for (const ws of [...byWeek.keys()].sort()) {
    const w = byWeek.get(ws);
    console.log(`     ${ws}  rows=${pad(w.rows, 6)}  clk=${pad(w.clk.toLocaleString(), 9)}` +
      `  cost=${pad(money(w.cost), 12)}  pur=${pad(w.pur.toLocaleString(), 7)}  sales=${pad(money(w.sales), 13)}`);
    summary.push({ source: name, week: ws, ...w });
  }

  if (dry) { console.log('   --dry: DB 쓰기 생략'); continue; }
  if (!agg.size) continue;

  // 적재: 대상 주차를 지우고 다시 넣는다 (재실행해도 같은 결과)
  const cols = ['week_start', ...src.key, ...src.meta, ...src.metrics];
  const rowsFor = ws => [...agg.values()].filter(r => r.week_start === ws).map(r => cols.map(c => r[c] ?? null));

  const c = db();
  for (const ws of [...byWeek.keys()].sort()) {
    const tx = await c.transaction('write');
    try {
      await tx.execute({ sql: `DELETE FROM ${src.table} WHERE week_start = ?`, args: [ws] });
      await insertRows(tx, src.table, cols, rowsFor(ws));
      await tx.execute({
        sql: `INSERT INTO weeks (week_start, week_end, label, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(week_start) DO UPDATE SET week_end=excluded.week_end,
                label=excluded.label, updated_at=excluded.updated_at`,
        args: [ws, weekEnd(ws), weekLabel(ws), new Date().toISOString()],
      });
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }

  await c.execute({
    sql: `INSERT INTO ingest_log (ran_at, source, rows_in, rows_kept, rows_skipped, weeks, detail)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [new Date().toISOString(), name, rows.length - 1, agg.size, skipRows,
      [...byWeek.keys()].sort().join(','), `시트 "${title}" gid ${src.gid}`],
  });
  console.log(`   ✓ ${src.table} 적재 완료 (${agg.size} 행, ${byWeek.size} 주차)`);
}

if (!dry && summary.length) console.log('\n검증은 `npm run verify` 로 확인하세요.');
