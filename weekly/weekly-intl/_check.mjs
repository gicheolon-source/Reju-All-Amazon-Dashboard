/* 국가 시트 점검 — 사용법: node _check.mjs <SHEET_ID>
   탭 목록 · ASIN 탭 자동 탐색 · 헤더 검사 · 데이터 범위 · 광고열 채움 · 집계 결과 */
import fs from 'fs';
import { JWT } from 'google-auth-library';
import { buildDashboard } from './api/data.js';

const SHEET = process.argv[2];
if (!SHEET) { console.error('사용법: node _check.mjs <SHEET_ID>'); process.exit(1); }

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
console.log(`문서: "${meta.properties.title}"  (탭 ${meta.sheets.length}개)\n`);
for (const s of meta.sheets) {
  const p = s.properties, g = p.gridProperties || {};
  console.log(`  gid=${String(p.sheetId).padEnd(11)} "${p.title}"  (${g.rowCount}×${g.columnCount})`);
}

const q = t => `'${t.replace(/'/g, "''")}'`;
async function vals(title, range) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(q(title) + '!' + range)}` +
    `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, { headers: H });
  return r.ok ? ((await r.json()).values || []) : null;
}
const norm = s => String(s ?? '').trim().toLowerCase()
  .replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ');
const NEED = ['Date', '(Child) ASIN', 'Product Name', 'Units Ordered',
              'Ordered Product Sales', 'Spend', 'Ad Sales', 'Sessions - Total'];

/* 모든 탭에서 ASIN 리포트 형태를 찾는다 (제목에 의존하지 않음) */
console.log('\n── ASIN 탭 탐색 (전 탭 헤더 검사) ──');
let win = null;
for (const s of meta.sheets) {
  const t = s.properties.title, gid = s.properties.sheetId;
  const rows = await vals(t, 'A1:BZ3');
  if (!rows || !rows.length) continue;
  let best = { row: -1, hit: 0 };
  rows.forEach((r, i) => {
    const hit = NEED.filter(n => r.findIndex(h => norm(h) === norm(n)) >= 0).length;
    if (hit > best.hit) best = { row: i, hit };
  });
  if (best.hit >= 4) console.log(`  "${t}" (gid=${gid}) → 헤더 ${best.row + 1}행, ${best.hit}/${NEED.length}`);
  if (best.hit >= 6 && (!win || best.hit > win.hit)) win = { title: t, gid, ...best };
}
if (!win) { console.log('  ✗ ASIN 리포트 형태의 탭 없음'); process.exit(0); }
console.log(`\n★ 선택: "${win.title}"  gid=${win.gid}  헤더 ${win.row + 1}행`);

const all = await vals(win.title, 'A1:BZ100000');
const h = all[win.row];
console.log('\n── 필수 컬럼 ──');
for (const n of NEED) {
  const ex = h.indexOf(n), ni = h.findIndex(x => norm(x) === norm(n));
  console.log(`  ${ni >= 0 ? 'O' : '✗'} ${n.padEnd(23)} ${ni >= 0 ? `열 ${String(ni).padEnd(3)}` : '      '} ` +
    (ex >= 0 ? '정확' : ni >= 0 ? `정규화 → ${JSON.stringify(h[ni])}` : '없음'));
}

const di = h.findIndex(x => norm(x) === 'date');
const body = all.slice(win.row + 1).filter(r => r && String(r[di] ?? '').trim());
const fmtd = s => { const p = String(s).replace(/\s+/g, '').split(/[-/]/);
  return p.length === 3 ? `${p[0]}-${String(p[1]).padStart(2,'0')}-${String(p[2]).padStart(2,'0')}` : String(s); };
const ds = [...new Set(body.map(r => fmtd(r[di])))].sort();
console.log(`\n── 데이터 ── 전체 ${all.length}행 · 데이터 ${body.length}행`);
console.log(`  날짜 범위: ${ds[0]} ~ ${ds[ds.length - 1]} (${ds.length}일)`);

console.log('\n── 광고 열 채움 ──');
for (const n of ['Spend', 'Ad Sales', 'Impressions', 'Clicks']) {
  const i = h.findIndex(x => norm(x) === norm(n));
  if (i < 0) { console.log(`  ${n.padEnd(12)} 컬럼 없음`); continue; }
  const nz = body.filter(r => typeof r[i] === 'number' && r[i] !== 0);
  const dd = nz.map(r => fmtd(r[di])).sort();
  console.log(`  ${n.padEnd(12)} 0아닌값 ${String(nz.length).padStart(5)}개` +
    (dd.length ? `  ${dd[0]} ~ ${dd[dd.length - 1]}` : '  (없음)'));
}

const out = buildDashboard({ asin: all, camp: [], notes: [] });
console.log(`\n── 집계 ${out.weeks.length}주 (Campaign 탭 없이) ──`);
console.log('주차   기간          매출     유닛  세션    광고비 광고매출  ACOS');
for (const w of out.weeks) {
  const acos = w.sales ? (w.spend / w.sales * 100).toFixed(1) + '%' : '—';
  console.log(`${w.label.padEnd(6)} ${String(w.range).padEnd(13)} ${String(Math.round(w.totalSales).toLocaleString()).padStart(8)} ${String(w.units).padStart(5)} ${String((w.sessions||0).toLocaleString()).padStart(7)} ${String(Math.round(w.spend).toLocaleString()).padStart(6)} ${String(Math.round(w.sales).toLocaleString()).padStart(8)} ${acos.padStart(7)}`);
}
console.log(`\n유닛/세션 0 인 주차: ${out.weeks.filter(w => !w.units || !w.sessions).length}/${out.weeks.length}`);

console.log('\n── Campaign 리포트 후보 ──');
const CN = ['Date range','Campaign name','Ad product','Total cost','Sales','Impressions','Clicks','Purchases'];
let found = false;
for (const s of meta.sheets) {
  const r = await vals(s.properties.title, 'A1:BZ1');
  const hh = (r && r[0]) || [];
  if (!hh.length) continue;
  const miss = CN.filter(n => hh.findIndex(x => norm(x) === norm(n)) < 0);
  if (miss.length <= 2) { console.log(`  ★ "${s.properties.title}" (gid=${s.properties.sheetId}) 누락 ${miss.length ? miss.join(', ') : '없음'}`); found = true; }
}
if (!found) console.log('  없음 — 노출·클릭·CTR·캠페인 표는 빈 상태가 됩니다');

console.log('\n── NOTES 탭 후보 ──');
const nf = meta.sheets.filter(s => /note|코멘트|comment/i.test(s.properties.title));
console.log(nf.length ? nf.map(s => `  "${s.properties.title}" gid=${s.properties.sheetId}`).join('\n') : '  없음');
