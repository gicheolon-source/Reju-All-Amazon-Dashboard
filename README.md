# AMZ Ads Lab — Dr Rejuall Brand

아마존 광고 콘솔 리포트를 주차 단위로 적재해 **서치텀·타겟팅·캠페인·제품**을 한 화면에서 판정하는 대시보드.

```
광고 콘솔 리포트 → Google 시트 → (npm run update) → SQLite/Turso → /api → 대시보드
```

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

| 테이블 | 리포트 | 시트 |
|---|---|---|
| `campaigns` | Campaign | 메인 시트 `AD 캠페인` |
| `search_terms` | Search term | 서치텀 시트 `시트2` |
| `targets` | Targeting | 메인 시트 `6-1 타겟팅` |
| `products` | Advertised product | **미연결** — 탭 생성 후 `lib/sources.mjs` 의 `products.gid` 를 채우면 제품별 탭이 켜진다 |

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

1. 광고 콘솔에서 Campaign / Search term / Targeting 리포트를 뽑아 시트에 append
2. `npm run update` — 경고가 나오면 원인을 먼저 해결
3. 행사·딜 주차는 `scripts/set-week.mjs` 로 표시 (WoW 급등 오경보 방지)

`npm run verify` 경고 읽는 법:

- `… 없음` — 그 주차 리포트가 시트에 없다
- `커버리지 N%` — 리포트가 일부만 뽑혔다 (필터·기간 확인)
- `Campaign 을 초과` — 중복 적재. 시트에 같은 기간이 두 번 들어갔는지 확인
