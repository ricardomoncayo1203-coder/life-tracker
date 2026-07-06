-- ============================================================
--  Life Tracker — analytics views (run AFTER schema.sql)
--  Keystone "hit" thresholds must match config.js:
--    sleep >= 7.5h · deep_work >= 2 blocks · 4 booleans
-- ============================================================

-- Per-day adherence (0..6) + percentage  (deep-work hit bar: >= 3 blocks)
create or replace view v_daily_adherence as
select
  user_id, log_date,
  ( workout_done::int
  + morning_protocol_done::int
  + no_screens_after_9::int
  + journal_done::int
  + (deep_work_blocks >= 3)::int
  + (coalesce(sleep_hours,0) >= 7.5)::int ) as habits_hit,
  6 as habits_possible,
  round(100.0 * (
      workout_done::int + morning_protocol_done::int + no_screens_after_9::int
    + journal_done::int + (deep_work_blocks >= 3)::int + (coalesce(sleep_hours,0) >= 7.5)::int
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
