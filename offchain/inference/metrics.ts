import { differenceInMinutes, parseISO, startOfDay, addDays, isBefore, isAfter, formatISO } from "date-fns";

export type Activity = {
  type: "run" | "walk" | "cycle" | "swim" | "steps" | "strength" | "hike"
      | "yoga" | "crossfit" | "rowing" | "exercise_time" | "calories";
  start: string; // ISO
  end: string;   // ISO
  distance_km?: number;
  duration_min?: number;
  avg_hr_bpm?: number;
  max_hr_bpm?: number;
  elev_gain_m?: number;
  steps_count?: number;
  calories?: number;
  exercise_minutes?: number;
  sessions?: number;
  gps_path?: [number, number][]; // [lat, lon]
};

export type Condition = { metric: string; op: ">="|">"|"<="|"<"|"=="; value: number; };
export type Period = { start: string; end: string; timezone: string; };
export type WeeklyTarget = { minOccurrences?: number; perWeeks?: number; };
export type DailyTarget = { consecutiveDays?: number; conditions?: Condition[] };

export type Rule = {
  challengeType: Activity["type"];
  period: Period;
  weeklyTarget?: WeeklyTarget;
  dailyTarget?: DailyTarget; // e.g., steps streak
  conditions?: Condition[];  // per-activity conditions
  antiCheat?: { minGpsContinuity?: number; minHrConsistency?: number; maxTeleportJumps?: number; };
  model?: { modelId?: string; modelVersion?: number; };
};

export type Verdict = { pass: boolean; reasons: string[]; evidenceHash: string };

export function avgPaceMinPerKm(distance_km?: number, duration_min?: number): number | null {
  if (duration_min == null || !distance_km || distance_km <= 0) return null;
  return duration_min / distance_km;
}
export function avgSpeedKmh(distance_km?: number, duration_min?: number): number | null {
  if (duration_min == null || !distance_km || distance_km <= 0) return null;
  return (distance_km) / (duration_min / 60);
}

export function gpsContinuityScore(gps?: [number, number][]): { score: number; jumps: number } {
  if (!gps || gps.length < 3) return { score: 0.0, jumps: 0 };
  let jumps = 0; let good = 0; let total = 0;
  for (let i = 1; i < gps.length; i++) {
    const d = haversine(gps[i-1], gps[i]);
    total++;
    if (d > 0.3) { jumps++; } else { good++; }
  }
  const score = total === 0 ? 0 : good / total;
  return { score, jumps };
}

// Haversine in km
function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (x: number) => x * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b[0]-a[0]);
  const dLon = toRad(b[1]-a[1]);
  const lat1 = toRad(a[0]); const lat2 = toRad(b[0]);
  const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

export function hrActivityConsistency(avg_hr_bpm?: number, duration_min?: number, type?: Activity["type"]): number {
  if (!avg_hr_bpm || !duration_min) return 0;
  const expected = type === "run" ? [110, 200]
                  : type === "cycle" ? [100, 190]
                  : type === "swim" ? [90, 180]
                  : type === "walk" ? [80, 160]
                  : [70, 200];
  return (avg_hr_bpm >= expected[0] && avg_hr_bpm <= expected[1]) ? 1 : 0.3;
}

export function inPeriod(a: Activity, p: Period): boolean {
  const s = parseISO(a.start); const e = parseISO(a.end);
  return !isBefore(e, parseISO(p.start)) && !isAfter(s, parseISO(p.end));
}

export function meetsCondition(a: Activity, c: Condition): boolean {
  const val = metricValue(a, c.metric);
  if (val == null) return false;
  switch (c.op) {
    case ">=": return val >= c.value;
    case ">":  return val >  c.value;
    case "<=": return val <= c.value;
    case "<":  return val <  c.value;
    case "==": return Math.abs(val - c.value) < 1e-9;
  }
}

function metricValue(a: Activity, m: string): number | null {
  switch (m) {
    case "distance_km": return a.distance_km ?? null;
    case "walking_km": return a.type === "walk" ? (a.distance_km ?? 0) : 0;
    case "hiking_km": return a.type === "hike" ? (a.distance_km ?? 0) : 0;
    case "rowing_km": return a.type === "rowing" ? (a.distance_km ?? 0) : 0;
    case "cycling_km": return a.type === "cycle" ? (a.distance_km ?? 0) : 0;
    case "swimming_km": return a.type === "swim" ? (a.distance_km ?? 0) : 0;
    case "duration_min": return a.duration_min ?? (a.start && a.end ? differenceInMinutes(parseISO(a.end), parseISO(a.start)) : null);
    case "yoga_min": return a.type === "yoga" ? (a.duration_min ?? 0) : 0;
    case "hiit_min": return a.type === "crossfit" ? (a.duration_min ?? 0) : 0;
    case "crossfit_min": return a.type === "crossfit" ? (a.duration_min ?? 0) : 0;
    case "active_minutes": return a.duration_min ?? 0;
    case "exercise_time": return a.exercise_minutes ?? a.duration_min ?? 0;
    case "avg_pace_min_per_km": return avgPaceMinPerKm(a.distance_km, a.duration_min);
    case "avg_speed_kmh": return avgSpeedKmh(a.distance_km, a.duration_min);
    case "elev_gain_m": return a.elev_gain_m ?? 0;
    case "avg_hr_bpm": return a.avg_hr_bpm ?? null;
    case "max_hr_bpm": return a.max_hr_bpm ?? null;
    case "steps_count": return a.steps_count ?? null;
    case "gps_continuity_score": return gpsContinuityScore(a.gps_path).score;
    case "hr_activity_consistency": return hrActivityConsistency(a.avg_hr_bpm, a.duration_min, a.type);
    case "swim_distance_km": return a.type === "swim" ? (a.distance_km ?? 0) : 0;
    case "calories": return a.calories ?? null;
    case "strength_sessions": return a.type === "strength" ? (a.sessions ?? 1) : 0;
    default: return null;
  }
}

export function evaluate(rule: Rule, activities: Activity[]): Verdict {
  const reasons: string[] = [];

  // 1) If dailyTarget exists (e.g., steps streak), check it first
  if (rule.dailyTarget?.consecutiveDays && rule.dailyTarget.conditions?.length) {
    const dayPass = dailyStreak(rule, activities);
    if (!dayPass.pass) {
      return { pass: false, reasons: ["Daily streak not met", ...dayPass.reasons], evidenceHash: hashJson(dayPass.evidence) };
    }
  }

  // 2) Non-steps sports / weekly occurrences
  const inScope = activities.filter(a => a.type === rule.challengeType && inPeriod(a, rule.period));

  if ((rule.conditions?.length || rule.weeklyTarget) && inScope.length === 0) {
    return { pass: false, reasons: ["No activities in period for challengeType"], evidenceHash: hashJson({ inScope }) };
  }

  // Anti-cheat assessment (soft; adds reasons if below threshold)
  if (rule.antiCheat) {
    for (const a of inScope) {
      const { score, jumps } = gpsContinuityScore(a.gps_path);
      const hrScore = hrActivityConsistency(a.avg_hr_bpm, a.duration_min, a.type);
      if (rule.antiCheat.minGpsContinuity != null && score < rule.antiCheat.minGpsContinuity) {
        reasons.push(`Low GPS continuity (${score.toFixed(2)} < ${rule.antiCheat.minGpsContinuity})`);
      }
      if (rule.antiCheat.maxTeleportJumps != null && jumps > rule.antiCheat.maxTeleportJumps) {
        reasons.push(`Too many GPS jumps (${jumps} > ${rule.antiCheat.maxTeleportJumps})`);
      }
      if (rule.antiCheat.minHrConsistency != null && hrScore < rule.antiCheat.minHrConsistency) {
        reasons.push(`Low HR/activity consistency (${hrScore.toFixed(2)} < ${rule.antiCheat.minHrConsistency})`);
      }
    }
  }

  let eligible = inScope;
  if (rule.conditions?.length) {
    eligible = inScope.filter(a => rule.conditions!.every(c => meetsCondition(a, c)));
    if (eligible.length === 0) reasons.push("No activity met the required conditions");
  }

  // Weekly target aggregation
  if (rule.weeklyTarget?.minOccurrences && rule.weeklyTarget?.perWeeks) {
    const weeks = sliceIntoDays(rule.period).reduce((acc, d) => {
      const weekKey = weekKeyOf(d); (acc[weekKey] ||= []).push(d); return acc;
    }, {} as Record<string, string[]>);

    // Count weeks with >= minOccurrences of eligible acts
    let okWeeks = 0;
    for (const wk of Object.keys(weeks)) {
      const [wStart, wEnd] = boundsOfWeek(weeks[wk]);
      const count = eligible.filter(a => {
        const s = parseISO(a.start);
        return !isBefore(s, wStart) && !isAfter(s, wEnd);
      }).length;
      if (count >= (rule.weeklyTarget.minOccurrences!)) okWeeks++;
    }
    if (okWeeks < rule.weeklyTarget.perWeeks) {
      reasons.push(`Weekly target not met (${okWeeks}/${rule.weeklyTarget.perWeeks} weeks achieved)`);
    }
  }

  const pass = reasons.length === 0;
  return { pass, reasons, evidenceHash: hashJson({ inScope, eligible, reasons }) };
}

function dailyStreak(rule: Rule, activities: Activity[]) {
  const reasons: string[] = [];
  const days = sliceIntoDays(rule.period); // list of ISO date strings
  const needed = rule.dailyTarget!.consecutiveDays!;
  const conds = rule.dailyTarget!.conditions!;

  const tz = rule.period.timezone;
  const dayPass: Record<string, boolean> = {};
  for (const dayIso of days) {
    // aggregate steps/distance/duration for the day (any type)
    const dayActs = activities.filter(a => inDay(a, dayIso, tz) && inPeriod(a, rule.period));
    const summary: Activity = {
      type: rule.challengeType,
      start: dayIso + "T00:00:00Z",
      end: dayIso + "T23:59:59Z",
      steps_count: sum(dayActs.map(a => a.steps_count ?? 0)),
      distance_km: sum(dayActs.map(a => a.distance_km ?? 0)),
      duration_min: sum(dayActs.map(a => a.duration_min ?? 0))
    };
    dayPass[dayIso] = conds.every(c => meetsCondition(summary, c));
  }

  // longest consecutive streak
  let best = 0, cur = 0;
  for (const d of days) {
    if (dayPass[d]) { cur++; best = Math.max(best, cur); } else { cur = 0; }
  }
  if (best < needed) {
    reasons.push(`Consecutive days achieved: ${best}/${needed}`);
  }
  return { pass: best >= needed, reasons, evidence: { dayPass, needed, best } };
}

/**
 * Check if an activity's start falls within a calendar day in the given timezone.
 * Uses the challenge timezone (from rule.period) so that day boundaries align
 * with the user's local calendar (e.g., midnight Sofia, not midnight UTC).
 */
function inDay(a: Activity, dayIso: string, tz?: string): boolean {
  const s = parseISO(a.start);
  if (tz) {
    // Day boundaries in the challenge timezone
    const d0 = tzMidnight(dayIso, tz);
    const d1 = new Date(d0.getTime() + 86400_000);
    return s.getTime() >= d0.getTime() && s.getTime() < d1.getTime();
  }
  // Fallback: UTC day boundaries
  const d0 = startOfDay(parseISO(dayIso + "T00:00:00Z"));
  const d1 = addDays(d0, 1);
  return !isBefore(s, d0) && isBefore(s, d1);
}

/**
 * Slice a challenge period into calendar days using the challenge timezone.
 * A 4-hour challenge from 17:25-21:25 UTC in Europe/Sofia (UTC+2) spans
 * a single local day (March 18), not two UTC days.
 */
function sliceIntoDays(p: Period): string[] {
  const tz = p.timezone;
  const out: string[] = [];

  if (tz) {
    // Use the challenge timezone for day slicing
    const startDate = parseISO(p.start);
    const endDate = parseISO(p.end);
    // Get the local date string for the start
    let cur = localDateStr(startDate, tz);
    const endStr = localDateStr(endDate, tz);
    out.push(cur);
    // Walk forward by day until we pass the end date's local day
    while (cur < endStr) {
      const next = tzMidnight(cur, tz);
      const nextDay = new Date(next.getTime() + 86400_000);
      cur = localDateStr(nextDay, tz);
      if (cur <= endStr) out.push(cur);
    }
  } else {
    // Fallback: UTC day boundaries
    let cur = startOfDay(parseISO(p.start));
    const end = parseISO(p.end);
    while (!isAfter(cur, end)) {
      out.push(formatISO(cur, { representation: "date" }));
      cur = addDays(cur, 1);
    }
  }
  return out;
}

/** Get midnight in a specific timezone for a given YYYY-MM-DD string. */
function tzMidnight(dayIso: string, tz: string): Date {
  // Create a date at noon UTC on that day, then find the offset
  const noon = new Date(`${dayIso}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(noon);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "0";
  // Reconstruct midnight in that timezone, then convert to UTC
  const localMidnight = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  // The offset between UTC midnight and local midnight
  const offset = noon.getTime() - new Date(`${dayIso}T12:00:00Z`).getTime();
  // Calculate: local midnight = UTC time - tz offset
  const noonLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(noon);
  const noonHour = Number(noonLocal.find(p => p.type === "hour")?.value ?? 12);
  const noonMin = Number(noonLocal.find(p => p.type === "minute")?.value ?? 0);
  // offset in ms = (localHour - utcHour) * 3600000 + (localMin - utcMin) * 60000
  const utcHour = noon.getUTCHours();
  const utcMin = noon.getUTCMinutes();
  const tzOffsetMs = ((noonHour - utcHour) * 3600 + (noonMin - utcMin) * 60) * 1000;
  // Midnight local = dayIso 00:00 local = dayIso 00:00 UTC - tzOffset
  return new Date(localMidnight.getTime() - tzOffsetMs);
}

/** Get YYYY-MM-DD string in a specific timezone. */
function localDateStr(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

function weekKeyOf(isoDate: string): string {
  // naive: "YYYY-WW" computed from date string slice; for display only
  return isoDate.slice(0,7);
}
function boundsOfWeek(days: string[]): [Date, Date] {
  const s = startOfDay(parseISO(days[0] + "T00:00:00Z"));
  const e = addDays(startOfDay(parseISO(days[days.length-1] + "T00:00:00Z")), 1);
  return [s, e];
}

function sum(a: number[]): number { return a.reduce((x,y)=>x+y,0); }

function hashJson(o: any): string {
  const s = JSON.stringify(o);
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
  return "evh:" + (h >>> 0).toString(16);
}
