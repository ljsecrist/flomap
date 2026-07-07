// ============================================================================
// FloMap cycle math  (pure functions — no DOM, no network, unit-testable)
// ----------------------------------------------------------------------------
// A "cycle" is anchored to a known Day 1 (the most recent logged period start).
// Given that anchor, an average cycle length, and an average period length we
// can classify ANY date into a phase and predict upcoming periods / fertile
// windows — forwards or backwards from the anchor.
// ============================================================================

export const PHASES = {
  period:     { key: "period",     label: "Period",     color: "#e0356b" },
  fertile:    { key: "fertile",    label: "Fertile",    color: "#28b3a6" },
  ovulation:  { key: "ovulation",  label: "Ovulation",  color: "#3b6fe0" },
  follicular: { key: "follicular", label: "Follicular", color: "#f4a6c0" },
  luteal:     { key: "luteal",     label: "Luteal",     color: "#c79be0" },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Date helpers -----------------------------------------------------------
// We work in "date only" space (local midnight) so DST / timezones don't shift
// day boundaries.

/** Parse "YYYY-MM-DD" (or a Date) into a local-midnight Date. */
export function toDate(d) {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const [y, m, day] = String(d).split("-").map(Number);
  return new Date(y, m - 1, day);
}

/** Format a Date (or string) as "YYYY-MM-DD". */
export function toISO(d) {
  const dt = toDate(d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Whole-day difference b - a (can be negative). */
export function daysBetween(a, b) {
  return Math.round((toDate(b) - toDate(a)) / MS_PER_DAY);
}

/** Add n days to a date, returning a new Date. */
export function addDays(d, n) {
  const dt = toDate(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

// --- Core cycle logic -------------------------------------------------------

/**
 * Day within the cycle for `date`, given the anchor Day 1.
 * Returns 1..cycleLength. Works for dates before the anchor too.
 */
export function dayInCycle(anchor, cycleLength, date) {
  const len = clampLen(cycleLength);
  const diff = daysBetween(anchor, date);
  return ((diff % len) + len) % len + 1; // 1-indexed
}

/**
 * The most recent Day 1 on or before `date`, projected from the anchor by
 * whole cycles. This is what we measure the cycle-day from.
 */
export function currentCycleStart(anchor, cycleLength, date) {
  const len = clampLen(cycleLength);
  const diff = daysBetween(anchor, date);
  const cyclesElapsed = Math.floor(diff / len);
  return addDays(anchor, cyclesElapsed * len);
}

/** Predicted start of the next period strictly after `date`. */
export function nextPeriodStart(anchor, cycleLength, date) {
  const len = clampLen(cycleLength);
  return addDays(currentCycleStart(anchor, len, date), len);
}

/**
 * Classify a date into a cycle phase.
 * Ovulation ≈ cycleLength - lutealLength (luteal defaults to ~14 days, but is
 * learned per-user from logged ovulation). Fertile window = 5 days before
 * ovulation through 1 day after.
 *
 * Returns { phase, label, color, day, ovulationDay, isPeriod, isFertile }.
 */
export function phaseFor(anchor, cycleLength, periodLength, date, lutealLength = 14) {
  const len = clampLen(cycleLength);
  const pLen = clampPeriod(periodLength, len);
  const day = dayInCycle(anchor, len, date);

  // never inside the period, never on the last day
  const ovulationDay = Math.min(len - 1, Math.max(pLen + 1, len - clampLuteal(lutealLength)));
  const fertileStart = ovulationDay - 5;
  const fertileEnd = ovulationDay + 1;

  let phase;
  if (day <= pLen) {
    phase = PHASES.period;
  } else if (day === ovulationDay) {
    phase = PHASES.ovulation;
  } else if (day >= fertileStart && day <= fertileEnd) {
    phase = PHASES.fertile;
  } else if (day < ovulationDay) {
    phase = PHASES.follicular;
  } else {
    phase = PHASES.luteal;
  }

  return {
    phase: phase.key,
    label: phase.label,
    color: phase.color,
    day,
    cycleLength: len,
    ovulationDay,
    isPeriod: day <= pLen,
    isOvulation: day === ovulationDay,
    isFertile: day >= fertileStart && day <= fertileEnd,
  };
}

/** Days until the next period from `date` (0 = period predicted today). */
export function daysUntilNextPeriod(anchor, cycleLength, date) {
  const info = phaseFor(anchor, cycleLength, 5, date);
  if (info.isPeriod) return 0;
  return daysBetween(date, nextPeriodStart(anchor, cycleLength, date));
}

// --- guards -----------------------------------------------------------------
function clampLen(len) {
  const n = Math.round(Number(len));
  if (!Number.isFinite(n) || n < 15) return 28; // sane default
  return Math.min(n, 60);
}
function clampPeriod(p, cycleLen) {
  const n = Math.round(Number(p));
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(n, Math.max(1, cycleLen - 10));
}
function clampLuteal(l) {
  const n = Math.round(Number(l));
  if (!Number.isFinite(n) || n < 9) return 14;
  return Math.min(n, 17);
}

// --- manual overrides -------------------------------------------------------
// A manual log ("I ovulated Jul 15") wins over the prediction for the days it
// covers. `events` = [{ phase, start_date, end_date }] (ISO date strings).

/** The manual event covering `date`, if any (most recently logged wins). */
export function findManualPhase(events, date) {
  if (!events || !events.length) return null;
  const iso = toISO(date);
  let best = null;
  for (const e of events) {
    if (iso >= e.start_date && iso <= e.end_date) {
      if (!best || e.start_date >= best.start_date) best = e;
    }
  }
  return best;
}

/** Phase-info object for a manual event on a given date (shape ≈ phaseFor). */
export function manualPhaseInfo(event, date) {
  const p = PHASES[event.phase] || PHASES.period;
  return {
    phase: p.key,
    label: p.label,
    color: p.color,
    manual: true,
    day: daysBetween(event.start_date, date) + 1,
    isPeriod: p.key === "period",
    isOvulation: p.key === "ovulation",
    isFertile: p.key === "fertile" || p.key === "ovulation",
  };
}

// --- learning ---------------------------------------------------------------
// Pure: given the user's logged history, derive updated cycle parameters.
//   cycle_length  <- average gap between recent Day-1 starts
//   period_length <- average duration of logged period segments
//   luteal_length <- average (cycle_length - ovulation-day-in-cycle)
// Falls back to the current value for anything not yet learnable.

const _mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const _clampRound = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * @param starts  array of ISO Day-1 dates (any order)
 * @param events  array of { phase, start_date, end_date }
 * @param current { cycle_length, period_length, luteal_length }
 */
export function learnCycleParams(starts, events, current) {
  let cycle_length = current.cycle_length;
  let period_length = current.period_length;
  let luteal_length = current.luteal_length || 14;

  const asc = [...starts].sort();
  if (asc.length >= 2) {
    const gaps = [];
    for (let i = 1; i < asc.length; i++) gaps.push(daysBetween(asc[i - 1], asc[i]));
    const recent = gaps.slice(-6).filter(g => g >= 15 && g <= 60);
    if (recent.length) cycle_length = _clampRound(_mean(recent), 15, 60);
  }

  const periodDurs = (events || []).filter(e => e.phase === "period")
    .map(e => daysBetween(e.start_date, e.end_date) + 1)
    .filter(d => d >= 1 && d <= 14);
  if (periodDurs.length) period_length = _clampRound(_mean(periodDurs.slice(0, 6)), 1, 14);

  const ovs = (events || []).filter(e => e.phase === "ovulation");
  if (ovs.length && asc.length) {
    const luts = [];
    for (const ev of ovs) {
      const anchor = [...asc].reverse().find(s => s <= ev.start_date);
      if (!anchor) continue;
      const ovDayInCycle = daysBetween(anchor, ev.start_date) + 1;
      const lut = cycle_length - ovDayInCycle;
      if (lut >= 9 && lut <= 17) luts.push(lut);
    }
    if (luts.length) luteal_length = _clampRound(_mean(luts.slice(0, 6)), 9, 17);
  }

  return { cycle_length, period_length, luteal_length };
}
