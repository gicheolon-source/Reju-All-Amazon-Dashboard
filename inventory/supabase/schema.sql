-- 재고 대시보드 Supabase 스키마
-- SQL Editor에 전체 붙여넣고 Run (수정 암호 부분만 변경)

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
