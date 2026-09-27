/* 광고 콘솔 리포트 CSV 를 Turso 에 직접 적재한다 — 구글 시트를 거치지 않는다.
   시트는 셀 1,000만 개 한도가 있어 서치텀 같은 대용량 리포트를 담을 수 없다.

   사용법:
     node scripts/load.mjs                        reports/us/ 의 모든 CSV → US
     node scripts/load.mjs --market=ca            reports/ca/ 의 모든 CSV → CA
     node scripts/load.mjs a.csv b.csv            파일 지정 (마켓은 --market, 기본 US)
     node scripts/load.mjs --weeks=2026-07-19     특정 주차만
     node scripts/load.mjs --dry                  읽고 집계만, DB 쓰기 없음

   마켓(US/CA)별로 폴더가 나뉜다 — 한 번의 실행은 한 마켓만 적재한다.
   리포트 종류(서치텀/타겟팅/캠페인/광고제품)는 헤더로 자동 판별한다.
   같은 주차를 다시 넣으면 그 마켓의 그 주차만 지우고 다시 넣으므로 몇 번 실행해도 결과가 같다. */
import { ROOT } from '../lib/env.mjs';
import { readdir, stat, mkdir } from 'node:fs/promises';
import { join, extname, basename, resolve } from 'node:path';
import { SOURCES, MARKETS, cleanMarket, detectSources } from '../lib/sources.mjs';
import { readCsvAoa } from '../lib/csv.mjs';
import { aggregate, merge, writeWeeks, report, HeaderError } from '../lib/aggregate.mjs';

const args = process.argv.slice(2);
const flag = n => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const weekFilter = flag('weeks')?.split(',').map(s => s.trim()).filter(Boolean);
const dry = args.includes('--dry');
const targets = args.filter(a => !a.startsWith('--'));

const rawMarket = flag('market');
if (rawMarket && cleanMarket(rawMarket) !== String(rawMarket).toUpperCase()) {
  console.error(`✗ 알 수 없는 마켓 "${rawMarket}" — 가능한 값: ${Object.keys(MARKETS).join(', ')}`);
  process.exit(1);
}
const MARKET = cleanMarket(rawMarket);
const marketDir = join(ROOT, 'reports', MARKET.toLowerCase());

const CSV = new Set(['.csv', '.tsv', '.txt']);

async function expand(p) {
  const abs = resolve(p);
  const s = await stat(abs).catch(() => null);
  if (!s) { console.error(`   ✗ 없는 경로: ${p}`); process.exitCode = 1; return []; }
  if (s.isFile()) return CSV.has(extname(abs).toLowerCase()) ? [abs] : [];
  const out = [];
  for (const e of await readdir(abs, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
    out.push(...await expand(join(abs, e.name)));
  }
  return out.sort();
}

await mkdir(marketDir, { recursive: true });
console.log(`마켓: ${MARKET} (${MARKETS[MARKET].account})`);

/* 실수 방지: reports/ 바로 밑에 놓인 CSV 는 어느 마켓인지 알 수 없으므로 적재하지 않는다 */
if (!targets.length) {
  const stray = (await readdir(join(ROOT, 'reports'), { withFileTypes: true }).catch(() => []))
    .filter(e => e.isFile() && CSV.has(extname(e.name).toLowerCase())).map(e => e.name);
  if (stray.length) {
    console.log(`\n⚠ reports/ 바로 밑에 CSV ${stray.length}개가 있습니다 — 마켓 폴더로 옮겨야 적재됩니다:`);
    console.log('    ' + Object.keys(MARKETS).map(m => `${m}: reports\\${m.toLowerCase()}\\`).join('   '));
    stray.slice(0, 5).forEach(f => console.log(`    · ${f}`));
  }
}

const roots = targets.length ? targets : [marketDir];
const files = (await Promise.all(roots.map(expand))).flat();

if (!files.length) {
  console.log(`\n적재할 CSV 가 없습니다.\n`);
  console.log(`  광고 콘솔에서 리포트를 CSV 로 내려받아 아래 폴더에 넣고 다시 실행하세요:`);
  console.log(`    ${marketDir}\n`);
  console.log('  다른 마켓: ' + Object.keys(MARKETS).filter(m => m !== 'US')
    .map(m => `npm run load:${m.toLowerCase()}`).join(' · ') + '\n');
  console.log(`  ⚠ 리포트 생성 시 날짜 범위는 일요일~토요일, 단위는 요약(Summary) 으로 뽑아야 합니다.`);
  console.log(`    일별로 뽑으면 조각 기간이라 적재되지 않습니다.\n`);
  console.log(`  xlsx 파일은 엑셀에서 "다른 이름으로 저장 → CSV UTF-8" 로 변환해주세요.\n`);
  process.exit(0);
}

/* 1단계: 파일별로 읽고 종류를 판별해 집계 */
const bySource = new Map();   // name → [result]
let failed = 0;

for (const f of files) {
  const label = basename(f);
  try {
    const { rows, count, delimiter } = await readCsvAoa(f);
    const names = detectSources(rows[0]);
    if (!names.length) {
      console.error(`✗ ${label} — 리포트 종류를 알 수 없습니다`);
      console.error(`    헤더: ${rows[0].slice(0, 12).join(' | ')}${rows[0].length > 12 ? ' …' : ''}`);
      failed++; continue;
    }
    /* 차원이 섞인 파일은 해당하는 소스 전부에 적재된다 (합계는 보존된다).
       단 복합 파일의 캠페인 총액은 전용 리포트보다 13~22% 적으므로(SB 일부 누락)
       빈 주차만 채우는 fillOnly 로 표시한다 — 전용 캠페인 리포트가 항상 이긴다. */
    for (const name of names) {
      const src = SOURCES[name];
      let res;
      try { res = aggregate(rows, src, { weekFilter, expectCurrency: MARKETS[MARKET].code }); }
      catch (e) {
        /* 한 소스의 열 누락이 같은 파일의 다른 소스 적재까지 막으면 안 된다 */
        failed++;
        console.error(`✗ ${label} → ${src.label} — ${e.message}`);
        if (e instanceof HeaderError) console.error(`    실제 헤더: ${e.header.join(' | ').slice(0, 200)}`);
        continue;
      }
      res.fillOnly = names.length > 1 && name === 'campaigns';
      const weeks = [...res.byWeek.keys()].sort();
      console.log(`✓ ${label}  →  ${src.label}   ${count.toLocaleString()}행 읽음` +
        `  ·  인정 ${res.agg.size.toLocaleString()}  ·  주차 ${weeks.length ? weeks.join(', ') : '없음'}` +
        (names.length > 1 ? `  (복합 리포트 ${names.indexOf(name) + 1}/${names.length})` : '') +
        (res.fillOnly ? '  [빈 주차만]' : '') +
        (delimiter !== ',' ? `  (구분자 ${JSON.stringify(delimiter)})` : ''));
      if (!bySource.has(name)) bySource.set(name, []);
      bySource.get(name).push(res);
    }
  } catch (e) {
    failed++;
    if (e instanceof HeaderError) {
      console.error(`✗ ${label} — ${e.message}`);
      console.error(`    실제 헤더: ${e.header.join(' | ')}`);
    } else {
      console.error(`✗ ${label} — ${e.message}`);
    }
  }
}

if (failed) process.exitCode = 1;
if (!bySource.size) { console.log('\n적재할 데이터가 없습니다.'); process.exit(process.exitCode ?? 0); }

/* 2단계: 종류별로 합쳐서 한 번에 적재 (같은 주차가 여러 파일에 나뉘어 있어도 합산된다).
   전용 리포트(덮어씀)와 복합 유래(fillOnly)는 반드시 따로 병합·적재한다 —
   섞어 합치면 같은 주차의 캠페인 총액이 전용+복합으로 이중 집계된다.
   전용을 먼저 쓰고, 복합은 그 뒤에 남은 빈 주차만 채운다. */
for (const [name, results] of bySource) {
  const src = SOURCES[name];
  const groups = [
    { label: '전용', fillOnly: false, list: results.filter(r => !r.fillOnly) },
    { label: '복합→빈 주차만', fillOnly: true, list: results.filter(r => r.fillOnly) },
  ].filter(g => g.list.length);

  for (const g of groups) {
    console.log(`\n━━ ${src.label} (${name}) ━━  파일 ${g.list.length}개${groups.length > 1 ? `  [${g.label}]` : g.fillOnly ? '  [복합→빈 주차만]' : ''}`);
    const m = merge(g.list, src);
    report(m);
    if (dry) { console.log('   --dry: DB 쓰기 생략' + (g.fillOnly ? ' (빈 주차만 채움)' : '')); continue; }
    const weeks = await writeWeeks(name, src, m,
      { market: MARKET, fillOnly: g.fillOnly, detail: `CSV 파일 ${g.list.length}개${g.fillOnly ? ' (복합→빈 주차만)' : ''}` });
    console.log(weeks.length
      ? `   ✓ ${src.table} 적재 완료 (${m.agg.size.toLocaleString()} 행, ${weeks.length} 주차)`
      : `   — ${src.table}: 새로 적재할 주차 없음 (전용 리포트 보존)`);
  }
}

if (!dry) console.log('\n검증은 `npm run verify` 로 확인하세요.');
