// ============================================================
//  app.js — controller: boot, routing, auth gate, theme, screens
// ============================================================
import * as S from "./store.js";
import { el, clear, ring, heatmap, weightChart, ratingBars, sparkline, iconSVG } from "./ui.js";
import {
  HABITS, RATINGS, WEIGHT_TARGETS, WEIGHT_UNIT, OWNER, LS, RECOVERY_BANDS,
} from "./config.js";

const view = document.getElementById("view");
const app = document.getElementById("app");
const splash = document.getElementById("splash");
const phaseTag = document.getElementById("phaseTag");

let route = "today";
let lastPop = null;
const uiState = {
  history: { habit: "overall", expanded: new Set() },
  review: { weekOffset: 0 },
};

/* ---------------- boot ---------------- */
function boot() {
  S.load();
  initTheme();
  S.initSupabase();
  if (location.search.includes("demo")) S.seedDemo();
  S.loadWhoop(); // async — re-renders via onChange when data lands

  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => setRoute(t.dataset.route)));
  document.getElementById("themeBtn").addEventListener("click", toggleTheme);

  S.onAuth(renderGate);
  S.onChange(() => { if (!needsLogin()) renderRoute(); });

  setRoute("today");
  requestAnimationFrame(() => {
    app.hidden = false;
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 420);
  });
}

/* ---------------- theme ---------------- */
function initTheme() {
  document.documentElement.dataset.theme = localStorage.getItem(LS.theme) || "gunmetal";
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === "gunmetal" ? "gold" : "gunmetal";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(LS.theme, next);
  renderRoute();
}

/* ---------------- auth gate ---------------- */
const needsLogin = () => S.isCloud() && !S.getUser();
function renderGate() {
  if (needsLogin()) { app.hidden = true; renderLogin(); }
  else { document.getElementById("login")?.remove(); app.hidden = false; renderRoute(); }
}
function renderLogin() {
  if (document.getElementById("login")) return;
  const node = el("div", { id: "login", class: "login" });
  const card = el("div", { class: "login__card fade-in" });
  card.innerHTML = `
    <div class="beams" aria-hidden="true"><span class="b-top"></span><span class="b-right"></span><span class="b-bottom"></span><span class="b-left"></span></div>
    <div class="crest" style="margin:0 auto 22px">R</div><h1>Command Console</h1><p>Sign in to sync across your devices.</p>`;
  const email = el("input", { type: "email", placeholder: "you@email.com", autocomplete: "email" });
  const btn = el("button", { class: "btn btn--primary btn--block", text: "Send magic link" });
  const note = el("div", { class: "login__note" });
  btn.addEventListener("click", async () => {
    if (!email.value.includes("@")) { email.focus(); return; }
    btn.textContent = "Sending…"; btn.disabled = true;
    try { await S.signIn(email.value.trim()); note.textContent = "Check your email for the link."; }
    catch (e) { note.textContent = "Couldn't send — check the address."; btn.disabled = false; btn.textContent = "Send magic link"; }
  });
  card.append(email, btn, note);
  node.append(card);
  document.body.append(node);
}

/* ---------------- routing ---------------- */
function setRoute(r) {
  route = r;
  document.querySelectorAll(".tab").forEach((t) =>
    t.setAttribute("aria-current", t.dataset.route === r ? "page" : "false"));
  window.scrollTo(0, 0);
  renderGate();
}
function renderRoute() {
  if (needsLogin()) return;
  updatePhaseTag();
  view.className = "view fade-in" + (route === "today" ? " today-view" : "");
  clear(view);
  ({ today: renderToday, dashboard: renderDashboard, history: renderHistory, review: renderReview }[route] || renderToday)();
}
function updatePhaseTag() {
  const { phase, daysLeft } = S.phaseCountdown();
  phaseTag.textContent = `${phase.label} · ${daysLeft}d to ${phase.end}${WEIGHT_UNIT}`;
}

/* ============================================================
   TODAY
   ============================================================ */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function touch(date, patch) {
  if (!S.hasDay(date)) {
    // smart default: strap-measured sleep beats the rolling average
    const w = S.getWhoop(date);
    const def = w?.sleep_hours != null ? Math.round(w.sleep_hours * 10) / 10 : S.rollingAvgSleep();
    patch = { sleep_hours: def, ...patch };
  }
  return S.patchDay(date, patch);
}
const recoveryBand = (r) =>
  r >= RECOVERY_BANDS.green ? "var(--positive)" : r >= RECOVERY_BANDS.yellow ? "var(--warn)" : "var(--danger)";

function renderToday() {
  const date = S.todayISO();
  const d = S.getDay(date);
  const count = S.adherenceCount(date);
  const streak = S.overallStreak();

  // header
  const head = el("div", { class: "today-head" });
  const rowB = el("div", { class: "row-between" });
  rowB.append(
    el("div", {},
      el("div", { class: "h-greeting" }, `${greeting()}, ${OWNER.name}.`),
      el("div", { class: "eyebrow", style: "margin-top:4px" }, S.fmtDate(date, { weekday: "long", month: "long", day: "numeric" })),
    ),
    el("div", { class: "streak-badge" },
      el("div", { class: "n metal" }, String(streak.current)),
      el("span", { class: "eyebrow l" }, "day streak"),
    ),
  );
  const atRisk = count < 4 && new Date().getHours() >= 20;
  const chain = el("div", { class: "chain" + (atRisk ? " at-risk" : "") , html:
    `${iconSVG("link", "ic")}<span>${atRisk
      ? `Chain at risk — log today to keep ${streak.current}.`
      : `Chain intact — day ${streak.current}. Longest: ${streak.longest}.`}</span>` });
  head.append(rowB, chain);

  // WHOOP vitals line — quiet, mono, only when the strap has data for today
  const w = S.getWhoop(date);
  if (w?.recovery_score != null) {
    const parts = [`Recovery ${w.recovery_score}%`];
    if (w.hrv_ms != null) parts.push(`HRV ${Math.round(w.hrv_ms)} ms`);
    if (w.day_strain != null) parts.push(`Strain ${w.day_strain.toFixed(1)}`);
    head.append(el("div", { class: "whoop-line" },
      el("span", { class: "band-dot", style: `background:${recoveryBand(w.recovery_score)}` }),
      parts.join(" · ")));
  }

  // ring + whisper
  const left = 6 - count;
  const whisper = count === 6 ? "A good day, logged." : count === 0 ? "The day awaits." : `${left} to go.`;
  const ringCard = el("div", { class: "card" + (count === 6 ? " sealed" : "") },
    el("div", { class: "ring-wrap" }, ring(count, 6), el("div", { class: "whisper" }, whisper)));

  // checklist
  const list = el("div", { class: "card checklist" });
  HABITS.forEach((h) => list.append(renderCrow(h, d, date)));

  // sync banner
  const sy = S.syncState();
  let banner = null;
  if (!sy.cloud) banner = el("div", { class: "banner", html: `<span class="dot"></span><span>Local only — finish setup to sync phone ↔ laptop.</span>` });
  else if (sy.pending) banner = el("div", { class: "banner", html: `<span class="dot"></span><span>${sy.pending} change(s) waiting to sync.</span>` });

  view.append(head, ringCard, list);
  if (banner) view.append(el("div", { style: "margin-top:16px" }, banner));
}

function renderCrow(h, d, date) {
  const done = h.hit(d);
  const crow = el("div", { class: "crow" + (done ? " done" : "") });
  const main = el("div", { class: "crow__main" },
    el("div", { class: "crow__label" }, h.label));
  const control = el("div", { class: "crow__control" });

  const pop = (node, field) => { if (lastPop === field) { node.classList.add("pop"); lastPop = null; } };
  const mkToggle = (on, field) => {
    // decorative — the whole row is the control
    const t = el("div", { class: "toggle" + (on ? " on" : ""), "aria-hidden": "true" });
    pop(t, field);
    return t;
  };
  // Whole-row tap target (≥44px), keyboard-operable, announced as a toggle.
  const wireRow = (on, fire) => {
    crow.classList.add("crow--tap");
    crow.setAttribute("role", "button");
    crow.setAttribute("tabindex", "0");
    crow.setAttribute("aria-pressed", on ? "true" : "false");
    crow.setAttribute("aria-label", h.label);
    const guard = (e) => !e.target.closest(".chips, .journal, button, input");
    crow.addEventListener("click", (e) => { if (guard(e)) fire(); });
    crow.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); }
    });
  };

  if (h.kind === "toggle") {
    control.append(mkToggle(d[h.field], h.field));
    wireRow(d[h.field], () => { lastPop = h.field; touch(date, { [h.field]: !d[h.field] }); });
  }

  else if (h.kind === "toggle-type") {
    control.append(mkToggle(d.workout_done, h.field));
    wireRow(d.workout_done, () => {
      const on = !d.workout_done; lastPop = h.field;
      const patch = { workout_done: on };
      if (on && !d.workout_type) { const s = S.suggestedWorkoutType(date); patch.workout_type = s === "Rest" ? "Push" : s; }
      touch(date, patch);
    });
    if (d.workout_done) {
      main.append(el("div", { class: "crow__sub" }, d.workout_type || "pick a type"));
      const chips = el("div", { class: "chips" });
      ["Push", "Pull", "Legs", "Core", "Gym", "Sprint"].forEach((ty) =>
        chips.append(el("button", {
          class: "chip" + (d.workout_type === ty ? " sel" : ""),
          text: ty, "aria-pressed": d.workout_type === ty ? "true" : "false",
          onClick: () => touch(date, { workout_type: ty }),
        })));
      main.append(chips);
    }
  }

  else if (h.kind === "number") {
    const val = d[h.field];
    const shown = val != null ? val : S.rollingAvgSleep();
    const wSleep = S.getWhoop(date)?.sleep_hours;
    const fromWhoop = val != null && wSleep != null && Math.abs(val - wSleep) < 0.06;
    main.append(el("div", { class: "crow__sub" },
      fromWhoop ? "via WHOOP" : val != null ? (done ? "logged" : "below target") : `~${shown} avg`));
    const step = el("div", { class: "stepper" });
    const mk = (lbl, dv, name) => el("button", { text: lbl, "aria-label": `${name} ${h.label}`, onClick: () => {
      const base = (S.getDay(date)[h.field] ?? S.rollingAvgSleep());
      touch(date, { [h.field]: Math.max(h.min, Math.min(h.max, Math.round((base + dv) * 2) / 2)) });
    }});
    step.append(mk("–", -h.step, "decrease"),
      el("div", { class: "val", html: `${shown}<span class="u">h</span>` }),
      mk("+", h.step, "increase"));
    control.append(step);
  }

  else if (h.kind === "segments") {
    main.append(el("div", { class: "crow__sub" }, `${d[h.field]} of ${h.max}${done ? "" : " · need " + h.threshold}`));
    const segs = el("div", { class: "segs" });
    for (let i = 0; i < h.max; i++) {
      const on = d[h.field] >= i + 1;
      segs.append(el("button", {
        class: "seg" + (on ? " on" : ""),
        "aria-label": `${i + 1} ${i ? "blocks" : "block"}`,
        "aria-pressed": on ? "true" : "false",
        onClick: () => { const cur = S.getDay(date)[h.field]; touch(date, { [h.field]: cur === i + 1 ? i : i + 1 }); },
      }));
    }
    control.append(segs);
  }

  else if (h.kind === "toggle-journal") {
    control.append(mkToggle(d.journal_done, h.field));
    wireRow(d.journal_done, () => { lastPop = h.field; touch(date, { journal_done: !d.journal_done }); });
  }

  crow.prepend(el("div", { class: "crow__ic", html: iconSVG(h.icon, "ic") }));
  crow.append(main, control);

  // journal expanded fields row (full width, below)
  if (h.kind === "toggle-journal" && d.journal_done) {
    const j = el("div", { class: "journal open" });
    h.fields.forEach((f) => {
      const input = el("input", { type: "text", value: d[f.key] || "", placeholder: "…" });
      input.addEventListener("change", () => S.patchDay(date, { [f.key]: input.value }));
      j.append(el("div", { class: "fld" }, el("label", {}, f.label), input));
    });
    const wrap = el("div", {});
    wrap.append(crow, j);
    return wrap;
  }
  return crow;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
const ADH_LEVEL = [0, 1, 1, 2, 3, 3, 4]; // adherenceCount 0..6 -> heat level
function renderDashboard() {
  const bento = el("div", { class: "bento" });

  // vitals
  const wk = S.weekSummary(S.weekStartISO(S.todayISO()));
  const latest = S.latestWeight();
  const series = S.weighSeries();
  const prev = series.length > 1 ? series[series.length - 2].lb : null;
  const delta = latest && prev != null ? (latest.lb - prev) : null;
  const { phase, daysLeft } = S.phaseCountdown();

  const vitals = el("div", { class: "span-12" }, el("div", { class: "vitals" },
    stat(`${wk.avgAdherence}`, "%", "This week adherence"),
    stat(latest ? latest.lb.toFixed(1) : "—", WEIGHT_UNIT, "Current weight",
      delta != null ? el("span", { class: "delta " + (delta >= 0 ? "up" : "down") }, `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`) : null),
    stat(`${daysLeft}`, "d", `To ${phase.end}${WEIGHT_UNIT} (${phase.label})`),
  ));

  // WHOOP recovery panel (only when synced data exists)
  let whoopCard = null;
  const lw = S.latestWhoop();
  if (lw) {
    const spark = S.whoopSeries(14, "recovery_score");
    whoopCard = el("div", { class: "card span-12" });
    whoopCard.append(
      el("div", { class: "eyebrow-row" },
        el("span", { class: "eyebrow" }, `Recovery · WHOOP`),
        el("span", { class: "whoop-line", style: "margin-top:0" },
          el("span", { class: "band-dot", style: `background:${recoveryBand(lw.recovery_score)}` }),
          lw.date === S.todayISO() ? "today" : S.fmtDate(lw.date))),
      el("div", { class: "vitals vitals--4" },
        stat(String(lw.recovery_score), "%", "Recovery"),
        stat(lw.hrv_ms != null ? String(Math.round(lw.hrv_ms)) : "—", "ms", "HRV"),
        stat(lw.rhr_bpm != null ? String(lw.rhr_bpm) : "—", "bpm", "Resting HR"),
        stat(lw.day_strain != null ? lw.day_strain.toFixed(1) : "—", "", "Day strain")),
      spark.length > 2
        ? el("div", { style: "margin-top:14px;display:flex;align-items:center;gap:10px" },
            sparkline(spark, { width: 220, height: 26 }),
            el("span", { class: "eyebrow" }, "14-day recovery"))
        : "");
  }

  // chain
  const chainCard = el("div", { class: "card span-12" });
  chainCard.append(
    el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "The chain"),
      el("span", { class: "mono", style: "color:var(--accent-bright);font-size:22px" }, String(S.overallStreak().current))),
    (() => {
      const chips = el("div", { class: "streakchips" });
      HABITS.forEach((h) => { const s = S.habitStreak(h.id);
        chips.append(el("div", { class: "schip" }, el("span", { class: "lab" }, h.short), el("span", { class: "n" }, String(s.current)))); });
      return chips;
    })(),
  );

  // heatmap
  const hmCard = el("div", { class: "card span-12" },
    el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "Adherence · 13 weeks")),
    heatmap((date) => S.hasDay(date) ? ADH_LEVEL[S.adherenceCount(date)] : null, { weeks: 13 }));

  // weight chart
  const wtCard = el("div", { class: "card span-8" },
    el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "Weight vs. goal")),
    series.length ? weightChart(series, WEIGHT_TARGETS)
      : el("div", { class: "empty" }, "Log a Sunday weigh-in to start the curve."));

  // ratings (latest set week)
  const rWk = latestRatingWeek();
  const rCard = el("div", { class: "card span-4" },
    el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "Weekly ratings")),
    rWk ? ratingBars(RATINGS.map((r) => ({ label: r.label, n: rWk[r.key] || 0 })))
      : el("div", { class: "empty" }, "Rate your week in Review."));

  bento.append(vitals);
  if (whoopCard) bento.append(whoopCard);
  bento.append(chainCard, hmCard, wtCard, rCard);
  view.append(bento);
}
function stat(v, unit, k, extra) {
  return el("div", { class: "stat" },
    el("div", { class: "v", html: `<span class="metal">${v}</span><span class="u">${unit}</span>` }, extra || ""),
    el("div", { class: "k eyebrow" }, k));
}
function latestRatingWeek() {
  const ws = S.weekStartISO(S.todayISO());
  for (let i = 0; i < 8; i++) { const r = S.getRating(S.addDays(ws, -i * 7)); if (Object.keys(r).length > 1) return r; }
  return null;
}

/* ============================================================
   HISTORY
   ============================================================ */
function renderHistory() {
  const sel = el("div", { class: "chips", style: "margin-bottom:16px" });
  const opts = [{ id: "overall", short: "Overall" }, ...HABITS];
  opts.forEach((o) => sel.append(el("button", {
    class: "chip" + (uiState.history.habit === o.id ? " sel" : ""), text: o.short,
    onClick: () => { uiState.history.habit = o.id; renderRoute(); },
  })));

  const hid = uiState.history.habit;
  const habit = HABITS.find((h) => h.id === hid);
  const levelFor = (date) => {
    if (!S.hasDay(date)) return null;
    if (hid === "overall") return ADH_LEVEL[S.adherenceCount(date)];
    return habit.hit(S.getDay(date)) ? 4 : 1;
  };
  const hmCard = el("div", { class: "card" },
    el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, (habit ? habit.label : "Overall") + " · 13 weeks")),
    heatmap(levelFor, { weeks: 13 }));

  // day log
  const logCard = el("div", { class: "card section-gap" });
  logCard.append(el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "Log")));
  const dates = S.allDaysSorted().reverse();
  if (!dates.length) logCard.append(el("div", { class: "empty" }, "No entries yet. Log today to begin."));
  const daylog = el("div", { class: "daylog" });
  let lastMonth = "";
  dates.forEach((date) => {
    const mon = S.fmtDate(date, { month: "long", year: "numeric" });
    if (mon !== lastMonth) { daylog.append(el("div", { class: "month-div" }, mon)); lastMonth = mon; }
    daylog.append(dayRow(date));
  });
  logCard.append(daylog);
  view.append(sel, hmCard, logCard);
}
function dayRow(date) {
  const d = S.getDay(date);
  const dots = el("div", { class: "dlrow__dots" });
  HABITS.forEach((h) => dots.append(el("div", { class: "ddot" + (h.hit(d) ? " on" : ""), title: h.short })));
  const w = S.weighSeries().find((x) => x.date === date);
  const row = el("div", { class: "dlrow" },
    el("div", { class: "dlrow__date" }, S.fmtDate(date, { month: "short", day: "numeric" })),
    dots,
    el("div", { class: "dlrow__wt" }, w ? `${w.lb.toFixed(1)}${WEIGHT_UNIT}` : ""));
  const wrap = el("div", {});
  wrap.append(row);
  const hasJournal = d.journal_went_well || d.journal_improve || d.journal_grateful;
  row.style.cursor = hasJournal ? "pointer" : "default";
  if (hasJournal) {
    row.addEventListener("click", () => {
      if (uiState.history.expanded.has(date)) uiState.history.expanded.delete(date);
      else uiState.history.expanded.add(date);
      renderRoute();
    });
    if (uiState.history.expanded.has(date)) {
      const ex = el("div", { class: "dlrow__expand" });
      if (d.journal_went_well) ex.append(el("div", { class: "jline", html: `<b>Went well — </b>${esc(d.journal_went_well)}` }));
      if (d.journal_improve) ex.append(el("div", { class: "jline", html: `<b>Improve — </b>${esc(d.journal_improve)}` }));
      if (d.journal_grateful) ex.append(el("div", { class: "jline", html: `<b>Grateful — </b>${esc(d.journal_grateful)}` }));
      wrap.append(ex);
    }
  }
  return wrap;
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* ============================================================
   WEEKLY REVIEW
   ============================================================ */
function isoWeek(dateISO) {
  const d = S.parseISO(dateISO); const t = new Date(d);
  t.setDate(t.getDate() + 3 - ((d.getDay() + 6) % 7));
  const wk1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - wk1) / 86400000 - 3 + ((wk1.getDay() + 6) % 7)) / 7);
}
function renderReview() {
  const ws = S.weekStartISO(S.addDays(S.todayISO(), uiState.review.weekOffset * 7));
  const sum = S.weekSummary(ws);
  const rating = S.getRating(ws);

  // header + week nav
  const head = el("div", { class: "row-between", style: "align-items:center;margin-bottom:16px" },
    el("div", {}, el("div", { class: "h-section" }, `Week ${isoWeek(ws)} — a review`),
      el("div", { class: "eyebrow", style: "margin-top:3px" }, `${S.fmtDate(ws)} – ${S.fmtDate(S.addDays(ws, 6))}`)),
    el("div", { style: "display:flex;gap:6px" },
      el("button", { class: "iconbtn", text: "‹", onClick: () => { uiState.review.weekOffset--; renderRoute(); } }),
      el("button", { class: "iconbtn", text: "›", disabled: uiState.review.weekOffset >= 0,
        onClick: () => { if (uiState.review.weekOffset < 0) { uiState.review.weekOffset++; renderRoute(); } } })));

  // weigh-in
  const sunday = S.addDays(ws, 6);
  const existing = S.weighSeries().find((x) => x.date >= ws && x.date <= sunday);
  const prev = S.weighSeries().filter((x) => x.date < ws).pop();
  const weighCard = el("div", { class: "card" });
  weighCard.append(el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "Sunday weigh-in")));
  const input = el("input", { type: "number", inputmode: "decimal", step: "0.1", placeholder: "—",
    value: existing ? existing.lb : "" });
  const deltaEl = el("span", { class: "mono tmuted", style: "font-size:13px" },
    existing && prev ? `${existing.lb - prev.lb >= 0 ? "+" : ""}${(existing.lb - prev.lb).toFixed(1)} vs last` : prev ? `last ${prev.lb}` : "");
  input.addEventListener("change", () => {
    const v = parseFloat(input.value); if (!isNaN(v)) S.setWeigh(sunday, Math.round(v * 10) / 10);
  });
  weighCard.append(el("div", { class: "bignum" }, input, el("span", { class: "tmuted", text: WEIGHT_UNIT }), deltaEl));

  // ratings
  const rateCard = el("div", { class: "card" });
  rateCard.append(el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "Rate the week · 1–5")));
  RATINGS.forEach((r) => {
    const rowEl = el("div", { style: "margin-bottom:12px" },
      el("div", { class: "eyebrow", style: "margin-bottom:6px;color:var(--text-secondary);letter-spacing:.04em;text-transform:none;font-size:12px" }, r.label));
    const pips = el("div", { class: "rate-select" });
    for (let i = 1; i <= 5; i++) pips.append(el("button", {
      class: "pip" + (rating[r.key] === i ? " on" : ""), text: String(i),
      "aria-label": `${r.label}: ${i} of 5`,
      "aria-pressed": rating[r.key] === i ? "true" : "false",
      onClick: () => S.setRating(ws, { [r.key]: i }),
    }));
    rowEl.append(pips); rateCard.append(rowEl);
  });

  // summary
  const adhSeries = Array.from({ length: 7 }, (_, i) => S.addDays(ws, i))
    .filter((dt) => dt <= S.todayISO() && S.hasDay(dt)).map((dt) => S.adherencePct(dt));
  const sumCard = el("div", { class: "card" });
  sumCard.append(el("div", { class: "eyebrow-row" }, el("span", { class: "eyebrow" }, "The week in numbers")));
  sumCard.append(el("div", { class: "vitals" },
    stat(`${sum.avgAdherence}`, "%", "Avg adherence"),
    stat(`${sum.workouts}`, "", "Workouts"),
    stat(sum.avgSleep != null ? sum.avgSleep.toFixed(1) : "—", "h", "Avg sleep")));
  const ww = S.whoopWeek(ws);
  if (ww.daysWithData > 0) {
    sumCard.append(el("div", { class: "vitals", style: "margin-top:12px" },
      stat(ww.avgRecovery != null ? String(ww.avgRecovery) : "—", "%", "Avg recovery · WHOOP"),
      stat(ww.avgHrv != null ? String(Math.round(ww.avgHrv)) : "—", "ms", "Avg HRV"),
      stat(ww.avgStrain != null ? ww.avgStrain.toFixed(1) : "—", "", "Avg strain")));
  }
  if (adhSeries.length) sumCard.append(el("div", { style: "margin-top:14px" }, sparkline(adhSeries, { width: 300, height: 30 })));
  const per = el("div", { class: "streakchips", style: "margin-top:14px" });
  HABITS.forEach((h) => per.append(el("div", { class: "schip" },
    el("span", { class: "lab" }, h.short), el("span", { class: "n" }, `${sum.perHabit[h.id]}/${sum.daysLogged || 0}`))));
  sumCard.append(per);

  // export
  const exportBtn = el("button", { class: "btn btn--block section-gap", text: "Export week to vault snapshot",
    onClick: () => exportWeek(ws, sum, rating) });

  view.append(head, el("div", { class: "split-2" }, weighCard, rateCard), el("div", { class: "section-gap" }, sumCard), exportBtn);
}

function exportWeek(ws, sum, rating) {
  const dates = Array.from({ length: 7 }, (_, i) => S.addDays(ws, i));
  const days = dates.filter(S.hasDay).map((dt) => ({ date: dt, ...S.getDay(dt), adherence_pct: S.adherencePct(dt), whoop: S.getWhoop(dt) }));
  const json = { week_start: ws, iso_week: isoWeek(ws), summary: sum, rating, days,
    whoop_week: S.whoopWeek(ws),
    weigh_ins: S.weighSeries().filter((x) => x.date >= ws && x.date <= S.addDays(ws, 6)) };
  let md = `# Week ${isoWeek(ws)} — Tracker Review\n\n`;
  md += `**${S.fmtDate(ws)} – ${S.fmtDate(S.addDays(ws, 6))}**\n\n`;
  md += `- Avg adherence: **${sum.avgAdherence}%**\n- Workouts: **${sum.workouts}**\n- Avg sleep: **${sum.avgSleep ?? "—"}h**\n`;
  md += `- Weigh-in: **${sum.weighin ?? "—"} ${WEIGHT_UNIT}**\n`;
  const wwx = S.whoopWeek(ws);
  if (wwx.daysWithData > 0)
    md += `- WHOOP: **${wwx.avgRecovery ?? "—"}%** avg recovery · **${wwx.avgHrv ?? "—"} ms** HRV · strain **${wwx.avgStrain ?? "—"}** · sleep **${wwx.avgSleep ?? "—"}h** (${wwx.daysWithData}d)\n`;
  md += `\n`;
  md += `## Per-habit (hits / days logged: ${sum.daysLogged})\n`;
  HABITS.forEach((h) => md += `- ${h.label}: ${sum.perHabit[h.id]}\n`);
  md += `\n## Journals\n`;
  days.forEach((d) => { if (d.journal_went_well || d.journal_improve || d.journal_grateful)
    md += `- **${d.date}** — well: ${d.journal_went_well || "—"} · improve: ${d.journal_improve || "—"} · grateful: ${d.journal_grateful || "—"}\n`; });

  download(`tracker-week-${ws}.json`, JSON.stringify(json, null, 2));
  download(`tracker-week-${ws}.md`, md);
}
function download(name, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
}

boot();

// service worker (offline shell) — no-op on file://
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
