# Reju-All Amazon Dashboard (통합)

아래 3개 리포를 **하나의 Vercel 프로젝트**로 합친 모노레포. 각 원본의 커밋 히스토리는 subtree 병합으로 보존돼 있다.

| 경로 | 원본 리포 | 내용 |
|---|---|---|
| `/` | — | 허브 (4개 대시보드 링크) |
| `/weekly` | [rejuall_gl_amz_weekly](https://github.com/ethan-elpapa/rejuall_gl_amz_weekly) (루트) | US 주간 리포트 Lite |
| `/weekly-intl` | [rejuall_gl_amz_weekly](https://github.com/ethan-elpapa/rejuall_gl_amz_weekly) `/weekly-intl` | 다국가 주간 리포트 |
| `/inventory` | [inventory-dashboard](https://github.com/ethan-elpapa/inventory-dashboard) | 재고 관제 (FBA + 3PL) |
| `/lab` | [rejuall_us_lab](https://github.com/ethan-elpapa/rejuall_us_lab) | AMZ Ads Lab (비밀번호 게이트) |

## 폴더 구조

```
index.html              허브
api/weekly/data.js      ← weekly/api/data.js
api/weekly-intl/data.js ← weekly-intl/api/data.js
api/inventory/sheet.mjs ← inventory/api/sheet.mjs
api/lab/{data,weeks,login}.js  ← lab/api/*  (lab/lib/* 를 import)
middleware.js           Lab 비밀번호 게이트 (/lab, /api/lab 에만 적용)
weekly/ weekly-intl/ inventory/ lab/   각 대시보드 정적 파일·문서·로컬 도구
```

Vercel 은 루트 `api/` 만 함수로 인식하므로 API 를 대시보드별 하위 경로로 옮기고, 각 화면의 fetch 경로를 맞춰 바꿨다.
그 외 집계·판정 로직은 원본 그대로다. 각 폴더의 README / CLAUDE.md 규칙은 그대로 유효하다
(단 `/api/data` 같은 경로 표기는 위 표의 새 경로로 읽는다).

## Vercel 환경변수 (한 프로젝트에 전부)

| 키 | 쓰는 곳 | 비고 |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | weekly · weekly-intl · inventory · lab | **공용.** 모든 시트를 이 서비스 계정에 뷰어 공유해야 한다 |
| `SHEET_MAIN_ID` `SHEET_NOTES_ID` `GID_ASIN` `GID_CAMPAIGN` `GID_NOTES` | weekly | 선택 (코드 기본값 있음) |
| `SHEET_XX_MAIN_ID` `GID_XX_ASIN` `GID_XX_CAMPAIGN` `SHEET_XX_NOTES_ID` `GID_XX_NOTES` `DEFAULT_COUNTRY` | weekly-intl | XX = US·CA·UK·AU·AE. US 는 기본값 있음 |
| `WEEKS_SHOWN` | weekly · weekly-intl | 선택, 기본 16 (두 대시보드 공용) |
| `SHEET_ID_XX` `SHEET_TAB_TARGETS` `SHEET_TAB_DATA` | inventory | XX = 국가코드 |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | lab | 필수 |
| `DASH_PASSWORD` / `DASH_SECRET` | lab | 게이트. 비우면 게이트 꺼짐 |

키 이름이 서로 겹치지 않으므로 기존 3개 Vercel 프로젝트의 환경변수를 그대로 모아 넣으면 된다.
단 원본 프로젝트들이 **서로 다른 서비스 계정**을 썼다면, 한 계정을 골라 나머지 시트도 그 계정에 공유해야 한다.

## 로컬

```bash
npm install
npm run dev          # http://localhost:3000 — 전체 사이트 + /api + Lab 게이트
npm test             # inventory smoke test
npm run lab:update   # Lab: 시트 → DB 적재 + 검증 (lab/.env.local 필요)
npm run lab:load     # Lab: lab/reports/us/ CSV 적재
```

weekly / weekly-intl 의 `_pull.mjs` · `_build.py` 등 로컬 도구는 각 폴더 안에서 실행한다.
