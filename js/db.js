// ============================================================================
// FloMap data-access layer
// ----------------------------------------------------------------------------
// Every Supabase query lives here so the rest of the app never touches the
// client directly. Each function returns plain data or throws an Error with a
// friendly message.
// ============================================================================

import { supabase } from "./config.js";
import { toISO, daysBetween, learnCycleParams } from "./cycle.js";

function must(error) {
  if (error) throw new Error(error.message || "Database error");
}

// --- USERS ------------------------------------------------------------------

export async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from("users").select("*").eq("email", email.toLowerCase()).maybeSingle();
  must(error);
  return data;
}

export async function findUserByUsername(username) {
  const { data, error } = await supabase
    .from("users").select("*").ilike("username", username).maybeSingle();
  must(error);
  return data;
}

/** Fuzzy member search by partial username (case-insensitive). Excludes self. */
export async function searchUsers(query, excludeId, limit = 8) {
  const q = String(query || "").trim().replace(/[%_]/g, "\\$&"); // escape LIKE wildcards
  if (!q) return [];
  const { data, error } = await supabase
    .from("users").select("id, username, avatar_url, gender")
    .ilike("username", `%${q}%`)
    .neq("id", excludeId)
    .order("username", { ascending: true })
    .limit(limit);
  must(error);
  return data;
}

export async function getUser(id) {
  const { data, error } = await supabase
    .from("users").select("*").eq("id", id).maybeSingle();
  must(error);
  return data;
}

export async function createUser(fields) {
  const { data, error } = await supabase
    .from("users").insert(fields).select().single();
  if (error) {
    if (error.code === "23505") {
      // unique violation — figure out which column
      if (/email/.test(error.message)) throw new Error("That email is already registered.");
      if (/username/.test(error.message)) throw new Error("That username is taken.");
      throw new Error("Account already exists.");
    }
    must(error);
  }
  return data;
}

export async function updateUser(id, fields) {
  const { data, error } = await supabase
    .from("users").update(fields).eq("id", id).select().single();
  if (error && error.code === "23505" && /username/.test(error.message))
    throw new Error("That username is taken.");
  must(error);
  return data;
}

// --- PERIOD STARTS ----------------------------------------------------------

/** All logged Day-1 dates for a set of users, newest first per user. */
export async function getPeriodStarts(userIds) {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from("period_starts").select("*")
    .in("user_id", userIds)
    .order("start_date", { ascending: false });
  must(error);
  return data;
}

/** The single most-recent anchor date for one user (or null). */
export async function getLatestStart(userId) {
  const { data, error } = await supabase
    .from("period_starts").select("start_date")
    .eq("user_id", userId)
    .order("start_date", { ascending: false }).limit(1).maybeSingle();
  must(error);
  return data ? data.start_date : null;
}

/** Log / correct a Day 1. Upsert so re-logging the same date is idempotent. */
export async function logPeriodStart(userId, date) {
  const { error } = await supabase
    .from("period_starts")
    .upsert({ user_id: userId, start_date: toISO(date) }, { onConflict: "user_id,start_date" });
  must(error);
}

export async function deletePeriodStart(userId, date) {
  const { error } = await supabase
    .from("period_starts").delete()
    .eq("user_id", userId).eq("start_date", toISO(date));
  must(error);
}

// --- CYCLE EVENTS (manual overrides) ----------------------------------------

/** All manually logged phase segments for a set of users, newest first. */
export async function getCycleEvents(userIds) {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from("cycle_events").select("*")
    .in("user_id", userIds)
    .order("start_date", { ascending: false });
  must(error);
  return data;
}

/**
 * Log a manual phase segment. Logging a "period" segment also records its start
 * as a Day-1 anchor (so predictions re-anchor). Then re-learns cycle params.
 */
export async function addCycleEvent(userId, phase, startDate, endDate) {
  let s = toISO(startDate), e = toISO(endDate);
  if (e < s) [s, e] = [e, s];
  const { data, error } = await supabase
    .from("cycle_events")
    .insert({ user_id: userId, phase, start_date: s, end_date: e })
    .select().single();
  must(error);
  if (phase === "period") await logPeriodStart(userId, s);
  await relearnCycle(userId);
  return data;
}

export async function deleteCycleEvent(id) {
  // fetch first so we can also tidy up the matching Day-1 anchor
  const { data: row, error: e0 } = await supabase
    .from("cycle_events").select("*").eq("id", id).maybeSingle();
  must(e0);
  const { error } = await supabase.from("cycle_events").delete().eq("id", id);
  must(error);
  if (row) {
    if (row.phase === "period") await deletePeriodStart(row.user_id, row.start_date);
    await relearnCycle(row.user_id);
  }
}

/**
 * Learn this user's cycle parameters from their logged history and save them.
 * The math lives in cycle.learnCycleParams() (pure + unit-tested); this just
 * fetches the history and persists the result. The more you log, the closer
 * predictions track your real pattern.
 */
export async function relearnCycle(userId) {
  const user = await getUser(userId);
  if (!user) return;
  const starts = (await getPeriodStarts([userId])).map(r => r.start_date);
  const events = await getCycleEvents([userId]);
  const params = learnCycleParams(starts, events, user);
  await updateUser(userId, params);
}

// --- FRIENDSHIPS ------------------------------------------------------------

/** Raw friendship rows where the user is requester or addressee. */
export async function getFriendships(userId) {
  const { data, error } = await supabase
    .from("friendships").select("*")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  must(error);
  return data;
}

/** Accepted friends as user records (excludes self). */
export async function getFriends(userId) {
  const rows = await getFriendships(userId);
  const accepted = rows.filter(r => r.status === "accepted");
  const ids = accepted.map(r => r.requester_id === userId ? r.addressee_id : r.requester_id);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("users").select("*").in("id", ids);
  must(error);
  return data;
}

/** Incoming pending requests (other people asked to friend me). */
export async function getIncomingRequests(userId) {
  const { data, error } = await supabase
    .from("friendships").select("*, requester:users!requester_id(id, username, avatar_url)")
    .eq("addressee_id", userId).eq("status", "pending");
  must(error);
  return data;
}

/** Outgoing pending requests (I asked, they haven't accepted). */
export async function getOutgoingRequests(userId) {
  const { data, error } = await supabase
    .from("friendships").select("*, addressee:users!addressee_id(id, username, avatar_url)")
    .eq("requester_id", userId).eq("status", "pending");
  must(error);
  return data;
}

export async function sendFriendRequest(requesterId, addresseeId) {
  // Is there already a relationship either direction?
  const { data: existing, error: e1 } = await supabase
    .from("friendships").select("*")
    .or(`and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`);
  must(e1);
  if (existing && existing.length) {
    const rel = existing[0];
    if (rel.status === "accepted") throw new Error("You're already friends.");
    // If they already requested ME, just accept it.
    if (rel.addressee_id === requesterId) {
      await acceptRequest(rel.id);
      return { autoAccepted: true };
    }
    throw new Error("Friend request already pending.");
  }
  const { error } = await supabase
    .from("friendships").insert({ requester_id: requesterId, addressee_id: addresseeId });
  must(error);
  return { autoAccepted: false };
}

export async function acceptRequest(friendshipId) {
  const { error } = await supabase
    .from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
  must(error);
}

export async function removeFriendship(friendshipId) {
  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  must(error);
}

/** Remove whatever relationship exists between two users (unfriend/decline). */
export async function unfriend(userId, otherId) {
  const { error } = await supabase
    .from("friendships").delete()
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`);
  must(error);
}

// --- COMMENTS (day threads) -------------------------------------------------

/** All comments for a given day authored by anyone in `authorIds`. */
export async function getComments(day, authorIds) {
  if (!authorIds.length) return [];
  const { data, error } = await supabase
    .from("comments")
    .select("*, author:users!user_id(id, username, avatar_url)")
    .eq("day", toISO(day))
    .in("user_id", authorIds)
    .order("created_at", { ascending: true });
  must(error);
  return data;
}

/** Count of comments per day (for calendar badges) across authorIds in a range. */
export async function getCommentDays(fromDay, toDay, authorIds) {
  if (!authorIds.length) return {};
  const { data, error } = await supabase
    .from("comments").select("day")
    .gte("day", toISO(fromDay)).lte("day", toISO(toDay))
    .in("user_id", authorIds);
  must(error);
  const counts = {};
  for (const row of data) counts[row.day] = (counts[row.day] || 0) + 1;
  return counts;
}

export async function addComment(userId, day, body, imageUrl) {
  const { data, error } = await supabase
    .from("comments")
    .insert({ user_id: userId, day: toISO(day), body: body || null, image_url: imageUrl || null })
    .select("*, author:users!user_id(id, username, avatar_url)").single();
  must(error);
  return data;
}

export async function updateComment(id, body, imageUrl) {
  const { data, error } = await supabase
    .from("comments")
    .update({ body: body || null, image_url: imageUrl || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, author:users!user_id(id, username, avatar_url)").single();
  must(error);
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  must(error);
}

// --- DERIODS ----------------------------------------------------------------

export async function getDeriods(fromDay, toDay, authorIds) {
  if (!authorIds.length) return [];
  const { data, error } = await supabase
    .from("deriods")
    .select("*, author:users!user_id(id, username, avatar_url)")
    .gte("day", toISO(fromDay)).lte("day", toISO(toDay))
    .in("user_id", authorIds);
  must(error);
  return data;
}

export async function addDeriod(userId, day, note) {
  const { error } = await supabase
    .from("deriods")
    .upsert({ user_id: userId, day: toISO(day), note: note || null }, { onConflict: "user_id,day" });
  must(error);
}

export async function deleteDeriod(userId, day) {
  const { error } = await supabase
    .from("deriods").delete().eq("user_id", userId).eq("day", toISO(day));
  must(error);
}
