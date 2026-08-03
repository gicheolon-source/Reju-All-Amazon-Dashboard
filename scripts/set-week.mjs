/* 주차에 행사주 표시/메모를 남긴다. 행사주는 전주 대비 급증 경고에서 제외된다.
     node scripts/set-week.mjs 2026-06-21 --event --note="Prime Day"
     node scripts/set-week.mjs 2026-06-21 --no-event */
import '../lib/env.mjs';
import { db } from '../lib/db.mjs';

const args = process.argv.slice(2);
const week = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!week) { console.error('사용법: node scripts/set-week.mjs <YYYY-MM-DD> [--event|--no-event] [--note="..."]'); process.exit(1); }

const note = args.find(a => a.startsWith('--note='))?.slice(7).replace(/^"|"$/g, '');
const isEvent = args.includes('--event') ? 1 : args.includes('--no-event') ? 0 : null;

const sets = [], vals = [];
if (isEvent !== null) { sets.push('is_event = ?'); vals.push(isEvent); }
if (note !== undefined) { sets.push('note = ?'); vals.push(note); }
if (!sets.length) { console.error('--event / --no-event / --note= 중 하나는 필요합니다.'); process.exit(1); }

const r = await db().execute({ sql: `UPDATE weeks SET ${sets.join(', ')} WHERE week_start = ?`, args: [...vals, week] });
if (!r.rowsAffected) { console.error(`${week} 주차가 weeks 테이블에 없습니다.`); process.exit(1); }

const w = (await db().execute({ sql: 'SELECT * FROM weeks WHERE week_start = ?', args: [week] })).rows[0];
console.log(`${w.week_start} (${w.label})  행사주=${w.is_event ? 'Y' : 'N'}  메모=${w.note ?? '—'}`);
