# 하이브리드 대시보드 세팅 가이드

## 역할 분담 (이렇게 나뉩니다)

| 어디서 | 무엇을 | 왜 |
|---|---|---|
| **구글 시트** | 월별 목표 + 확보 개월수, Data 입력(판매·재고), 제품 추가 | 붙여넣기·대량 입력은 시트가 편함 |
| **웹 (Pipeline ✎)** | 발송 추가, 입고완료 처리 | 폰에서 그때그때 터치 — Supabase로 전원 공유 |
| **웹 (설정 ✎)** | 3PL 월수, 리드타임, 행사일 | 가끔 바꾸는 값 |
| **웹 (Dashboard·월별 계획)** | 보기 전용 — 클라이언트 공유용 대표 화면 | |

같은 항목을 양쪽에서 입력하지 않는 구조라 충돌이 없습니다.

---

## PART 1. 구글 시트 연동 (5분)

### 1-1. 탭 2개 "웹에 게시"

1. 구글 시트에서 **파일 → 공유 → 웹에 게시**
2. "전체 문서" 대신 **'월별 목표' 탭 선택** + 형식 **쉼표로 구분된 값(.csv)** → 게시 → 나온 URL 복사
3. 같은 방법으로 **'Data 입력' 탭**도 게시 → URL 복사
   (팁: "게시된 콘텐츠 및 설정"에서 자동 재게시가 켜져 있는지 확인)

### 1-2. HTML에 URL 붙여넣기

HTML 파일 상단의 이 부분에:

```js
const SHEET = {
  US: {
    targets: "여기에 '월별 목표' 게시 CSV 주소",
    data:    "여기에 'Data 입력' 게시 CSV 주소",
  },
  JP: { targets: "", data: "" },   // 일본 시트 만들면 동일하게
};
```

이러면 웹의 '월별 목표'·'Data' 탭이 자동으로 **보기 전용(시트 연동)**으로 바뀝니다.
비워두면 예전처럼 웹에서 직접 입력하는 모드로 작동합니다.

### 시트 쪽 전제 조건 (지금 시트 구조 그대로면 OK)

- **월별 목표 탭**: A열 제품명 / B열 ASIN / C~K열 = 5월~1월(27) / "월초 FBA 확보 개월수" 행 포함
- **Data 입력 탭**: A열 ASIN / C열 7일 판매 / D열 30일 판매 / E열 FBA Available / G열 3PL 재고
- 제품 추가 = 월별 목표 탭에 행 추가 (제품명 + ASIN 채우면 웹에 자동 등장)

### 알아둘 것

- 시트 수정 → 웹 반영까지 **최대 5분** (구글 게시 캐시)
- 게시 CSV는 URL을 아는 사람은 볼 수 있음 — 민감하면 나중에 Apps Script 프록시로 전환 가능

---

## PART 2. Supabase 연동 — Pipeline·설정 공유 + 수정 암호 (10분)

### 2-1. 프로젝트 만들기

https://supabase.com 가입 → New Project (리전: Seoul) → 생성 대기 1~2분

### 2-2. SQL 한 번 실행

**SQL Editor → New query** → 아래 붙여넣고 Run:

```sql
create table dashboard_state (
  country text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table dashboard_secret (
  id int primary key default 1,
  edit_password text not null
);

-- ★★★ 원하는 수정 암호로 변경 ★★★
insert into dashboard_secret (id, edit_password) values (1, '여기에-수정암호');

alter table dashboard_state enable row level security;
alter table dashboard_secret enable row level security;
create policy "public read" on dashboard_state for select using (true);

create or replace function save_dashboard(p_country text, p_data jsonb, p_password text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dashboard_secret where id = 1 and edit_password = p_password) then
    raise exception 'bad_password';
  end if;
  insert into dashboard_state (country, data, updated_at)
  values (p_country, p_data, now())
  on conflict (country) do update set data = excluded.data, updated_at = now();
  return 'ok';
end;
$$;

grant execute on function save_dashboard(text, jsonb, text) to anon;
```

### 2-3. 키 붙여넣기

Settings → API에서 **Project URL**과 **anon public** 키 복사 → HTML 상단:

```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
```

(service_role 키는 절대 넣지 말 것)

### 2-4. 사용

- 링크 열면 누구나 보기 가능 (US/JP 전환 포함)
- **[🔒 편집]** → 수정 암호 입력 → Pipeline·설정 저장 가능. 암호 틀리면 서버가 저장 거부
- 암호 변경: `update dashboard_secret set edit_password='새암호' where id=1;`

---

## PART 3. 배포

파일명을 **index.html**로 바꿔 Vercel에 업로드 (평소 방식 그대로).
이후 시트/Supabase 키를 바꿀 때만 재배포하면 됩니다.

## 매주 운영 루틴

1. 시트 'Data 입력'에 리포트 붙여넣기 (주 1~2회)
2. 발송·입고는 웹 Pipeline에서 그때그때 처리
3. Dashboard의 'FBA 보충 필요' / '한국 발주 필요' 숫자로 실행
