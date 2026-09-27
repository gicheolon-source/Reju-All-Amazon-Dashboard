import { buildDashboard } from '../api/weekly/data.js';
import fs from 'fs';

/* _pull.mjs 가 받아둔 RAW(asin·camp·notes) 를 그대로 집계한다 */
const raw = JSON.parse(fs.readFileSync('_raw_arrays.json','utf-8'));
console.log('rows — asin:', raw.asin.length, '· camp:', raw.camp.length, '· notes:', raw.notes.length);

const out = buildDashboard({ asin: raw.asin, camp: raw.camp, notes: raw.notes });
const t = out.weeks.map(w=>({wk:w.label,range:w.range,totalSales:w.totalSales,units:w.units,
  adSales:w.sales,spend:w.spend,ads:w.ads.hasAds,prods:w.products.length,note:w.note?'Y':''}));
console.table(t.slice(-8));
console.log('weeks with notes:', out.weeks.filter(w=>w.note).map(w=>w.label).join(', ') || '(none)');
fs.writeFileSync('data.sample.json', JSON.stringify(out));
console.log('bytes:', fs.statSync('data.sample.json').size);
