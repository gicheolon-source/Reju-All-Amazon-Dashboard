import { valid, readCookie } from './lab/lib/auth.mjs';

/* 비밀번호 게이트는 Ads Lab(/lab, /api/lab) 에만 건다.
   Weekly · Inventory 는 원래 리포처럼 게이트 없이 열린다. */
export const config = {
  matcher: ['/lab', '/lab/:path*', '/api/lab/:path*'],
};

export default async function middleware(req) {
  const url = new URL(req.url);
  if (url.pathname === '/lab/login' || url.pathname === '/lab/login.html' || url.pathname === '/api/lab/login') return;

  const secret = process.env.DASH_SECRET;
  const password = process.env.DASH_PASSWORD;

  // 비밀번호를 설정하지 않았으면 게이트를 걸지 않는다 (초기 셋업 중 잠기지 않도록)
  if (!password || !secret) return;

  if (await valid(readCookie(req.headers.get('cookie')), secret)) return;

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const next = url.pathname;
  url.pathname = '/lab/login';
  url.search = '?next=' + encodeURIComponent(next);
  return Response.redirect(url, 302);
}
