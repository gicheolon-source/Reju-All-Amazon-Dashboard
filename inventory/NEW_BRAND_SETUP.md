# 새 브랜드 복제 가이드

이 저장소 하나가 브랜드 하나다. 새 브랜드 = 저장소 복사 → 시트 복사 → Supabase 새 프로젝트 → Vercel 새 프로젝트.
전부 처음 하면 40~60분, 익숙하면 20분.

> **브랜드마다 Supabase 프로젝트를 따로 만들어야 하는 이유**: `dashboard_state`의 키가 국가 코드뿐이라
> 두 브랜드가 한 프로젝트를 쓰면 서로의 US 데이터를 덮어쓴다. (무료 플랜은 활성 프로젝트 2개 제한 — 브랜드가
> 3개 이상이 되면 유료 전환 또는 스키마에 brand 컬럼 추가 개조가 필요하다.)

---

## 0. 준비물

| 항목 | 값 / 위치 |
|---|---|
| 서비스 계정 이메일 | `rejuall-amz-us-dashboard@impactful-name-495400-k2.iam.gserviceaccount.com` |
| 서비스 계정 비공개 키 | `amz-ads-lab/.env.vercel` 의 `GOOGLE_PRIVATE_KEY` |
| 시트 템플릿 | 재고_대시보드_US (ID `19aRqjJ4gP1KU_YWvtvKrOAcLUcBt8ve4aMa7ZPJ2ho8`) |

서비스 계정은 브랜드 수와 무관하게 **하나를 재사용**한다 — 새로 만들 필요 없다.
새 브랜드 시트에 이 이메일을 공유하기만 하면 된다.

## 1. 저장소 복사 (5분)

```bash
git clone https://github.com/ethan-elpapa/inventory-dashboard.git <새브랜드>-inventory
cd <새브랜드>-inventory
rm -rf .git && git init -b main
```

`index.html` 에서 브랜드 고유 요소 4곳을 정리:

1. **`<title>`** (6행) — 브랜드명으로 교체
2. **`US_DEFAULT.products`** — PDRN 제품 9종이 박혀 있다. `[]` 로 비우거나 새 브랜드 제품으로 교체
   (시트 연동 후에는 어차피 시트가 덮어쓰지만, 시트 연결 전 첫 화면에 이전 브랜드 제품이 보이는 사고 방지)
3. **`US_DEFAULT.pipeline`** — 샘플 선적 8건도 PDRN 것. `[]` 로 비울 것 (**이 값은 시트가 안 덮어쓴다** — Supabase/localStorage 소관이라 지우지 않으면 발주 계산에 계속 섞인다)
4. **`SUPABASE_URL` / `SUPABASE_ANON_KEY`** (156~159행) — 일단 `""` 로 비워두고 5단계에서 채운다

수정 후 반드시:

```bash
node test/smoke_test.js
```

GitHub에 **private** 저장소 생성 후 푸시.

## 2. 구글 시트 복사 (10분)

1. 템플릿 시트 열기 → **파일 → 사본 만들기**
2. '월별 목표' 탭: 제품명·ASIN·목표를 새 브랜드 것으로 교체 ('월초 FBA 확보 개월수' 행 유지)
3. 'Data 입력' 탭: A열 ASIN 교체. C~F열 수식이 다른 시트를 IMPORTRANGE 한다면 참조처도 새 브랜드용으로 교체
4. **공유** → 서비스 계정 이메일 추가 (뷰어, 알림 끄기)
5. 새 시트의 ID 기록 (URL 의 `/d/` 와 `/edit` 사이)

### ⚠️ 이 단계의 함정 2개 (실제로 겪은 것)

- **xlsx 업로드본은 못 읽는다.** Drive에 올린 엑셀 파일 그대로면 Sheets API가 `400 "must not be an Office file"` 을 낸다. 반드시 **파일 → Google Sheets로 저장**으로 변환. 변환하면 **ID가 바뀌고 공유도 초기화**되니 4~5번을 변환 후에 할 것.
- **사본은 IMPORTRANGE 승인이 풀려 있다.** 'Data 입력' C~F열이 전부 `#REF!` 로 뜨면, 데스크톱 브라우저로 시트를 열어 오류 셀 클릭 → **액세스 허용** 1회. 안 누르면 `/api/sheet` 가 의도적으로 502를 내며 오류 셀 좌표를 알려준다 (0으로 잘못 읽혀 발주량이 튀는 것 방지).

## 3. Supabase 새 프로젝트 (10분)

1. supabase.com → New Project (리전 Seoul) → 생성 대기
2. SQL Editor → `supabase/schema.sql` 전체 붙여넣기 → **16행 `'여기에-수정암호'` 를 팀 암호로 교체** → Run
3. Settings → API Keys → **Publishable key** 복사 (`sb_publishable_...`)
   - 신형 키 체계 기준. Legacy 탭의 anon 키도 동작하지만 신형 권장
   - **Secret keys 는 절대 사용 금지** (구 service_role — 클라이언트에 넣으면 RLS 무력화)
4. Project URL 기록 (`https://xxxx.supabase.co`)

암호 변경은 언제든: `update dashboard_secret set edit_password='새암호' where id=1;`

## 4. Vercel 새 프로젝트 (10분)

1. vercel.com/new → 새 저장소 Import (private 이면 GitHub 앱 권한에 저장소 추가)
2. Application Preset **Other**, Root Directory `./`, Build 설정 건드리지 않음
3. **환경변수 3개**:

| 키 | 값 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 준비물의 서비스 계정 이메일 |
| `GOOGLE_PRIVATE_KEY` | 준비물의 비공개 키 (BEGIN~END 전체, `\n` 문자 그대로 OK) |
| `SHEET_ID_US` | 2단계에서 기록한 새 시트 ID |

   - Vercel이 이전 프로젝트의 환경변수(TURSO_* 등)를 미리 채워올 수 있다 — **쓰지 않는 것은 전부 삭제**
4. Deploy → `https://<프로젝트명>.vercel.app/api/sheet?country=US&tab=targets` 가 CSV를 주는지 확인
5. 도메인 변경은 프로젝트 상단 **Domains 탭** (Settings 사이드바 아님. Project Name 변경으로는 기존 도메인이 안 바뀐다)

## 5. 키 연결 & 마무리 (5분)

1. `index.html` 156~159행에 Supabase URL + Publishable key 입력
2. `node test/smoke_test.js` → 커밋 → 푸시 → 자동 재배포
3. 검증 체크리스트:
   - [ ] 헤더에 "공유 모드 · 시트 동기화" 표시
   - [ ] Dashboard에 새 브랜드 제품·숫자
   - [ ] [🔒 편집] → 암호 → Pipeline 행 추가 → "저장됨" 표시
   - [ ] 다른 브라우저/폰에서 열어 방금 수정이 보이는지
   - [ ] 틀린 암호로 저장 시도 → 거부되는지

## 6. 국가 확장 (국가당 5분, 필요할 때)

시트를 국가별로 복사 (2단계와 동일) → Vercel 에 `SHEET_ID_CA` 등 추가 →
`index.html` 의 `SHEET` 객체에서 해당 국가를 US 와 같은 형태로 채움 → 커밋.
신설 국가의 리드타임·3PL 월수는 웹 설정 탭에서 국가별로 조정 (US 값이 자리표시자로 들어있다).

---

## 운영 메모

- **입력 위치 규칙**: 목표·판매·재고 = 시트 / Pipeline·설정 = 웹. 시트의 '설정값'·'발송 현황'·'Dashboard'·'월별 계획' 탭은 웹과 무관한 템플릿 잔재 — 거기 고쳐도 대시보드에 반영 안 됨.
- **시트 반영 주기**: CDN 30초 캐시. 시트 수정 → 새로고침이면 충분.
- **월 그리드**: 2026-05 ~ 2027-01 고정. 2027년 2월 이후 쓰려면 롤링 개편 필요 (전 브랜드 공통 TODO).
- **접근 제어**: 링크를 알면 누구나 열람 가능. 열람 자체를 막으려면 Vercel Deployment Protection 검토.
