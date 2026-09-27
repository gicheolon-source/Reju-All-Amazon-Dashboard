/* 로컬 개발 서버 — 통합 리포 전체(허브·weekly·weekly-intl·inventory·lab)의
   Vercel 정적 + /api 라우팅과 Lab 비밀번호 게이트를 흉내낸다.
   실행: 리포 루트에서 npm run dev  (기본 3000, PORT 로 변경) */
import { ROOT } from '../lib/env.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { valid, readCookie } from '../lib/auth.mjs';

const REPO = dirname(ROOT);   // ROOT = lab/
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
    /* 게이트는 middleware.js 와 같게 Lab 경로에만 건다 */
    const labPath = p === '/lab' || p.startsWith('/lab/') || p.startsWith('/api/lab/');
    const isLogin = p === '/lab/login' || p === '/api/lab/login';

    if (p.startsWith('/api/')) {
      if (labPath && !isLogin && !(await gateOk(req)))
        return res.status(401).json({ error: '로그인이 필요합니다' });
      const rel = p.slice(1).replace(/[^a-z0-9/-]/gi, '').replace(/\.\.+/g, '');
      const fn = ['.js', '.mjs'].map(e => join(REPO, rel + e)).find(f => existsSync(f));
      if (!fn) return res.status(404).json({ error: 'no such api: ' + p });
      const mod = await import(pathToFileURL(fn).href);
      req.body = await readBody(req);
      return mod.default(req, res);
    }

    if (labPath && !isLogin && !(await gateOk(req))) {
      res.statusCode = 302;
      res.setHeader('location', '/lab/login?next=' + encodeURIComponent(p));
      return res.end();
    }

    /* cleanUrls 흉내: /x → x · x.html · x/index.html 순서로 찾는다 */
    const clean = decodeURIComponent(p).replace(/\/+$/, '').slice(1).replace(/\.\.+/g, '');
    const file = [clean, clean + '.html', join(clean, 'index.html')]
      .find(f => extname(f) && existsSync(join(REPO, f))) ?? clean;
    const buf = await readFile(join(REPO, file)).catch(() => null);
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
