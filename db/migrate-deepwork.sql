-- ============================================================
--  Migration (2026-07-05): deep-work ceiling 3 → 6 blocks,
--  adherence hit bar 2 → 3. Paste once in the SQL Editor → Run.
-- ============================================================

alter table daily_log drop constraint if exists daily_log_deep_work_blocks_check;
alter table daily_log add constraint daily_log_deep_work_blocks_check
  check (deep_work_blocks between 0 and 6);

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
