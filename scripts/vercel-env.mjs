/* Vercel 환경변수로 붙여넣을 .env.vercel 을 만든다.
   개인키를 손으로 옮기면 줄바꿈이 깨지기 쉬워서 파일로 뽑는다.

   사용:  node scripts/vercel-env.mjs "<대시보드 비밀번호>" "libsql://…" "<turso 토큰>"
   토큰·URL 을 생략하면 .env.local 값을 쓴다. */
import { ROOT } from '../lib/env.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const [password, url, token] = process.argv.slice(2);
if (!password) {
  console.error('사용: node scripts/vercel-env.mjs "<대시보드 비밀번호>" [libsql://…] [turso 토큰]');
  process.exit(1);
}

const keyPath = process.env.REJUALL_SA_KEY;
if (!keyPath) { console.error('REJUALL_SA_KEY 가 .env.local 에 없습니다.'); process.exit(1); }
const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
if (!sa.client_email || !sa.private_key) { console.error('서비스 계정 JSON 형식이 아닙니다: ' + keyPath); process.exit(1); }

const dbUrl = url ?? process.env.TURSO_DATABASE_URL ?? '';
if (!dbUrl.startsWith('libsql://'))
  console.warn(`⚠ TURSO_DATABASE_URL 이 libsql:// 가 아닙니다 ("${dbUrl}") — Vercel 에서는 원격 URL 이어야 합니다.`);

/* 값에 줄바꿈이 있으면 따옴표로 감싸야 Vercel 의 .env 파서가 한 값으로 읽는다 */
const q = v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

const out = [
  `TURSO_DATABASE_URL=${dbUrl}`,
  `TURSO_AUTH_TOKEN=${token ?? process.env.TURSO_AUTH_TOKEN ?? ''}`,
  `GOOGLE_SERVICE_ACCOUNT_EMAIL=${sa.client_email}`,
  `GOOGLE_PRIVATE_KEY=${q(sa.private_key)}`,
  `DASH_PASSWORD=${password}`,
  `DASH_SECRET=${randomBytes(32).toString('hex')}`,
  '',
].join('\n');

const dest = join(ROOT, '.env.vercel');
writeFileSync(dest, out);
console.log(`\n${dest} 생성 완료 (gitignore 됨)\n`);
console.log('  Vercel → Project → Settings → Environment Variables → Import .env 에서 이 파일을 올리세요.');
console.log('  DASH_SECRET 은 새로 생성했습니다 — 바꾸면 기존 로그인 세션이 모두 만료됩니다.\n');
for (const line of out.trim().split('\n')) {
  const [k, v] = line.split(/=(.*)/s);
  console.log(`  ${k.padEnd(30)} ${k.includes('KEY') || k.includes('TOKEN') || k.includes('PASSWORD') || k.includes('SECRET') ? `(${v.length}자)` : v}`);
}
