// ============================================================
//  store.js — local-first data layer + Supabase sync
//  UI always reads/writes local state (instant, offline-proof).
//  When Supabase is configured + authed, edits queue and push,
//  and remote rows pull in on connect. Idempotent upserts.
// ============================================================
import {
  SUPABASE_URL, SUPABASE_ANON, supabaseConfigured,
  HABITS, HABIT_COUNT, LS, WEIGHT_TARGETS, WORKOUT_BY_DOW,
} from "./config.js";

/* ---------------- date helpers (all local time) ---------------- */
export const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => isoDate(new Date());
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const dow = (s) => parseISO(s).getDay(); // 0 Sun … 6 Sat
export function weekStartISO(s) {            // Monday-anchored
  const d = parseISO(s); const day = (d.getDay() + 6) % 7; // 0=Mon
  d.setDate(d.getDate() - day); return isoDate(d);
}
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export function fmtDate(s, opts = { month: "short", day: "numeric" }) {
  return parseISO(s).toLocaleDateString("en-US", opts);
}

/* ---------------- in-memory state (mirror of localStorage) ---------------- */
const state = { daily: {}, weigh: {}, ratings: {}, pending: [], whoop: {} };
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

const readLS = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function load() {
  state.daily = readLS(LS.daily, {});
  state.weigh = readLS(LS.weigh, {});
  state.ratings = readLS(LS.ratings, {});
  state.pending = readLS(LS.pending, []);
  state.whoop = readLS(LS.whoop, {});
}

const persistDaily = () => writeLS(LS.daily, state.daily);
const persistWeigh = () => writeLS(LS.weigh, state.weigh);
const persistRatings = () => writeLS(LS.ratings, state.ratings);
const persistPending = () => writeLS(LS.pending, state.pending);

/* ---------------- day model ---------------- */
const EMPTY_DAY = {
  workout_done: false, workout_type: null,
  sleep_hours: null,
  morning_protocol_done: false,
  deep_work_blocks: 0,
  no_screens_after_9: false,
  journal_done: false, journal_went_well: "", journal_improve: "", journal_grateful: "",
  updated_at: null,
};

export function getDay(dateISO) {
  return { log_date: dateISO, ...EMPTY_DAY, ...(state.daily[dateISO] || {}) };
}
export function hasDay(dateISO) { return !!state.daily[dateISO]; }
export function allDaysSorted() { return Object.keys(state.daily).sort(); }

export function patchDay(dateISO, patch) {
  const cur = state.daily[dateISO] || { ...EMPTY_DAY };
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  state.daily[dateISO] = next;
  persistDaily();
  queue("daily_log", { log_date: dateISO, ...next });
  emit();
  return getDay(dateISO);
}

/* ---------------- weigh-ins ---------------- */
export function setWeigh(dateISO, lb) {
  state.weigh[dateISO] = { weight_lb: lb, updated_at: new Date().toISOString() };
  persistWeigh();
  queue("weigh_in", { weigh_date: dateISO, weight_lb: lb });
  emit();
}
export function weighSeries() {
  return Object.entries(state.weigh)
    .map(([date, v]) => ({ date, lb: v.weight_lb }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function latestWeight() { const s = weighSeries(); return s.length ? s[s.length - 1] : null; }

/* ---------------- weekly ratings ---------------- */
export function getRating(weekStart) { return state.ratings[weekStart] || {}; }
export function setRating(weekStart, patch) {
  state.ratings[weekStart] = { ...(state.ratings[weekStart] || {}), ...patch, updated_at: new Date().toISOString() };
  persistRatings();
  queue("weekly_rating", { week_start: weekStart, ...state.ratings[weekStart] });
  emit();
}

/* ============================================================
   DERIVED ANALYTICS
   ============================================================ */
export const habitHit = (day, habit) => habit.hit(day);
export function adherenceCount(dateISO) {
  const d = getDay(dateISO);
  return HABITS.reduce((n, h) => n + (h.hit(d) ? 1 : 0), 0);
}
export const adherencePct = (dateISO) => Math.round((adherenceCount(dateISO) / HABIT_COUNT) * 100);

// generic streak over a predicate on a date string, counting back from `end`
function streakBack(pred, end = todayISO()) {
  let cur = 0, cursor = end;
  // if today not yet satisfied, start from yesterday so an un-logged today doesn't zero the run
  if (!pred(cursor)) cursor = addDays(cursor, -1);
  while (pred(cursor)) { cur++; cursor = addDays(cursor, -1); }
  return cur;
}
function longestStreak(pred) {
  const days = allDaysSorted();
  if (!days.length) return 0;
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    if (!pred(d)) { run = 0; prev = d; continue; }
    run = prev && daysBetween(prev, d) === 1 && (run > 0) ? run + 1 : 1;
    prev = d; best = Math.max(best, run);
  }
  return best;
}
const dayHitPred = (habit) => (d) => hasDay(d) && habit.hit(getDay(d));
const anyAdherencePred = (min = 4) => (d) => hasDay(d) && adherenceCount(d) >= min;

export function overallStreak(min = 4) {
  const pred = anyAdherencePred(min);
  return { current: streakBack(pred), longest: longestStreak(pred) };
}
export function habitStreak(habitId) {
  const habit = HABITS.find((h) => h.id === habitId);
  const pred = dayHitPred(habit);
  return { current: streakBack(pred), longest: longestStreak(pred) };
}

export function rollingAvgSleep(n = 14) {
  const days = allDaysSorted().slice(-n).map(getDay).map((d) => d.sleep_hours).filter((x) => x != null);
  if (!days.length) return 7.5;
  return Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 2) / 2;
}

// smart default workout type: day-of-week from his plan, else next in rotation
export function suggestedWorkoutType(dateISO) { return WORKOUT_BY_DOW[dow(dateISO)]; }

export function weekSummary(weekStart) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d <= todayISO());
  const logged = dates.filter(hasDay);
  const perHabit = {};
  HABITS.forEach((h) => { perHabit[h.id] = logged.filter((d) => h.hit(getDay(d))).length; });
  const sleeps = logged.map((d) => getDay(d).sleep_hours).filter((x) => x != null);
  const workouts = logged.filter((d) => getDay(d).workout_done).length;
  const adh = logged.length ? Math.round(logged.reduce((a, d) => a + adherencePct(d), 0) / logged.length) : 0;
  const w = Object.entries(state.weigh).filter(([dt]) => dt >= weekStart && dt < addDays(weekStart, 7));
  const weighin = w.length ? w[w.length - 1][1].weight_lb : null;
  return {
    weekStart, daysLogged: logged.length, workouts,
    avgSleep: sleeps.length ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10 : null,
    perHabit, avgAdherence: adh, weighin,
    rating: getRating(weekStart),
  };
}

/* ============================================================
   WHOOP (read-only in the app; whoop/sync.mjs produces the data)
   Cloud mode: whoop_daily table · Local mode: ./whoop.json
   ============================================================ */
export function getWhoop(dateISO) { return state.whoop[dateISO] || null; }
export function hasWhoop() { return Object.keys(state.whoop).length > 0; }
export function latestWhoop() {
  const days = Object.keys(state.whoop).sort();
  for (let i = days.length - 1; i >= 0; i--) {
    if (state.whoop[days[i]]?.recovery_score != null) return { date: days[i], ...state.whoop[days[i]] };
  }
  return null;
}
export function whoopSeries(n = 14, field = "recovery_score") {
  const end = todayISO();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const v = state.whoop[addDays(end, -i)]?.[field];
    if (v != null) out.push(v);
  }
  return out;
}
export function whoopWeek(weekStart) {
  const vals = { recovery: [], hrv: [], strain: [], sleep: [] };
  for (let i = 0; i < 7; i++) {
    const w = state.whoop[addDays(weekStart, i)];
    if (!w) continue;
    if (w.recovery_score != null) vals.recovery.push(w.recovery_score);
    if (w.hrv_ms != null) vals.hrv.push(w.hrv_ms);
    if (w.day_strain != null) vals.strain.push(w.day_strain);
    if (w.sleep_hours != null) vals.sleep.push(w.sleep_hours);
  }
  const avg = (a, dp = 0) => a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10 ** dp) / 10 ** dp : null;
  return { avgRecovery: avg(vals.recovery), avgHrv: avg(vals.hrv, 1), avgStrain: avg(vals.strain, 1), avgSleep: avg(vals.sleep, 1), daysWithData: vals.recovery.length };
}

export async function loadWhoop() {
  let days = null;
  if (sb && currentUser) {
    try {
      const { data } = await sb.from("whoop_daily").select("*");
      if (data?.length) {
        days = {};
        data.forEach((row) => { const { user_id, day, raw, synced_at, ...rest } = row; days[day] = rest; });
      }
    } catch { /* table may not exist yet */ }
  }
  if (!days) {
    try {
      const res = await fetch("./whoop.json", { cache: "no-cache" });
      if (res.ok) days = (await res.json()).days || null;
    } catch { /* no local file — WHOOP not set up yet */ }
  }
  if (days) {
    state.whoop = days;
    writeLS(LS.whoop, days);
    autoFillSleep();
    emit();
  }
}

// Today's sleep fills itself from the strap when he hasn't logged it manually.
function autoFillSleep() {
  const today = todayISO();
  const w = state.whoop[today];
  if (w?.sleep_hours == null) return;
  const cur = state.daily[today]?.sleep_hours;
  if (cur == null) patchDay(today, { sleep_hours: Math.round(w.sleep_hours * 10) / 10 });
}

/* ---------------- phase / progress-to-goal ---------------- */
export function currentPhase(dateISO = todayISO()) {
  return WEIGHT_TARGETS.find((p) => dateISO >= p.startDate && dateISO <= p.endDate)
      || (dateISO < WEIGHT_TARGETS[0].startDate ? WEIGHT_TARGETS[0] : WEIGHT_TARGETS[WEIGHT_TARGETS.length - 1]);
}
export function phaseCountdown(dateISO = todayISO()) {
  const p = currentPhase(dateISO);
  return { phase: p, daysLeft: Math.max(0, daysBetween(dateISO, p.endDate)) };
}

/* ============================================================
   SUPABASE SYNC (best-effort; app works fully without it)
   ============================================================ */
let sb = null, currentUser = null;
const authListeners = new Set();
export const onAuth = (fn) => { authListeners.add(fn); fn(currentUser); return () => authListeners.delete(fn); };
const emitAuth = () => authListeners.forEach((fn) => fn(currentUser));
export const getUser = () => currentUser;
export const isCloud = () => supabaseConfigured();

const CONFLICT = { daily_log: "user_id,log_date", weigh_in: "user_id,weigh_date", weekly_rating: "user_id,week_start" };

export function initSupabase() {
  if (!supabaseConfigured() || !window.supabase) return null;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  sb.auth.getSession().then(({ data }) => { setUser(data?.session?.user || null); });
  sb.auth.onAuthStateChange((_e, session) => { setUser(session?.user || null); });
  window.addEventListener("online", flush);
  return sb;
}
function setUser(u) {
  const changed = (currentUser?.id) !== (u?.id);
  currentUser = u; emitAuth();
  if (u && changed) { pushAllLocal().then(pull).then(loadWhoop); } // upload local-first data, merge server, refresh whoop
}

export async function signIn(email) {
  if (!sb) throw new Error("cloud-not-configured");
  const { error } = await sb.auth.signInWithOtp({
    email, options: { emailRedirectTo: location.href.split("#")[0] },
  });
  if (error) throw error;
}
export async function signOut() { if (sb) await sb.auth.signOut(); currentUser = null; emitAuth(); }
// 6-digit code from the same email — completes sign-in INSIDE the installed PWA
// (iOS opens magic links in Safari, whose storage the home-screen app can't see).
export async function verifyCode(email, token) {
  if (!sb) throw new Error("cloud-not-configured");
  const { error } = await sb.auth.verifyOtp({ email, token: token.trim(), type: "email" });
  if (error) throw error;
}
// Pasted magic LINK (long-press → Copy Link in Mail) — extracts the token hash
// and verifies inside this context. Works with Supabase's locked default template.
export async function verifyPastedLink(url) {
  if (!sb) throw new Error("cloud-not-configured");
  let token_hash = null;
  try { const u = new URL(url.trim()); token_hash = u.searchParams.get("token") || u.searchParams.get("token_hash"); } catch {}
  if (!token_hash) throw new Error("That doesn't look like the sign-in link — long-press it in Mail and choose Copy Link.");
  const { error } = await sb.auth.verifyOtp({ token_hash, type: "email" });
  if (error) {
    // legacy type fallback
    const retry = await sb.auth.verifyOtp({ token_hash, type: "magiclink" });
    if (retry.error) throw error;
  }
}

/* queue + flush */
function queue(table, payload) {
  if (!supabaseConfigured()) return; // local-only mode: nothing to sync to, don't grow the queue
  state.pending.push({ table, payload, ts: Date.now() });
  persistPending();
  flush();
}

// One-time on first cloud connect: push everything logged locally (incl. pre-cloud data) up.
export async function pushAllLocal() {
  if (!sb || !currentUser) return;
  const uid = currentUser.id;
  const sets = {
    daily_log:     Object.entries(state.daily).map(([log_date, v]) => ({ log_date, ...v, user_id: uid })),
    weigh_in:      Object.entries(state.weigh).map(([weigh_date, v]) => ({ weigh_date, weight_lb: v.weight_lb, user_id: uid })),
    weekly_rating: Object.entries(state.ratings).map(([week_start, v]) => ({ week_start, ...v, user_id: uid })),
  };
  for (const [table, list] of Object.entries(sets)) {
    if (!list.length) continue;
    try { await sb.from(table).upsert(list, { onConflict: CONFLICT[table] }); } catch (e) { return; }
  }
  state.pending = []; persistPending();
}
export async function flush() {
  if (!sb || !currentUser || !state.pending.length || !navigator.onLine) return;
  const batch = [...state.pending];
  const keep = [];
  for (const op of batch) {
    try {
      const row = { ...op.payload, user_id: currentUser.id };
      const { error } = await sb.from(op.table).upsert(row, { onConflict: CONFLICT[op.table] });
      if (error) throw error;
    } catch (e) { keep.push(op); }
  }
  state.pending = keep; persistPending();
  updateSyncBadge();
}
export async function pull() {
  if (!sb || !currentUser) return;
  try {
    const [d, w, r] = await Promise.all([
      sb.from("daily_log").select("*"),
      sb.from("weigh_in").select("*"),
      sb.from("weekly_rating").select("*"),
    ]);
    (d.data || []).forEach((row) => {
      const loc = state.daily[row.log_date];
      if (!loc || (row.updated_at && (!loc.updated_at || row.updated_at >= loc.updated_at))) {
        const { user_id, log_date, ...rest } = row; state.daily[log_date] = rest;
      }
    });
    (w.data || []).forEach((row) => { state.weigh[row.weigh_date] = { weight_lb: row.weight_lb, updated_at: row.created_at }; });
    (r.data || []).forEach((row) => { const { user_id, week_start, ...rest } = row; state.ratings[week_start] = rest; });
    persistDaily(); persistWeigh(); persistRatings(); emit();
  } catch (e) { /* offline / not ready — ignore */ }
}

/* sync status badge hook (set by app) */
let syncBadgeFn = null;
export const onSyncStatus = (fn) => { syncBadgeFn = fn; };
function updateSyncBadge() { syncBadgeFn?.({ pending: state.pending.length, cloud: isCloud(), authed: !!currentUser }); }
export const syncState = () => ({ pending: state.pending.length, cloud: isCloud(), authed: !!currentUser });

/* ============================================================
   DEMO SEED (preview only — append ?demo to the URL)
   ============================================================ */
export function seedDemo() {
  if (Object.keys(state.daily).length) return; // never overwrite real data
  const rng = mulberry(20260703);
  const types = ["Push", "Pull", "Rest", "Legs", "Core", "Gym", "Rest"];
  for (let i = 20; i >= 1; i--) {
    const date = addDays(todayISO(), -i);
    const good = rng() > 0.25;
    const wk = WORKOUT_BY_DOW[dow(date)];
    state.daily[date] = {
      workout_done: wk !== "Rest" && good, workout_type: wk !== "Rest" && good ? wk : null,
      sleep_hours: Math.round((6.5 + rng() * 2.2) * 2) / 2,
      morning_protocol_done: rng() > 0.3,
      deep_work_blocks: Math.min(3, Math.floor(rng() * 3.4)),
      no_screens_after_9: rng() > 0.45,
      journal_done: rng() > 0.35,
      journal_went_well: good ? "Shipped the decision-engine spec." : "",
      journal_improve: "Sleep earlier.", journal_grateful: "Family, the farm.",
      updated_at: new Date().toISOString(),
    };
  }
  // a few Sunday weigh-ins trending up (rounded; clamped to today)
  [-21, -14, -7, 0].forEach((off, i) => {
    const sun0 = addDays(weekStartISO(addDays(todayISO(), off)), 6);
    const sun = sun0 > todayISO() ? todayISO() : sun0;
    state.weigh[sun] = { weight_lb: Math.round((130.5 + i * 1.1 + (rng() - 0.5)) * 10) / 10, updated_at: new Date().toISOString() };
  });
  persistDaily(); persistWeigh(); emit();
}
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
