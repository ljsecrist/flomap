# 🩸 FloMap

A social period-tracking web app — think **Flo** meets **PoopMap**. Track your
menstrual cycle, see where your friends are in theirs, chat on a shared thread
for any day, and (if you're a guy) drop the occasional **Deriod** 💪.

Built as **plain HTML/CSS/JS** (no build step) with a **free Supabase** backend,
so the whole thing hosts for free on GitHub Pages.

---

## ✨ Features

- **Accounts** — email + password sign-up with a multi-step onboarding
  (username, profile photo, gender, Day 1 + average cycle/period length).
  Males skip the cycle questions automatically.
- **Prediction calendar** — a month calendar tinting *your* current phase
  (period / fertile / ovulation / follicular / luteal) and showing colored dots
  for friends who are on their period or fertile that day.
- **Correct your cycle anytime** — update Day 1, keep a history of logged starts,
  and every prediction recalculates instantly.
- **Manual overrides that learn** — log any phase (period, fertile, ovulation,
  follicular, luteal) with start/end dates. Logged days override the calendar,
  and FloMap learns your real `cycle_length`, `period_length`, and
  `luteal_length` (ovulation timing) so next cycle's predictions get sharper.
- **Friends** — add people by username, accept/decline requests, see each
  friend's current phase at a glance.
- **Day threads** — tap any day to open a shared chat. Post text + photos,
  edit and delete your own messages.
- **Deriods** 💪 — male users can drop a "dude period" on any day. Hidden as a
  *create* option for everyone else, but visible to all on the calendar.
- **Mobile-first** design with a bottom tab bar; works great on desktop too.
- **Light & dark** theme aware.

---

## 🚀 Setup (about 5 minutes)

### 1. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) and create a free account + new project.
2. Wait for the project to finish provisioning.

### 2. Create the database
1. In the Supabase dashboard open **SQL Editor → New query**.
2. Copy the entire contents of [`supabase/schema.sql`](supabase/schema.sql),
   paste it, and click **Run**. You should see "Success. No rows returned."

> **Already set up an earlier version?** Run the incremental migrations in
> [`supabase/`](supabase/) that you haven't yet — currently
> [`fix_permissions.sql`](supabase/fix_permissions.sql) (table grants) and
> [`migrate_cycle_events.sql`](supabase/migrate_cycle_events.sql) (manual
> phase logging + learning). They're safe to run more than once.

### 3. Add your keys
1. In the dashboard open **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open [`js/config.js`](js/config.js) and paste them in:
   ```js
   export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...your-anon-key...";
   ```

### 4. Run it
Because the app uses ES modules, browsers won't load it from a `file://` path —
serve it over HTTP. Any static server works:

```bash
# Python (already on most machines)
python -m http.server 8000
# then open http://localhost:8000
```

Or just push to GitHub Pages (below) — that's HTTP too.

---

## 🌐 Deploy free on GitHub Pages

1. Create a new GitHub repo and push these files to it.
2. In the repo go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source: Deploy from a branch**,
   pick your branch (e.g. `main`) and the `/root` folder, then **Save**.
4. Your app goes live at `https://<you>.github.io/<repo>/`.

That's it — no server, no bill. Supabase's free tier + GitHub Pages = $0.

> **Heads-up:** your `anon` key ships in the client (it's meant to be public).
> Combined with the intentionally-open database rules, anyone with the URL could
> read/write data. That's fine for a friends-only hobby app — **don't store
> anything sensitive**.

---

## 🧪 Tests

The cycle-prediction math is pure and unit-tested:

```bash
node tests/cycle.test.js
```

---

## 🗂 Project structure

```
flomap/
├── index.html              # app shell
├── css/styles.css          # Flo-inspired, mobile-first theme
├── js/
│   ├── config.js           # ← paste your Supabase URL + key here
│   ├── cycle.js            # pure cycle math (predictions, phases)
│   ├── db.js               # all Supabase queries
│   ├── auth.js             # signup / login / session
│   ├── image.js            # client-side photo resize → data URL
│   ├── ui.js               # DOM + toast + modal helpers
│   ├── app.js              # boot, routing, auth & onboarding UI
│   ├── views_calendar.js   # calendar + day-thread sheet
│   ├── views_friends.js    # friends & requests
│   └── views_profile.js    # profile, Day 1 updates, edit
├── supabase/schema.sql     # run once in Supabase
├── tests/cycle.test.js     # node tests for the math
└── README.md
```

---

## 🔧 Notes & design choices

- **Photos** are downscaled in the browser and stored as compressed JPEG data
  URLs right in Postgres — so there's no Storage bucket to configure.
- **Security is intentionally minimal** (passwords in plaintext, open RLS) per
  the project brief. If you ever want to lock it down, switch to Supabase Auth
  and tighten the RLS policies in `schema.sql`.
- **A "day thread"** is simply every comment sharing that date, filtered to you
  and your friends — no extra tables needed.
