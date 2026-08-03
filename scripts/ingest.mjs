/* 구글 시트의 아마존 광고 리포트를 읽어 SQLite/Turso 에 적재한다.

   사용법:
     node scripts/ingest.mjs                      전체 소스
     node scripts/ingest.mjs --only=search_terms  일부만
     node scripts/ingest.mjs --weeks=2026-07-19   특정 주차만
     node scripts/ingest.mjs --dry                읽고 집계만, DB 쓰기 없음

   대용량 리포트(서치텀 등)는 시트 셀 한도에 걸리므로 `npm run load` 로
   CSV 를 직접 넣는 편이 낫다. 정규화·집계 로직은 lib/aggregate.mjs 로 공유한다.

   핵심 규칙: 시트에는 같은 주의 부분 기간 조각행이 섞여 있다
   (예: 'Jun 01 - Jun 01', 'May 31 - Jun 03'). 함께 합산하면 수치가 오염되므로
   일요일 시작 + 정확히 7일인 행만 한 주차로 인정하고 나머지는 버린다. */
import '../lib/env.mjs';
import { SOURCES, SHEETS } from '../lib/sources.mjs';
import { pullTab } from '../lib/sheets.mjs';
import { aggregate, writeWeeks, report, HeaderError } from '../lib/aggregate.mjs';

const args = process.argv.slice(2);
const flag = n => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

const only = flag('only')?.split(',').map(s => s.trim()).filter(Boolean);
const weekFilter = flag('weeks')?.split(',').map(s => s.trim()).filter(Boolean);
const dry = args.includes('--dry');

let wrote = false;

for (const [name, src] of Object.entries(SOURCES)) {
  if (only && !only.includes(name)) continue;

  console.log(`\n━━ ${src.label} (${name}) ━━`);
  if (!src.gid) {
    console.log(`   건너뜀 — 시트에 탭이 없습니다. lib/sources.mjs 의 ${name}.gid 를 채우면 적재됩니다.`);
    console.log(`   또는 CSV 를 reports/ 에 넣고 \`npm run load\` 로 직접 적재할 수 있습니다.`);
    continue;
  }

  const { title, rows } = await pullTab(SHEETS[src.sheet], src.gid);
  console.log(`   시트 "${title}"  ${rows.length} 행 읽음`);
  if (rows.length < 2) { console.log('   데이터 없음'); continue; }

  let result;
  try {
    result = aggregate(rows, src, { weekFilter });
  } catch (e) {
    if (!(e instanceof HeaderError)) throw e;
    console.error(`   ✗ ${e.message}`);
    console.error(`     실제 헤더: ${e.header.join(' | ')}`);
    process.exitCode = 1;
    continue;
  }

  report(result);

  if (dry) { console.log('   --dry: DB 쓰기 생략'); continue; }
  if (!result.agg.size) continue;

  const weeks = await writeWeeks(name, src, result, { detail: `시트 "${title}" gid ${src.gid}` });
  console.log(`   ✓ ${src.table} 적재 완료 (${result.agg.size} 행, ${weeks.length} 주차)`);
  wrote = true;
}

if (wrote) console.log('\n검증은 `npm run verify` 로 확인하세요.');
