const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const store = {};
const el = { innerHTML:'', textContent:'', style:{}, className:'', value:'' };
global.localStorage = { getItem:k=>store[k]||null, setItem:(k,v)=>store[k]=v, removeItem:k=>delete store[k] };
global.sessionStorage = global.localStorage;
global.document = { getElementById:()=>({...el}), querySelector:()=>({...el}), createElement:()=>({...el, click:()=>{}}) };
global.fetch = async()=>({ ok:true, json:async()=>[], text:async()=>'' });
global.alert=()=>{}; global.prompt=()=>null; global.confirm=()=>true;

const csv = [
  '제품명,ASIN,5월,6월,7월,8월,9월,10월,11월,12월,1월',
  '"Test, Cream",B0TEST12345,0,0,"9,300",12200,12200,22150,33448,24365,0',
  '월초 FBA 확보 개월수,★,2,2,2,2,2,1,2,2,2'
].join('\n');

const body = script + `
;const rows = parseCSV(${JSON.stringify(csv)});
const c = calcRow(G.data.US.products[0]);
const c2 = calcRow(G.data.US.products[1]); // Copper with 12,000 FBA-bound air
return {
  csvRows: rows.length,
  quotedName: rows[1][0],
  numParse: num(rows[1][4]),
  cream: { fbaNeed: c.fbaNeed, refill: c.refill, sys: c.sysNeed, order: c.order },
  copper: { inFBA: c2.inF, refill: c2.refill },
  views: [vTgt().length>100, vData().length>100, vSet().length>100, vDash().length>100],
};`;
console.log(JSON.stringify(new Function(body)(), null, 1));
