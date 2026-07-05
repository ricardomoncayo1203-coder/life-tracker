# Life Tracker — "The Command Console" · Setup

A private, dark habit & life tracker. Streaks, a weight-vs-goal curve, an adherence heatmap, and a Sunday review with Claude. Built on the same stack as your Nono Garden app (static files + Supabase + GitHub Pages). Cost: **$0**.

---

## It already works — right now, local-only

Before any setup, the app is fully usable on this laptop:

- Preview it: from this folder run `python3 -m http.server 8777`, open **http://localhost:8777**.
- Everything logs and renders. Data lives in **this browser** only.
- Add `?demo` to the URL (e.g. `localhost:8777/?demo`) to see it populated with ~3 weeks of sample data.

The only thing local-only mode *doesn't* do is sync between your phone and laptop. That's what the 15-minute setup below turns on.

---

## Turn on phone ↔ laptop sync (~15 min, once)

Legend: 🧑 = you · 🤖 = Claude (me)

### 1. 🧑 Create the Supabase project
- **supabase.com** → reuse your existing account (the one running Nono Garden) → **New project**.
- Name `life-tracker`, region **South America (São Paulo)**, set a DB password, save it. Wait ~2 min.

### 2. 🧑 Create the tables
- Left menu **SQL Editor → New query** → paste all of [`db/schema.sql`](db/schema.sql) → **Run** (should say *Success*).
- New query → paste all of [`db/views.sql`](db/views.sql) → **Run**.

### 3. 🧑 Auth — one account, then lock the door
- **Authentication → Providers**: enable **Email**, turn **off** everything else. Make sure **magic link** is on.
- **Authentication → URL Configuration**: set **Site URL** and add to **Redirect URLs** your Pages address (from step 6), e.g. `https://ricardomoncayo1203-coder.github.io/life-tracker/`. (Come back after step 6.)
- Open the app once and sign in with your email (creates your single account).
- Then **Authentication → Sign-ups: DISABLE**. Now no second account can ever be created.

### 4. 🧑 Give me the two public values
- **Project Settings → API** → copy me the **Project URL** and the **anon public key**.
- Both are public and safe in the client (Row-Level Security protects the data). **Do not** send the `service_role` key.

### 5. 🤖 I wire + deploy
- I paste your URL + anon key into [`config.js`](config.js) (the two `__SUPABASE__` placeholders), push to GitHub, and confirm Pages is live.

### 6. 🧑 Create the GitHub repo + Pages
- I can run `gh repo create life-tracker --public --source . --push` for you (your `gh` is already authenticated), **or** you own it.
- **Settings → Pages → Deploy from branch → `main` / root.** Your URL: `https://<you>.github.io/life-tracker/`.

### 7. 🧑 Install on your iPhone
- Open the Pages URL in **Safari** (online) → **Share → Add to Home Screen**.
- Open it, sign in once with the magic link. The session persists for months; it launches full-screen like a native app.

That's it. Log on either device; it syncs. Offline logs queue and sync when you're back on signal.

---

## The Sunday review with Claude

Two ways for me to read your week — pick either:

**A) Export → vault (default, no secrets).**
On the **Review** screen tap **"Export week to vault snapshot"** — it downloads `tracker-week-<date>.json` + `.md`. Tell me you've done your review; I file those into `Personal Life/Claude/{YYYY}/{Month}/Week-N/` and read them, then score adherence vs. your 6-month plan and propose adjustments. Works even in local-only mode.

**B) Direct read (hands-off, optional).**
If you want me to pull without exporting: put your **service_role** key in a local file **outside this repo** —
`06_Health & Fitness/.tracker-secrets.env`:
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
```
It stays on your machine (never in git, never in the app — same rule as your Nono photo-upload key). During the review I `source` it and `curl` the `v_week_review` view. Delete the file anytime.

---

## WHOOP integration (~10 min, once)

Pulls Recovery %, HRV, resting HR, sleep, and strain from your strap. Sleep then **logs itself** in the daily checklist, and the Dashboard gains a Recovery panel.

### 1. 🧑 Create the WHOOP developer app
- Log in at **developer.whoop.com** (your normal WHOOP account) → create an app.
- **Redirect URI** (exact): `http://localhost:8799/callback`
- **Scopes**: enable all read scopes + offline.
- Copy the **Client ID** and **Client Secret**.

### 2. 🧑 Add credentials to the secrets file
Append to `06_Health & Fitness/.tracker-secrets.env` (same file as the Supabase keys):
```
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
```

### 3. 🧑 Authorize once
From the `life-tracker` folder:
```bash
node whoop/sync.mjs auth
```
Browser opens → approve → done. The refresh token saves itself into the secrets file. (WHOOP rotates this token on every sync — the script manages that automatically; don't copy it anywhere.)

### 4. Sync
```bash
node whoop/sync.mjs sync
```
- Writes `whoop.json` next to the app (laptop/local mode reads it; gitignored — health data never enters the repo).
- If the Supabase keys are in the secrets file, also upserts into the `whoop_daily` table (run [`db/whoop.sql`](db/whoop.sql) once in the SQL Editor first) — that's what your **phone** reads.
- Run it whenever, or I run it as part of the Sunday review. It can also be put on a schedule later.

**Preview without a WHOOP account:** `node whoop/sync.mjs demo` writes three weeks of plausible data.

---

## Security (why public code is fine)
- **RLS is on** for every table; policies require `user_id = auth.uid()`. That — not hiding the code — is the security boundary (identical to your Nono app).
- The **anon key** in the client can read/write **nothing** without your logged-in session.
- **Sign-ups disabled** → your account is the only one that can exist.
- The `service_role` key (only if you use option B) never leaves your machine; `.gitignore` blocks `*.env` as a backstop and the file lives outside the repo anyway.

## Files
| Path | What |
|---|---|
| `index.html`, `app.js`, `store.js`, `ui.js`, `config.js`, `styles.css` | the app |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA (installable, offline) |
| `db/schema.sql`, `db/views.sql` | run these in Supabase |
| `config.js` | the two Supabase values go here (step 5) |
