# 다른 국가(마켓플레이스)로 복제하기

US 경량판을 JP / CA / UK / DE 등 다른 마켓플레이스용으로 만드는 절차.
**코드 구조는 그대로 재사용**하고, 바뀌는 건 (1) 시트 ID·gid (2) 통화 표기 (3) 브랜드명뿐입니다.

> ⚠ **가장 흔한 실패 원인은 코드가 아니라 리포트 언어입니다.**
> 이 대시보드는 컬럼을 **헤더 이름 문자열**로 찾습니다 (`header.indexOf('Units Ordered')`).
> Seller Central / 광고 콘솔을 일본어·독일어로 쓰면 헤더가 `注文された商品点数` 처럼
> 현지어로 내려와서 **전 행이 스킵되고 KPI 가 전부 0** 이 됩니다.
> → **Phase 1 을 건너뛰지 마세요.**

---

## 0. 준비물

| 항목 | 비고 |
|---|---|
| 대상 마켓플레이스 Seller Central 접근 | Business Reports 권한 |
| 대상 마켓플레이스 광고 콘솔 접근 | Campaign 리포트 다운로드 권한 |
| Google 스프레드시트 2개 | RAW 데이터용 + NOTES용 (새로 만듦) |
| 서비스 계정 | **US 것 재사용 가능** — 새로 만들 필요 없음 |
| Vercel 계정 | 국가별로 **별도 프로젝트** |
| GitHub 저장소 | 국가별로 별도 Private 저장소 권장 |

서비스 계정은 `rejuall-amz-us-dashboard@impactful-name-495400-k2.iam.gserviceaccount.com`
하나로 여러 국가 시트를 다 읽을 수 있습니다. 시트마다 **뷰어 공유**만 해주면 됩니다.
(이름에 `us` 가 들어 있지만 계정 이름은 기능과 무관합니다. 신경 쓰이면 새로 만들어도 되고,
그 경우 Vercel 환경변수 2개만 새 값으로 넣으면 됩니다.)

---

## 1. 리포트 언어를 English 로 고정 ← 최우선

두 콘솔 **모두** 확인해야 합니다. 한쪽만 영어면 그쪽 탭만 동작합니다.

1. **Seller Central** → 우측 상단 언어 설정 → **English**
   → Business Reports 를 다시 받아서 1행 헤더가 `Date`, `(Child) ASIN`,
   `Units Ordered`, `Ordered Product Sales`, `Sessions - Total` 인지 눈으로 확인
2. **광고 콘솔** → 언어 설정 → **English**
   → Campaign 리포트 헤더가 `Date range`, `Campaign name`, `Ad product`,
   `Total cost`, `Sales`, `Impressions`, `Clicks`, `Purchases` 인지 확인

### 영어로 못 바꾸는 경우 (또는 헤더가 계속 현지어인 경우)

`api/data.js` 에 별칭을 추가합니다. `idxOf` 를 아래처럼 바꾸면 됩니다.

```js
// 기존
const idxOf = (header, name) => header.indexOf(name);

// 별칭 지원 버전 — 첫 번째로 발견된 것을 씀
const ALIAS = {
  'Units Ordered':          ['注文された商品点数', 'Bestellte Einheiten'],
  'Ordered Product Sales':  ['注文商品売上', 'Umsatz bestellter Produkte'],
  'Sessions - Total':       ['セッション - 合計'],
  // … 필요한 만큼 추가
};
const idxOf = (header, name) => {
  for (const cand of [name, ...(ALIAS[name] || [])]) {
    const i = header.indexOf(cand);
    if (i >= 0) return i;
  }
  return -1;
};
```

> 위 현지어 문자열은 **예시입니다.** 실제 리포트를 받아 1행을 그대로 복사해 넣으세요.
> 추측한 문자열을 넣으면 조용히 0 이 됩니다.

### 광고 타입 이름도 현지어입니다

```js
const AD_TYPE = { 'Sponsored Products':'SP', 'Sponsored Brands':'SB', 'Sponsored Display':'SD' };
```

`Ad product` 값이 현지어면 매칭 실패 후 **전부 `SP` 로 폴백**합니다.
KPI 숫자는 맞지만 **광고 타입별 믹스 차트가 통째로 SP 로 보입니다** (조용한 오류).
현지어를 쓰면 키를 추가하세요:

```js
const AD_TYPE = {
  'Sponsored Products':'SP', 'Sponsored Brands':'SB', 'Sponsored Display':'SD',
  'スポンサープロダクト広告':'SP', 'スポンサーブランド広告':'SB', 'スポンサーディスプレイ広告':'SD',
};
```

---

## 2. 스프레드시트 2개 만들기

US 와 **동일한 구조**로 만듭니다. 가장 안전한 방법은 US 시트를 복제하고 데이터만 비우는 것입니다.

### 시트 A — RAW 데이터 (탭 2개)

| 탭 | 내용 | 헤더 위치 |
|---|---|---|
| ASIN 탭 | Sales & Traffic by ASIN (일별) | **1행 배너 / 2행 헤더 / 3행부터 데이터** |
| Campaign 탭 | Campaign 리포트 (SP/SB/SD) | 1행이 헤더 |

### 시트 B — NOTES (탭 1개)

컬럼: `Week` \| `기간` \| `Overview` \| `Sales` \| `Advertising`

### ID 와 gid 뽑기

시트 URL 에서 읽습니다:

```
https://docs.google.com/spreadsheets/d/  1AbC...XyZ  /edit#gid=  123456789
                                         └── 시트 ID ──┘        └─ gid ─┘
```

탭을 클릭할 때마다 주소창의 `gid=` 값이 바뀝니다. 3개(ASIN·Campaign·NOTES) 다 적어두세요.

> **gid 는 절대 바꾸지 마세요.** 탭 **이름**은 나중에 자유롭게 바꿔도 됩니다
> (코드가 gid → 이름을 매 요청마다 다시 조회하므로).

### 서비스 계정에 공유

**시트 2개 모두** → 공유 → 서비스 계정 이메일 → **뷰어**.
빠지면 배포 후 `403 PERMISSION_DENIED` 로 500 이 납니다. NOTES 만 공유하고 RAW 를
안 하는 실수가 US 때 실제로 있었습니다.

---

## 3. 코드 복제

```powershell
cd C:\Users\USER\Desktop\MD\rejuall-dashboard
Copy-Item weekly-lite weekly-lite-jp -Recurse -Exclude .git,node_modules,_raw_arrays.json
cd weekly-lite-jp
git init
```

`.git` 을 반드시 제외하세요 — 안 하면 US 저장소에 그대로 푸시됩니다.

### 3-1. 통화 표기 변경 — `index.html`

`'$'` 가 **5곳**에 하드코딩되어 있습니다. 상수로 모으는 걸 권장합니다.

`index.html` 의 `const fmt$ = ...` (약 595행) 위에 추가:

```js
/* ── 국가 설정 ── 통화 기호와 소수점 자릿수만 바꾸면 전 화면에 반영된다 */
const CUR  = '$';   // JP:'¥'  UK:'£'  DE:'€'  CA:'C$'
const CDEC = 2;     // 소수점 없는 통화(JPY)는 0
```

그리고 아래 지점들의 `'$'` 를 `CUR` 로 교체:

| 위치(대략) | 원본 | 교체 |
|---|---|---|
| 595 | `const fmt$ = n => '$' + …` | `CUR + …` |
| 825 | `callback:v=>'$'+(v/1000)+'K'` | `CUR+(v/1000)+'K'` |
| 851 | `fmt:v=>'$'+v.toFixed(2)` (AOV) | `CUR+v.toFixed(CDEC)` |
| 897 | `callback:v=>'$'+(v/1000).toFixed(1)+'K'` | `CUR+…` |
| 1008 | `callback:v=>'$'+(v/1000)+'K'` | `CUR+…` |

찾기 명령:

```powershell
Select-String -Path index.html -Pattern "'\$'|fmt\$ =" -AllMatches
```

### 3-2. 브랜드명 변경 — `index.html` 4곳

| 행 | 내용 |
|---|---|
| 6 | `<title>Dr. Rejuall US — Weekly Report (Lite)</title>` |
| 276 | `<div class="b-name">Dr. Rejuall US</div>` |
| 304 | `<h1 id="pageTitle">Dr. Rejuall US</h1>` |
| 447 | `const BRAND = 'Dr. Rejuall US';` |

### 3-3. 통화 문자열 파싱 — `api/data.js` (필요 시)

```js
const money = v => {
  const n = parseFloat(String(v ?? '').replace(/[$,%\s]/g, ''));
  return isNaN(n) ? 0 : n;
};
```

시트를 `UNFORMATTED_VALUE` 로 읽으므로 숫자 셀은 **숫자 그대로** 옵니다 →
보통 통화 기호를 만나지 않습니다. 다만 RAW 를 **텍스트로 붙여넣으면** 기호가 남습니다.

- `¥` `£` `€` 를 쓰는 국가: 정규식에 기호 추가 → `.replace(/[$¥£€,%\s]/g, '')`
- **유럽식 소수점(`1.234,56`)이면 위 함수는 틀린 값을 냅니다.** `1.234,56` → `1.23456`
  이 되어 **1000배 작아집니다.** 이 경우 시트에서 해당 열을 숫자 형식으로 바꾸는 게
  정답이고, 코드로 처리해야 하면 `,`→`.` 변환 후 `.` 천단위 제거 로직이 별도로 필요합니다.

> 배포 전에 **아무 주차 하나의 매출을 시트 합계와 직접 대조**하세요.
> 1000배·100배 오차는 이 지점에서만 발생합니다.

### 3-4. 시트 ID·gid

코드 기본값(`api/data.js` 21~28행)은 **건드리지 않아도 됩니다.**
Vercel 환경변수로 덮어쓰는 게 안전합니다 (코드에 국가별 값이 섞이지 않음).
로컬 오프라인 빌드를 쓸 거면 `_pull.mjs` 상단의 `MAIN_ID` / `NOTES_ID` / `TABS` 는
직접 고쳐야 합니다 (이건 환경변수를 안 봅니다).

---

## 4. Vercel 배포

```powershell
cd weekly-lite-jp
npx vercel            # Link to existing project? → N (새로 만듦)
                      # Project name? → rejuall-weekly-jp
npx vercel --prod
```

### 환경변수 (Settings → Environment Variables)

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 서비스 계정 `client_email` |
| `GOOGLE_PRIVATE_KEY` | `private_key` 전체 (`-----BEGIN…` ~ `…END-----\n`) |
| `SHEET_MAIN_ID` | 새 RAW 시트 ID |
| `SHEET_NOTES_ID` | 새 NOTES 시트 ID |
| `GID_ASIN` | ASIN 탭 gid |
| `GID_CAMPAIGN` | Campaign 탭 gid |
| `GID_NOTES` | NOTES 탭 gid |

**환경변수 추가·변경 후에는 Redeploy 해야 반영됩니다.**

---

## 5. 검증 (이 순서로)

```powershell
# 1) API 가 실데이터를 내는가
curl.exe -s "https://<도메인>/api/data?cb=1" | ConvertFrom-Json |
  Select-Object demo, updatedAt, @{n='weeks';e={$_.weeks.Count}}
```

- [ ] `demo: false` — `true` 면 환경변수 누락 또는 Redeploy 안 함
- [ ] `weeks` 배열이 비어 있지 않음
- [ ] 최신 주차의 **총매출을 시트에서 직접 합산해 대조** (통화 파싱 검증)
- [ ] 광고 KPI(Impressions·Clicks·CTR)가 `—` 가 아님 → `—` 면 Campaign 탭 미인식
- [ ] 광고 타입별 믹스 차트에 SP 외 타입도 나옴 → 전부 SP 면 `AD_TYPE` 현지어 문제
- [ ] NOTES 코멘트가 뜸 (해당 주차 행을 채운 경우)
- [ ] **연속 5~6회 호출해서 전부 200** — Vercel warm 컨테이너가 여러 개라
      한 번 성공했다고 끝이 아닙니다

```powershell
1..6 | ForEach-Object {
  $r = curl.exe -s -o NUL -w "%{http_code}" "https://<도메인>/api/data?cb=$_"
  Write-Output "$_ 회: $r"
}
```

### 증상별 원인

| 증상 | 원인 |
|---|---|
| `{"demo":true,"reason":"env vars not set"}` | 환경변수 누락 / Redeploy 안 함 |
| `403 PERMISSION_DENIED` | 시트를 서비스 계정에 공유 안 함 |
| `gid N not found` | gid 오타, 탭 삭제됨 |
| `Unable to parse range` 400 | 탭 이름 인용 문제 — **US 판에서 이미 수정됨**, 복제본은 안전 |
| **KPI 전부 0 / 주차 없음** | **헤더가 현지어** (Phase 1) 또는 ASIN 탭 행 오프셋 |
| 매출이 1000배 작음 | 유럽식 소수점 파싱 (3-3) |
| 광고 타입이 전부 SP | `AD_TYPE` 현지어 (Phase 1) |

---

## 6. 주간 운영 플로우 (국가 공통)

1. **매출** — Seller Central → Business Reports → Sales & Traffic **by ASIN, 일별**
   → ASIN 탭에 이어붙이기
2. **광고** — 광고 콘솔 → Reports → **Campaign 리포트**, **일~토 1주치**
   → Campaign 탭에 이어붙이기
3. **코멘트** — NOTES 시트 해당 주차 행의 Overview / Sales / Advertising 작성
   - 줄 앞에 `-` → 불릿 렌더링
   - `Week` 은 `W28` 또는 일요일 날짜(`2026-07-12`) 둘 다 인식
4. 대시보드 새로고침 — **재배포 불필요**, CDN 캐시로 최대 5분 지연

광고 리포트는 반드시 **일~토 1주치**로 받으세요. 코드가 `Date range` 의 기간 길이로
주간/월간을 자동 판정합니다 (일요일 시작 + 7일 = 주간, 20일 이상 = 월간 스냅샷, 그 외 무시).

---

## 7. 국가별로 바꾸는 것 / 그대로 두는 것

| 항목 | 국가별 변경 |
|---|---|
| 시트 ID · gid 3개 | **O** (환경변수) |
| 통화 기호 · 소수점 자릿수 | **O** (`CUR` / `CDEC`) |
| 브랜드명 4곳 | **O** |
| 헤더 별칭 · `AD_TYPE` | 리포트가 현지어일 때만 |
| Vercel 프로젝트 · GitHub 저장소 | **O** (분리) |
| 서비스 계정 | X (재사용) |
| 주차 축 (일~토) · 집계 로직 | X |
| 광고 주간/월간 자동 라우팅 | X |
| `WEEKS_SHOWN` (16주) | 선택 |

---

## 8. 복제 전 체크리스트

- [ ] Seller Central 언어 = English, 헤더 눈으로 확인
- [ ] 광고 콘솔 언어 = English, 헤더 눈으로 확인
- [ ] RAW 시트: ASIN 탭 **3행부터 데이터** 구조 맞음
- [ ] 시트 2개 **모두** 서비스 계정에 뷰어 공유
- [ ] Google Cloud 프로젝트에서 Sheets API 사용 설정됨
- [ ] `.git` 제외하고 복사 → `git init` 새로
- [ ] 새 GitHub 저장소 **Private** (실매출이 들어갑니다)
- [ ] 통화 기호 · 브랜드명 교체 완료
- [ ] `/api/data` → `demo:false`, 시트 합계와 대조 일치
- [ ] 연속 6회 호출 전부 200

> **저장소는 반드시 Private.** `data.sample.json` 과 오프라인 HTML 에 실제 매출이
> 그대로 들어갑니다. 한 번 Public 으로 푸시하면 나중에 Private 로 바꿔도
> git 이력과 크롤러 캐시에 남습니다.

---

## 9. 오프라인 공유 파일 (선택)

```powershell
cd weekly-lite-jp
node _pull.mjs        # 시트 3개 탭 → _raw_arrays.json  (MAIN_ID/NOTES_ID/TABS 먼저 수정)
node _test.mjs        # 집계 → data.sample.json
curl.exe -s -o _chartjs.js https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js
python _build.py      # → Dr_Rejuall_Weekly_Lite.html
```

- `_pull.mjs` 는 서비스 계정 키 파일이 필요합니다:
  `$env:REJUALL_SA_KEY="C:\path\to\key.json"; node _pull.mjs`
- `_build.py` 는 마지막에 `_chartjs.js` 를 지웁니다 (정상 동작).
- **`gviz/tq` 는 절대 쓰지 마세요** — 컬럼 타입을 추론해 날짜·숫자 열의 문자열 헤더를
  빈칸으로 반환하고, 그러면 헤더 이름 매칭이 전 행을 스킵합니다.

---

## 10. 이미 해결된 함정 (복제본에 재도입하지 마세요)

US 판에서 실제로 프로덕션 500 을 냈던 두 건입니다. 현재 코드에는 수정이 반영되어 있으니
`api/data.js` 를 직접 손볼 때 되돌리지 않도록 주의하세요.

1. **탭 제목 캐시를 모듈 전역에 두면 안 됩니다.**
   Vercel warm 컨테이너가 재사용되어, 시트에서 탭 이름을 바꾼 뒤에도 옛 이름을 계속 씁니다.
   컨테이너마다 상태가 달라 **"어떤 요청은 되고 어떤 요청은 500"** 인 증상이 납니다.
   → 캐시는 `handler` 안에서 `const titleCache = {}` 로 **요청 단위**로 만듭니다.
   (값이 아니라 Promise 를 캐시해 `Promise.all` 중복 요청을 막는 구조도 그대로 두세요.)

2. **A1 표기법에서 탭 이름은 작은따옴표로 감쌉니다.**
   `6-1 캠페인` 처럼 숫자로 시작하거나 하이픈·공백이 든 이름은 감싸지 않으면
   `Unable to parse range` 400 이 나서 대시보드 전체가 죽습니다.
   → `qTitle()` 을 통과시키고, 이름 안의 `'` 는 `''` 로 이스케이프합니다.
