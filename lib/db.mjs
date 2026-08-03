import { createClient } from '@libsql/client';
import { pathToFileURL } from 'url';
import { join } from 'path';
import { ROOT } from './env.mjs';

let client;

export function db() {
  if (client) return client;
  let url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error(
    'TURSO_DATABASE_URL 이 없습니다. 로컬은 .env.local 에 file:./data/ads.db, ' +
    'Vercel 은 환경변수에 libsql://... 를 넣으세요.');
  /* 로컬 파일 경로는 cwd 가 아니라 리포 루트 기준으로 해석한다 */
  const rel = url.match(/^file:\.{0,2}\/?(?!\/)(.+)$/);
  if (rel) url = pathToFileURL(join(ROOT, rel[1])).href;
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return client;
}

/* 한 번에 여러 행 INSERT. libSQL 은 파라미터 수에 상한이 있어 청크로 나눈다.
   exec 는 client 또는 transaction — 둘 다 execute() 를 갖는다. */
export async function insertRows(exec, table, cols, rows, chunkRows = 200) {
  if (!rows.length) return 0;
  const colList = cols.join(', ');
  const one = `(${cols.map(() => '?').join(', ')})`;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkRows) {
    const slice = rows.slice(i, i + chunkRows);
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${slice.map(() => one).join(', ')}`;
    await exec.execute({ sql, args: slice.flat() });
    done += slice.length;
  }
  return done;
}
