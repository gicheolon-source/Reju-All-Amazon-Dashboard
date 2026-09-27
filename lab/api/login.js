import { makeCookie, clearCookie } from '../lib/auth.mjs';

export default async function handler(req, res) {
  const { DASH_PASSWORD, DASH_SECRET } = process.env;

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie());
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!DASH_PASSWORD || !DASH_SECRET)
    return res.status(500).json({ error: 'DASH_PASSWORD / DASH_SECRET 환경변수가 없습니다' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const given = String(body.password ?? '');

  // 길이가 달라도 같은 시간이 걸리도록 비교
  let diff = given.length ^ DASH_PASSWORD.length;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ DASH_PASSWORD.charCodeAt(i % DASH_PASSWORD.length);
  if (diff !== 0) {
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ error: '비밀번호가 맞지 않습니다' });
  }

  res.setHeader('Set-Cookie', await makeCookie(DASH_SECRET));
  return res.status(200).json({ ok: true });
}
