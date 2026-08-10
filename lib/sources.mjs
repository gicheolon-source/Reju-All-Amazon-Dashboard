import { txt, num, int } from './normalize.mjs';

export const ACCOUNT = 'Dr Rejuall Brand';

/* 마켓플레이스. 대시보드 토글·API 검증·리포트 폴더(reports/<소문자>)가 이 목록을 따른다. */
export const MARKETS = {
  US: { label: 'US', account: 'Dr Rejuall Brand — 미국' },
  CA: { label: 'CA', account: 'Dr Rejuall Brand — 캐나다' },
  AU: { label: 'AU', account: 'Dr Rejuall Brand — 호주' },
  UK: { label: 'UK', account: 'Dr Rejuall Brand — 영국' },
  AE: { label: 'AE', account: 'Dr Rejuall Brand — 중동(UAE)' },
};
export const cleanMarket = m => {
  const v = String(m ?? 'US').toUpperCase();
  return MARKETS[v] ? v : 'US';
};

export const SHEETS = {
  main: '1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao',
  searchTerm: '18PYxLFzgzkltYoAyVKEJTmqflf-9CNsBFX01zCRRvLQ',
};

const AD_PRODUCT = {
  'Sponsored Products': 'SP',
  'Sponsored Brands': 'SB',
  'Sponsored Display': 'SD',
};

const MATCH_TYPE = {
  TARGETING_EXPRESSION: 'PT',
  TARGETING_EXPRESSION_PREDEFINED: 'AUTO',
};

/* 각 소스: 시트 위치 + 필요한 헤더명 + 행 매퍼 + 적재 키.
   metrics 는 같은 키로 묶일 때 합산, meta 는 마지막 값이 남는다.
   spec 값이 배열이면 그 중 먼저 발견된 헤더를 쓴다 — 콘솔 다운로드 파일과
   시트에 붙여넣은 버전이 열 이름이 다른 경우가 있다.
   detect 는 파일이 어떤 리포트인지 알아내는 지표 열이다. */
export const SOURCES = {
  campaigns: {
    table: 'campaigns',
    label: 'Campaign',
    sheet: 'main',
    gid: 1710166971,
    detect: ['Ad product'],
    spec: {
      range: ['Date range', 'Date'], portfolio: 'Portfolio name', campaign: 'Campaign name',
      adProduct: 'Ad product', imp: 'Impressions', clk: 'Clicks',
      cost: ['Total cost', 'Spend'],
      pur: 'Purchases', sales: 'Sales', ntbPur: 'Purchases (new to brand)',
      ntbSales: 'Sales (new to brand)', dpv: 'Detail page views',
    },
    key: ['campaign'],
    meta: ['portfolio', 'ad_product'],
    metrics: ['imp', 'clk', 'cost', 'pur', 'sales', 'ntb_pur', 'ntb_sales', 'dpv'],
    map: (r, i) => ({
      campaign: txt(r[i.campaign]),
      portfolio: txt(r[i.portfolio]),
      ad_product: AD_PRODUCT[txt(r[i.adProduct])] ?? txt(r[i.adProduct]),
      imp: int(r[i.imp]), clk: int(r[i.clk]), cost: num(r[i.cost]),
      pur: int(r[i.pur]), sales: num(r[i.sales]),
      ntb_pur: int(r[i.ntbPur]), ntb_sales: num(r[i.ntbSales]), dpv: int(r[i.dpv]),
    }),
    valid: row => !!row.campaign,
  },

  search_terms: {
    table: 'search_terms',
    label: 'Search term',
    sheet: 'searchTerm',
    gid: 1268127862,
    detect: ['Search term', 'Customer search term'],
    spec: {
      range: ['Date range', 'Date'], portfolio: 'Portfolio name', campaign: 'Campaign name',
      adGroup: 'Ad group name', term: ['Search term', 'Customer search term'],
      imp: 'Impressions', clk: 'Clicks',
      cost: ['Total cost', 'Spend'], pur: 'Purchases', sales: 'Sales', units: 'Units sold',
      ntbSales: 'Sales (new to brand)', dpv: 'Detail page views',
    },
    key: ['campaign', 'ad_group', 'term'],
    meta: ['portfolio'],
    metrics: ['imp', 'clk', 'cost', 'pur', 'sales', 'units', 'ntb_sales', 'dpv'],
    map: (r, i) => ({
      campaign: txt(r[i.campaign]), ad_group: txt(r[i.adGroup]),
      term: txt(r[i.term]).toLowerCase(), portfolio: txt(r[i.portfolio]),
      imp: int(r[i.imp]), clk: int(r[i.clk]), cost: num(r[i.cost]),
      pur: int(r[i.pur]), sales: num(r[i.sales]), units: int(r[i.units]),
      ntb_sales: num(r[i.ntbSales]), dpv: int(r[i.dpv]),
    }),
    /* 검색어가 빈 행(SB 등)은 합계 정합성을 위해 버리지 않는다 */
    valid: row => !!row.campaign,
  },

  targets: {
    table: 'targets',
    label: 'Targeting',
    sheet: 'main',
    gid: 1629787156,
    detect: ['Targeting'],
    spec: {
      range: ['Date range', 'Date'], portfolio: 'Portfolio name', campaign: 'Campaign name',
      adGroup: 'Ad group name', target: 'Targeting',
      matchType: ['Targeting match type', 'Match type'],
      bid: ['Target bid', 'Bid'], status: ['Target status', 'Status'],
      imp: 'Impressions', clk: 'Clicks',
      cost: ['Total cost', 'Spend'], pur: 'Purchases', sales: 'Sales', units: 'Units sold',
    },
    key: ['campaign', 'ad_group', 'target', 'match_type'],
    meta: ['portfolio', 'bid', 'status'],
    metrics: ['imp', 'clk', 'cost', 'pur', 'sales', 'units'],
    map: (r, i) => ({
      campaign: txt(r[i.campaign]), ad_group: txt(r[i.adGroup]),
      target: txt(r[i.target]),
      match_type: MATCH_TYPE[txt(r[i.matchType])] ?? txt(r[i.matchType]),
      portfolio: txt(r[i.portfolio]),
      bid: txt(r[i.bid]) === '' ? null : num(r[i.bid]),
      status: txt(r[i.status]),
      imp: int(r[i.imp]), clk: int(r[i.clk]), cost: num(r[i.cost]),
      pur: int(r[i.pur]), sales: num(r[i.sales]), units: int(r[i.units]),
    }),
    valid: row => !!row.campaign,
  },

  /* Advertised product 리포트 — 시트에 탭이 아직 없다.
     탭을 만들고 gid 를 채우면 제품별 탭이 살아난다. */
  products: {
    table: 'products',
    label: 'Advertised product',
    sheet: 'main',
    gid: null,
    detect: ['Advertised ASIN', 'Advertised product ID'],
    spec: {
      range: ['Date range', 'Date'], portfolio: 'Portfolio name', campaign: 'Campaign name',
      adGroup: 'Ad group name',
      /* 새 리포트 빌더는 'Advertised product ID/name' 으로 내보낸다 */
      asin: ['Advertised ASIN', 'Advertised product ID'],
      sku: ['Advertised SKU', 'Advertised product SKU'],
      title: ['Advertised product title', 'Advertised product name', 'Advertised product'],
      imp: 'Impressions', clk: 'Clicks',
      cost: ['Total cost', 'Spend'], pur: 'Purchases', sales: 'Sales', units: 'Units sold',
    },
    key: ['campaign', 'ad_group', 'asin', 'sku'],
    meta: ['portfolio', 'title'],
    metrics: ['imp', 'clk', 'cost', 'pur', 'sales', 'units'],
    map: (r, i) => ({
      campaign: txt(r[i.campaign]), ad_group: txt(r[i.adGroup]),
      asin: txt(r[i.asin]).toUpperCase(), sku: txt(r[i.sku]),
      title: txt(r[i.title]), portfolio: txt(r[i.portfolio]),
      imp: int(r[i.imp]), clk: int(r[i.clk]), cost: num(r[i.cost]),
      pur: int(r[i.pur]), sales: num(r[i.sales]), units: int(r[i.units]),
    }),
    valid: row => !!row.campaign && !!row.asin,
  },
};

/* 리포트 종류 판별 순서 — 서치텀 리포트에도 'Targeting' 열이 있으므로
   더 구체적인 것부터 본다. */
const DETECT_ORDER = ['search_terms', 'products', 'targets', 'campaigns'];

export function detectSource(header) {
  const names = new Set(header.map(h => txt(h)));
  for (const name of DETECT_ORDER) {
    if (SOURCES[name].detect.some(c => names.has(c))) return name;
  }
  return null;
}

/* 새 리포트 빌더는 차원을 섞어 한 파일로 뽑을 수 있다 (서치텀+타겟팅+광고제품+Ad product).
   행이 잘게 쪼개질 뿐 합계는 보존되므로, 해당하는 소스 전부에 적재한다.
   campaigns 도 포함한다 — 실측으로 복합 파일의 SP/SB/SD 지출 비중이 전용 캠페인
   리포트와 일치함을 확인했다 (US: 87.8/11.7/0.5 vs 누적 83.4/15.9/0.7, 검색어 빈
   행의 SB/SD 지출도 담김). 구형 서치텀 전용 파일에는 'Ad product' 열이 없어
   캠페인으로 오인되지 않는다. 같은 주차에 전용 캠페인 리포트를 넣으면
   delete-insert 로 그쪽이 최종값이 된다. */
export function detectSources(header) {
  const names = new Set(header.map(h => txt(h)));
  return DETECT_ORDER.filter(n => SOURCES[n].detect.some(c => names.has(c)));
}
