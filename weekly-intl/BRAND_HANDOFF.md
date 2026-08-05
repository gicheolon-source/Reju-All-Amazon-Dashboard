# 다른 브랜드로 이식하기 — 인수인계 문서

> **이 문서를 읽는 Claude 에게**
> 이 문서는 Dr. Rejuall 주간 대시보드를 **다른 브랜드**로 이식하기 위한 인수인계서다.
> 사용자가 이 문서와 함께 `weekly-intl/` 폴더를 줬을 것이다. 없다면 먼저 요청하라 —
> 이 문서만으로는 코드를 복원할 수 없다 (`index.html` 64KB + `api/data.js` 22KB).
>
> **먼저 §2 를 읽고 §7 순서대로 진행하라.** §5 의 함정들은 전부 실제로 발생한 것이고,
> 공통점은 **에러 없이 숫자만 조용히 틀리는 것**이다. 검증 없이 넘어가지 마라.

---

## 1. 받아야 할 것

```
weekly-intl/
├── index.html          SPA 프런트엔드 (Chart.js CDN)      ← 배포
├── api/data.js         Vercel Function, 시트 → 주간 집계   ← 배포
├── package.json        google-auth-library 의존성          ← 배포
├── README.md           운영 문서
├── NEW_COUNTRY_SETUP.md  국가 추가 절차
├── BRAND_HANDOFF.md    이 문서
├── _check.mjs          시트 점검 (ASIN 탭 자동 탐색·헤더·날짜·광고열)
├── _notes.mjs          코멘트 시트 점검
├── _camp.mjs           캠페인 리포트 점검 (Date range 라우팅 판정)
├── _pull.mjs / _test.mjs / _build.py   로컬 수집·집계·오프라인 빌드
└── .gitignore
```

배포에 필요한 것은 `index.html` · `api/data.js` · `package.json` 3개뿐이다.
`_*.mjs` 는 로컬 진단용이지만 **§7 에서 반드시 쓴다.**

## 2. ⚠ `weekly-lite` 를 베이스로 쓰지 마라

같은 저장소 루트에 `weekly-lite`(US 단일 국가판)가 있다. 겉보기엔 더 단순해서
브랜드 이식 베이스로 적합해 보이지만, **이번 개발에서 잡은 버그가 하나도 반영되어
있지 않다.** 실측 확인 결과:

| 수정 | weekly-lite | weekly-intl |
|---|---|---|
| 헤더 표기 정규화 (`normHdr`) | 없음 | 있음 |
| 마침표 날짜 파싱 (`2026. 8. 2`) | 없음 | 있음 |
| Campaign 리포트 폴백 (`adSrc`) | 없음 | 있음 |
| 광고열 부분입력 감지 (`spendDays`) | 없음 | 있음 |
| 마지막 완료 주차로 열기 (`defaultWeekIndex`) | 없음 | 있음 |
| 포트폴리오 필터 소실 수정 | 없음 | 있음 |

`weekly-intl` 은 국가 1개만 두고도 정상 동작한다. **단일 마켓 브랜드도 이쪽을 쓰라.**

---

## 3. 아키텍처 (10줄)

```
Google Sheets (브랜드·국가별)
   ASIN 탭      Sales & Traffic by ASIN 일별  → 매출·유닛·세션·광고비·광고매출
   Campaign 탭  Campaign 리포트 (SP/SB/SD)    → 노출·클릭·캠페인 표
   NOTES 시트   주간 코멘트
        ↓  서비스 계정 JWT (spreadsheets.readonly)
/api/data?country=XX   Vercel Function
   gid → 탭 제목 해석 → values 읽기 → 일~토 주간 집계
   Cache-Control: s-maxage=300  (시트 수정 후 최대 5분, 재배포 불필요)
        ↓
index.html   국가 셀렉터 · Overview / Sales / Advertising 3페이지
```

핵심 설계 두 가지:
- **컬럼은 위치가 아니라 헤더 이름으로 찾는다** → 열 순서 변경에 안전
- **탭은 gid 로 찾는다** → 탭 이름 변경에 안전 (단 gid 는 바뀌면 안 됨)

---

## 4. 브랜드 교체 체크리스트

### 4-1. 반드시 지워야 하는 것 — 이전 브랜드 시트 ID가 코드에 박혀 있다

`api/data.js` 의 `COUNTRIES.US.sheets` 에 **Dr. Rejuall 의 US 시트 ID가 하드코딩**되어
있다. 지우지 않으면 새 브랜드 대시보드가 이전 브랜드 매출을 읽는다.

```js
US: { label:'United States', …,
      sheets: {                                   // ← 이 블록 전체를 삭제하고
        mainId: '1tlz01J78avb…',                  //   환경변수로만 받게 하라
        gidAsin: 952475532, gidCampaign: 1710166971,
        notesId: '1GOClg8wNjUO…', gidNotes: 119883587,
      } },
```

같은 이유로 `_pull.mjs` 상단의 `MAIN_ID` / `NOTES_ID` / `TABS` 도 교체 대상이다.

### 4-2. 브랜드·국가 설정

| 파일 | 심볼 | 내용 |
|---|---|---|
| `api/data.js` | `COUNTRIES` | 국가·통화 표. 국가 추가/제거는 여기 한 줄 |
| `api/data.js` | `DEFAULT_COUNTRY` | 최초 진입 국가 (기본 `US`) |
| `index.html` | `BRAND_BASE` | 브랜드명 (사이드바·`document.title` 에 반영) |
| `index.html` | `<title>` | 6행 |
| `index.html` | `FALLBACK_COUNTRIES` | API 를 못 읽을 때 셀렉터용 표시 전용 목록 |

`index.html` 의 브랜드명은 `BRAND_BASE` 한 곳만 바꾸면 된다 —
사이드바·제목·문서 타이틀 모두 여기서 파생된다.

### 4-3. 브랜드별로 다시 정해야 하는 기준값

```js
const ACOS_TARGET = 25;            // 양호/주의 경계
const STATUS_OVER = 50;            // 주의/초과 경계
const MIN_CAMP_SPEND_DEFAULT = 100; // 캠페인 표 '전체 보기' 하한 (현지 통화)
```

이건 Dr. Rejuall 기준이다. 마진 구조가 다른 브랜드는 그대로 쓰면 안 된다.
`MIN_CAMP_SPEND_DEFAULT` 는 **환율이 아니라 그 마켓의 실제 캠페인 광고비 규모**를
보고 정하라 (§5-6 참고).

### 4-4. 환경변수 (Vercel)

공통 2개:

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 서비스 계정 `client_email` |
| `GOOGLE_PRIVATE_KEY` | `private_key` 전체 (`\n` 이스케이프·실제 개행 둘 다 동작) |

국가별 (`XX` = `US`·`CA`·`UK`·`AU`·`AE`…):

| Name | 필수 | 비고 |
|---|---|---|
| `SHEET_XX_MAIN_ID` | **O** | ASIN 탭이 있는 시트 |
| `GID_XX_ASIN` | **O** | |
| `GID_XX_CAMPAIGN` | — | 없으면 노출·클릭·CTR·캠페인 표만 빔 |
| `SHEET_XX_NOTES_ID` | — | 미설정 시 MAIN_ID |
| `GID_XX_NOTES` | — | 없으면 코멘트만 빔 |

> 필수는 `SHEET_XX_MAIN_ID` + `GID_XX_ASIN` 둘뿐이다.
> **시트 ID·gid 는 비밀이 아니다** → Vercel 의 `Sensitive` 를 끄는 편이 낫다.
> 켜두면 나중에 값을 확인할 수 없어 대조가 불가능하다.
> 서비스 계정 키 2개는 반드시 Sensitive 유지.

### 4-5. 서비스 계정

새 브랜드는 **새 서비스 계정을 만드는 것을 권한다.** 하나를 공유하면
Google Sheets API 분당 할당량을 공유하고(§5-7), 키 하나가 노출되면 두 브랜드
시트가 전부 열린다. 만든 뒤 각 시트를 그 이메일에 **뷰어 공유**해야 한다.

---

## 5. 실제로 발생한 함정 — 전부 "에러 없이 숫자만 틀림"

### 5-1. 헤더 표기가 마켓마다 다르다 (KPI 가 조용히 0)

Amazon 리포트 컬럼명이 마켓별로 미묘하게 다르다. 실측:

| 컬럼 | US | CA | AU |
|---|---|---|---|
| 유닛 | `Units Ordered` | `Units ordered` | `Units ordered` |
| 매출 | `Ordered Product Sales` | `Ordered Product Sales` | `Ordered product sales` |
| 세션 | `Sessions - Total` | `Sessions – Total` (**EN DASH** U+2013) | `Sessions - Total` |

정확 일치만 하면 전 행이 스킵되어 **해당 지표가 전 주차 0** 이 된다. 에러도 로그도 없다.
→ `idxOf` 가 대소문자·대시 종류(`‐‑‒–—―−`)·연속 공백을 무시하고 비교한다.

**부분 일치(`includes`)는 쓰지 마라.** `Sessions - Total` 이 `Sessions - Total - B2B` 를
잡으면 B2B 수치가 섞인다. 정규화 후에도 완전 일치여야 한다.

**리포트 언어가 현지어면 이것으로도 못 막는다.** Seller Central·광고 콘솔 언어를
English 로 고정하는 것이 1순위다. 불가하면 `idxOf` 에 별칭을 추가하되,
반드시 실제 리포트 1행을 복사해 넣어라 — 추측한 문자열은 조용히 0 이 된다.

광고 타입도 같은 문제다. `AD_TYPE` 의 `'Sponsored Products'` 가 현지어면 전부 `SP` 로
폴백해 **KPI 는 맞는데 타입별 믹스 차트만 거짓**이 된다.

### 5-2. 날짜 구분자가 마침표인 시트 (최근 5주가 사라짐)

AE 시트에서 발생. Date 열에 두 형식이 섞여 있었다.

```
1,024행  "2025- 10- 27"   하이픈 → 정상
  238행  "2026. 6. 26"    마침표 → pdate 가 null → 행 통째로 스킵
    1행  "Date"           데이터 중간에 섞인 머리글
```

스킵된 238행은 2026-06-26 ~ 08-02 구간, 매출 109,600 이었다. 결과적으로 **최근 5주가
대시보드에 아예 없었고** 주차 수는 16개로 정상이라 겉보기엔 멀쩡했다.
→ `pdate` 가 `[-/.]` 를 모두 받고, 뒤에 붙는 마침표(`2026.8.2.`)도 허용한다.

**새 브랜드 시트를 붙일 때 `_check.mjs` 로 날짜 범위를 먼저 확인하라.**
최신 날짜가 예상보다 과거면 이 문제다.

### 5-3. 광고 KPI 와 캠페인 표의 출처가 다르다

- **Ad Spend · Ad Sales · ACOS · TACOS · ROAS** → ASIN 탭의 `Spend` · `Ad Sales`
- **노출 · 클릭 · CTR · 캠페인 표** → Campaign 탭

ASIN 탭 광고열이 안 채워진 주차는 캠페인 표에 광고비가 찍히는데 KPI 는 0 이 된다.
`ACOS 0.0%` 는 누락이 아니라 **"효율 완벽"이라는 정반대 신호**다.
→ ASIN 쪽이 비었고 Campaign 쪽에 값이 있으면 Campaign 의 `Total cost`·`Sales` 를
쓰고 `adSrc:'campaign'` 으로 표시한다.

**두 출처는 값이 다르다** — US 실측 ASIN `$33,592` vs Campaign `$42,152` (약 25% 차이).
그래서 어느 쪽을 썼는지 화면에 밝힌다. 국가 간 ACOS 비교 시 기준 차이를 감안해야 한다.

### 5-4. 광고열이 '일부 날짜만' 채워진 주차

UK W29 는 `Ad Sales` 가 7/19 하루만 채워져 £391 이었다. 합계가 0 이 아니라서
"한쪽이 0" 조건에 안 걸리고 **ACOS 461.4%** 가 나왔다 (실제 47.1%).
→ 한 주 안에서 `Spend` 가 있는 날 수 ≠ `Ad Sales` 가 있는 날 수면 미완성으로 본다.
비율·배수 같은 임의 기준이 아니라 **날짜 수 불일치라는 사실**만 쓴다.

폴백할 때는 `spend`·`sales` 를 **둘 다** Campaign 에서 가져와라. ASIN 의 분자와
Campaign 의 분모를 섞으면 기준이 다른 값으로 ACOS 를 만들게 된다.

### 5-5. 대시보드가 진행 중인 주차로 열린다

`current = WEEKS.length - 1` 은 항상 최신 주차다. 오늘이 화요일이면 2일치만 집계된
주가 열려서 **매출이 폭락한 것처럼 보이고** 그 주 광고 리포트는 아직 없으니
캠페인 표가 비어 "데이터 미반영"으로 읽힌다. 실제로 이 오해가 발생했다.
→ `defaultWeekIndex()` 가 종료일이 지난 마지막 완료 주차를 고른다.

### 5-6. 캠페인 표 하한이 포트폴리오를 선택지에서 지운다

```js
campRows = src.campaigns.filter(c => c.spend >= MIN_CAMP_SPEND);
populateCampFilter();   // ← 걸러진 목록으로 드롭다운을 만들면 안 된다
```

소속 캠페인이 전부 하한 미달인 포트폴리오는 **선택 자체가 불가능**해져 존재가
화면에서 사라진다. 실측: US W30 은 `PDRN Max` 15개가 통째로, UK·AU 는 7종 중 3종이
목록에서 없어졌다.
→ 드롭다운은 **필터 없는 전체**로 만들고, 하한은 '전체 보기' 일 때만 적용한다.
숨긴 개수를 화면에 밝힌다.

`MIN_CAMP_SPEND` 를 국가별로 다르게 둘 때는 **환율이 아니라 실제 캠페인 규모**를 보라.
AE 를 환율만 보고 300 으로 올렸다가 38개 중 4개만 남아 철회했다.

### 5-7. Sheets API 분당 할당량

캐시를 우회해 몰아치면 `429` 가 나고 **같은 서비스 계정을 쓰는 다른 대시보드까지 500**
이 된다. 실제로 검증 중 운영 대시보드를 일시 다운시켰다.

실사용은 안전하다 — `s-maxage=300` 으로 국가당 원본 호출이 5분에 1회다.
**검증할 때 캐시 버스터로 연속 호출하지 마라.** 간격을 두고 적은 횟수로 확인하라.

### 5-8. 이미 고쳐진 것 — 되돌리지 마라

1. **탭 제목 캐시를 모듈 전역에 두면 안 된다.** Vercel warm 컨테이너가 재사용되어
   탭 이름을 바꾼 뒤에도 옛 이름을 써서 **"어떤 요청은 되고 어떤 요청은 500"** 이 된다.
   → `handler` 안에서 `const titleCache = {}` 로 요청 단위 생성. Promise 를 캐시해
   `Promise.all` 중복 요청을 막는 구조도 유지.
2. **A1 표기법에서 탭 이름은 작은따옴표로 감싼다.** `6-1 캠페인` 처럼 숫자로 시작하거나
   하이픈·공백이 든 이름은 `Unable to parse range` 400 이 난다. 이름 안의 `'` 는 `''`.
3. **`gviz/tq` 를 쓰지 마라.** 컬럼 타입을 추론해 날짜·숫자 열의 문자열 헤더를 빈칸으로
   반환하고, 그러면 헤더 이름 매칭이 전 행을 스킵한다.

---

## 6. Campaign 리포트 주간/월간 라우팅

`Date range` 의 기간 길이로 판정한다.

| 패턴 | 판정 |
|---|---|
| 일요일 시작 + 7일 (span 6) | 해당 주 데이터 |
| 20일 이상 | 월간 스냅샷 (주간 없는 주차 폴백) |
| 그 외 | **무시** (중복 합산 방지) |

부분 기간으로 받은 행은 조용히 제외된다. CA 시트에 `span 1·3·4·4·5` 인 행이 5종
있었고 전부 무시됐다. **광고 콘솔에서 일~토 정확히 7일치로 주차별로 받아야 한다.**
`_camp.mjs` 가 어떤 `Date range` 가 유효/무시인지 그대로 보여준다.

---

## 7. 구축 순서 (검증 게이트 포함)

### Step 1 — 리포트 언어 확인 (가장 먼저)

Seller Central·광고 콘솔 **둘 다** English 로 고정하고, 리포트를 받아 1행 헤더를
눈으로 확인한다. 이걸 건너뛰면 이후 모든 숫자를 의심해야 한다.

### Step 2 — 시트 생성 + 서비스 계정 공유

ASIN 탭은 **1행 배너 / 2행 헤더 / 3행부터 데이터** 구조여야 한다.
시트 전부를 서비스 계정에 뷰어 공유. 빠지면 `403 PERMISSION_DENIED`.

### Step 3 — 코드 복제 + 브랜드 교체

```bash
robocopy weekly-intl <새폴더> /E /XD .git node_modules /XF _raw_arrays.json data.sample.json
```

`.git` 을 반드시 제외하라 (안 하면 이전 브랜드 저장소로 푸시된다).
그다음 §4-1(하드코딩 시트 ID 삭제) → §4-2 → §4-3 순서로 교체.

### Step 4 — 시트 점검 ★ 배포 전에 반드시

```bash
node _check.mjs <SHEET_ID>          # ASIN 탭 자동 탐색·헤더·날짜 범위·광고열
node _camp.mjs <SHEET_ID> <GID>     # Campaign 리포트 + Date range 라우팅
node _notes.mjs <SHEET_ID>          # 코멘트 시트
```

`_check.mjs` 는 탭 제목에 의존하지 않고 **헤더로 ASIN 탭을 찾는다.**
사용자가 알려준 gid 가 ASIN 탭이 아닌 경우가 실제로 두 번 있었다(UK·AU 모두
`데일리 매출` 탭 gid 를 줬고 필수컬럼 0/8 이었다). 이 스크립트가 잡아준다.

**게이트:** 필수 컬럼 8/8, 날짜 범위 최신, 유닛·세션 0인 주차 0개.
하나라도 어긋나면 배포하지 말고 §5-1·5-2 를 보라.

### Step 5 — 배포

```bash
npx vercel && npx vercel --prod
```
GitHub 연동이면 **Root Directory 를 해당 폴더로 지정**. 저장소는 반드시 **Private**
(집계 산출물에 실매출이 들어간다). 환경변수 추가·변경 후 **Redeploy 필수**.

### Step 6 — 배포 검증

```bash
curl -s "https://<도메인>/api/data?country=XX"
```

- `demo:false` · `weeks` 비어있지 않음 · `country`·`currency` 정확
- **최신 주차 총매출을 시트에서 직접 합산해 대조** (통화 파싱 검증)
- 노출·클릭·CTR 이 `—` 가 아님
- 광고 타입 믹스에 SP 외 타입도 나옴 (전부 SP 면 §5-1)
- 화면이 **마지막 완료 주차**로 열림
- 포트폴리오 드롭다운에 모든 포트폴리오가 있음 (§5-6)
- **간격을 두고 5~6회 호출해 전부 200** (warm 컨테이너가 여러 개) — 단, 몰아치지 말 것

---

## 8. 하지 말 것

- `weekly-lite` 를 베이스로 쓰기 (§2)
- `COUNTRIES.US.sheets` 하드코딩 방치 (§4-1)
- 헤더 매칭에 부분 일치 사용 (§5-1)
- 노출·클릭을 ASIN 탭으로 폴백 — US 실측 20~35% 낮아 CTR 이 구조적으로 부풀려진다.
  **보존할 값이 있으면 폴백하지 않고, 없을 때만 폴백한다**가 원칙이다 (§5-3)
- 검증 중 캐시 우회 연속 호출 (§5-7)
- 완전히 채워진 주차의 값을 임의 보정 — UK W26 의 ACOS 101.4% 는 데이터가 온전한
  상태의 실제 값이다. 이상해 보여도 손대지 말고 그대로 두라
- `data.sample.json` 커밋 — 배포 시 무인증 공개되고, 한 국가 스냅샷이 올라가면
  프런트엔드가 그 국가로 셀렉터를 잠근다 (`.gitignore` 에 이미 있음)

---

## 9. 참고 — 상세 문서

| 문서 | 내용 |
|---|---|
| `README.md` | 환경변수 전체·시트 구조·주간 운영 플로우·증상별 원인 표 |
| `NEW_COUNTRY_SETUP.md` | 같은 브랜드에 국가를 추가하는 절차 |

이 문서는 **브랜드 이식**, `NEW_COUNTRY_SETUP.md` 는 **국가 추가**용이다.
