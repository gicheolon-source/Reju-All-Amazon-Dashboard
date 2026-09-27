/* 로컬 개발 서버 — Vercel 의 정적 + /api 라우팅과 비밀번호 게이트를 흉내낸다.
   실행: npm run dev  (기본 3000, PORT 로 변경) */
import { ROOT } from '../lib/env.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { valid, readCookie } from '../lib/auth.mjs';

const PORT = Number(process.env.PORT ?? 3000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

/* Vercel 핸들러가 기대하는 res 헬퍼를 붙인다 */
function shim(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  return res;
}

const readBody = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  shim(res);

  try {
    if (p.startsWith('/api/')) {
      const name = p.slice(5).replace(/[^a-z]/g, '');
      if (name !== 'login' && !(await gateOk(req)))
        return res.status(401).json({ error: '로그인이 필요합니다' });
      const mod = await import(`../api/${name}.js`).catch(() => null);
      if (!mod) return res.status(404).json({ error: 'no such api: ' + name });
      req.body = await readBody(req);
      return mod.default(req, res);
    }

    if (!p.startsWith('/login') && !(await gateOk(req))) {
      res.statusCode = 302;
      res.setHeader('location', '/login?next=' + encodeURIComponent(p));
      return res.end();
    }

    const file = p === '/' ? 'index.html' : (p.startsWith('/login') ? 'login.html' : p.slice(1));
    const buf = await readFile(join(ROOT, file)).catch(() => null);
    if (!buf) { res.statusCode = 404; return res.end('not found: ' + file); }
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
    /* 개발 중에는 편집 결과가 바로 보여야 한다 — 브라우저 추측 캐시를 막는다 */
    res.setHeader('cache-control', 'no-store');
    res.end(buf);
  } catch (e) {
    res.status(500).json({ error: String(e.stack ?? e) });
  }
}).listen(PORT, () => {
  const gate = process.env.DASH_PASSWORD && process.env.DASH_SECRET ? '켜짐' : '꺼짐 (DASH_PASSWORD 없음)';
  console.log(`http://localhost:${PORT}   비밀번호 게이트: ${gate}`);
});

async function gateOk(req) {
  const { DASH_PASSWORD, DASH_SECRET } = process.env;
  if (!DASH_PASSWORD || !DASH_SECRET) return true;
  return valid(readCookie(req.headers.cookie), DASH_SECRET);
}
