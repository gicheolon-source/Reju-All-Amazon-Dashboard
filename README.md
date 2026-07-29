# Dr. Rejuall US — Weekly Report (Lite)

주간 보고 전용 **경량판** 대시보드. Overview / Sales / Advertising 3페이지.

기존 풀버전(`../index.html`)과의 차이는 **읽는 리포트 수**뿐입니다. 화면에 표시되는
매출·유닛·세션·Spend·Ad Sales·캠페인 상세·제품별 매출은 **완전히 동일**합니다.

| | 풀버전 | **Lite** |
|---|---|---|
| 읽는 탭 | ASIN + Campaign + Targeting + Search term (시트 2개 / 탭 4개) | ASIN + Campaign (**시트 1개 / 탭 2개**) |
| 코멘트 시트 | NOTES | NOTES (동일) |
| 주간 pull 행 수 | 약 49,000행 | 약 40,000행 (**−19%**) |
| 광고 탭 | 캠페인 표(2/3) + 광고 최적화 추천(1/3) | 캠페인 표 **전폭** |

> **왜 뺐나:** Targeting / Search term 리포트는 "광고 최적화 추천" 패널에만 쓰였고
> 표시 지표에는 전혀 기여하지 않습니다 (JSON diff로 검증 — `keywords` 필드 외 완전 동일).
> 키워드·네거티브 심층분석은 별도 광고 대시보드가 담당합니다.

---

## 1. 데이터 소스 — 시트 2개 / 탭 3개

### 시트 A `SHEET_MAIN_ID` = `1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao`

| gid | 리포트 | 용도 | 필수 컬럼 |
|---|---|---|---|
| `952475532` (`GID_ASIN`) | **Sales & Traffic by ASIN (일별)** | 매출·유닛·세션·제품별·TACOS 분모 | `Date`, `(Child) ASIN`, `Product Name`, `Units Ordered`, `Ordered Product Sales`, `Spend`, `Ad Sales`, `Sessions - Total` |
| `1710166971` (`GID_CAMPAIGN`) | **Campaign 리포트 (SP/SB/SD)** | 캠페인 성과 상세·타입별 믹스 | `Date range`, `Campaign name`, `Ad product`, `Portfolio name`, `Total cost`, `Sales`, `Clicks`, `Purchases` |

### 시트 B `SHEET_NOTES_ID` = `1GOClg8wNjUOJAQzcu2dGbENoMWrMCMd4vzx-LLqkFqA`

| gid | 탭 | 용도 | 컬럼 |
|---|---|---|---|
| `119883587` (`GID_NOTES`) | **NOTES** | 주간 특이사항 코멘트 (3페이지 각각) | `Week`, `기간`, `Overview`, `Sales`, `Advertising` |

- ASIN 탭은 **1행 배너 / 2행 헤더 / 3행부터 데이터**. Campaign·NOTES는 1행이 헤더.
- 컬럼은 **위치가 아니라 헤더 이름**으로 찾습니다 → 열 순서가 바뀌어도 안전. 단 **헤더 문자열은 바꾸지 마세요.**
- 매출·KPI는 전부 ASIN 탭에서 나옵니다 → Campaign 리포트가 없는 주차도 KPI는 정상 표시되고,
  캠페인 표만 `⚠ 주간 광고 리포트 미업로드` 로 비워집니다.
- NOTES는 실패해도 대시보드를 깨뜨리지 않습니다 (시트 미공유·헤더 변경 → 코멘트만 빈 상태).

### 주간/월간 자동 라우팅 (Campaign 리포트)

| `Date range` 패턴 | 판정 |
|---|---|
| **일요일 시작 + 7일치** (span 6일) | 해당 주(일~토) 광고 데이터 |
| **20일 이상** | 월간 스냅샷 (주간 데이터 없는 주차의 폴백) |
| 그 외 부분 조각 | 무시 |

→ 광고 콘솔에서 **일~토 1주치**로 pull 해서 이어붙이면 자동으로 해당 주차에 붙습니다.

---

## 2. Vercel 배포

`weekly-lite` 는 자체 `package.json` + `api/` 를 가진 독립 프로젝트입니다.
기존 풀버전과 **별도 Vercel 프로젝트**로 배포하세요.

### 방법 A — CLI (가장 빠름)

```bash
cd weekly-lite
npx vercel            # 첫 배포: 로그인 → 새 프로젝트 생성 → Preview URL
npx vercel --prod     # 운영 배포
```

`vercel` 이 묻는 것:
- *Set up and deploy?* → **Y**
- *Which scope?* → 본인 계정
- *Link to existing project?* → **N** (새로 만듦, 풀버전과 분리)
- *Project name?* → `rejuall-weekly-lite`
- *In which directory is your code located?* → **`./`** (이미 weekly-lite 안이므로)
- *Override settings?* → **N**

### 방법 B — GitHub 연동

리포에 푸시 후 Vercel → **Add New → Project → Import** →
**Settings → General → Root Directory** 를 **`weekly-lite`** 로 지정.
(이걸 안 하면 상위 폴더의 풀버전이 배포됩니다.)

### 환경변수 (Settings → Environment Variables)

**필수 2개만:**

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 서비스 계정 JSON 의 `client_email` |
| `GOOGLE_PRIVATE_KEY` | 서비스 계정 JSON 의 `private_key` 전체 (`-----BEGIN…` ~ `…END-----\n`, `\n` 포함 그대로) |

**선택 (미설정 시 코드 기본값 사용):**

| Name | 기본값 |
|---|---|
| `SHEET_MAIN_ID` | `1tlz01J78avbCMn2zObK1gN5-Sy1oPwz_VthdalC49ao` |
| `SHEET_NOTES_ID` | `1GOClg8wNjUOJAQzcu2dGbENoMWrMCMd4vzx-LLqkFqA` |
| `GID_ASIN` | `952475532` |
| `GID_CAMPAIGN` | `1710166971` |
| `GID_NOTES` | `119883587` |
| `WEEKS_SHOWN` | `16` |

> 풀버전용 `SHEET_SEARCH_ID` / `GID_TARGET` / `GID_SEARCH` 는 Lite 가 무시합니다.

환경변수 추가·변경 후에는 **Redeploy** 해야 반영됩니다.

### 배포 전 체크

- [ ] 스프레드시트 **2개 모두** 서비스 계정 이메일에 **뷰어** 공유 (빠지면 403)
- [ ] Google Cloud 프로젝트에서 **Google Sheets API 사용 설정**
- [ ] 배포 후 `https://<도메인>/api/data` 직접 열어 `"demo": false` 와 `weeks` 배열 확인

문제 진단:

| 증상 | 원인 |
|---|---|
| `{"demo": true, "reason": "env vars not set"}` | 환경변수 누락 또는 Redeploy 안 함 |
| `{"error": "... 403 ..."}` | 시트를 서비스 계정에 공유하지 않음 |
| `{"error": "... gid N not found ..."}` | gid 오타, 또는 탭이 삭제/이동됨 |
| KPI 전부 0 / 주차 없음 | ASIN 탭 헤더(`Date` 등)가 변경됨 |

---

## 3. 주간 운영 플로우

1. **매출**: Seller Central → Business Reports → Sales & Traffic (by ASIN, 일별) → ASIN 탭에 이어붙이기
2. **광고**: 광고 콘솔 → Reports → **Campaign 리포트만** 일~토 1주치 → Campaign 탭에 이어붙이기
3. **코멘트**: NOTES 시트에 해당 주차 행의 Overview / Sales / Advertising 칸 작성
   - 줄 앞에 `-` 를 쓰면 불릿으로 렌더링됩니다
   - `Week` 값은 `W28` 또는 일요일 날짜(`2026-07-12`) 둘 다 인식
4. 대시보드 새로고침 (CDN 캐시로 최대 5분 지연)

---

## 4. 오프라인 공유 파일 만들기

시트/서버 없이 열리는 단일 HTML (카톡·메일 첨부용):

```bash
cd weekly-lite
node _pull.mjs        # 시트 3개 탭 → _raw_arrays.json
node _test.mjs        # 집계 → data.sample.json
curl -s -o _chartjs.js https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js
python _build.py      # → Dr_Rejuall_Weekly_Lite.html (Chart.js + 데이터 내장)
```

- `_pull.mjs` 는 `export?format=csv` 를 씁니다. **`gviz/tq` 를 쓰면 안 됩니다** —
  컬럼 타입을 추론해서 날짜·숫자 열의 문자열 헤더(`Date`, `Campaign ID` 등)를 빈칸으로 반환하고,
  그러면 헤더 이름으로 컬럼을 찾는 집계 로직이 전 행을 스킵합니다.
- 로컬 프리뷰(`index.html` 직접 열기)는 `/api/data` 실패 시 `data.sample.json` 으로 폴백합니다.

---

## 파일 구조

| 파일 | 역할 | 배포 |
|---|---|---|
| `index.html` | SPA 프론트엔드 (Chart.js CDN) | O |
| `api/data.js` | Vercel Function — ASIN + Campaign + NOTES 집계 | O |
| `package.json` | `google-auth-library` 의존성 | O |
| `data.sample.json` | `/api/data` 실패 시 폴백 샘플 | O |
| `Dr_Rejuall_Weekly_Lite.html` | 오프라인 단일 파일 (공유용) | — |
| `_pull.mjs` / `_test.mjs` / `_build.py` | 로컬 수집·집계·빌드 스크립트 | — |
