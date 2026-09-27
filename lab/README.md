# AMZ Ads Lab — Dr Rejuall Brand

아마존 광고 콘솔 리포트를 주차 단위로 적재해 **서치텀·타겟팅·캠페인·제품**을 한 화면에서 판정하는 대시보드.

```
광고 콘솔 리포트 ─┬─ CSV 파일 → reports/ → (npm run load)  ─┬→ SQLite/Turso → /api → 대시보드
                  └─ Google 시트 ────→ (npm run update) ─────┘
```

입구가 두 개다. **대용량 리포트(서치텀·타겟팅)는 CSV 직접 적재를 쓴다.**
구글 시트는 스프레드시트당 셀 1,000만 개 한도가 있어 13열 기준 약 77만 행이 천장이고,
그 전에 브라우저가 붙여넣기를 버티지 못한다. 캠페인 리포트처럼 작은 건 시트가 편하다.

브라우저는 원본 행을 받지 않는다. 서버가 주차 창(window)을 합산해 사전 압축된 배열만 내려주므로
8주 합산도 payload 가 220KB 수준이고 localStorage 용량 제한이 없다.

---

## 빠른 시작 (로컬)

```bash
npm install
cp .env.example .env.local     # 값 채우기
npm run init-db                # 스키마 생성
npm run update                 # 시트 → DB 적재 + 정합성 검증
npm run dev                    # http://localhost:3000
```

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 로컬 서버 (정적 + `/api` + 비밀번호 게이트) |
| `npm run init-db` | `db/schema.sql` 적용 |
| `npm run load` | **CSV → DB 직접 적재 (미국).** `reports/us/` 를 읽는다. 경로·`--weeks=`·`--dry` 지원 |
| `npm run load:ca` | 캐나다 적재 — `reports/ca/` 를 읽는다 |
| `npm run load:au` | 호주 적재 — `reports/au/` 를 읽는다 |
| `npm run verify:ca` / `verify:au` | 마켓별 검증 |
| `npm run ingest` | 시트 → DB 적재. `--only=search_terms` `--weeks=2026-07-19` `--dry` 지원 |
| `npm run verify` | 주차별 커버리지·KPI·경고 리포트 |
| `npm run update` | ingest + verify |
| `node scripts/set-week.mjs 2026-06-21 --event --note="프라임데이"` | 행사주 표시 |

## 환경변수

| 이름 | 로컬 | Vercel |
|---|---|---|
| `TURSO_DATABASE_URL` | `file:./data/ads.db` 또는 `libsql://…` | `libsql://…` |
| `TURSO_AUTH_TOKEN` | 원격일 때만 | 필요 |
| `REJUALL_SA_KEY` | 서비스 계정 JSON 경로 | (미사용) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | — | 서비스 계정 이메일 |
| `GOOGLE_PRIVATE_KEY` | — | 서비스 계정 개인키 |
| `DASH_PASSWORD` | 비우면 게이트 꺼짐 | 필수 |
| `DASH_SECRET` | 쿠키 서명용 랜덤 | 필수 |

시트는 서비스 계정에 **뷰어로 공유**되어 있어야 한다.

---

## 주차 규칙 — 왜 일부 행을 버리는가

광고 콘솔 리포트는 같은 시트 안에 겹치는 부분 기간(`Date range`) 행이 섞여 들어온다.
이걸 그대로 합산하면 총계가 배로 뛴다. 그래서 **일요일 시작 + 정확히 7일** 인 행만 적재한다.

실측: 서치텀 8,749행 중 5,537행이 조각 기간 → 3,212행만 적재.
버린 행 수는 `ingest_log` 와 `npm run verify` 출력에서 확인할 수 있다.

주차 키는 `week_start` (일요일, `YYYY-MM-DD`). 같은 주차를 다시 적재하면
해당 주차만 삭제 후 재삽입하므로 몇 번 돌려도 결과가 같다.

## 데이터 소스

| 테이블 | 리포트 | 시트 탭 | 권장 입구 |
|---|---|---|---|
| `campaigns` | Campaign | `AD 캠페인` | 시트 (작다) |
| `search_terms` | Search term | `시트2` | **CSV** (크다) |
| `targets` | Targeting | `6-1 타겟팅` | **CSV** |
| `products` | Advertised product | 없음 | **CSV** (시트 탭 미연결) |

## CSV 직접 적재

1. 광고 콘솔에서 리포트를 **CSV** 로 내려받는다
2. 마켓 폴더에 넣는다 — `reports/us/` · `reports/ca/` · `reports/au/` (하위 폴더 재귀 탐색)
3. `npm run load` (미국) / `npm run load:ca` / `npm run load:au`

마켓(US/CA/AU)은 DB 의 `market` 열로 분리되고 대시보드 상단 토글로 전환한다.
`reports/` 바로 밑의 CSV 는 어느 마켓인지 알 수 없어 적재하지 않는다.

리포트 종류는 헤더로 자동 판별한다 (`Search term`/`Customer search term` → 서치텀,
`Advertised ASIN` → 광고제품, `Targeting` → 타겟팅, `Ad product` → 캠페인).
콘솔 다운로드본과 시트 붙여넣기본의 열 이름이 달라도(`Spend` vs `Total cost`) 둘 다 인식한다.
한 파일에 여러 주차가 섞여 있어도 주차별로 나눠 적재한다.

`reports/` 는 gitignore 된다 — 리포트 파일은 커밋되지 않는다.

### 처리량

| 대상 | 속도 | 50,000행 |
|---|---|---|
| 로컬 `file:./data/ads.db` | ~34,000 행/초 | 1.5초 |
| Turso 원격 (한국 → us-east-1) | ~1,500 행/초 | 33초 |

CSV 파싱·집계는 초당 20만 행 이상이라 병목이 아니다. 원격 쓰기가 전부다.
20만 행이면 약 2분. 5,000행을 넘으면 진행률을 표시한다.
대량 백필은 주차별 트랜잭션이라 중간에 끊겨도 이미 넣은 주차는 남고, 다시 실행하면 이어진다.

**xlsx 는 지원하지 않는다.** npm 의 SheetJS 등록본에 미수정 취약점이 있고,
대용량에서는 CSV 가 훨씬 빠르다. 엑셀에서 `다른 이름으로 저장 → CSV UTF-8` 로 변환하면 된다.

## 판정 기준

| 판정 | 조건 |
|---|---|
| 제외 후보 | 구매 0 & (클릭 ≥ 10 또는 지출 ≥ $10) |
| 수확·이관 | 구매 ≥ 3 & ACOS ≤ 목표 |
| 스케일업 | 구매 ≥ 2 & ACOS ≤ 목표 × 0.8 |
| 입찰 인하 | ACOS > 목표 × 1.3 |
| 관찰 | 나머지 |

임계값은 대시보드 **데이터·설정** 탭에서, 포트폴리오별 목표 ACOS 는 **포트폴리오** 탭에서 조정한다
(브라우저 localStorage 저장).

## 구조

```
lib/aggregate.mjs   적재 코어 — 시트·CSV 두 입구가 공유한다 (정규화가 갈라지면 안 된다)
lib/csv.mjs         의존성 없는 스트리밍 CSV 리더 (구분자·BOM·인용 자동 처리)
index.html          대시보드 (단일 파일, 빌드 없음)
login.html          비밀번호 입력 화면
middleware.js       Vercel Edge — 쿠키 없으면 /login 또는 401
api/weeks.js        주차 목록 + 행 수
api/data.js         ?weeks=… 합산 스냅샷
api/login.js        비밀번호 검증 → 서명 쿠키
lib/query.mjs       API 응답 포맷 (대시보드와의 계약)
lib/sources.mjs     시트 위치 · 헤더명 · 행 매퍼
lib/normalize.mjs   주차 판정, 숫자·문자 정규화
lib/auth.mjs        HMAC 쿠키 (Edge/Node 공용)
db/schema.sql       테이블 + 인덱스
```

`lib/query.mjs` 의 반환 형태를 바꾸면 `index.html` 의 `expand()` 도 같이 바꿔야 한다.

## 매주 하는 일

1. 광고 콘솔에서 Campaign / Search term / Targeting 리포트를 뽑는다
   — **날짜 범위는 일요일~토요일, 단위는 요약(Summary)**. 일별로 뽑으면 조각 기간이라 버려진다
2. 서치텀·타겟팅 CSV 는 `reports/` 에 넣고 `npm run load`
   캠페인은 시트에 append 하고 `npm run update`
3. `npm run verify` 로 경고 확인 — 경고가 나오면 원인을 먼저 해결
4. 행사·딜 주차는 `scripts/set-week.mjs` 로 표시 (WoW 급등 오경보 방지)

적재하면 배포된 사이트에 **즉시 반영된다** — Vercel 재배포가 필요 없다 (같은 Turso 를 읽는다).

`npm run verify` 경고 읽는 법:

- `… 없음` — 그 주차 리포트가 시트에 없다
- `커버리지 N%` — 리포트가 일부만 뽑혔다 (필터·기간 확인)
- `Campaign 을 초과` — 중복 적재. 시트에 같은 기간이 두 번 들어갔는지 확인
