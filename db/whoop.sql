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
