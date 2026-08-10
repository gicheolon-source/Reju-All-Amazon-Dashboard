const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const DAY_MS = 86400000;

/* 아마존 CSV 의 ="..." 래핑과 공백 제거 */
export function txt(v) {
  let s = String(v ?? '').trim();
  if (s.startsWith('="') && s.endsWith('"')) s = s.slice(2, -1);
  return s.trim();
}

/* 통화 표기를 벗긴 숫자. 빈 값/파싱 실패는 0.
   '$1,234.56' · 'CAD 3.20' · 'C$3.20' · '£12' · 'AED 99.50' · 'د.إ 99.50' 모두 온다.
   비숫자 문자를 지우는 방식은 'د.إ' 처럼 기호에 점이 든 통화에서 깨지므로
   (점이 숫자에 섞여 '.99.50' 이 된다) 숫자 토큰을 추출하는 방식을 쓴다. */
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const m = txt(v).match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0].replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

export function int(v) { return Math.round(num(v)); }

/* 'May 31, 2026 - Jun 06, 2026' → { start:'2026-05-31', end:'2026-06-06' } */
export function parseRange(v) {
  const s = txt(v);
  const parts = s.split(/\s+-\s+/);
  if (parts.length !== 2) return null;
  const a = parseDate(parts[0]), b = parseDate(parts[1]);
  return a && b ? { start: a, end: b } : null;
}

/* 'Jun 06, 2026' → '2026-06-06' */
export function parseDate(v) {
  const m = txt(v).match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

const utc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/* 일요일 시작 + 정확히 7일(일~토) 인 기간만 한 '주차'로 인정한다.
   시트에는 같은 주의 부분 기간 조각행이 다수 섞여 있어, 함께 합산하면 수치가 오염된다. */
export function fullWeek(range) {
  if (!range) return null;
  const a = utc(range.start), b = utc(range.end);
  if (new Date(a).getUTCDay() !== 0) return null;
  if (b - a !== 6 * DAY_MS) return null;
  return range.start;
}

export function weekEnd(weekStart) {
  return new Date(utc(weekStart) + 6 * DAY_MS).toISOString().slice(0, 10);
}

const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* 대시보드가 쓰는 라벨 형식: 'Jun 14 – Jun 20, 2026' */
export function weekLabel(weekStart) {
  const a = new Date(utc(weekStart)), b = new Date(utc(weekStart) + 6 * DAY_MS);
  const f = d => `${MON_ABBR[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${f(a)} – ${f(b)}, ${b.getUTCFullYear()}`;
}

/* 헤더명 → 열 인덱스. 아마존 리포트는 'ROAS' 같은 이름이 중복되고
   promoted/halo 파생 컬럼이 뒤에 붙으므로 '첫 번째 정확 일치'가 기본 컬럼이다. */
export function colMap(header, spec) {
  const norm = header.map(h => txt(h));
  const out = {};
  const missing = [];
  for (const [key, def] of Object.entries(spec)) {
    const names = Array.isArray(def) ? def : [def];
    let idx = -1;
    for (const n of names) { idx = norm.indexOf(n); if (idx >= 0) break; }
    if (idx < 0) { missing.push(`${key}(${names.join('|')})`); continue; }
    out[key] = idx;
  }
  return { idx: out, missing };
}

export const ASIN_RE = /^B0[A-Z0-9]{8}$/i;

export function asinOf(s) {
  const v = txt(s);
  const m = v.match(/asin\s*=\s*"?([A-Za-z0-9]{10})"?/i);
  if (m) return m[1].toUpperCase();
  return ASIN_RE.test(v) ? v.toUpperCase() : null;
}
