#!/usr/bin/env node
// ============================================================
//  WHOOP → Life Tracker sync (zero dependencies, Node 18+)
//
//  Commands:
//    node whoop/sync.mjs auth    one-time OAuth (opens browser, saves refresh token)
//    node whoop/sync.mjs sync    pull last N days → whoop.json (+ Supabase if configured)
//    node whoop/sync.mjs demo    write plausible fake data (preview without a WHOOP account)
//
//  Secrets live OUTSIDE the repo in:
//    Personal Life/06_Health & Fitness/.tracker-secrets.env
//  Keys used: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REFRESH_TOKEN (written by `auth`),
//             SUPABASE_URL, SUPABASE_SERVICE_KEY (optional — enables cloud upsert)
//
//  WHOOP rotates refresh tokens on every use — this script persists the
//  new token back to the secrets file after each refresh. Do not reuse old tokens.
// ============================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "..");
const OUT_FILE = path.join(APP_DIR, "whoop.json");
const SECRETS_FILE = process.env.TRACKER_SECRETS ||
  path.resolve(APP_DIR, "../../06_Health & Fitness/.tracker-secrets.env");

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer/v2";
const SCOPES = "offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement";
const CALLBACK_PORT = 8799;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const DAYS_BACK = parseInt(process.env.WHOOP_DAYS || "14", 10);

/* ---------------- secrets file ---------------- */
function readSecrets() {
  const out = {};
  try {
    for (const line of fs.readFileSync(SECRETS_FILE, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* file may not exist yet */ }
  return out;
}
function writeSecret(key, value) {
  let text = "";
  try { text = fs.readFileSync(SECRETS_FILE, "utf8"); } catch {}
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, "m").test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    text = text.length && !text.endsWith("\n") ? text + "\n" + line + "\n" : text + line + "\n";
  }
  fs.mkdirSync(path.dirname(SECRETS_FILE), { recursive: true });
  fs.writeFileSync(SECRETS_FILE, text, { mode: 0o600 });
}

/* ---------------- small utils ---------------- */
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };
const log = (msg) => console.log("· " + msg);
const isoDay = (d) => d.toISOString().slice(0, 10);

// UTC instant + WHOOP timezone_offset ("+02:00" / "-05:00") → local calendar date
function localDate(utcISO, tzOffset) {
  const t = new Date(utcISO).getTime();
  let mins = 0;
  const m = /^([+-])(\d{2}):(\d{2})/.exec(tzOffset || "");
  if (m) mins = (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  return isoDay(new Date(t + mins * 60000));
}
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
const r2 = (x) => x == null ? null : Math.round(x * 100) / 100;

/* ---------------- OAuth ---------------- */
async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function cmdAuth() {
  const s = readSecrets();
  if (!s.WHOOP_CLIENT_ID || !s.WHOOP_CLIENT_SECRET)
    die(`Missing WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET in\n  ${SECRETS_FILE}\nCreate an app at developer.whoop.com (redirect URI: ${REDIRECT_URI}) and add both lines first.`);

  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const url = `${AUTH_URL}?` + new URLSearchParams({
    client_id: s.WHOOP_CLIENT_ID, redirect_uri: REDIRECT_URI,
    response_type: "code", scope: SCOPES, state,
  });

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (u.pathname !== "/callback") { res.writeHead(404); res.end(); return; }
      const ok = u.searchParams.get("code") && u.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html" });
      res.end(`<body style="background:#0A0B0D;color:#E8E6E1;font-family:Georgia,serif;display:grid;place-items:center;height:100vh;margin:0">
        <div style="text-align:center"><div style="width:56px;height:56px;border:1px solid #8A93A6;border-radius:999px;display:grid;place-items:center;margin:0 auto 16px;color:#C7CDD6;font-size:26px">R</div>
        ${ok ? "WHOOP connected. You can close this tab." : "Authorization failed — return to the terminal."}</div></body>`);
      server.close();
      ok ? resolve(u.searchParams.get("code")) : reject(new Error("bad callback (state mismatch or no code)"));
    });
    server.listen(CALLBACK_PORT, () => {
      log(`Opening WHOOP consent screen… (listening on :${CALLBACK_PORT})`);
      execFile("open", [url], (err) => { if (err) log(`Open this URL manually:\n${url}`); });
    });
    setTimeout(() => { server.close(); reject(new Error("timed out after 3 minutes")); }, 180000);
  });

  const tok = await tokenRequest({
    grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI,
    client_id: s.WHOOP_CLIENT_ID, client_secret: s.WHOOP_CLIENT_SECRET,
  });
  if (!tok.refresh_token) die("No refresh_token returned — ensure the 'offline' scope is enabled for your WHOOP app.");
  writeSecret("WHOOP_REFRESH_TOKEN", tok.refresh_token);
  log(`Refresh token saved to ${path.basename(SECRETS_FILE)}.`);
  log("Done — run `node whoop/sync.mjs sync` any time.");
}

/* ---------------- API pull ---------------- */
async function refreshAccess(s) {
  const tok = await tokenRequest({
    grant_type: "refresh_token", refresh_token: s.WHOOP_REFRESH_TOKEN,
    client_id: s.WHOOP_CLIENT_ID, client_secret: s.WHOOP_CLIENT_SECRET, scope: "offline",
  }).catch((e) => die(`Token refresh failed (${e.message}).\nIf this persists, run \`node whoop/sync.mjs auth\` again.`));
  // WHOOP rotates refresh tokens — persist the new one IMMEDIATELY.
  if (tok.refresh_token) writeSecret("WHOOP_REFRESH_TOKEN", tok.refresh_token);
  return tok.access_token;
}

async function getPaged(access, pathName, start) {
  const records = [];
  let nextToken, pages = 0;
  const MAX_PAGES = 500; // 500 × 25 records — years of history
  while (pages < MAX_PAGES) {
    const qs = new URLSearchParams({ limit: "25", start });
    if (nextToken) qs.set("nextToken", nextToken);
    const res = await fetch(`${API}/${pathName}?${qs}`, { headers: { Authorization: `Bearer ${access}` } });
    if (res.status === 429) { // rate-limited — wait and retry the same page
      const wait = Math.min(90, parseInt(res.headers.get("retry-after") || "30", 10) + 1);
      log(`rate-limited on ${pathName} — waiting ${wait}s…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (res.status === 401) die("WHOOP rejected the token (401) — run `node whoop/sync.mjs auth` again.");
    if (!res.ok) die(`GET ${pathName} → ${res.status}: ${await res.text()}`);
    const body = await res.json();
    records.push(...(body.records || []));
    nextToken = body.next_token || body.nextToken;
    pages++;
    if (!nextToken) break;
  }
  if (pages >= MAX_PAGES) log(`⚠ ${pathName}: hit the ${MAX_PAGES}-page cap — oldest records may be missing`);
  return records;
}

function buildDays({ sleeps, recoveries, cycles, workouts }) {
  const days = {};
  const day = (d) => (days[d] ||= { workout_count: 0, workout_sports: [] });

  // sleeps → the sleep that ENDS on day X is day X's sleep (skip naps, keep longest)
  const sleepById = {};
  for (const sl of sleeps) {
    const d = localDate(sl.end, sl.timezone_offset);
    sleepById[sl.id] = d;
    if (sl.nap || sl.score_state !== "SCORED" || !sl.score) continue;
    const st = sl.score.stage_summary || {};
    const asleepH = ((st.total_light_sleep_time_milli || 0) + (st.total_slow_wave_sleep_time_milli || 0) + (st.total_rem_sleep_time_milli || 0)) / 3600000;
    const t = day(d);
    if (t.sleep_hours == null || asleepH > t.sleep_hours) {
      t.sleep_hours = r2(asleepH);
      t.sleep_performance_pct = sl.score.sleep_performance_percentage ?? null;
      t.sleep_consistency_pct = sl.score.sleep_consistency_percentage ?? null;
      t.sleep_efficiency_pct = r1(sl.score.sleep_efficiency_percentage);
      t.respiratory_rate = r2(sl.score.respiratory_rate);
    }
  }

  // recoveries → date of the linked sleep (fallback: created_at UTC date)
  for (const rc of recoveries) {
    if (rc.score_state !== "SCORED" || !rc.score) continue;
    const d = sleepById[rc.sleep_id] || (rc.created_at || "").slice(0, 10);
    if (!d) continue;
    const t = day(d);
    t.recovery_score = Math.round(rc.score.recovery_score);
    t.hrv_ms = r1(rc.score.hrv_rmssd_milli);
    t.rhr_bpm = Math.round(rc.score.resting_heart_rate);
    t.spo2_pct = r1(rc.score.spo2_percentage);
    t.skin_temp_c = r2(rc.score.skin_temp_celsius);
  }

  // cycles → strain for the local date the cycle STARTS
  for (const cy of cycles) {
    if (!cy.score) continue;
    const t = day(localDate(cy.start, cy.timezone_offset));
    t.day_strain = r1(cy.score.strain);
    t.avg_hr_bpm = cy.score.average_heart_rate ?? null;
    t.max_hr_bpm = cy.score.max_heart_rate ?? null;
  }

  // workouts
  for (const w of workouts) {
    const t = day(localDate(w.start, w.timezone_offset));
    t.workout_count += 1;
    const sport = w.sport_name || (w.sport_id != null ? `sport ${w.sport_id}` : "workout");
    if (!t.workout_sports.includes(sport)) t.workout_sports.push(sport);
  }

  for (const d of Object.values(days)) d.workout_sports = d.workout_sports.join(", ");
  return days;
}

/* ---------------- outputs ---------------- */
function writeLocal(days) {
  const payload = { source: "whoop", generated_at: new Date().toISOString(), days };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  log(`Wrote ${Object.keys(days).length} day(s) → ${path.relative(process.cwd(), OUT_FILE)}`);
}

async function upsertSupabase(days, s) {
  if (!s.SUPABASE_URL || !s.SUPABASE_SERVICE_KEY) { log("Supabase not configured — local file only (fine before setup)."); return; }
  const H = { apikey: s.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${s.SUPABASE_SERVICE_KEY}` };
  // single-user project: resolve the one user id via the admin API
  const ur = await fetch(`${s.SUPABASE_URL}/auth/v1/admin/users?per_page=1`, { headers: H });
  if (!ur.ok) { log(`could not resolve user (auth admin ${ur.status}) — skipped cloud upsert`); return; }
  const uid = (await ur.json()).users?.[0]?.id;
  if (!uid) { log("no user exists yet in Supabase — sign into the app once, then re-run sync"); return; }

  // PostgREST bulk upsert requires identical keys on every row — normalize to the full column set.
  const COLS = ["recovery_score","hrv_ms","rhr_bpm","spo2_pct","skin_temp_c","sleep_hours",
    "sleep_performance_pct","sleep_consistency_pct","sleep_efficiency_pct","respiratory_rate",
    "day_strain","avg_hr_bpm","max_hr_bpm","workout_count"];
  const now = new Date().toISOString();
  const rows = Object.entries(days).map(([d, v]) => {
    const row = { user_id: uid, day: d, workout_sports: v.workout_sports || null, raw: null, synced_at: now };
    for (const c of COLS) row[c] = v[c] ?? (c === "workout_count" ? 0 : null);
    return row;
  });
  for (let i = 0; i < rows.length; i += 500) { // chunked for large backfills
    const res = await fetch(`${s.SUPABASE_URL}/rest/v1/whoop_daily?on_conflict=user_id,day`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) die(`Supabase upsert failed ${res.status}: ${await res.text()}`);
  }
  log(`Upserted ${rows.length} day(s) → Supabase whoop_daily`);
}

async function cmdSync() {
  const s = readSecrets();
  if (!s.WHOOP_CLIENT_ID || !s.WHOOP_CLIENT_SECRET) die(`Missing WHOOP credentials in ${SECRETS_FILE} — see SETUP.md`);
  if (!s.WHOOP_REFRESH_TOKEN) die("No WHOOP_REFRESH_TOKEN yet — run `node whoop/sync.mjs auth` first.");
  const access = await refreshAccess(s);
  const start = new Date(Date.now() - DAYS_BACK * 86400000).toISOString();
  log(`Pulling last ${DAYS_BACK} days from WHOOP…`);
  const [recoveries, sleeps, cycles, workouts] = await Promise.all([
    getPaged(access, "recovery", start),
    getPaged(access, "activity/sleep", start),
    getPaged(access, "cycle", start),
    getPaged(access, "activity/workout", start),
  ]);
  log(`recovery:${recoveries.length} sleep:${sleeps.length} cycles:${cycles.length} workouts:${workouts.length}`);
  const days = buildDays({ sleeps, recoveries, cycles, workouts });
  writeLocal(days);
  await upsertSupabase(days, s);
  log("Sync complete.");
}

/* ---------------- demo data (preview without an account) ---------------- */
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function cmdDemo() {
  const rng = mulberry(20260704);
  const sports = ["Weightlifting", "Functional Fitness", "Running", "Horseback Riding"];
  const days = {};
  for (let i = 20; i >= 0; i--) {
    const d = isoDay(new Date(Date.now() - i * 86400000));
    const rec = Math.round(35 + rng() * 60);
    const worked = rng() > 0.35;
    days[d] = {
      recovery_score: rec,
      hrv_ms: r1(55 + rng() * 65),
      rhr_bpm: Math.round(48 + rng() * 10),
      spo2_pct: r1(95 + rng() * 3),
      skin_temp_c: r2(33 + rng() * 1.5),
      sleep_hours: r2(5.9 + rng() * 3),
      sleep_performance_pct: Math.round(60 + rng() * 38),
      sleep_consistency_pct: Math.round(55 + rng() * 40),
      sleep_efficiency_pct: r1(85 + rng() * 12),
      respiratory_rate: r2(13 + rng() * 3),
      day_strain: r1(5 + rng() * 12),
      avg_hr_bpm: Math.round(58 + rng() * 14),
      max_hr_bpm: Math.round(140 + rng() * 45),
      workout_count: worked ? 1 : 0,
      workout_sports: worked ? sports[Math.floor(rng() * sports.length)] : "",
    };
  }
  writeLocal(days);
  log("Demo WHOOP data written — reload the app to see it.");
}

/* ---------------- main ---------------- */
const cmd = process.argv[2] || "sync";
if (cmd === "auth") await cmdAuth();
else if (cmd === "sync") await cmdSync();
else if (cmd === "demo") cmdDemo();
else die(`Unknown command "${cmd}" — use auth | sync | demo`);
