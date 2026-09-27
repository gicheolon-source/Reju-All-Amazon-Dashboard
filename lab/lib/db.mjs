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

/* SQLite 의 바인딩 파라미터 상한(32766)에서 여유를 둔 값.
   열 수로 나눠 청크 크기를 정하면 왕복 횟수가 열 수에 무관하게 최소가 된다. */
const MAX_PARAMS = 24000;

/* 한 번에 여러 행 INSERT. 원격(Turso) 에서는 왕복 횟수가 곧 소요 시간이라
   파라미터 상한에 닿을 만큼 크게 묶는다.
   exec 는 client 또는 transaction — 둘 다 execute() 를 갖는다. */
export async function insertRows(exec, table, cols, rows, { chunkRows, onProgress } = {}) {
  if (!rows.length) return 0;
  chunkRows ??= Math.max(1, Math.floor(MAX_PARAMS / cols.length));
  const colList = cols.join(', ');
  const one = `(${cols.map(() => '?').join(', ')})`;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkRows) {
    const slice = rows.slice(i, i + chunkRows);
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${slice.map(() => one).join(', ')}`;
    await exec.execute({ sql, args: slice.flat() });
    done += slice.length;
    onProgress?.(done, rows.length);
  }
  return done;
}
