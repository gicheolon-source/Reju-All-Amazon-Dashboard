/* weekly-lite RAW 수집 — 시트 3개 탭을 gviz CSV 로 그대로 받아 _raw_arrays.json 생성
   (로컬 미리보기/오프라인 빌드 전용. 배포판은 api/data.js 가 서비스계정으로 읽는다) */
import fs from 'fs';

const MAIN_ID  = '1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao';
const NOTES_ID = '1GOClg8wNjUOJAQzcu2dGbENoMWrMCMd4vzx-LLqkFqA';
const TABS = {
  asin:  { id: MAIN_ID,  gid: '952475532'  },   // ASIN 일별 통합
  camp:  { id: MAIN_ID,  gid: '1710166971' },   // Campaign 리포트
  notes: { id: NOTES_ID, gid: '119883587'  },   // 주간 코멘트
};

function parseCSV(t){
  t = t.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for(let i=0;i<t.length;i++){
    const ch = t[i];
    if(q){
      if(ch === '"'){ if(t[i+1] === '"'){ cur += '"'; i++; } else q = false; }
      else cur += ch;
    }
    else if(ch === '"') q = true;
    else if(ch === ',') { row.push(cur); cur = ''; }
    else if(ch === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
    else if(ch !== '\r') cur += ch;
  }
  if(cur || row.length){ row.push(cur); rows.push(row); }
  return rows;
}

async function pull(name, { id, gid }){
  /* export?format=csv 를 쓴다. gviz/tq 는 컬럼 타입을 추론해서
     날짜·숫자 열의 문자열 헤더("Date","Campaign ID" 등)를 빈칸으로 반환하고,
     그러면 헤더 이름으로 컬럼을 찾는 집계 로직이 전 행을 스킵한다. */
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  const r = await fetch(url, { redirect: 'follow' });
  if(!r.ok) throw new Error(`${name} fetch ${r.status}`);
  const rows = parseCSV(await r.text());
  console.log(`${name.padEnd(6)} ${String(rows.length).padStart(6)} rows`);
  return rows;
}

const out = {};
for(const [name, cfg] of Object.entries(TABS)) out[name] = await pull(name, cfg);

fs.writeFileSync('_raw_arrays.json', JSON.stringify(out));
console.log('→ _raw_arrays.json', fs.statSync('_raw_arrays.json').size, 'bytes');
