// ============================================================
//  Life Tracker — configuration & constants
//  The ONLY file Ricardo edits to go live: paste the two public
//  Supabase values below. Until then the app runs local-first.
// ============================================================

// ---- Supabase (public values — safe in the client, protected by RLS) ----
// Leave as-is to run local-only (data lives in this browser).
// After the 15-min setup, paste your Project URL + anon public key here.
export const SUPABASE_URL  = "https://ydzeeoypylgfonfchknx.supabase.co";
export const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkemVlb3lweWxnZm9uZmNoa254Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzg0MDksImV4cCI6MjA5ODg1NDQwOX0.lEsbjvGaoXB-ilVgzU8LxZdgNg8GzCYZZ79Wy15Cp7w";

export const supabaseConfigured = () =>
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON.length > 20;

// ---- Owner ----
export const OWNER = { name: "Ricardo" };

// ---- Keystone habits (the 6 tracked daily) --------------------------------
// `hit(day)` returns true when the habit counts toward adherence that day.
export const HABITS = [
  {
    id: "workout",
    label: "Workout",
    short: "Workout",
    kind: "toggle-type",
    field: "workout_done",
    typeField: "workout_type",
    icon: "dumbbell",
    hit: (d) => !!d.workout_done,
  },
  {
    id: "morning",
    label: "Morning protocol",
    short: "AM",
    kind: "toggle",
    field: "morning_protocol_done",
    icon: "sunrise",
    hit: (d) => !!d.morning_protocol_done,
  },
  {
    id: "sleep",
    label: "Sleep",
    short: "Sleep",
    kind: "number",
    field: "sleep_hours",
    unit: "h",
    min: 3, max: 12, step: 0.5,
    threshold: 7.5, // hours to "hit"
    icon: "moon",
    hit: (d) => (d.sleep_hours ?? 0) >= 7.5,
  },
  {
    id: "deepwork",
    label: "Deep-work blocks",
    short: "Deep-work",
    kind: "segments",
    field: "deep_work_blocks",
    // 90-min blocks. Ceiling 6 (9h loggable) per Ricardo — entrepreneur workload.
    // Hit bar stays 3 (4.5h ≈ the research ceiling for high-quality focus);
    // the extra dots record ambition without making the chain unwinnable.
    max: 6,
    threshold: 3,
    icon: "target",
    hit: (d) => (d.deep_work_blocks ?? 0) >= 3,
  },
  {
    id: "screens",
    label: "No screens after 9",
    short: "Screens",
    kind: "toggle",
    field: "no_screens_after_9",
    icon: "smartphone-off",
    hit: (d) => !!d.no_screens_after_9,
  },
  {
    id: "journal",
    label: "3-line journal",
    short: "Journal",
    kind: "toggle-journal",
    field: "journal_done",
    fields: [
      { key: "journal_went_well", label: "Went well" },
      { key: "journal_improve",   label: "To improve" },
      { key: "journal_grateful",  label: "Grateful for" },
    ],
    icon: "pen",
    hit: (d) => !!d.journal_done,
  },
];

export const HABIT_COUNT = HABITS.length; // 6

// Workout split — types + the day-of-week smart default (from his 6-month plan)
export const WORKOUT_TYPES = ["Push", "Pull", "Legs", "Core", "Gym", "Sprint", "Rest"];
// 0=Sun … 6=Sat
export const WORKOUT_BY_DOW = ["Rest", "Push", "Pull", "Rest", "Legs", "Core", "Gym"];

// ---- Weekly self-ratings (1–5) --------------------------------------------
// Subjective-only dimensions — nothing a sensor already measures.
// NOTE: "sleep_1_5" DB column is reused to store Discipline (avoids a migration);
// labels are what the UI and exports show.
export const RATINGS = [
  { key: "nutrition_1_5", label: "Nutrition" },
  { key: "training_1_5",  label: "Training quality" },
  { key: "mental_1_5",    label: "Mental" },
  { key: "sleep_1_5",     label: "Discipline" },
];

// ---- Routines (the coach's scripts — steps shown in Today) -----------------
export const ROUTINES = {
  morning: {
    title: "Morning routine",
    window: "on waking · ~12 min",
    steps: [
      "500 ml water immediately on waking",
      "Box breathing — 2 min (8 cycles of 4-4-4-4)",
      "Read your statement aloud — with feeling (see below)",
      "Intention — say today's one main task out loud",
      "Sunlight — 5 min outside within 30 min of waking",
      "Cold face splash — 30 sec",
    ],
    affirmation: true,
  },
  night: {
    title: "Night routine",
    window: "from 9:00 pm · lights out 10:00 pm",
    steps: [
      "No screens after 9:00 pm — no work email or Slack after dinner",
      "Girlfriend call",
      "Read your statement aloud — visualize it already yours",
      "3-line journal — went well · improve · grateful",
      "In bed by 10:00 pm (7–9 h floor)",
    ],
    affirmation: true,
  },
};

// ---- The statement (Think and Grow Rich, Ch. 2 — Definite Chief Aim) -------
// Read aloud twice daily: on waking and before sleep.
// text: null shows an invitation to engrave it; Ricardo dictates, Claude engraves.
export const AFFIRMATION = {
  title: "Definite Chief Aim",
  source: "Think and Grow Rich — Ch. 2",
  text: null,
};

// ---- Progress-to-goal targets (weight, lb) --------------------------------
// Source: 06_Health & Fitness/6-Month High-Performance Plan.md
export const WEIGHT_TARGETS = [
  { key: "phase1", label: "Phase 1", start: 130, end: 135, startDate: "2026-06-01", endDate: "2026-08-07" },
  { key: "phase2", label: "Phase 2", start: 135, end: 145, startDate: "2026-08-07", endDate: "2026-11-30" },
];
export const WEIGHT_UNIT = "lb";

// ---- Theme ----
export const THEMES = ["gunmetal", "gold"];
export const DEFAULT_THEME = "gunmetal";

// ---- Storage keys (versioned) ----
export const LS = {
  daily:   "lt.v1.daily",
  weigh:   "lt.v1.weigh",
  ratings: "lt.v1.ratings",
  pending: "lt.v1.pending",
  theme:   "lt.v1.theme",
  whoop:   "lt.v1.whoop",
  demoSeeded: "lt.v1.demoSeeded",
};

// WHOOP recovery bands (matches WHOOP's green/yellow/red)
export const RECOVERY_BANDS = { green: 67, yellow: 34 };
