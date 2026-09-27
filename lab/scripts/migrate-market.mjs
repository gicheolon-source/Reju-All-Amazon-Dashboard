/* 단일 마켓(US) 스키마 → market 열 포함 스키마로 이행한다.
   기존 행은 전부 market='US' 가 된다.

   PK 에 market 이 들어가야 해서 ALTER 로는 안 되고 테이블을 다시 만든다.
   순서: _new 생성 → 복사 → 행수·합계 검증 → 통과 시에만 기존 DROP + RENAME.
   복사는 INSERT INTO … SELECT 라 서버 안에서 돌고, 실패해도 원본은 남는다.
   이미 이행된 DB 에서 다시 실행하면 아무것도 하지 않는다. */
import '../lib/env.mjs';
import { db } from '../lib/db.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const c = db();

async function hasMarket(table) {
  const r = await c.execute(`SELECT COUNT(*) n FROM pragma_table_info('${table}') WHERE name='market'`);
  return Number(r.rows[0].n) > 0;
}
const exists = async t =>
  Number((await c.execute({ sql: `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name=?`, args: [t] })).rows[0].n) > 0;

/* 새 테이블 DDL 은 schema.sql 에서 그대로 떼어 쓴다 — 정의가 두 곳에 있으면 어긋난다 */
const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../db/schema.sql'), 'utf8');
function ddlOf(table) {
  const m = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\);`));
  if (!m) throw new Error(`schema.sql 에서 ${table} 정의를 못 찾음`);
  return m[1];
}

const TABLES = [
  { t: 'weeks',        sum: null },
  { t: 'campaigns',    sum: 'cost' },
  { t: 'search_terms', sum: 'cost' },
  { t: 'targets',      sum: 'cost' },
  { t: 'products',     sum: 'cost' },
];

for (const { t, sum } of TABLES) {
  if (!(await exists(t))) { console.log(`${t}: 없음 — 건너뜀`); continue; }
  if (await hasMarket(t)) { console.log(`${t}: 이미 market 있음 — 건너뜀`); continue; }

  const cols = (await c.execute(`SELECT name FROM pragma_table_info('${t}') ORDER BY cid`)).rows.map(r => r.name);
  const before = (await c.execute(
    `SELECT COUNT(*) n${sum ? `, COALESCE(SUM(${sum}),0) s` : ''} FROM ${t}`)).rows[0];

  await c.execute(`DROP TABLE IF EXISTS ${t}_new`);
  await c.execute(`CREATE TABLE ${t}_new (${ddlOf(t)})`);
  await c.execute(
    `INSERT INTO ${t}_new (market, ${cols.join(', ')}) SELECT 'US', ${cols.join(', ')} FROM ${t}`);

  const after = (await c.execute(
    `SELECT COUNT(*) n${sum ? `, COALESCE(SUM(${sum}),0) s` : ''} FROM ${t}_new`)).rows[0];

  const ok = Number(before.n) === Number(after.n) &&
    (!sum || Math.abs(Number(before.s) - Number(after.s)) < 0.01);
  if (!ok) {
    console.error(`✗ ${t}: 검증 실패 (행 ${before.n}→${after.n}${sum ? `, 합계 ${before.s}→${after.s}` : ''}) — 원본 유지, ${t}_new 만 삭제`);
    await c.execute(`DROP TABLE ${t}_new`);
    process.exit(1);
  }
  await c.execute(`DROP TABLE ${t}`);
  await c.execute(`ALTER TABLE ${t}_new RENAME TO ${t}`);
  console.log(`✓ ${t}: ${Number(before.n).toLocaleString()} 행 → market='US'` +
    (sum ? `  (합계 ${Number(after.s).toFixed(2)} 일치)` : ''));
}

/* ingest_log 는 PK 가 id 라 열만 추가하면 된다 */
if (await exists('ingest_log') && !(await hasMarket('ingest_log'))) {
  await c.execute(`ALTER TABLE ingest_log ADD COLUMN market TEXT NOT NULL DEFAULT 'US'`);
  console.log('✓ ingest_log: market 열 추가');
}

/* 인덱스는 테이블과 함께 사라졌으니 schema.sql 로 재생성 (IF NOT EXISTS) */
await c.executeMultiple(schema);
console.log('✓ 인덱스 재생성 완료');

const w = await c.execute(`SELECT market, COUNT(*) n FROM weeks GROUP BY market`);
console.log('\nweeks:', w.rows.map(r => `${r.market}=${r.n}`).join(', '));
