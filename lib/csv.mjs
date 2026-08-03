/* 의존성 없는 CSV/TSV 리더. 수십만 행짜리 리포트를 메모리에 한 번에 올리지 않고
   스트림으로 읽어 행 단위로 넘긴다. RFC4180 인용 규칙(""=리터럴 따옴표)을 따른다. */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { open } from 'node:fs/promises';

/* 구분자 추정 — 아마존은 CSV 를 주지만 지역 설정에 따라 세미콜론/탭이 나오기도 한다.
   따옴표 밖에 있는 후보 문자만 센다. */
function sniff(line) {
  const count = ch => {
    let n = 0, q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { q = !q; continue; }
      if (!q && c === ch) n++;
    }
    return n;
  };
  const best = [',', '\t', ';'].map(d => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/* 한 줄을 필드 배열로. 인용 필드 안의 줄바꿈은 caller 가 이어붙여 넘긴다. */
function splitLine(line, d) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/* 인용부호 개수가 홀수면 필드 안에서 줄이 끊긴 것 */
const unbalanced = s => {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === '"') n++;
  return n % 2 === 1;
};

/* 헤더 앞에 붙는 안내문("Report generated on…" 같은 행)을 건너뛰고
   실제 헤더로 보이는 첫 행을 찾는다 — 필드가 여러 개이고 Date 계열 열이 있는 행. */
const looksLikeHeader = f => f.length >= 5 &&
  f.some(x => /^(date|date range|날짜)$/i.test(String(x).trim()));

export async function readCsv(path, { onRow, maxProbe = 20 } = {}) {
  const rl = createInterface({
    input: createReadStream(path, { encoding: await detectEncoding(path) }),
    crlfDelay: Infinity,
  });

  let d = null, header = null, pending = '', probed = 0, count = 0;

  for await (const raw of rl) {
    let line = pending ? pending + '\n' + raw : raw;
    if (unbalanced(line)) { pending = line; continue; }
    pending = '';
    if (line.trim() === '') continue;

    if (!header) {
      d ??= sniff(line);
      const f = splitLine(line, d);
      if (looksLikeHeader(f) || ++probed > maxProbe) { header = f; onRow(f); continue; }
      continue;   // 헤더 앞 안내문 행
    }
    onRow(splitLine(line, d));
    count++;
  }
  if (pending.trim()) { onRow(splitLine(pending, d ?? ',')); count++; }
  if (!header) throw new Error('헤더 행을 찾지 못했습니다 — Date 또는 Date range 열이 있는 CSV 인지 확인하세요.');
  return { header, count, delimiter: d };
}

/* UTF-8 BOM / UTF-16LE BOM 판별. 아마존 콘솔은 UTF-8 BOM 을 붙여 내려준다. */
async function detectEncoding(path) {
  const fh = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(4), 0, 4, 0);
    if (bytesRead >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf16le';
    return 'utf8';   // BOM 은 아래에서 제거
  } finally { await fh.close(); }
}

/* 전체를 AOA 로. 헤더 첫 셀의 BOM 을 떼어낸다. */
export async function readCsvAoa(path) {
  const rows = [];
  const meta = await readCsv(path, { onRow: r => rows.push(r) });
  if (rows.length && typeof rows[0][0] === 'string') rows[0][0] = rows[0][0].replace(/^﻿/, '');
  return { rows, ...meta };
}
