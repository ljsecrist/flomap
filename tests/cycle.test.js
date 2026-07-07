// Run with:  node tests/cycle.test.js
// Pure-logic tests for the cycle math. No Supabase / browser needed.

import {
  toISO, daysBetween, addDays,
  dayInCycle, currentCycleStart, nextPeriodStart,
  phaseFor, daysUntilNextPeriod,
  findManualPhase, manualPhaseInfo, learnCycleParams,
} from "../js/cycle.js";

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`✗ ${msg}\n    expected ${e}\n    got      ${a}`); }
}

const ANCHOR = "2026-01-01"; // Day 1
const LEN = 28, PERIOD = 5;

// --- date helpers ---
eq(daysBetween("2026-01-01", "2026-01-08"), 7, "daysBetween forward");
eq(daysBetween("2026-01-08", "2026-01-01"), -7, "daysBetween backward");
eq(toISO(addDays("2026-01-30", 3)), "2026-02-02", "addDays crosses month");

// --- dayInCycle ---
eq(dayInCycle(ANCHOR, LEN, "2026-01-01"), 1, "anchor is day 1");
eq(dayInCycle(ANCHOR, LEN, "2026-01-28"), 28, "day 28 is last day");
eq(dayInCycle(ANCHOR, LEN, "2026-01-29"), 1, "next cycle wraps to day 1");
eq(dayInCycle(ANCHOR, LEN, "2025-12-31"), 28, "day before anchor is day 28");

// --- currentCycleStart / nextPeriodStart ---
eq(toISO(currentCycleStart(ANCHOR, LEN, "2026-01-15")), "2026-01-01", "cycle start mid-cycle");
eq(toISO(currentCycleStart(ANCHOR, LEN, "2026-02-05")), "2026-01-29", "cycle start next cycle");
eq(toISO(nextPeriodStart(ANCHOR, LEN, "2026-01-15")), "2026-01-29", "next period after mid-cycle");
eq(toISO(nextPeriodStart(ANCHOR, LEN, "2026-01-01")), "2026-01-29", "next period from day 1");

// --- phaseFor ---
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-01").phase, "period", "day1 = period");
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-05").phase, "period", "day5 = period (period length 5)");
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-06").phase, "follicular", "day6 = follicular");
// ovulation day = 28 - 14 = 14  -> 2026-01-14
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-14").phase, "ovulation", "ovulation day");
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-14").isFertile, true, "ovulation is fertile");
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-10").phase, "fertile", "day10 = fertile window");
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-20").phase, "luteal", "day20 = luteal");

// --- daysUntilNextPeriod ---
eq(daysUntilNextPeriod(ANCHOR, LEN, "2026-01-01"), 0, "on period => 0 days");
eq(daysUntilNextPeriod(ANCHOR, LEN, "2026-01-28"), 1, "day 28 => 1 day until period");

// --- learned luteal length shifts ovulation ---
// default luteal 14 => ovulation day 14
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-14").isOvulation, true, "default ovulation day 14");
// luteal 10 => ovulation day 28-10 = 18
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-18", 10).isOvulation, true, "luteal 10 => ovulation day 18");
eq(phaseFor(ANCHOR, LEN, PERIOD, "2026-01-14", 10).isOvulation, false, "day 14 not ovulation when luteal 10");

// --- manual overrides ---
const events = [
  { phase: "ovulation", start_date: "2026-01-09", end_date: "2026-01-09" },
  { phase: "period",    start_date: "2026-01-20", end_date: "2026-01-24" },
];
eq(findManualPhase(events, "2026-01-09")?.phase, "ovulation", "finds ovulation override");
eq(findManualPhase(events, "2026-01-22")?.phase, "period", "finds period override range");
eq(findManualPhase(events, "2026-01-15"), null, "no override on uncovered day");
eq(manualPhaseInfo(events[0], "2026-01-09").isFertile, true, "manual ovulation is fertile");
eq(manualPhaseInfo(events[1], "2026-01-22").day, 3, "manual period day-in-segment");

// --- learning from logged history ---
const base = { cycle_length: 28, period_length: 5, luteal_length: 14 };
// starts 30 days apart => learned cycle_length 30
eq(learnCycleParams(["2026-01-01", "2026-01-31"], [], base).cycle_length, 30, "learns cycle length from Day-1 gaps");
// one start => not enough to learn, keep current
eq(learnCycleParams(["2026-01-01"], [], base).cycle_length, 28, "single start keeps current cycle length");
// period segment of 6 days => learned period_length 6
eq(learnCycleParams(["2026-01-01"],
  [{ phase: "period", start_date: "2026-01-01", end_date: "2026-01-06" }], base).period_length, 6, "learns period length from segment");
// ovulation on day 12 with cycle 28 => luteal = 28 - 12 = 16
eq(learnCycleParams(["2026-01-01"],
  [{ phase: "ovulation", start_date: "2026-01-12", end_date: "2026-01-12" }], base).luteal_length, 16, "learns luteal length from ovulation");
// averages multiple gaps (28 and 30 => 29)
eq(learnCycleParams(["2026-01-01", "2026-01-29", "2026-02-28"], [], base).cycle_length, 29, "averages multiple cycle gaps");

// --- robustness: bad inputs fall back to defaults, never throw ---
eq(dayInCycle(ANCHOR, 0, "2026-01-29"), 1, "cycleLength 0 falls back to 28");
eq(phaseFor(ANCHOR, 999, 999, "2026-01-01").phase, "period", "insane inputs clamp safely");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
