/* weekly-lite RAW 수집 — 시트 3개 탭을 받아 _raw_arrays.json 생성
   (로컬 미리보기/오프라인 빌드 전용. 배포판은 api/data.js 가 같은 방식으로 읽는다)

   시트가 "링크 있는 누구나"에서 "제한됨"으로 잠긴 뒤로는 무인증 CSV export 가
   401 이 나므로, 배포판과 동일하게 서비스 계정 토큰으로 Sheets API v4 를 쓴다.
   덤으로 프로덕션과 완전히 같은 값(UNFORMATTED_VALUE)을 보게 되어
   "로컬은 되는데 배포는 안 되는" 차이가 사라진다.

   키 파일 경로 지정 (우선순위):
     1) 환경변수  REJUALL_SA_KEY=C:\path\to\key.json
     2) 아래 DEFAULT_KEY
   ※ 키 파일은 절대 커밋하지 않는다 (.gitignore: service-account*.json) */
import fs from 'fs';
import { JWT } from 'google-auth-library';

const DEFAULT_KEY = 'C:/Users/USER/Downloads/impactful-name-495400-k2-3baa40b785b7.json';
const KEY_PATH = process.env.REJUALL_SA_KEY || DEFAULT_KEY;

const MAIN_ID  = '1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao';
const NOTES_ID = '1GOClg8wNjUOJAQzcu2dGbENoMWrMCMd4vzx-LLqkFqA';
const TABS = {
  asin:  { id: MAIN_ID,  gid: 952475532  },   // ASIN 일별 통합
  camp:  { id: MAIN_ID,  gid: 1710166971 },   // Campaign 리포트
  notes: { id: NOTES_ID, gid: 119883587  },   // 주간 코멘트
};

if (!fs.existsSync(KEY_PATH)) {
  console.error(`\n서비스 계정 키를 찾을 수 없습니다:\n  ${KEY_PATH}\n\n` +
    `해결: REJUALL_SA_KEY 환경변수로 경로를 지정하세요.\n` +
    `  PowerShell:  $env:REJUALL_SA_KEY="C:\\path\\to\\key.json"; node _pull.mjs\n`);
  process.exit(1);
}
const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf-8'));
console.log('계정:', key.client_email);

const jwt = new JWT({ email: key.client_email, key: key.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const H = await jwt.getRequestHeaders();

/* 탭 이름은 A1 표기법에서 작은따옴표로 감싼다 (내부 ' 는 '' 로 이스케이프) */
const qTitle = t => `'${String(t).replace(/'/g, "''")}'`;

const metaCache = {};
async function titleOf(id, gid) {
  if (!metaCache[id]) metaCache[id] = (async () => {
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`,
      { headers: H });
    if (!r.ok) throw new Error(`meta ${id} ${r.status} ${await r.text()}`);
    const j = await r.json();
    return Object.fromEntries((j.sheets || []).map(s => [s.properties.sheetId, s.properties.title]));
  })();
  const map = await metaCache[id];
  const t = map[gid];
  if (!t) throw new Error(`gid ${gid} 없음 — 있는 탭: ${Object.entries(map).map(([g, n]) => `${n}(${g})`).join(', ')}`);
  return t;
}

async function pull(name, { id, gid }) {
  const title = await titleOf(id, gid);
  const range = encodeURIComponent(`${qTitle(title)}!A1:BZ100000`);
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}` +
    `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: H });
  if (!r.ok) throw new Error(`${name} values ${r.status} ${await r.text()}`);
  const rows = (await r.json()).values || [];
  console.log(`${name.padEnd(6)} ${String(rows.length).padStart(6)} rows   ← "${title}"`);
  return rows;
}

const out = {};
for (const [name, cfg] of Object.entries(TABS)) out[name] = await pull(name, cfg);

fs.writeFileSync('_raw_arrays.json', JSON.stringify(out));
console.log('→ _raw_arrays.json', fs.statSync('_raw_arrays.json').size, 'bytes');
