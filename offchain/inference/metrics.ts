import { differenceInMinutes, parseISO, startOfDay, addDays, isBefore, isAfter, formatISO } from "date-fns";

export type Activity = {
  type: "run" | "walk" | "cycle" | "swim" | "steps";
  start: string; // ISO
  end: string;   // ISO
  distance_km?: number;
  duration_min?: number;
  avg_hr_bpm?: number;
  max_hr_bpm?: number;
  elev_gain_m?: number;
  steps_count?: number;
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
    case "duration_min": return a.duration_min ?? (a.start && a.end ? differenceInMinutes(parseISO(a.end), parseISO(a.start)) : null);
    case "avg_pace_min_per_km": return avgPaceMinPerKm(a.distance_km, a.duration_min);
    case "avg_speed_kmh": return avgSpeedKmh(a.distance_km, a.duration_min);
    case "elev_gain_m": return a.elev_gain_m ?? 0;
    case "avg_hr_bpm": return a.avg_hr_bpm ?? null;
    case "max_hr_bpm": return a.max_hr_bpm ?? null;
    case "steps_count": return a.steps_count ?? null;
    case "gps_continuity_score": return gpsContinuityScore(a.gps_path).score;
    case "hr_activity_consistency": return hrActivityConsistency(a.avg_hr_bpm, a.duration_min, a.type);
    case "swim_distance_km": return a.type === "swim" ? (a.distance_km ?? 0) : 0;
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

  const dayPass: Record<string, boolean> = {};
  for (const dayIso of days) {
    // aggregate steps/distance/duration for the day (any type)
    const dayActs = activities.filter(a => inDay(a, dayIso) && inPeriod(a, rule.period));
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

function inDay(a: Activity, dayIso: string): boolean {
  const s = parseISO(a.start);
  const d0 = startOfDay(parseISO(dayIso + "T00:00:00Z"));
  const d1 = addDays(d0, 1);
  return !isBefore(s, d0) && isBefore(s, d1);
}

function sliceIntoDays(p: Period): string[] {
  const out: string[] = [];
  let cur = startOfDay(parseISO(p.start));
  const end = parseISO(p.end);
  while (!isAfter(cur, end)) {
    out.push(formatISO(cur, { representation: "date" }));
    cur = addDays(cur, 1);
  }
  return out;
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
