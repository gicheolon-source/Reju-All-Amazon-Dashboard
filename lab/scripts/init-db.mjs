import '../lib/env.mjs';
import fs from 'fs';
import path from 'path';
import { db } from '../lib/db.mjs';

const sql = fs.readFileSync(path.join(import.meta.dirname, '../db/schema.sql'), 'utf-8');
await db().executeMultiple(sql);

const t = await db().execute(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
console.log('스키마 적용 완료 —', process.env.TURSO_DATABASE_URL);
console.log('테이블:', t.rows.map(r => r.name).join(', '));
