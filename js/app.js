// ============================================================================
// FloMap — main application controller
// ============================================================================

import { isConfigured } from "./config.js";
import * as auth from "./auth.js";
import * as db from "./db.js";
import { fileToDataURL, cropImageFile } from "./image.js";
import {
  toISO, toDate, addDays, daysBetween, phaseFor, PHASES,
  dayInCycle, nextPeriodStart, daysUntilNextPeriod,
} from "./cycle.js";
import {
  el, clear, avatar, toast, openSheet, timeAgo,
  MONTHS, WEEKDAYS, prettyDate, escapeHTML,
} from "./ui.js";

const root = () => document.getElementById("app");

// --- global state -----------------------------------------------------------
const state = {
  user: null,
  friends: [],          // accepted friend user records
  network: [],          // [me, ...friends]
  anchors: {},          // userId -> latest period start (ISO) or null
  tab: "calendar",
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() }, // viewed month
};

function hasCycle(u) {
  return u && u.gender !== "male" && state.anchors[u.id];
}

// ============================================================================
// BOOT
// ============================================================================
async function boot() {
  if (!isConfigured) return renderSetupNeeded();
  try {
    const user = await auth.restoreSession();
    if (user) { state.user = user; await loadNetwork(); return renderApp(); }
  } catch (e) {
    console.error(e);
    return renderConnError(e);
  }
  renderAuth();
}

function renderSetupNeeded() {
  clear(root()).append(
    el("div.auth-wrap", {}, [
      el("div.auth-hero", {}, [ el("div.brand-word", {}, ["FloMap"]) ]),
      el("div.setup-note", { html: `
        <h2 style="margin-bottom:8px">One-time setup</h2>
        <p>Before FloMap can run you need a free Supabase backend:</p>
        <ol style="margin:10px 0 10px 18px;line-height:1.7">
          <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a></li>
          <li>Open <b>SQL Editor</b> and run the contents of <code>supabase/schema.sql</code></li>
          <li>Open <b>Project Settings → API</b>, copy your <b>Project URL</b> and <b>anon public</b> key</li>
          <li>Paste both into <code>js/config.js</code> and reload</li>
        </ol>
        <p class="muted small">See <code>README.md</code> for the full walkthrough.</p>` }),
    ])
  );
}

function renderConnError(e) {
  clear(root()).append(
    el("div.auth-wrap", {}, [
      el("div.auth-hero", {}, [ el("div.brand-word", {}, ["FloMap"]) ]),
      el("div.setup-note", { html: `
        <h2 style="margin-bottom:8px">Couldn't reach the database</h2>
        <p class="small">${escapeHTML(e.message)}</p>
        <p class="small muted" style="margin-top:10px">
          Check your URL/key in <code>js/config.js</code> and that you ran
          <code>schema.sql</code>. Then reload.</p>` }),
    ])
  );
}

// ============================================================================
// NETWORK DATA
// ============================================================================
async function loadNetwork() {
  state.friends = await db.getFriends(state.user.id);
  state.network = [state.user, ...state.friends];
  const starts = await db.getPeriodStarts(state.network.map(u => u.id));
  const anchors = {};
  for (const row of starts) { // newest first, so first seen = latest
    if (!(row.user_id in anchors)) anchors[row.user_id] = row.start_date;
  }
  state.anchors = anchors;
}

// ============================================================================
// AUTH SCREEN
// ============================================================================
function renderAuth() {
  let mode = "login";
  const wrap = el("div.auth-wrap");

  function paint() {
    clear(wrap).append(
      el("div.auth-hero", {}, [
        el("div.brand-word", {}, ["FloMap"]),
        el("p", {}, ["Track your flow, together 🩸"]),
      ]),
      el("div.tabs", {}, [
        el("button", { class: mode === "login" ? "active" : "", onclick: () => { mode = "login"; paint(); } }, ["Log in"]),
        el("button", { class: mode === "signup" ? "active" : "", onclick: () => { mode = "signup"; paint(); } }, ["Sign up"]),
      ]),
      mode === "login" ? loginForm() : null,
      mode === "signup" ? signupWizard() : null,
    );
  }
  paint();
  clear(root()).append(wrap);
}

function loginForm() {
  const email = el("input", { type: "email", placeholder: "you@example.com", autocomplete: "email" });
  const pass = el("input", { type: "password", placeholder: "Password", autocomplete: "current-password" });
  const err = el("div.error-msg");
  const btn = el("button.btn", {}, ["Log in"]);

  const submit = async () => {
    err.textContent = "";
    btn.disabled = true; btn.textContent = "Logging in…";
    try {
      state.user = await auth.login(email.value, pass.value);
      await loadNetwork();
      renderApp();
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false; btn.textContent = "Log in";
    }
  };
  btn.addEventListener("click", submit);
  pass.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });

  return el("form.card", { onsubmit: e => { e.preventDefault(); submit(); } }, [
    el("div.field", {}, [ el("label", {}, ["Email"]), email ]),
    el("div.field", {}, [ el("label", {}, ["Password"]), pass ]),
    err, btn,
  ]);
}

// --- multi-step signup ------------------------------------------------------
function signupWizard() {
  const data = {
    email: "", password: "", username: "", avatar_url: null,
    gender: "female", cycle_length: 28, period_length: 5, day1: toISO(new Date()),
  };
  let step = 0;
  const host = el("div");

  const steps = () => {
    // Males skip the cycle step.
    return data.gender === "male" ? [stepAccount, stepProfile] : [stepAccount, stepProfile, stepCycle];
  };

  function dots() {
    const s = steps();
    return el("div.steps-dots", {}, s.map((_, i) => el("span", { class: i === step ? "on" : "" })));
  }

  function go(delta) {
    const s = steps();
    step = Math.max(0, Math.min(s.length - 1, step + delta));
    paint();
  }

  async function finish(btn, err) {
    err.textContent = "";
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      state.user = await auth.signup(data);
      await loadNetwork();
      renderApp();
      toast("Welcome to FloMap! 🎉");
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false; btn.textContent = "Create account";
      // Jump back to the step that owns the failing field.
      if (/email|password/i.test(e.message)) { step = 0; paint(); }
      else if (/username/i.test(e.message)) { step = 1; paint(); }
    }
  }

  // --- step 0: account ---
  function stepAccount() {
    const email = el("input", { type: "email", placeholder: "you@example.com", value: data.email, autocomplete: "email" });
    const pass = el("input", { type: "password", placeholder: "At least 4 characters", value: data.password, autocomplete: "new-password" });
    const err = el("div.error-msg");
    const next = el("button.btn", {}, ["Continue"]);
    next.addEventListener("click", () => {
      data.email = email.value.trim(); data.password = pass.value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return err.textContent = "Enter a valid email.";
      if (data.password.length < 4) return err.textContent = "Password must be at least 4 characters.";
      err.textContent = ""; go(1);
    });
    return el("div", {}, [
      el("div.field", {}, [ el("label", {}, ["Email"]), email ]),
      el("div.field", {}, [ el("label", {}, ["Password"]), pass ]),
      err, next,
    ]);
  }

  // --- step 1: profile (username, avatar, gender) ---
  function stepProfile() {
    const uname = el("input", { placeholder: "yourname", value: data.username, maxLength: 20, autocomplete: "username" });
    const gender = el("select", {}, [
      el("option", { value: "female", selected: data.gender === "female" }, ["Female"]),
      el("option", { value: "male", selected: data.gender === "male" }, ["Male"]),
      el("option", { value: "other", selected: data.gender === "other" }, ["Other / prefer not to say"]),
    ]);
    const preview = avatar({ username: data.username || "?", avatar_url: data.avatar_url }, "lg");
    const file = el("input", { type: "file", accept: "image/*", style: "display:none" });
    const pick = el("button.btn.secondary.auto", { type: "button" }, ["📷 Choose photo"]);
    pick.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      try {
        const cropped = await cropImageFile(file.files[0], { size: 400 });
        file.value = ""; // allow re-picking the same file
        if (!cropped) return; // user cancelled
        data.avatar_url = cropped;
        const fresh = avatar({ username: uname.value || "?", avatar_url: data.avatar_url }, "lg");
        preview.replaceWith(fresh);
      } catch (e) { toast(e.message, true); }
    });

    const err = el("div.error-msg");
    const next = el("button.btn", {}, [data.gender === "male" ? "Create account" : "Continue"]);
    const back = el("button.btn.ghost.auto", { type: "button", onclick: () => go(-1) }, ["← Back"]);

    gender.addEventListener("change", () => {
      data.gender = gender.value;
      next.textContent = data.gender === "male" ? "Create account" : "Continue";
    });

    next.addEventListener("click", () => {
      data.username = uname.value.trim();
      data.gender = gender.value;
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(data.username))
        return err.textContent = "Username: 3–20 letters, numbers, or _.";
      err.textContent = "";
      if (data.gender === "male") finish(next, err);
      else go(1);
    });

    return el("div", {}, [
      el("div.avatar-pick", {}, [ preview, pick, file, el("span.hint", {}, ["Optional profile photo"]) ]),
      el("div.field", {}, [ el("label", {}, ["Username"]), uname ]),
      el("div.field", {}, [ el("label", {}, ["Gender"]), gender ]),
      el("p.small.muted", {}, [
        data.gender === "male"
          ? "As a male you won't track a cycle — but you can drop “Deriods” on the calendar. 💪"
          : "We'll ask about your cycle next so we can predict it for you.",
      ]),
      err,
      el("div.row", {}, [ back, next ]),
    ]);
  }

  // --- step 2: cycle (non-male only) ---
  function stepCycle() {
    const day1 = el("input", { type: "date", value: data.day1, max: toISO(new Date()) });
    const len = el("input", { type: "number", value: data.cycle_length, min: 15, max: 60 });
    const plen = el("input", { type: "number", value: data.period_length, min: 1, max: 14 });
    const err = el("div.error-msg");
    const create = el("button.btn", {}, ["Create account"]);
    const back = el("button.btn.ghost.auto", { type: "button", onclick: () => go(-1) }, ["← Back"]);

    create.addEventListener("click", () => {
      data.day1 = day1.value;
      data.cycle_length = clampInt(len.value, 15, 60, 28);
      data.period_length = clampInt(plen.value, 1, 14, 5);
      if (!data.day1) return err.textContent = "Pick the first day of your current period.";
      finish(create, err);
    });

    return el("div", {}, [
      el("div.field", {}, [ el("label", {}, ["First day of your current period (Day 1)"]), day1 ]),
      el("div.row", {}, [
        el("div.field", {}, [ el("label", {}, ["Avg cycle length"]), len ]),
        el("div.field", {}, [ el("label", {}, ["Avg period length"]), plen ]),
      ]),
      el("p.small.muted", {}, ["Not sure? The averages (28 & 5) are fine — you can fix Day 1 anytime."]),
      err,
      el("div.row", {}, [ back, create ]),
    ]);
  }

  function paint() {
    const s = steps();
    step = Math.min(step, s.length - 1);
    clear(host).append(dots(), el("div.card", {}, [ s[step]() ]));
  }
  paint();
  return host;
}

// ============================================================================
// MAIN APP SHELL
// ============================================================================
function renderApp() {
  const shell = el("div.app-shell");
  shell.append(topbar(), viewHost());
  clear(root()).append(shell, tabbar());
  paintView();
}

let _viewHost;
function viewHost() { _viewHost = el("div.view"); return _viewHost; }

function topbar() {
  const titles = { calendar: null, friends: "Friends", profile: "Profile" };
  const t = titles[state.tab];
  return el("div.topbar", {}, [
    t ? el("h1", {}, [t]) : el("span.brand-word", {}, ["FloMap"]),
    el("div", { onclick: () => { state.tab = "profile"; renderApp(); } }, [ avatar(state.user, "sm") ]),
  ]);
}

function tabbar() {
  const mk = (key, ico, label) =>
    el("button", { class: state.tab === key ? "active" : "", onclick: () => setTab(key) }, [
      el("span.ico", {}, [ico]), label,
    ]);
  return el("div.tabbar", {}, [
    mk("calendar", "📅", "Calendar"),
    mk("friends", "👯", "Friends"),
    mk("profile", "🙂", "Profile"),
  ]);
}

function setTab(key) { state.tab = key; renderApp(); }

function paintView() {
  clear(_viewHost);
  if (state.tab === "calendar") renderCalendar(_viewHost);
  else if (state.tab === "friends") renderFriends(_viewHost);
  else if (state.tab === "profile") renderProfile(_viewHost);
}

// --- shared helpers exposed to other view modules via closures --------------
function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// Sections defined in the split files below are attached here:
import { renderCalendar as _cal } from "./views_calendar.js";
import { renderFriends as _friends } from "./views_friends.js";
import { renderProfile as _profile } from "./views_profile.js";

function renderCalendar(host) { _cal(host, ctx()); }
function renderFriends(host) { _friends(host, ctx()); }
function renderProfile(host) { _profile(host, ctx()); }

/** Shared context handed to view modules. */
function ctx() {
  return {
    state, db, auth,
    phaseFor, dayInCycle, nextPeriodStart, daysUntilNextPeriod, daysBetween, addDays, toISO, toDate,
    PHASES, el, clear, avatar, toast, openSheet, timeAgo, MONTHS, WEEKDAYS, prettyDate, escapeHTML,
    fileToDataURL, cropImageFile, clampInt, hasCycle,
    reloadNetwork: async () => { await loadNetwork(); },
    repaint: () => paintView(),
    rerender: () => renderApp(),
    logout: () => { auth.logout(); location.reload(); },
  };
}

// go
boot();
