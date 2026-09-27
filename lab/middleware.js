import { valid, readCookie } from './lib/auth.mjs';

export const config = {
  matcher: ['/((?!login|api/login|favicon.ico).*)'],
};

export default async function middleware(req) {
  const secret = process.env.DASH_SECRET;
  const password = process.env.DASH_PASSWORD;

  // 비밀번호를 설정하지 않았으면 게이트를 걸지 않는다 (초기 셋업 중 잠기지 않도록)
  if (!password || !secret) return;

  if (await valid(readCookie(req.headers.get('cookie')), secret)) return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  url.pathname = '/login';
  return Response.redirect(url, 302);
}
