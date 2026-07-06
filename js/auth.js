// ============================================================================
// FloMap auth + session
// ----------------------------------------------------------------------------
// Deliberately simple (per spec): plaintext password compared against the
// custom `users` table. The logged-in user id is remembered in localStorage so
// a refresh keeps you signed in. NOT secure — friends-only hobby app.
// ============================================================================

import * as db from "./db.js";

const SESSION_KEY = "flomap_session_uid";

let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

/** Restore a session from localStorage on app boot. Returns the user or null. */
export async function restoreSession() {
  const uid = localStorage.getItem(SESSION_KEY);
  if (!uid) return null;
  try {
    const user = await db.getUser(uid);
    if (user) { currentUser = user; return user; }
  } catch (_) { /* fall through */ }
  localStorage.removeItem(SESSION_KEY);
  return null;
}

/** Re-fetch the current user from the DB (after profile edits, etc.). */
export async function refreshCurrentUser() {
  if (!currentUser) return null;
  currentUser = await db.getUser(currentUser.id);
  return currentUser;
}

export async function login(email, password) {
  email = (email || "").trim().toLowerCase();
  if (!email || !password) throw new Error("Enter your email and password.");
  const user = await db.findUserByEmail(email);
  if (!user || user.password !== password) throw new Error("Wrong email or password.");
  currentUser = user;
  localStorage.setItem(SESSION_KEY, user.id);
  return user;
}

/**
 * Create an account + (for non-males) log their first Day 1.
 * `fields` = { email, password, username, avatar_url, gender,
 *              cycle_length, period_length, day1 }
 */
export async function signup(fields) {
  const email = (fields.email || "").trim().toLowerCase();
  const username = (fields.username || "").trim();
  const password = fields.password || "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    throw new Error("Username must be 3–20 letters, numbers, or underscores.");

  const user = await db.createUser({
    email,
    password,
    username,
    avatar_url: fields.avatar_url || null,
    gender: fields.gender || "female",
    cycle_length: fields.cycle_length || 28,
    period_length: fields.period_length || 5,
  });

  // Log the initial Day 1 for anyone who tracks a cycle.
  if (fields.gender !== "male" && fields.day1) {
    try { await db.logPeriodStart(user.id, fields.day1); } catch (_) { /* non-fatal */ }
  }

  currentUser = user;
  localStorage.setItem(SESSION_KEY, user.id);
  return user;
}

export function logout() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
}
