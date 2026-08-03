-- AMZ Ads Lab 스키마 (SQLite / Turso libSQL)
-- 모든 성과 테이블의 시간축은 week_start = 일요일 'YYYY-MM-DD'.
-- 아마존 리포트의 Date range 가 일~토 7일 전체가 아닌 행은 ingest 에서 버린다.

CREATE TABLE IF NOT EXISTS weeks (
  week_start TEXT PRIMARY KEY,
  week_end   TEXT NOT NULL,
  label      TEXT NOT NULL,
  is_event   INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS campaigns (
  week_start TEXT NOT NULL,
  portfolio  TEXT NOT NULL DEFAULT '',
  campaign   TEXT NOT NULL,
  ad_product TEXT NOT NULL DEFAULT '',
  imp INTEGER NOT NULL DEFAULT 0,
  clk INTEGER NOT NULL DEFAULT 0,
  cost REAL   NOT NULL DEFAULT 0,
  pur INTEGER NOT NULL DEFAULT 0,
  sales REAL  NOT NULL DEFAULT 0,
  ntb_pur   INTEGER NOT NULL DEFAULT 0,
  ntb_sales REAL    NOT NULL DEFAULT 0,
  dpv INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_start, campaign)
);

CREATE TABLE IF NOT EXISTS search_terms (
  week_start TEXT NOT NULL,
  portfolio  TEXT NOT NULL DEFAULT '',
  campaign   TEXT NOT NULL,
  ad_group   TEXT NOT NULL DEFAULT '',
  term       TEXT NOT NULL DEFAULT '',
  imp INTEGER NOT NULL DEFAULT 0,
  clk INTEGER NOT NULL DEFAULT 0,
  cost REAL   NOT NULL DEFAULT 0,
  pur INTEGER NOT NULL DEFAULT 0,
  sales REAL  NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  ntb_sales REAL NOT NULL DEFAULT 0,
  dpv INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_start, campaign, ad_group, term)
);

CREATE TABLE IF NOT EXISTS targets (
  week_start TEXT NOT NULL,
  portfolio  TEXT NOT NULL DEFAULT '',
  campaign   TEXT NOT NULL,
  ad_group   TEXT NOT NULL DEFAULT '',
  target     TEXT NOT NULL DEFAULT '',
  match_type TEXT NOT NULL DEFAULT '',
  bid    REAL,
  status TEXT NOT NULL DEFAULT '',
  imp INTEGER NOT NULL DEFAULT 0,
  clk INTEGER NOT NULL DEFAULT 0,
  cost REAL   NOT NULL DEFAULT 0,
  pur INTEGER NOT NULL DEFAULT 0,
  sales REAL  NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_start, campaign, ad_group, target, match_type)
);

-- Advertised product 리포트 (아직 시트에 탭이 없음 — 탭 추가 시 자동으로 채워진다)
CREATE TABLE IF NOT EXISTS products (
  week_start TEXT NOT NULL,
  portfolio  TEXT NOT NULL DEFAULT '',
  campaign   TEXT NOT NULL,
  ad_group   TEXT NOT NULL DEFAULT '',
  asin  TEXT NOT NULL DEFAULT '',
  sku   TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  imp INTEGER NOT NULL DEFAULT 0,
  clk INTEGER NOT NULL DEFAULT 0,
  cost REAL   NOT NULL DEFAULT 0,
  pur INTEGER NOT NULL DEFAULT 0,
  sales REAL  NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_start, campaign, ad_group, asin, sku)
);

CREATE TABLE IF NOT EXISTS ingest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at   TEXT NOT NULL,
  source   TEXT NOT NULL,
  rows_in      INTEGER NOT NULL DEFAULT 0,
  rows_kept    INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  weeks    TEXT,
  detail   TEXT
);

CREATE INDEX IF NOT EXISTS ix_st_week  ON search_terms(week_start);
CREATE INDEX IF NOT EXISTS ix_st_term  ON search_terms(term);
CREATE INDEX IF NOT EXISTS ix_st_pf    ON search_terms(portfolio, week_start);
CREATE INDEX IF NOT EXISTS ix_st_camp  ON search_terms(campaign, week_start);
CREATE INDEX IF NOT EXISTS ix_tg_week  ON targets(week_start);
CREATE INDEX IF NOT EXISTS ix_tg_pf    ON targets(portfolio, week_start);
CREATE INDEX IF NOT EXISTS ix_cp_week  ON campaigns(week_start);
CREATE INDEX IF NOT EXISTS ix_cp_pf    ON campaigns(portfolio, week_start);
CREATE INDEX IF NOT EXISTS ix_pr_week  ON products(week_start);
CREATE INDEX IF NOT EXISTS ix_pr_asin  ON products(asin, week_start);
