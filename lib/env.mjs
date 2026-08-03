import fs from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

/* cwd 가 아니라 리포 루트 기준으로 찾는다 — 상위 폴더에서 실행해도 동작한다 */
export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f);
  if (fs.existsSync(p)) { process.loadEnvFile(p); break; }
}
