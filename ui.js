// ============================================================
//  ui.js — tiny DOM helper + hand-rolled SVG visualizations
//  (adherence ring, calendar heatmap, weight-vs-goal chart,
//   rating bars, sparkline). No chart library.
// ============================================================
import { parseISO, isoDate, addDays, weekStartISO, daysBetween, todayISO } from "./store.js";

/* ---- hyperscript ---- */
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k in n && k !== "list") { try { n[k] = v; } catch { n.setAttribute(k, v); } }
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((c) => { if (c == null || c === false) return; n.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return n;
}
export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

/* ---- line icons (thin, 1.5px) ---- */
const ICONS = {
  dumbbell: '<path d="M4 9v6M7 8v8M17 8v8M20 9v6M7 12h10"/>',
  sunrise: '<path d="M12 3v4M5 10l1.5 1.5M2 16h2.5M19.5 16H22M17.5 11.5L19 10M8 16a4 4 0 0 1 8 0M3 20h18"/>',
  moon: '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  "smartphone-off": '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M4 3l16 18"/>',
  pen: '<path d="M14 5l5 5M4 20l1.2-4.2L15 6l3 3L8.2 18.8 4 20z"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.6-5.6l-1 1M14 11a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 5.6 5.6l1-1"/>',
};
export const iconSVG = (name, cls = "ic") =>
  `<svg viewBox="0 0 24 24" class="${cls}">${ICONS[name] || ""}</svg>`;

/* ============================================================
   Adherence ring
   ============================================================ */
let ringSeq = 0;
export function ring(count, total, size = 96, stroke = 6) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - count / total);
  const gid = `ringg${++ringSeq}`;
  const complete = count >= total;
  const wrap = el("div", { class: "ring" + (complete ? " complete" : ""), style: `width:${size}px;height:${size}px` });
  wrap.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--text-primary)"/>
          <stop offset="60%" stop-color="var(--accent-bright)"/>
          <stop offset="100%" stop-color="var(--accent)"/>
        </linearGradient>
      </defs>
      <circle class="track" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="fill" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke="url(#${gid})"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}"/>
    </svg>
    <div class="ring__center"><div><div class="n metal">${count}</div><div class="l">of ${total}</div></div></div>`;
  // sweep in from empty to value on mount (CSS transition carries it)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const f = wrap.querySelector(".fill");
    if (f) f.style.strokeDashoffset = off.toFixed(2);
  }));
  return wrap;
}

/* ============================================================
   Calendar heatmap — level function maps a date -> 0..4 (or null)
   weeks: how many week-columns back from today
   ============================================================ */
export function heatmap(levelFor, { weeks = 13 } = {}) {
  const today = todayISO();
  const start = weekStartISO(addDays(today, -(weeks - 1) * 7));

  // month labels — one per column where the month changes
  const months = el("div", { class: "hm-months", style: `grid-template-columns: repeat(${weeks}, 12px);` });
  let prevMonth = "";
  for (let w = 0; w < weeks; w++) {
    const first = addDays(start, w * 7);
    const m = parseISO(first).toLocaleDateString("en-US", { month: "short" });
    if (m !== prevMonth) {
      months.append(el("span", { style: `grid-column:${w + 1}` }, m));
      prevMonth = m;
    }
  }

  // day-of-week labels (Mon / Wed / Fri)
  const days = el("div", { class: "hm-days" });
  ["Mon", "", "Wed", "", "Fri", "", ""].forEach((lab) => days.append(el("span", {}, lab)));

  const grid = el("div", { class: "hm-grid" });
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      if (date > today) { grid.append(el("div", { class: "hm-cell", style: "visibility:hidden" })); continue; }
      const lvl = levelFor(date);
      const nice = parseISO(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const cell = el("div", {
        class: "hm-cell" + (date === today ? " today" : ""),
        title: `${nice} — ${lvl == null ? "no entry" : `level ${lvl}/4`}`,
      });
      if (lvl != null) cell.dataset.l = String(lvl);
      grid.append(cell);
    }
  }

  const scroll = el("div", { class: "hm-scroll" }, months, grid);
  const body = el("div", { class: "hm-body" },
    el("div", {}, el("div", { class: "hm-months", style: "visibility:hidden" }, el("span", {}, "M")), days),
    scroll);
  const legend = el("div", { class: "hm-legend" }, "less",
    ...[0,1,2,3,4].map((l) => { const c = el("div", { class: "hm-cell" }); c.dataset.l = String(l); return c; }), "more");
  return el("div", { class: "heatmap" }, body, legend);
}

/* ============================================================
   Weight-vs-goal chart (SVG)
   series: [{date, lb}]  ·  targets: WEIGHT_TARGETS
   ============================================================ */
export function weightChart(series, targets, { width = 640, height = 210 } = {}) {
  const pad = { l: 30, r: 12, t: 14, b: 22 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;

  const t0 = parseISO(targets[0].startDate).getTime();
  const t1 = parseISO(targets[targets.length - 1].endDate).getTime();
  const spanT = t1 - t0 || 1;
  const lows = [...series.map((s) => s.lb), ...targets.map((t) => t.start), ...targets.map((t) => t.end)];
  const yMin = Math.floor(Math.min(...lows) - 2), yMax = Math.ceil(Math.max(...lows) + 2);
  const spanY = yMax - yMin || 1;

  const X = (ms) => pad.l + ((ms - t0) / spanT) * iw;
  const Xd = (d) => X(parseISO(d).getTime());
  const Y = (lb) => pad.t + (1 - (lb - yMin) / spanY) * ih;

  const today = todayISO();
  let bands = "", targetPath = "", phaseLabs = "";
  targets.forEach((tg) => {
    const x0 = Xd(tg.startDate), x1 = Xd(tg.endDate);
    const active = today >= tg.startDate && today <= tg.endDate;
    bands += `<rect class="band${active ? " active" : ""}" x="${x0}" y="${pad.t}" width="${x1 - x0}" height="${ih}"/>`;
    targetPath += `${targetPath ? "L" : "M"}${x0.toFixed(1)},${Y(tg.start).toFixed(1)} L${x1.toFixed(1)},${Y(tg.end).toFixed(1)} `;
    phaseLabs += `<text class="phase-lab" x="${(x0 + 6).toFixed(1)}" y="${(pad.t + 12).toFixed(1)}">${tg.label}</text>`;
    if (tg !== targets[0]) phaseLabs += `<line class="grid-line" x1="${x0}" y1="${pad.t}" x2="${x0}" y2="${pad.t + ih}" stroke-dasharray="2 3"/>`;
  });

  // y gridlines + labels (min, mid milestones, max)
  const yTicks = [...new Set([yMin, ...targets.map((t) => t.end), yMax])].sort((a, b) => a - b);
  let yAxis = "";
  yTicks.forEach((v) => {
    yAxis += `<line class="grid-line" x1="${pad.l}" y1="${Y(v)}" x2="${width - pad.r}" y2="${Y(v)}" opacity="0.4"/>`;
    yAxis += `<text class="axis-lab" x="4" y="${(Y(v) + 3).toFixed(1)}">${v}</text>`;
  });

  let curve = "", dots = "", lastLab = "", area = "";
  series.forEach((s, i) => {
    const x = Xd(s.date).toFixed(1), y = Y(s.lb).toFixed(1);
    curve += `${i ? "L" : "M"}${x},${y} `;
    const last = i === series.length - 1;
    dots += `<circle class="dot${last ? " last" : ""}" cx="${x}" cy="${y}" r="${last ? 3.4 : 2.4}"><title>${s.date} · ${s.lb.toFixed(1)} lb</title></circle>`;
    if (last) {
      const anchor = parseFloat(x) > width - 56 ? "end" : "start";
      const lx = anchor === "end" ? parseFloat(x) - 7 : parseFloat(x) + 7;
      lastLab = `<text class="last-val" x="${lx.toFixed(1)}" y="${(parseFloat(y) - 7).toFixed(1)}" text-anchor="${anchor}">${s.lb.toFixed(1)}</text>`;
    }
  });
  if (series.length > 1) {
    const x0 = Xd(series[0].date).toFixed(1), xN = Xd(series[series.length - 1].date).toFixed(1);
    const yB = (pad.t + ih).toFixed(1);
    area = `<path class="area" d="${curve}L${xN},${yB} L${x0},${yB} Z" fill="url(#wtarea)" stroke="none"/>`;
  }

  const svg = `
    <svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="wtarea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-bright)" stop-opacity="0.13"/>
          <stop offset="100%" stop-color="var(--accent-bright)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${bands}${yAxis}
      <path class="target" d="${targetPath}"/>
      ${area}
      ${series.length ? `<path class="curve" d="${curve}"/>` : ""}
      ${dots}${lastLab}${phaseLabs}
    </svg>`;
  const wrap = el("div", { class: "chart-wrap" });
  wrap.innerHTML = svg;
  return wrap;
}

/* ============================================================
   Rating bars (1–5)  ·  values: [{label, n}]
   ============================================================ */
export function ratingBars(values) {
  const wrap = el("div", { class: "ratebars" });
  values.forEach(({ label, n }) => {
    const pct = n ? (n / 5) * 100 : 0;
    wrap.append(el("div", { class: "ratebar" },
      el("span", { class: "lab" }, label),
      el("div", { class: "track" }, el("div", { class: "fill", style: `width:${pct}%` })),
      el("span", { class: "n" }, n ? n.toFixed(1) : "—"),
    ));
  });
  return wrap;
}

/* small inline sparkline */
export function sparkline(vals, { width = 120, height = 26 } = {}) {
  if (!vals.length) return el("div");
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const step = width / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(" ");
  const wrap = el("div");
  wrap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.25"/></svg>`;
  return wrap;
}
