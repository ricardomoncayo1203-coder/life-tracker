-- Life Tracker — complete database setup (schema + views + WHOOP)
-- Paste this whole file into the Supabase SQL Editor and Run once.

-- ============================================================
--  Life Tracker — Supabase schema (single user: Ricardo)
--  Run ONCE in the Supabase SQL Editor, then run views.sql.
--  Owner-only RLS keyed to auth.uid(). No roles, no multi-user.
-- ============================================================

-- Workout type (keystone set)
do $$ begin
  create type workout_type as enum ('Push','Pull','Legs','Core','Gym','Sprint','Rest');
exception when duplicate_object then null; end $$;

-- ---------- DAILY LOG (one row per calendar day, upsert target) ----------
create table if not exists daily_log (
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date               date not null,
  workout_done           boolean     not null default false,
  workout_type           workout_type,
  sleep_hours            numeric(3,1),
  morning_protocol_done  boolean     not null default false,
  deep_work_blocks       smallint    not null default 0 check (deep_work_blocks between 0 and 3),
  no_screens_after_9     boolean     not null default false,
  journal_done           boolean     not null default false,
  journal_went_well      text,
  journal_improve        text,
  journal_grateful       text,
  updated_at             timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- ---------- WEIGH-INS ----------
create table if not exists weigh_in (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weigh_date  date not null,
  weight_lb   numeric(5,1) not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, weigh_date)
);

-- ---------- WEEKLY SELF-RATINGS (1–5) ----------
create table if not exists weekly_rating (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start    date not null,                 -- Monday-anchored
  sleep_1_5     smallint check (sleep_1_5     between 1 and 5),
  nutrition_1_5 smallint check (nutrition_1_5 between 1 and 5),
  training_1_5  smallint check (training_1_5  between 1 and 5),
  mental_1_5    smallint check (mental_1_5    between 1 and 5),
  reflection    text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- ---------- REFERENCE TARGETS (progress-to-goal lines) ----------
create table if not exists target (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null,
  start_value numeric, end_value numeric,
  start_date  date, end_date date,
  unit        text, note text,
  primary key (user_id, key)
);

-- ============================================================
--  ROW LEVEL SECURITY — owner-only, all four tables
-- ============================================================
alter table daily_log     enable row level security;
alter table weigh_in      enable row level security;
alter table weekly_rating enable row level security;
alter table target        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['daily_log','weigh_in','weekly_rating','target'] loop
    execute format('drop policy if exists "own_sel" on %I;', t);
    execute format('drop policy if exists "own_ins" on %I;', t);
    execute format('drop policy if exists "own_upd" on %I;', t);
    execute format('drop policy if exists "own_del" on %I;', t);
    execute format('create policy "own_sel" on %I for select to authenticated using (user_id = auth.uid());', t);
    execute format('create policy "own_ins" on %I for insert to authenticated with check (user_id = auth.uid());', t);
    execute format('create policy "own_upd" on %I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    execute format('create policy "own_del" on %I for delete to authenticated using (user_id = auth.uid());', t);
  end loop;
end $$;

-- ============================================================
--  OPTIONAL — weight targets.
--  The app already reads targets from config.js, so this table is
--  optional (future-proofing). The SQL Editor runs as `postgres`, so
--  auth.uid() is null here — seed by your email instead of the default:
--
--    insert into target (user_id, key, start_value, end_value, start_date, end_date, unit, note)
--    select u.id, v.key, v.sv, v.ev, v.sd, v.ed, 'lb', v.note
--    from auth.users u,
--      (values ('weight_phase1',130,135,date '2026-06-01',date '2026-08-07','Phase 1 → 135 by early Aug'),
--              ('weight_phase2',135,145,date '2026-08-07',date '2026-11-30','Phase 2 → 145 by late Nov'))
--         as v(key,sv,ev,sd,ed,note)
--    where u.email = 'YOUR-EMAIL'
--    on conflict (user_id, key) do nothing;
-- ============================================================

-- Next: run views.sql

-- ============================================================
--  Life Tracker — analytics views (run AFTER schema.sql)
--  Keystone "hit" thresholds must match config.js:
--    sleep >= 7.5h · deep_work >= 2 blocks · 4 booleans
-- ============================================================

-- Per-day adherence (0..6) + percentage
create or replace view v_daily_adherence as
select
  user_id, log_date,
  ( workout_done::int
  + morning_protocol_done::int
  + no_screens_after_9::int
  + journal_done::int
  + (deep_work_blocks >= 2)::int
  + (coalesce(sleep_hours,0) >= 7.5)::int ) as habits_hit,
  6 as habits_possible,
  round(100.0 * (
      workout_done::int + morning_protocol_done::int + no_screens_after_9::int
    + journal_done::int + (deep_work_blocks >= 2)::int + (coalesce(sleep_hours,0) >= 7.5)::int
  ) / 6.0, 0) as adherence_pct
from daily_log;

-- One row per week — the weekly-review read surface
create or replace view v_week_review as
select
  dl.user_id,
  date_trunc('week', dl.log_date)::date        as week_start,
  count(*)                                       as days_logged,
  sum(dl.workout_done::int)                      as workouts,
  round(avg(dl.sleep_hours), 1)                  as avg_sleep,
  sum(dl.morning_protocol_done::int)             as morning_hits,
  sum(dl.deep_work_blocks)                       as deep_work_total,
  sum(dl.no_screens_after_9::int)                as no_screen_hits,
  sum(dl.journal_done::int)                      as journal_hits,
  round(avg(va.adherence_pct), 0)                as avg_adherence_pct
from daily_log dl
join v_daily_adherence va using (user_id, log_date)
group by dl.user_id, date_trunc('week', dl.log_date);

-- Views inherit the base tables' RLS (security invoker), so a logged-in
-- read only ever returns your own rows.

-- ============================================================
--  WHOOP daily metrics (run in Supabase SQL Editor, after schema.sql)
--  Written by whoop/sync.mjs (service key, bypasses RLS with explicit user_id).
--  Read by the app (anon key + session, RLS owner-only).
-- ============================================================

create table if not exists whoop_daily (
  user_id               uuid not null references auth.users(id) on delete cascade,
  day                   date not null,
  recovery_score        smallint,        -- 0–100
  hrv_ms                numeric(6,1),    -- HRV (RMSSD, ms)
  rhr_bpm               smallint,
  spo2_pct              numeric(4,1),
  skin_temp_c           numeric(5,2),
  sleep_hours           numeric(4,2),    -- actual asleep (light+SWS+REM), naps excluded
  sleep_performance_pct smallint,
  sleep_consistency_pct smallint,
  sleep_efficiency_pct  numeric(4,1),
  respiratory_rate      numeric(4,2),
  day_strain            numeric(4,1),    -- 0–21
  avg_hr_bpm            smallint,
  max_hr_bpm            smallint,
  workout_count         smallint not null default 0,
  workout_sports        text,
  raw                   jsonb,
  synced_at             timestamptz not null default now(),
  primary key (user_id, day)
);

alter table whoop_daily enable row level security;

drop policy if exists "own_sel" on whoop_daily;
create policy "own_sel" on whoop_daily for select to authenticated using (user_id = auth.uid());
-- No insert/update policies for `authenticated` on purpose:
-- only the sync script (service role) writes this table.
