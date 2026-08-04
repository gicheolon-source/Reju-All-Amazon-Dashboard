/* NOTES(주간 코멘트) 시트 점검 — 사용법: node _notes.mjs <SHEET_ID> [GID]
   접근 권한 · 탭 목록 · 헤더 매칭(api/data.js 의 parseNotes 와 동일 로직) · 작성된 주차 */
import fs from 'fs';
import { JWT } from 'google-auth-library';

const SHEET = process.argv[2];
const GID = process.argv[3] !== undefined ? parseInt(process.argv[3], 10) : 119883587;
if (!SHEET) { console.error('사용법: node _notes.mjs <SHEET_ID> [GID]'); process.exit(1); }

const key = JSON.parse(fs.readFileSync(
  process.env.REJUALL_SA_KEY || 'C:/Users/USER/Downloads/impactful-name-495400-k2-3baa40b785b7.json', 'utf-8'));
const jwt = new JWT({ email: key.client_email, key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const H = await jwt.getRequestHeaders();

const mr = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}?fields=properties.title,sheets.properties(sheetId,title,gridProperties)`,
  { headers: H });
if (!mr.ok) {
  const t = await mr.text();
  console.log(`✗ 접근 불가 HTTP ${mr.status}`);
  console.log(t.includes('PERMISSION_DENIED')
    ? `→ ${key.client_email} 에 뷰어 공유가 필요합니다.` : t.slice(0, 300));
  process.exit(0);
}
const meta = await mr.json();
console.log(`문서: "${meta.properties.title}"  (탭 ${meta.sheets.length}개)`);
for (const s of meta.sheets) {
  const p = s.properties, g = p.gridProperties || {};
  console.log(`  gid=${String(p.sheetId).padEnd(11)} "${p.title}"  (${g.rowCount}×${g.columnCount})` +
    (p.sheetId === GID ? '  ← 대상' : ''));
}

const target = meta.sheets.find(s => s.properties.sheetId === GID);
if (!target) {
  console.log(`\n✗ gid ${GID} 가 없습니다. 위 목록에서 맞는 gid 를 두 번째 인자로 주세요.`);
  process.exit(0);
}
const title = target.properties.title;
const rows = ((await (await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/` +
  encodeURIComponent(`'${title.replace(/'/g, "''")}'!A1:Z2000`) +
  `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, { headers: H })).json()).values) || [];
console.log(`\n── "${title}" (gid=${GID}) · ${rows.length}행 ──`);
if (!rows.length) { console.log('탭이 비어 있습니다 → 코멘트는 빈 상태가 됩니다.'); process.exit(0); }
console.log(`1행: ${(rows[0] || []).map(c => JSON.stringify(String(c ?? ''))).join(' | ')}`);

/* parseNotes 와 동일한 헤더 매칭 */
const h = (rows[0] || []).map(x => String(x ?? '').trim().toLowerCase());
const find = (...alts) => h.findIndex(x => alts.some(a => x.includes(a)));
const ci = { wk: find('week','주차','주'), ov: find('overview','경영','요약','오버뷰'),
             sl: find('sales','매출','세일'), ad: find('advertis','광고','애드') };
console.log('\n헤더 매칭:');
for (const [k, label] of [['wk','Week'],['ov','Overview'],['sl','Sales'],['ad','Advertising']])
  console.log(`  ${ci[k] >= 0 ? 'O' : '✗'} ${label.padEnd(12)} ${ci[k] >= 0 ? `열 ${ci[k]} ("${rows[0][ci[k]]}")` : '못 찾음'}`);
if (ci.wk < 0) { console.log('\n✗ Week 열이 없으면 코멘트 전체가 무시됩니다.'); process.exit(0); }

const normKey = s => String(s ?? '').toUpperCase().replace(/\s+/g, '');
const OK = /^(W\d{1,2}|\d{4}-\d{1,2}-\d{1,2})$/i;
console.log('\n── 내용이 있는 주차 ──');
let n = 0, bad = 0;
for (const x of rows.slice(1)) {
  if (!x || !x.length) continue;
  const k = String(x[ci.wk] ?? '').trim(); if (!k) continue;
  const parts = ['ov','sl','ad'].map(t => ci[t] >= 0 ? String(x[ci[t]] ?? '').trim() : '');
  if (!parts.some(Boolean)) continue;
  n++;
  const keyOk = OK.test(normKey(k));
  if (!keyOk) bad++;
  console.log(`  ${keyOk ? 'O' : '✗'} "${k}" → "${normKey(k)}"  Overview ${parts[0].length}자 · Sales ${parts[1].length}자 · Advertising ${parts[2].length}자`);
  if (parts[0]) console.log(`      ${parts[0].replace(/\n/g, ' ⏎ ').slice(0, 80)}`);
}
console.log(`\n내용 있는 주차 ${n}개` + (bad ? ` · 주차 키 형식 오류 ${bad}개` : ''));
console.log('※ Week 값은 "W29" 또는 일요일 날짜("2026-07-19")여야 매칭됩니다.');
