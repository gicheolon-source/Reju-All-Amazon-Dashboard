/**
 * 글로벌 대시보드(/global) — 채널·국가별 매출 시트 프록시 (서비스 계정)
 *
 * 시트를 비공개로 둔 채 서버에서만 읽는다. 7개 시트(아마존 5개국 + 틱톡샵 2개국)를
 * 한 번에 읽어 JSON 으로 돌려주고, 파싱(헤더 탐지·컬럼 매핑)은 /global/index.html 이 한다.
 *
 *   GET /api/global/sheets
 *
 * 필요한 환경변수 (Vercel — weekly/inventory 와 공용):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   이 주소로 아래 시트 전부를 '뷰어' 공유할 것
 *   GOOGLE_PRIVATE_KEY             서비스 계정 비공개 키 (\n 이스케이프 허용)
 *
 * 소스 시트는 gid(탭 ID)로 지정되어 있어, 탭 이름이 바뀌어도 계속 동작한다.
 * (Sheets API values 엔드포인트는 탭 '이름'만 받으므로 메타데이터로 gid→이름을 푼다)
 *
 * 의존성 없음 — api/inventory/sheet.mjs 와 같은 node:crypto JWT 패턴.
 */
import { createSign } from 'node:crypto';

const SOURCES = [
  { ch: '아마존', co: '미국',      id: '1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao', gid: 1609839593 },
  { ch: '아마존', co: '캐나다',    id: '1_IYvl05yI8YmHFYkMeicHPwBHIwGWUZgXLfrZ4txRio', gid: 1026315804 },
  { ch: '아마존', co: '영국',      id: '1dESw-mxQKkkN-NzvPd9eg4M3YkKPAjFZmP_PyddqgX8', gid: 1026315804 },
  { ch: '아마존', co: '호주',      id: '11rXNp-JU1WnqkxAcEsX9SO0JOpaNAbrU2zvgxGh0ZgQ', gid: 1026315804 },
  { ch: '아마존', co: '중동(UAE)', id: '1JGDCm4bmW5NsJffgwJD_uW2ZbkiCwbzzwWDOFMXyYos', gid: 1026315804 },
  { ch: '틱톡샵', co: '미국',      id: '1TCF9cQpSSlyKru0vaQzUZmAOXciwO8O_Zkr9fi8NfcI', gid: 1243654523 },
  // TODO: 틱톡샵 영국 — 올바른 시트 URL 확정되면 교체 (현재 US 와 동일 URL 로 전달받아 보류)
  { ch: '틱톡샵', co: '영국',      id: '11hAym_BnzWSQxkQFOi4xKuLARyN35Fp9ixu1JbvaQtg', gid: 1243654523 },
];

const b64url = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cachedToken = null;

async function getToken(){
  const now = Math.floor(Date.now() / 1000);
  if(cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if(!email || !key) throw new Error('missing_service_account_env');

  const header = b64url(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const claim  = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(key))}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if(!r.ok) throw new Error(`token_failed_${r.status}`);

  const j = await r.json();
  cachedToken = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cachedToken.token;
}

// 같은 스프레드시트를 여러 소스가 쓸 수 있으므로 메타데이터는 요청 내에서 캐시
async function tabTitle(token, id, gid, metaCache){
  if(!metaCache[id]){
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`,
      { headers: { Authorization: `Bearer ${token}` } });
    if(!r.ok){
      const err = new Error(`meta_${r.status}`);
      err.status = r.status;
      throw err;
    }
    metaCache[id] = (await r.json()).sheets.map(s => s.properties);
  }
  const hit = metaCache[id].find(p => p.sheetId === gid);
  if(!hit) throw new Error(`gid_${gid}_not_found`);
  return hit.title;
}

export default async function handler(req, res){
  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
  try{
    const token = await getToken();
    const metaCache = {};

    const sources = await Promise.all(SOURCES.map(async s => {
      try{
        const title = await tabTitle(token, s.id, s.gid, metaCache);
        const r = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${s.id}/values/`
          + `${encodeURIComponent(title)}`
          + `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
          { headers: { Authorization: `Bearer ${token}` } });
        if(!r.ok){
          const err = new Error(`values_${r.status}`);
          err.status = r.status;
          throw err;
        }
        return { ch: s.ch, co: s.co, ok: true, title, rows: (await r.json()).values || [] };
      }catch(e){
        return {
          ch: s.ch, co: s.co, ok: false,
          error: String(e.message || e),
          hint: e.status === 403
            ? `시트를 ${saEmail} 에 뷰어로 공유했는지 확인`
            : e.status === 404 ? '스프레드시트 ID 확인' : undefined,
        };
      }
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, saEmail, fetchedAt: new Date().toISOString(), sources });
  }catch(e){
    return res.status(500).json({ ok: false, saEmail, error: String(e && e.message || e) });
  }
}
