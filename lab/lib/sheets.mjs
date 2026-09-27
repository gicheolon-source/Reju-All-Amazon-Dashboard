import fs from 'fs';
import { JWT } from 'google-auth-library';

let headersPromise;

/* 인증: 로컬은 키 파일(REJUALL_SA_KEY), Vercel 은 환경변수 2개. */
function authHeaders() {
  if (headersPromise) return headersPromise;
  headersPromise = (async () => {
    let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let pkey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!email || !pkey) {
      const path = process.env.REJUALL_SA_KEY;
      if (!path || !fs.existsSync(path)) throw new Error(
        '서비스 계정 자격증명이 없습니다. 로컬은 REJUALL_SA_KEY 에 키 파일 경로를, ' +
        'Vercel 은 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 를 설정하세요.');
      const k = JSON.parse(fs.readFileSync(path, 'utf-8'));
      email = k.client_email; pkey = k.private_key;
    }
    const jwt = new JWT({ email, key: pkey, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    return jwt.getRequestHeaders();
  })();
  return headersPromise;
}

const metaCache = {};

async function titles(id) {
  if (!metaCache[id]) metaCache[id] = (async () => {
    const H = await authHeaders();
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title,gridProperties)`,
      { headers: H });
    if (!r.ok) throw new Error(`시트 메타 조회 실패 ${id} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return Object.fromEntries((j.sheets || []).map(s =>
      [s.properties.sheetId, { title: s.properties.title, rows: s.properties.gridProperties?.rowCount ?? 0 }]));
  })();
  return metaCache[id];
}

const quote = t => `'${String(t).replace(/'/g, "''")}'`;

/* gid 로 탭 하나를 전부 읽는다. 행이 많으면 나눠 받는다. */
export async function pullTab(id, gid, { chunk = 20000, lastCol = 'BZ' } = {}) {
  const H = await authHeaders();
  const map = await titles(id);
  const meta = map[gid];
  if (!meta) throw new Error(
    `gid ${gid} 를 찾을 수 없습니다. 이 시트의 탭: ` +
    Object.entries(map).map(([g, m]) => `${m.title}(${g})`).join(', '));

  const total = Math.max(meta.rows, 1);
  const out = [];
  for (let from = 1; from <= total; from += chunk) {
    const to = Math.min(from + chunk - 1, total);
    const range = encodeURIComponent(`${quote(meta.title)}!A${from}:${lastCol}${to}`);
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}` +
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      { headers: H });
    if (!r.ok) throw new Error(`값 조회 실패 "${meta.title}" ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const vals = (await r.json()).values || [];
    out.push(...vals);
    if (vals.length < to - from + 1) break;
  }
  return { title: meta.title, rows: out };
}

/* gid 가 바뀌었을 때 원인을 바로 알 수 있게 탭 목록을 노출한다. */
export async function listTabs(id) {
  const map = await titles(id);
  return Object.entries(map).map(([gid, m]) => ({ gid: Number(gid), title: m.title, rows: m.rows }));
}
