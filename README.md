# 재고 관제 대시보드 (Amazon FBA + 3PL)

아마존 US/JP 재고 운영 대시보드. **단일 파일 웹앱** (`index.html`) — 빌드 없음, 프레임워크 없음, Vercel 정적 배포.

## 배포

`index.html` 하나를 Vercel에 올리면 끝. 빌드 설정 불필요.

## 테스트

```bash
node test/smoke_test.js
```

DOM을 스텁한 헤드리스 테스트. CSV 파서, 계산 로직(calcRow), 6개 뷰 렌더링을 검증한다.
**index.html을 수정하면 반드시 이 테스트를 돌릴 것.** 특히 `document.getElementById` 대상 요소를
지우거나 이름을 바꿀 때 — 과거에 제거된 요소를 참조하는 코드가 남아 전체 렌더링이 죽은 사고가 있었다.
테스트는 실제 브라우저처럼 "존재하지 않는 id → null"로 동작한다.

## 아키텍처 (하이브리드 입력 구조)

하나의 데이터는 반드시 한 곳에서만 입력한다:

| 입력 위치 | 데이터 | 흐름 |
|---|---|---|
| 구글 시트 | 월별 목표 + 월초 확보 개월수, 판매·재고(Data), 제품 목록 | 시트(비공개) → `/api/sheet` 서비스 계정 프록시가 CSV로 변환 → `sheetLoad()`가 fetch → S.products/S.coverage 덮어씀 (읽기 전용, CDN 30초 캐시) |
| 웹 | Pipeline(발송 로그), 설정값 | 변경 → `save()` → localStorage + Supabase RPC `save_dashboard` (수정 암호 서버 검증) |
| 웹 (보기 전용) | Dashboard, 월별 계획 | 계산 결과 표시 |

### index.html 상단 설정 상수

```js
SUPABASE_URL / SUPABASE_ANON_KEY   // 비우면 로컬 모드 (localStorage만)
SHEET = { US:{targets, data}, JP:{...} }  // 기본값은 /api/sheet 프록시 경로.
                                          // 공개 게시 CSV URL을 직접 넣어도 동작한다.
                                          // 비우면 해당 탭이 웹 직접 입력 모드로 폴백
```

### Vercel 환경변수 (`/api/sheet` 전용)

| 키 | 용도 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 이 주소로 시트를 **뷰어 공유**해야 읽힌다 |
| `GOOGLE_PRIVATE_KEY` | 서비스 계정 비공개 키 (`\n` 이스케이프 형태 허용) |
| `SHEET_ID_US` / `SHEET_ID_JP` | 스프레드시트 ID (URL의 `/d/` 와 `/edit` 사이) |
| `SHEET_TAB_TARGETS` / `SHEET_TAB_DATA` | (선택) 탭 이름이 기본값과 다를 때만 |

`api/sheet.mjs`는 **의존성이 없다** — JWT를 `node:crypto`로 직접 서명하므로
package.json도 빌드 스텝도 생기지 않는다. 이 성질을 깨뜨리지 말 것.

- **로컬 모드**: 편집 자유, 데이터는 브라우저별.
- **공유 모드**(Supabase 설정 시): 보기는 전원, 수정은 [편집] 버튼 → 암호 → RPC가 서버에서 검증.
  암호 불일치 시 저장 거부(`bad_password`). 스키마: `supabase/schema.sql`.
- **시트 모드**(SHEET URL 설정 시): '월별 목표'·'Data' 탭이 보기 전용으로 전환.

### 상태 구조

```js
G = { country: 'US'|'JP', data: { US: S, JP: S } }   // localStorage 'inv_multi_v1'
S = { settings, coverage[9], products[], pipeline[], updated }
product = { name, sku, asin, targets[9], s7, d30, fba, pl3 }   // sku == asin (키는 ASIN)
pipeline row = { date, sku(=asin), qty, mode(해상|항공|특송), dest('FBA'|'3PL'), eta, status(이동중|입고완료|취소), memo }
```

- 월 그리드: `MONTHS` = 2026-05 ~ 2027-01 (9칸) **고정**. 2027년 2월 이후 사용하려면 롤링 구조로 개편 필요 (알려진 TODO).
- `dest` 값은 국가 무관 `'FBA'`/`'3PL'` 고정 (JP는 라벨만 '현지창고'로 표시).
- Dashboard 집계는 **목적지+상태만** 본다 (운송수단은 기록용).

## 핵심 계산 로직 — "익월 1일 착지" (v4)

`calcRow(p)` 참조. 모든 수량 계산의 심장:

```
당월 잔여(D)   = 당월 목표 × (당월 남은 일수 / 당월 일수)
K              = coverage[익월]                    # 익월 1일에 FBA가 보유할 개월수
FBA 필요량     = D + Σ(익월부터 K개월치 목표)      # spanNeed(), 소수 개월 지원
FBA 보충 필요  = max(0, FBA필요 − (FBA재고 + FBA향 이동중))     # → 3PL에 내리는 출고 지시
T              = threePL==0 ? max(K, 해상리드+버퍼) : K + threePL월수
시스템 필요총량 = D + Σ(익월부터 T개월치)
한국 발주 필요 = max(0, 시스템필요 − (FBA + FBA향이동중 + 3PL + 3PL향이동중))  # → 해상 선적 지시
페이스         = (s7/7) ÷ (당월목표/30)            # 목표 대비 판매 속도
```

`settings.threePL = 0`이면 FBA 단일 모드로 자동 전환 (보충 컬럼 비활성).

## 시트 CSV 계약 (sheetLoad가 기대하는 형식)

`/api/sheet`는 Sheets API 응답을 이 형식의 CSV로 변환해 돌려준다. 행 끝의 빈 셀은
Sheets API가 잘라서 주므로 프록시가 최소 11칸(A~K)까지 패딩한다 — 안 하면 targets가 9칸을 못 채운다.

**수식 오류는 502로 실패시킨다.** `num()`은 숫자로 못 읽는 값을 0으로 바꾸는데,
`#REF!`가 든 FBA 재고가 0이 되면 '한국 발주 필요'가 실재고를 무시한 거대한 숫자로 튄다.
조용히 틀린 발주보다 대놓고 실패가 낫다 — 이때 `sheetLoad`의 catch가 받아
"⚠️ 시트 불러오기 실패 — 마지막 데이터 표시 중"을 띄운다. 502 응답에 오류 셀 좌표가 담긴다.

'Data 입력' 탭의 C~F열은 다른 스프레드시트를 `IMPORTRANGE`로 당겨온다. 시트를 복사하거나
xlsx에서 변환하면 승인이 초기화되어 전 셀이 `#REF!`가 된다 — 데스크톱 브라우저로 열어
오류 셀의 **액세스 허용**을 한 번 눌러야 풀린다. (서비스 계정은 원본 시트 권한이 필요 없다.
IMPORTRANGE 승인은 시트에 저장되며 구글이 서버측에서 평가한다.)

- **targets CSV** ('월별 목표' 탭): 헤더 행은 A열에 '제품명' 포함. 데이터 행 = A 제품명 / B ASIN / C~K 월별 목표(5월~1월).
  A열에 '확보' 포함된 행 = 월초 FBA 확보 개월수 (C~K).
- **data CSV** ('Data 입력' 탭): A ASIN / C 7일 판매 / D 30일 판매 / E FBA Available / G 3PL 재고.
- 천단위 콤마·따옴표 처리됨 (`parseCSV`, `num`).
- 제품 추가 = targets 시트에 행 추가만 하면 됨 (제품 목록의 원천).

## 히스토리 / 관련 산출물

엑셀 원본 템플릿(동일 로직): 재고_대시보드_템플릿_RAW.xlsx (US) / 재고_대시보드_일본_RAW.xlsx (JP).
현재 index.html에는 PDRN 스킨케어 US 데이터가 폴백 기본값(US_DEFAULT)으로 심어져 있음 — 시트 연동 후에는 시트가 진실.

## 알려진 TODO

- [ ] 월 그리드 롤링 구조 (현재 2026.5~2027.1 고정)
- [ ] 편집 권한 이메일 단위 (현재 공용 암호) — Supabase Auth로 확장
- [x] ~~게시 CSV 공개 노출~~ → `/api/sheet` 서비스 계정 프록시로 해결 (시트 비공개 유지)
