import fs from "node:fs";
import { Activity } from "../inference/metrics";

/**
 * Input: Strava bulk export activities.json (array)
 * Output: { athlete, activities } normalized
 */
export function normalizeStrava(jsonPath: string, athleteAddress: string) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const activities: Activity[] = raw.map((r: any) => ({
    type: mapType(r.type),
    start: r.start_date,         // ISO
    end: r.start_date_local || r.start_date, // approx
    distance_km: Number(r.distance || 0) / 1000,
    duration_min: Number(r.moving_time || r.elapsed_time || 0) / 60,
    avg_hr_bpm: r.has_heartrate ? Number(r.average_heartrate) : undefined,
    max_hr_bpm: r.has_heartrate ? Number(r.max_heartrate) : undefined,
    elev_gain_m: Number(r.total_elevation_gain || 0),
    steps_count: undefined,
    gps_path: undefined // could be added from GPX per-activity if available
  }));
  return { athlete: { address: athleteAddress, source: "strava" }, activities };
}
function mapType(t: string): Activity["type"] {
  const x = (t||"").toLowerCase();
  if (x.includes("run")) return "run";
  if (x.includes("walk")) return "walk";
  if (x.includes("ride") || x.includes("cycle")) return "cycle";
  if (x.includes("swim")) return "swim";
  return "walk";
}
