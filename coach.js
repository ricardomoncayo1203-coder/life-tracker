// ============================================================
//  coach.js — the daily coach: rule-driven, adaptive, quiet.
//  Reads today, yesterday, streaks, WHOOP, phase, and the clock;
//  returns at most two notes, most important first.
//  Tone: a gentleman's coach — imperative, never a scold.
// ============================================================
import * as S from "./store.js";
import { HABITS, AFFIRMATION, RECOVERY_BANDS } from "./config.js";

const H = () => new Date().getHours();
const isMorning = () => H() < 12;
const isEvening = () => H() >= 18;

function yesterdayState(today) {
  const y = S.addDays(today, -1);
  if (!S.hasDay(y)) return { date: y, unlogged: true, misses: [] };
  const d = S.getDay(y);
  return { date: y, unlogged: false, misses: HABITS.filter((h) => !h.hit(d)) };
}

export function missedYesterday(today = S.todayISO()) {
  const y = yesterdayState(today);
  return new Set(y.misses.map((h) => h.id));
}

/* Each rule returns { text, kind } or null. kind: "push" | "adjust" | "honor" */
const RULES = [
  // 1 — the statement, morning and night (Think and Grow Rich)
  function statement(ctx) {
    if (!isMorning() && !isEvening()) return null;
    const when = isMorning() ? "Begin with the statement" : "Before the light goes out";
    const tail = AFFIRMATION.text
      ? (isMorning() ? " — read it aloud, with feeling." : " — read it aloud and see it already yours.")
      : " — your Definite Chief Aim isn't engraved yet. Dictate it to Claude and it will live here.";
    return { text: `${when}${tail}`, kind: "push" };
  },

  // 2 — recovery-aware training adjustment (WHOOP)
  function recovery(ctx) {
    const w = ctx.whoop;
    if (!w || w.recovery_score == null || ctx.day.workout_done) return null;
    if (w.recovery_score < RECOVERY_BANDS.yellow)
      return { text: `Recovery ${w.recovery_score}% — trade the session for a farm walk and mobility. Protect tonight's sleep; the plan survives an easy day.`, kind: "adjust" };
    if (w.recovery_score >= RECOVERY_BANDS.green && ctx.suggested !== "Rest")
      return { text: `Recovery ${w.recovery_score}% — you're primed. Make today's ${ctx.suggested} session count while the body is willing.`, kind: "push" };
    return null;
  },

  // 3 — reclaim what slipped yesterday
  function reclaim(ctx) {
    const y = ctx.yesterday;
    if (y.unlogged) return { text: "Yesterday went unlogged. Log it from memory if you can — an honest gap beats a broken record.", kind: "adjust" };
    if (!y.misses.length) return null;
    const names = y.misses.slice(0, 2).map((h) => h.label.toLowerCase()).join(" and ");
    const more = y.misses.length > 2 ? ` (+${y.misses.length - 2} more)` : "";
    return { text: `${cap(names)}${more} slipped yesterday. Reclaim ${y.misses.length === 1 ? "it" : "them"} first today — marked below.`, kind: "adjust" };
  },

  // 4 — Sunday ritual
  function sunday(ctx) {
    if (S.dow(ctx.today) !== 0) return null;
    const hasWeigh = S.weighSeries().some((x) => x.date === ctx.today);
    if (!hasWeigh) return { text: "Sunday — weigh in before breakfast, then close the week in Review.", kind: "push" };
    return null;
  },

  // 5 — sleep debt (3-day average under 7h)
  function sleepDebt(ctx) {
    const days = [0, 1, 2].map((i) => S.addDays(ctx.today, -i)).filter(S.hasDay);
    const hrs = days.map((d) => S.getDay(d).sleep_hours).filter((x) => x != null);
    if (hrs.length < 3) return null;
    const avg = hrs.reduce((a, b) => a + b, 0) / hrs.length;
    if (avg < 7) return { text: `Three-day sleep average is ${avg.toFixed(1)}h. Tonight the bed wins the argument — 10:00 pm, no exceptions.`, kind: "adjust" };
    return null;
  },

  // 6 — honor a milestone
  function milestone(ctx) {
    const s = S.overallStreak();
    if ([7, 14, 21, 30, 60, 90].includes(s.current))
      return { text: `Day ${s.current}. The chain is becoming who you are — hold it quietly.`, kind: "honor" };
    return null;
  },

  // 7 — evening close-out
  function closeout(ctx) {
    if (!isEvening()) return null;
    const left = HABITS.filter((h) => !h.hit(ctx.day));
    if (!left.length) return { text: "The day is sealed. Read, call, sleep — nothing owed.", kind: "honor" };
    if (left.length <= 2)
      return { text: `${left.length === 1 ? "One item" : "Two items"} between you and a sealed day: ${left.map((h) => h.label.toLowerCase()).join(", ")}.`, kind: "push" };
    return null;
  },

  // 8 — phase pressure (default)
  function phase(ctx) {
    const { phase, daysLeft } = S.phaseCountdown(ctx.today);
    return { text: `${daysLeft} days to ${phase.end} lb. Ordinary days, kept, are what get you there.`, kind: "push" };
  },
];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function coachNotes(max = 2) {
  const today = S.todayISO();
  const ctx = {
    today,
    day: S.getDay(today),
    yesterday: yesterdayState(today),
    whoop: S.getWhoop(today),
    suggested: S.suggestedWorkoutType(today),
  };
  const notes = [];
  for (const rule of RULES) {
    if (notes.length >= max) break;
    try {
      const n = rule(ctx);
      if (n) notes.push(n);
    } catch { /* a broken rule never breaks the day */ }
  }
  return notes;
}
