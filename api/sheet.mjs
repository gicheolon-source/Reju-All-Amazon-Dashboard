/**
 * 구글 시트 → CSV 프록시 (서비스 계정)
 *
 * 시트를 비공개로 둔 채 서버에서만 읽는다. 응답은 CSV 텍스트라
 * index.html 의 parseCSV/sheetLoad 는 손댈 필요가 없다.
 *
 *   GET /api/sheet?country=US&tab=targets
 *   GET /api/sheet?country=US&tab=data
 *
 * 필요한 환경변수 (Vercel):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   서비스 계정 이메일 — 이 주소로 시트를 '뷰어' 공유할 것
 *   GOOGLE_PRIVATE_KEY             서비스 계정 비공개 키 (\n 이스케이프된 형태 허용)
 *   SHEET_ID_US / SHEET_ID_JP      스프레드시트 ID (URL 의 /d/ 와 /edit 사이)
 *   SHEET_TAB_TARGETS/_DATA        (선택) 탭 이름이 기본값과 다를 때만
 *
 * 의존성 없음 — JWT 를 node:crypto 로 직접 서명하므로 package.json 이 필요 없고
 * 빌드 스텝도 생기지 않는다.
 */
import { createSign } from 'node:crypto';

const TABS = {
  targets: process.env.SHEET_TAB_TARGETS || '월별 목표',
  data:    process.env.SHEET_TAB_DATA    || 'Data 입력',
};

// 시트 CSV 계약상 A~K(11칸)까지는 항상 존재해야 한다. Sheets API 는 행 끝의
// 빈 셀을 잘라서 주므로, 짧은 행을 그대로 내보내면 targets 가 9칸을 못 채운다.
const MIN_COLS = 11;

const b64url = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cachedToken = null;   // 람다 인스턴스가 살아있는 동안 재사용

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

// 시트 수식 오류(#REF! 등)는 절대 통과시키지 않는다. index.html 의 num() 은
// 숫자로 못 읽는 값을 0 으로 바꾸는데, 재고·판매가 0 이 되면 '한국 발주 필요'가
// 실재고를 무시한 거대한 숫자로 튄다. 조용히 틀린 발주보다 대놓고 실패가 낫다.
const SHEET_ERR = /^#(REF|N\/A|VALUE|DIV\/0|NAME|NUM|ERROR)[!?]/;

const colName = i => {
  let s = '';
  for(let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + n % 26) + s;
  return s;
};

const csvCell = v => {
  // UNFORMATTED_VALUE 는 시트 수식의 부동소수 오차를 그대로 준다
  // (33447.700000000004). 표시용으로 그 잡음만 걷어낸다 — 값 자체는 안 바꾼다.
  if(typeof v === 'number' && Number.isFinite(v)) v = Math.round(v * 1e6) / 1e6;
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default async function handler(req, res){
  try{
    const { searchParams } = new URL(req.url, 'http://localhost');
    const country = (searchParams.get('country') || 'US').toUpperCase();
    const tab = searchParams.get('tab') || 'targets';

    const sheetName = TABS[tab];
    if(!sheetName) return res.status(400).json({ error:'bad_tab', allowed:Object.keys(TABS) });

    const id = process.env[`SHEET_ID_${country}`];
    if(!id) return res.status(400).json({ error:`missing_SHEET_ID_${country}` });

    const token = await getToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/`
      + `${encodeURIComponent(sheetName)}`
      + `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

    const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
    if(!r.ok){
      // 403 이면 대개 시트를 서비스 계정에 공유하지 않은 것, 404 면 ID 오타.
      return res.status(r.status).json({
        error: 'sheets_api',
        status: r.status,
        hint: r.status === 403
          ? `시트를 ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} 에 뷰어로 공유했는지 확인`
          : r.status === 404 ? `SHEET_ID_${country} 또는 탭 이름('${sheetName}') 확인` : undefined,
        detail: (await r.text()).slice(0, 300),
      });
    }

    const rows = (await r.json()).values || [];

    const bad = [];
    rows.forEach((row, ri) => row.forEach((v, ci) => {
      if(SHEET_ERR.test(String(v ?? ''))) bad.push(`${colName(ci)}${ri + 1}`);
    }));
    if(bad.length){
      return res.status(502).json({
        error: 'sheet_formula_error',
        tab: sheetName,
        count: bad.length,
        cells: bad.slice(0, 12),
        hint: 'IMPORTRANGE 라면 시트를 데스크톱 브라우저로 열어 "액세스 허용"을 한 번 눌러야 합니다. '
            + '오류 셀을 0으로 읽으면 발주 수량이 잘못 계산되므로 의도적으로 실패시킵니다.',
      });
    }

    const width = Math.max(MIN_COLS, ...rows.map(x => x.length), 0);
    const csv = rows
      .map(row => Array.from({ length: width }, (_, i) => csvCell(row[i])).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).send(csv);
  }catch(e){
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
