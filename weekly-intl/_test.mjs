import { buildDashboard, COUNTRIES } from './api/data.js';
import fs from 'fs';

/* 이 샘플이 어느 국가 데이터인지. _pull.mjs 가 받아온 시트와 반드시 맞춰야 한다.
   ── 왜 필요한가 ──────────────────────────────────────────────
   샘플/오프라인 데이터는 한 국가 것뿐이다. 국가 표시를 안 새기면 프런트엔드가
   "UK 버튼 + US 숫자 + £ 기호" 를 그려서 존재하지 않는 매출을 보여준다.
   이 값이 있으면 프런트엔드가 셀렉터를 해당 국가로 고정한다. */
const SAMPLE_COUNTRY = (process.env.SAMPLE_COUNTRY || 'US').toUpperCase();
const meta = COUNTRIES[SAMPLE_COUNTRY];
if (!meta) {
  console.error(`SAMPLE_COUNTRY=${SAMPLE_COUNTRY} 는 COUNTRIES 에 없습니다.` +
    ` 가능한 값: ${Object.keys(COUNTRIES).join(', ')}`);
  process.exit(1);
}

/* _pull.mjs 가 받아둔 RAW(asin·camp·notes) 를 그대로 집계한다 */
const raw = JSON.parse(fs.readFileSync('_raw_arrays.json','utf-8'));
console.log('rows — asin:', raw.asin.length, '· camp:', raw.camp.length, '· notes:', raw.notes.length);

const out = {
  country: SAMPLE_COUNTRY,
  countryLabel: meta.label,
  currency: { symbol: meta.symbol, iso: meta.iso, dec: meta.dec },
  singleCountry: true,          // 프런트엔드: 셀렉터를 이 국가로 고정하라는 표시
  ...buildDashboard({ asin: raw.asin, camp: raw.camp, notes: raw.notes }),
};
const t = out.weeks.map(w=>({wk:w.label,range:w.range,totalSales:w.totalSales,units:w.units,
  adSales:w.sales,spend:w.spend,ads:w.ads.hasAds,prods:w.products.length,note:w.note?'Y':''}));
console.table(t.slice(-8));
console.log('weeks with notes:', out.weeks.filter(w=>w.note).map(w=>w.label).join(', ') || '(none)');
fs.writeFileSync('data.sample.json', JSON.stringify(out));
console.log(`국가: ${SAMPLE_COUNTRY} (${meta.label}) · 통화 ${meta.symbol}${meta.iso}` +
            ` — 셀렉터는 이 국가로 고정됩니다`);
console.log('bytes:', fs.statSync('data.sample.json').size);
