/* 광고 콘솔 리포트 CSV 를 Turso 에 직접 적재한다 — 구글 시트를 거치지 않는다.
   시트는 셀 1,000만 개 한도가 있어 서치텀 같은 대용량 리포트를 담을 수 없다.

   사용법:
     node scripts/load.mjs                        reports/ 폴더의 모든 CSV
     node scripts/load.mjs a.csv b.csv            파일 지정
     node scripts/load.mjs reports/2026-07        폴더 지정
     node scripts/load.mjs --weeks=2026-07-19     특정 주차만
     node scripts/load.mjs --dry                  읽고 집계만, DB 쓰기 없음

   리포트 종류(서치텀/타겟팅/캠페인/광고제품)는 헤더로 자동 판별한다.
   같은 주차를 다시 넣으면 그 주차만 지우고 다시 넣으므로 몇 번 실행해도 결과가 같다. */
import { ROOT } from '../lib/env.mjs';
import { readdir, stat } from 'node:fs/promises';
import { join, extname, basename, resolve } from 'node:path';
import { SOURCES, detectSource } from '../lib/sources.mjs';
import { readCsvAoa } from '../lib/csv.mjs';
import { aggregate, merge, writeWeeks, report, HeaderError } from '../lib/aggregate.mjs';

const args = process.argv.slice(2);
const flag = n => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const weekFilter = flag('weeks')?.split(',').map(s => s.trim()).filter(Boolean);
const dry = args.includes('--dry');
const targets = args.filter(a => !a.startsWith('--'));

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

const roots = targets.length ? targets : [join(ROOT, 'reports')];
const files = (await Promise.all(roots.map(expand))).flat();

if (!files.length) {
  console.log(`\n적재할 CSV 가 없습니다.\n`);
  console.log(`  광고 콘솔에서 리포트를 CSV 로 내려받아 아래 폴더에 넣고 다시 실행하세요:`);
  console.log(`    ${join(ROOT, 'reports')}\n`);
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
    const name = detectSource(rows[0]);
    if (!name) {
      console.error(`✗ ${label} — 리포트 종류를 알 수 없습니다`);
      console.error(`    헤더: ${rows[0].slice(0, 12).join(' | ')}${rows[0].length > 12 ? ' …' : ''}`);
      failed++; continue;
    }
    const src = SOURCES[name];
    const res = aggregate(rows, src, { weekFilter });
    const weeks = [...res.byWeek.keys()].sort();
    console.log(`✓ ${label}  →  ${src.label}   ${count.toLocaleString()}행 읽음` +
      `  ·  인정 ${res.agg.size.toLocaleString()}  ·  주차 ${weeks.length ? weeks.join(', ') : '없음'}` +
      (delimiter !== ',' ? `  (구분자 ${JSON.stringify(delimiter)})` : ''));
    if (!bySource.has(name)) bySource.set(name, []);
    bySource.get(name).push(res);
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

/* 2단계: 종류별로 합쳐서 한 번에 적재 (같은 주차가 여러 파일에 나뉘어 있어도 합산된다) */
for (const [name, results] of bySource) {
  const src = SOURCES[name];
  console.log(`\n━━ ${src.label} (${name}) ━━  파일 ${results.length}개`);
  const m = merge(results, src);
  report(m);
  if (dry) { console.log('   --dry: DB 쓰기 생략'); continue; }
  const weeks = await writeWeeks(name, src, m, { detail: `CSV 파일 ${results.length}개` });
  console.log(`   ✓ ${src.table} 적재 완료 (${m.agg.size.toLocaleString()} 행, ${weeks.length} 주차)`);
}

if (!dry) console.log('\n검증은 `npm run verify` 로 확인하세요.');
