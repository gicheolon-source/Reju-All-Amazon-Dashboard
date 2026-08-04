# Dr. Rejuall INTL — Weekly Report (다국가판)

**한 배포에서 미국 · 캐나다 · 영국 · 호주 · 중동을 전환**하는 주간 보고 대시보드.
US 경량판(저장소 루트)과 집계 로직은 **완전히 동일**하고, 달라진 것은
"어느 시트를 읽을지"와 "어떤 통화로 표시할지"뿐입니다.

| | US 경량판 (루트) | **INTL (이 폴더)** |
|---|---|---|
| 국가 | US 1개 | **US · CA · UK · AU · AE 5개** |
| 배포 | Vercel 프로젝트 1개 | Vercel 프로젝트 **1개** (국가는 쿼리로 전환) |
| API | `/api/data` | `/api/data?country=CA` |
| 통화 | `$` 하드코딩 | **API 응답의 `currency` 로 주입** |
| 국가 추가 | — | `api/data.js` 의 `COUNTRIES` 에 한 줄 |

> **US 는 환경변수 없이 바로 동작합니다.** 운영 중인 시트 좌표를
> `COUNTRIES.US.sheets` 에 코드 기본값으로 넣어 두었습니다
> (`SHEET_US_MAIN_ID` 등을 설정하면 환경변수가 이깁니다).
> 최초 진입 국가도 US 입니다 — 처음 열었을 때 데모가 아니라 실제 숫자가 보이도록.
>
> 루트의 US 경량판 배포(`rejuall-gl-amz-weekly`)는 **그대로 살아 있습니다.**
> 이 폴더는 별도 Vercel 프로젝트(`rejuall-weekly-intl`)로 배포됩니다.

---

## 1. 국가 전환이 동작하는 방식

```
사용자가 🇬🇧 UK 클릭
  → localStorage 에 UK 저장 + URL 을 ?country=UK 로 바꾸고 리로드
  → GET /api/data?country=UK
  → 서버가 SHEET_UK_MAIN_ID / GID_UK_* 로 해당 국가 시트를 읽음
  → 응답의 currency({symbol:'£', iso:'GBP', dec:2}) 로 화면 전체 통화 표기 전환
```

- **최초 진입 국가**: URL `?country=` → 직전 선택(localStorage) → `DEFAULT_COUNTRY`(기본 `CA`)
- **URL 이 곧 공유 링크**입니다. `?country=UK#/ads` 를 보내면 상대도 같은 화면을 봅니다.
- 국가 전환은 **전체 리로드**입니다 (차트 인스턴스·주차 선택·필터를 부분 갱신으로
  되돌리는 것보다 안전하고, URL 공유성까지 얻으므로 의도된 선택).
- 페이지 해시(`#/ads`)는 국가를 바꿔도 **보존**됩니다.

### 셀렉터는 API 가 그립니다

국가 버튼 목록은 `/api/data` 응답의 `countries` 배열로 렌더링됩니다.
→ **국가를 추가할 때 `index.html` 은 손대지 않습니다.** `api/data.js` 의
`COUNTRIES` 에 한 줄 넣으면 셀렉터에 자동으로 나타납니다.

시트가 아직 연결되지 않은 국가는 `ready:false` 로 내려와 **점선 테두리**로 표시되고,
클릭하면 데모 데이터 + "무엇을 설정해야 하는지" 안내가 뜹니다
(500 이 아니라 200 안내 응답 — 신규 4개국을 순차 온보딩하는 동안 나머지가 에러를 뿜지 않도록).

---

## 2. 환경변수

### 공통 (필수)

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 서비스 계정 `client_email` |
| `GOOGLE_PRIVATE_KEY` | `private_key` 전체 (`-----BEGIN…` ~ `…END-----\n`) |

> 서비스 계정은 **US 것을 그대로 재사용**할 수 있습니다. 새 시트마다 그 이메일로
> **뷰어 공유**만 해주면 됩니다.

### 국가별 (`XX` = `US` \| `CA` \| `UK` \| `AU` \| `AE`)

| Name | 필수 | 설명 |
|---|---|---|
| `SHEET_XX_MAIN_ID` | **O** | ASIN·Campaign 탭이 있는 시트 ID |
| `GID_XX_ASIN` | **O** | ASIN 탭 gid |
| `GID_XX_CAMPAIGN` | **O** | Campaign 탭 gid |
| `SHEET_XX_NOTES_ID` | — | 미설정 시 `SHEET_XX_MAIN_ID` 를 씀 |
| `GID_XX_NOTES` | — | 없으면 코멘트만 빈 상태 |

> **`US` 는 위 5개 전부 생략 가능합니다** — `COUNTRIES.US.sheets` 코드 기본값이
> 쓰입니다. 설정하면 환경변수가 이깁니다.

### 선택

| Name | 기본값 |
|---|---|
| `DEFAULT_COUNTRY` | `US` |
| `WEEKS_SHOWN` | `16` |

> **시트를 국가마다 따로 만들어도 되고, 한 시트에 국가별 탭을 두어도 됩니다.**
> 후자는 `SHEET_CA_MAIN_ID` 와 `SHEET_UK_MAIN_ID` 에 **같은 시트 ID** 를 넣고
> `GID_*` 만 다르게 주면 됩니다. 코드 변경은 없습니다.

환경변수 추가·변경 후에는 **Redeploy** 해야 반영됩니다.

---

## 3. 시트 구조 (국가 공통)

| 탭 | 리포트 | 헤더 위치 | 필수 컬럼 |
|---|---|---|---|
| ASIN | Sales & Traffic by ASIN (일별) | **1행 배너 / 2행 헤더 / 3행부터 데이터** | `Date`, `(Child) ASIN`, `Product Name`, `Units Ordered`, `Ordered Product Sales`, `Spend`, `Ad Sales`, `Sessions - Total` |
| Campaign | Campaign 리포트 (SP/SB/SD) | 1행이 헤더 | `Date range`, `Campaign name`, `Ad product`, `Portfolio name`, `Total cost`, `Sales`, `Impressions`, `Clicks`, `Purchases` |
| NOTES | 주간 코멘트 | 1행이 헤더 | `Week`, `기간`, `Overview`, `Sales`, `Advertising` |

컬럼은 **위치가 아니라 헤더 이름**으로 찾습니다 → 열 순서가 바뀌어도 안전.
단 **헤더 문자열은 바꾸지 마세요.**

### 지표별 출처

| 지표 | 출처 | Campaign 리포트 없는 주차 |
|---|---|---|
| Total Sales · Units · Sessions · **Ad Spend** · **Ad Sales** · ACOS · TACOS · ROAS | **ASIN 탭** | 정상 표시 |
| **Impressions** · **Clicks** · **CTR** · 캠페인 표 | **Campaign 탭** | `—` + `광고 리포트 미업로드` |

### 주간/월간 자동 라우팅 (Campaign 리포트)

| `Date range` 패턴 | 판정 |
|---|---|
| **일요일 시작 + 7일치** (span 6일) | 해당 주(일~토) 광고 데이터 |
| **20일 이상** | 월간 스냅샷 (주간 데이터 없는 주차의 폴백) |
| 그 외 부분 조각 | 무시 |

→ 광고 콘솔에서 **일~토 1주치**로 pull 해서 이어붙이면 자동으로 해당 주차에 붙습니다.

---

## 4. ⚠ 국가 확장 시 실제로 터지는 지점

코드 문제가 아니라 **리포트 언어·통화 형식** 문제입니다. 순서대로 확인하세요.

### 4-1. 리포트 언어를 English 로 고정 ← 최우선

컬럼을 헤더 이름 문자열로 찾으므로(`header.indexOf('Units Ordered')`),
Seller Central 을 현지어로 쓰면 **전 행이 스킵되고 KPI 가 전부 0** 이 됩니다.
에러도 안 나고 그냥 0 이라 알아채기 어렵습니다.

- **Seller Central** 언어 → English → Business Reports 1행 헤더 눈으로 확인
- **광고 콘솔** 언어 → English → Campaign 리포트 헤더 눈으로 확인

CA/UK/AU 는 기본이 영어라 대개 문제없지만, **CA 는 프랑스어, AE 는 아랍어**
설정이 있으니 반드시 확인하세요.

영어로 못 바꾸면 `api/data.js` 의 `idxOf` 에 별칭을 추가합니다
(실제 리포트 1행을 복사해 넣으세요 — 추측한 문자열은 조용히 0 이 됩니다).

### 4-2. 광고 타입 이름도 현지어입니다 (조용한 오류)

```js
const AD_TYPE = { 'Sponsored Products':'SP', 'Sponsored Brands':'SB', 'Sponsored Display':'SD' };
```

`Ad product` 값이 현지어면 매칭 실패 후 **전부 `SP` 로 폴백**합니다.
KPI 숫자는 맞는데 **광고 타입별 믹스 차트가 통째로 SP** 로 보입니다.
현지어를 쓰면 `AD_TYPE` 에 키를 추가하세요.

### 4-3. 유럽식 소수점을 쓰는 마켓을 추가할 때

현재 `money()` 는 US/CA/UK/AU/AE 전제입니다 — 5개국 모두 소수점 `.` + 천단위 `,`.

**DE/FR/IT/ES 를 추가하려면 `money()` 를 먼저 고쳐야 합니다.**
그대로 두면 `1.234,56` → `1.23456` 이 되어 **1000배 작아집니다.**
(시트에서 해당 열을 숫자 형식으로 바꾸는 게 더 안전한 해법입니다.)

### 4-4. 캠페인 표 최소 광고비는 현지 통화 기준

`index.html` 의 `MIN_SPEND_BY_COUNTRY` — `AED 100` 과 `£100` 은 실질 규모가 다르므로
AE 만 `300` 으로 올려 두었습니다. 환율 감각에 맞게 조정하세요.

```js
const MIN_SPEND_BY_COUNTRY = { AE: 300 };   // 미지정 국가는 100
```

---

## 5. 배포

```bash
cd weekly-intl
npx vercel            # Link to existing project? → N (US 판과 분리)
                      # Project name? → rejuall-weekly-intl
npx vercel --prod
```

GitHub 연동으로 배포하면 **Root Directory 를 `weekly-intl`** 로 지정하세요.

> **저장소는 반드시 Private.** 오프라인 빌드 산출물과 `data.sample.json` 에
> 실매출이 그대로 들어갑니다. 한 번 Public 으로 푸시하면 Private 로 바꿔도
> git 이력과 크롤러 캐시에 남습니다.

### 배포 후 검증

```bash
curl -s "https://<도메인>/api/data?country=CA"
```

- [ ] `demo:false` — `true` 면 환경변수 누락 또는 Redeploy 안 함
- [ ] `country:"CA"`, `currency.symbol:"C$"`
- [ ] `weeks` 배열이 비어 있지 않음
- [ ] 최신 주차 총매출을 **시트에서 직접 합산해 대조** (통화 파싱 검증)
- [ ] Impressions·Clicks·CTR 이 `—` 가 아님 → `—` 면 Campaign 탭 미인식
- [ ] 광고 타입 믹스에 SP 외 타입도 나옴 → 전부 SP 면 `AD_TYPE` 현지어 문제
- [ ] 5개국 각각 호출 (`?country=US|CA|UK|AU|AE`) — US 는 `demo:false` 여야 정상
- [ ] **연속 5~6회 호출해서 전부 200** — Vercel warm 컨테이너가 여러 개라
      한 번 성공했다고 끝이 아닙니다

### 증상별 원인

| 증상 | 원인 |
|---|---|
| `demo:true, reason:"env vars not set"` | 서비스 계정 환경변수 누락 / Redeploy 안 함 |
| `demo:true, reason:"XX not configured"` | 해당 국가 `SHEET_XX_MAIN_ID` / `GID_XX_*` 미설정 |
| `403 PERMISSION_DENIED` | 시트를 서비스 계정에 공유 안 함 |
| `gid N not found` | gid 오타, 탭 삭제됨 |
| **KPI 전부 0 / 주차 없음** | **헤더가 현지어** (4-1) 또는 ASIN 탭 행 오프셋 |
| 매출이 1000배 작음 | 유럽식 소수점 파싱 (4-3) |
| 광고 타입이 전부 SP | `AD_TYPE` 현지어 (4-2) |

---

## 6. 주간 운영 플로우 (국가별로 반복)

1. **매출** — Seller Central → Business Reports → Sales & Traffic **by ASIN, 일별**
   → 해당 국가 ASIN 탭에 이어붙이기
2. **광고** — 광고 콘솔 → Reports → **Campaign 리포트**, **일~토 1주치**
   → 해당 국가 Campaign 탭에 이어붙이기
3. **코멘트** — NOTES 시트 해당 주차 행 작성 (줄 앞 `-` → 불릿,
   `Week` 은 `W28` 또는 일요일 날짜 둘 다 인식)
4. 대시보드 새로고침 — **재배포 불필요**, CDN 캐시로 최대 5분 지연

---

## 7. 국가 추가하기

`api/data.js` 상단 `COUNTRIES` 에 한 줄:

```js
const COUNTRIES = {
  CA: { label: 'Canada', short: 'CA', flag: '🇨🇦', symbol: 'C$', iso: 'CAD', dec: 2 },
  // …
  SG: { label: 'Singapore', short: 'SG', flag: '🇸🇬', symbol: 'S$', iso: 'SGD', dec: 2 },
};
```

그 다음 Vercel 에 `SHEET_SG_MAIN_ID` · `GID_SG_ASIN` · `GID_SG_CAMPAIGN` 추가 → Redeploy.
**`index.html` 은 손대지 않습니다.**

시트 좌표를 환경변수 대신 코드에 박고 싶으면 `sheets` 를 함께 넣으면 됩니다
(US 가 그렇게 되어 있습니다):

```js
  SG: { label: 'Singapore', short: 'SG', flag: '🇸🇬', symbol: 'S$', iso: 'SGD', dec: 2,
        sheets: { mainId: '…', gidAsin: 111, gidCampaign: 222,
                  notesId: '…', gidNotes: 333 } },
```

> `index.html` 의 `FALLBACK_COUNTRIES` 는 **API 를 못 읽는 상황**(로컬 파일 직접 열기,
> 오프라인 단일 HTML)에서 셀렉터를 그리기 위한 표시 전용 목록입니다.
> 배포판 동작에는 영향이 없으니 급하지 않으면 안 고쳐도 됩니다.

---

## 8. 오프라인 공유 파일 (선택)

```bash
cd weekly-intl
node _pull.mjs        # ※ 상단 MAIN_ID / NOTES_ID / TABS 를 해당 국가 값으로 먼저 수정
node _test.mjs        # 집계 → data.sample.json
curl -s -o _chartjs.js https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js
python _build.py      # → Dr_Rejuall_Weekly_Lite.html
```

- `_pull.mjs` 는 서비스 계정 키가 필요합니다:
  `$env:REJUALL_SA_KEY="C:\path\to\key.json"; node _pull.mjs`
- `_pull.mjs` 는 **환경변수를 안 봅니다** — 국가별 시트 ID 를 파일에서 직접 고쳐야 합니다.
- **오프라인 HTML 은 국가 전환이 안 됩니다** (API 가 없으므로). 내장된 한 국가만 표시됩니다.
  국가별로 따로 빌드하세요.
- **`gviz/tq` 는 절대 쓰지 마세요** — 컬럼 타입을 추론해 날짜·숫자 열의 문자열 헤더를
  빈칸으로 반환하고, 그러면 헤더 이름 매칭이 전 행을 스킵합니다.

---

## 파일 구조

| 파일 | 역할 | 배포 |
|---|---|---|
| `index.html` | SPA 프런트엔드 + 국가 셀렉터 (Chart.js CDN) | O |
| `api/data.js` | Vercel Function — 국가별 ASIN + Campaign + NOTES 집계 | O |
| `package.json` | `google-auth-library` 의존성 | O |
| `_pull.mjs` / `_test.mjs` / `_build.py` | 로컬 수집·집계·빌드 스크립트 | — |

---

## 9. 이미 해결된 함정 (되돌리지 마세요)

US 판에서 실제로 프로덕션 500 을 냈던 두 건입니다. 이 코드에는 수정이 반영되어 있습니다.

1. **탭 제목 캐시를 모듈 전역에 두면 안 됩니다.** Vercel warm 컨테이너가 재사용되어,
   시트에서 탭 이름을 바꾼 뒤에도 옛 이름을 계속 씁니다. 컨테이너마다 상태가 달라
   **"어떤 요청은 되고 어떤 요청은 500"** 인 증상이 납니다.
   → 캐시는 `handler` 안에서 `const titleCache = {}` 로 **요청 단위**로 만듭니다.
   (다국가판에서는 더 중요합니다 — 국가별 시트가 한 캐시를 공유하면 안 되므로.)

2. **A1 표기법에서 탭 이름은 작은따옴표로 감쌉니다.** `6-1 캠페인` 처럼 숫자로
   시작하거나 하이픈·공백이 든 이름은 감싸지 않으면 `Unable to parse range` 400 이
   나서 대시보드 전체가 죽습니다. → `qTitle()` 통과, 이름 안의 `'` 는 `''` 로 이스케이프.
