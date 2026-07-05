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
    max: 3,
    threshold: 2, // >=2 blocks to "hit"
    icon: "target",
    hit: (d) => (d.deep_work_blocks ?? 0) >= 2,
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
export const RATINGS = [
  { key: "sleep_1_5",     label: "Sleep" },
  { key: "nutrition_1_5", label: "Nutrition" },
  { key: "training_1_5",  label: "Training" },
  { key: "mental_1_5",    label: "Mental" },
];

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
