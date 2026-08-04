/* Campaign 리포트 탭 점검 — 사용법: node _camp.mjs <SHEET_ID> <GID>
   필수 컬럼 · Date range 패턴(주간/월간 라우팅) · 집계 결과까지 확인 */
import fs from 'fs';
import { JWT } from 'google-auth-library';
import { buildDashboard } from './api/data.js';

const [SHEET, GIDS] = process.argv.slice(2);
const GID = parseInt(GIDS, 10);
if (!SHEET || !Number.isFinite(GID)) { console.error('사용법: node _camp.mjs <SHEET_ID> <GID>'); process.exit(1); }

const key = JSON.parse(fs.readFileSync(
  process.env.REJUALL_SA_KEY || 'C:/Users/USER/Downloads/impactful-name-495400-k2-3baa40b785b7.json', 'utf-8'));
const jwt = new JWT({ email: key.client_email, key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const H = await jwt.getRequestHeaders();

const meta = await (await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}?fields=sheets.properties(sheetId,title)`,
  { headers: H })).json();
const t = meta.sheets.find(s => s.properties.sheetId === GID);
if (!t) { console.log(`gid ${GID} 없음`); process.exit(0); }
const title = t.properties.title;

async function get(tabTitle, range) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/` +
    encodeURIComponent(`'${tabTitle.replace(/'/g, "''")}'!${range}`) +
    `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, { headers: H });
  return r.ok ? ((await r.json()).values || []) : [];
}
const rows = await get(title, 'A1:BZ100000');
console.log(`"${title}" (gid=${GID}) — 값 있는 행 ${rows.length}\n`);
if (!rows.length) { console.log('비어 있습니다.'); process.exit(0); }

const norm = s => String(s ?? '').trim().toLowerCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ');
const NEED = ['Date range','Campaign name','Ad product','Total cost','Sales','Impressions','Clicks','Purchases','Portfolio name'];
const h = rows[0];
console.log(`1행 (${h.length}칸): ${h.map(x => String(x ?? '')).filter(Boolean).join(' | ')}\n`);
console.log('필수 컬럼:');
for (const n of NEED) {
  const i = h.findIndex(x => norm(x) === norm(n));
  const opt = n === 'Portfolio name' ? ' (선택)' : '';
  console.log(`  ${i >= 0 ? 'O' : '✗'} ${n.padEnd(15)} ${i >= 0 ? `열 ${i}` : '없음'}${opt}`);
}

/* Date range 패턴 → 주간/월간 라우팅 판정 */
const dr = h.findIndex(x => norm(x) === 'date range');
if (dr >= 0) {
  const MON = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const parse = s => {
    const m = [...String(s ?? '').matchAll(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/g)];
    if (m.length < 2) return null;
    const mk = g => new Date(Date.UTC(+g[3], MON[g[1].toLowerCase()], +g[2]));
    return [mk(m[0]), mk(m[1])];
  };
  const buckets = { 주간: [], 월간: [], 무시: [], 파싱실패: [] };
  const seen = new Set();
  for (const x of rows.slice(1)) {
    const v = String(x[dr] ?? '').trim(); if (!v) continue;
    if (seen.has(v)) continue; seen.add(v);
    const p = parse(v);
    if (!p) { buckets.파싱실패.push(v); continue; }
    const span = Math.round((p[1] - p[0]) / 86400000);
    if (span === 6 && p[0].getUTCDay() === 0) buckets.주간.push(`${v} (일요일 시작)`);
    else if (span >= 20) buckets.월간.push(`${v} (${span + 1}일)`);
    else buckets.무시.push(`${v} (span ${span}, ${['일','월','화','수','목','금','토'][p[0].getUTCDay()]}요일 시작)`);
  }
  console.log('\nDate range 값 → 라우팅 판정:');
  for (const [k, arr] of Object.entries(buckets)) {
    if (!arr.length) continue;
    console.log(`  ${k} ${arr.length}종:`);
    arr.slice(0, 8).forEach(v => console.log(`      ${v}`));
    if (arr.length > 8) console.log(`      … 외 ${arr.length - 8}종`);
  }
}

/* 실제 집계 */
const asin = await get('Child sales_RAW_CA', 'A1:BZ100000');
const out = buildDashboard({ asin, camp: rows, notes: [] });
console.log('\n집계 결과 (최근 8주):');
console.log('주차   기간          광고비 광고매출  ACOS   impr        clicks  캠페인');
for (const w of out.weeks.slice(-8)) {
  const a = w.ads || {};
  const acos = w.sales ? (w.spend / w.sales * 100).toFixed(1) + '%' : '—';
  console.log(`${w.label.padEnd(6)} ${String(w.range).padEnd(13)} ${String(Math.round(w.spend).toLocaleString()).padStart(6)} ${String(Math.round(w.sales).toLocaleString()).padStart(8)} ${acos.padStart(6)}` +
    `  ${String((a.impr||0).toLocaleString()).padStart(11)} ${String((a.clicks||0).toLocaleString()).padStart(7)}  ${String((a.campaigns||[]).length).padStart(4)}`);
}
console.log(`\nhasAds=true 주차: ${out.weeks.filter(w => w.ads.hasAds).length}/${out.weeks.length}`);
console.log(`월간 스냅샷(adPeriods): ${(out.adPeriods || []).map(p => p.label).join(', ') || '없음'}`);
