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
