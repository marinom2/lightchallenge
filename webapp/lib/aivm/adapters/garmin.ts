import { Adapter, AdapterContext, AdapterResult, CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";
import { isFitnessModel, getFitnessHash } from "./fitnessModels";

function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

/**
 * Map TCX <Activity Sport="..."> values to canonical types.
 * Garmin TCX Sport values: Running, Biking, Swimming, Other.
 * For "Other" or extended Garmin exports, detect from activity name.
 */
function mapTcxSport(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes("run")) return "run";
  if (s.includes("bik") || s.includes("cycl") || s.includes("rid")) return "cycle";
  if (s.includes("swim")) return "swim";
  if (s.includes("hik") || s.includes("trail")) return "hike";
  if (s.includes("walk")) return "walk";
  if (s.includes("strength") || s.includes("weight")) return "strength";
  if (s.includes("yoga")) return "yoga";
  if (s.includes("hiit") || s.includes("cross")) return "crossfit";
  if (s.includes("row")) return "rowing";
  return "distance";
}

/**
 * Map GPX <type> values to canonical activity types.
 * Garmin GPX may use numeric codes or text values.
 */
function mapGpxType(typeVal: string): string {
  const s = typeVal.toLowerCase().trim();
  // Garmin numeric type codes
  if (s === "1" || s === "running") return "run";
  if (s === "2" || s === "biking") return "cycle";
  if (s === "6" || s === "hiking") return "hike";
  if (s === "10" || s === "walking") return "walk";
  if (s === "4" || s === "swimming") return "swim";
  // Text values
  if (s.includes("run")) return "run";
  if (s.includes("bik") || s.includes("cycl")) return "cycle";
  if (s.includes("hik") || s.includes("trail")) return "hike";
  if (s.includes("swim")) return "swim";
  if (s.includes("walk")) return "walk";
  if (s.includes("strength") || s.includes("weight")) return "strength";
  if (s.includes("yoga")) return "yoga";
  if (s.includes("row")) return "rowing";
  return "distance";
}

/**
 * Compute cumulative elevation gain (ascent only) from an altitude profile.
 * Only positive altitude differences are summed — descents are ignored.
 */
function cumulativeAscent(altitudes: number[]): number {
  let gain = 0;
  for (let i = 1; i < altitudes.length; i++) {
    const diff = altitudes[i] - altitudes[i - 1];
    if (diff > 0) gain += diff;
  }
  return Math.round(gain * 100) / 100; // round to cm precision
}

/** Haversine distance in meters between two [lat, lon] points. */
function haversineM(a: [number, number], b: [number, number]): number {
  const toRad = (x: number) => x * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Parse TCX file into one summary record per activity.
 * Extracts total distance, elevation gain, and duration from trackpoints.
 */
function parseTCX(text: string, userIdHash: string): CanonicalRecord[] {
  const activitySport = (text.match(/<Activity\s+Sport="([^"]*)"/) || [])[1] || "Other";
  const actType = mapTcxSport(activitySport);

  // Collect all trackpoint data for activity-level summary
  const tpRe = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;
  let tp;
  let firstTs = 0;
  let lastTs = 0;
  let maxDist = 0;
  const altitudes: number[] = [];

  while ((tp = tpRe.exec(text))) {
    const t = tp[1];
    const time = (t.match(/<Time>(.*?)<\/Time>/) || [])[1];
    const dist = Number((t.match(/<DistanceMeters>(.*?)<\/DistanceMeters>/) || [])[1] || 0);
    const altStr = (t.match(/<AltitudeMeters>(.*?)<\/AltitudeMeters>/) || [])[1];
    const ts = time ? Math.floor(new Date(time).getTime() / 1000) : 0;

    if (!firstTs && ts) firstTs = ts;
    if (ts) lastTs = ts;
    if (dist > maxDist) maxDist = dist;
    if (altStr != null) {
      const alt = Number(altStr);
      if (!isNaN(alt)) altitudes.push(alt);
    }
  }

  if (!firstTs) return [];

  return [{
    provider: "garmin",
    user_id: userIdHash,
    activity_id: `tcx:${firstTs}`,
    type: actType,
    start_ts: firstTs,
    end_ts: lastTs,
    duration_s: lastTs - firstTs,
    distance_m: Math.round(maxDist),
    elev_gain_m: cumulativeAscent(altitudes),
    steps: null,
    avg_hr_bpm: null,
    source_device: "garmin_tcx",
    checksum: sha256hex(text.slice(0, 2048)),
  }];
}

/**
 * Parse GPX file into one summary record per track.
 * Extracts distance (from coordinates), elevation gain, and duration.
 * Detects activity type from <type> element if present.
 */
function parseGPX(text: string, userIdHash: string): CanonicalRecord[] {
  // Detect activity type from <trk><type>...</type>
  const gpxTypeMatch = text.match(/<trk>[\s\S]*?<type>(.*?)<\/type>/);
  const actType = gpxTypeMatch ? mapGpxType(gpxTypeMatch[1]) : "distance";

  const tpRe = /<trkpt([^>]*?)>([\s\S]*?)<\/trkpt>/g;
  let tp;
  let firstTs = 0;
  let lastTs = 0;
  const altitudes: number[] = [];
  const coords: [number, number][] = [];

  while ((tp = tpRe.exec(text))) {
    const attrs = tp[1];
    const body = tp[2];
    const time = (body.match(/<time>(.*?)<\/time>/) || [])[1];
    const eleStr = (body.match(/<ele>(.*?)<\/ele>/) || [])[1];
    const ts = time ? Math.floor(new Date(time).getTime() / 1000) : 0;

    const latMatch = attrs.match(/lat="([^"]*)"/);
    const lonMatch = attrs.match(/lon="([^"]*)"/);
    if (latMatch && lonMatch) {
      coords.push([Number(latMatch[1]), Number(lonMatch[1])]);
    }

    if (!firstTs && ts) firstTs = ts;
    if (ts) lastTs = ts;
    if (eleStr != null) {
      const ele = Number(eleStr);
      if (!isNaN(ele)) altitudes.push(ele);
    }
  }

  if (!firstTs && coords.length === 0) return [];

  // Compute total distance from GPS coordinates
  let distanceM = 0;
  for (let i = 1; i < coords.length; i++) {
    distanceM += haversineM(coords[i - 1], coords[i]);
  }

  return [{
    provider: "garmin",
    user_id: userIdHash,
    activity_id: `gpx:${firstTs || 0}`,
    type: actType,
    start_ts: firstTs,
    end_ts: lastTs,
    duration_s: lastTs - firstTs,
    distance_m: Math.round(distanceM),
    elev_gain_m: cumulativeAscent(altitudes),
    steps: null,
    avg_hr_bpm: null,
    source_device: "garmin_gpx",
    checksum: sha256hex(text.slice(0, 2048)),
  }];
}

function parseStepsJson(json: any, userIdHash: string): CanonicalRecord[] {
  if (!Array.isArray(json)) throw new Error("Garmin steps JSON must be an array");
  return json.map((d: any) => {
    const day = String(d.date);
    const ts = Math.floor(new Date(day + "T00:00:00Z").getTime() / 1000);
    return {
      provider: "garmin",
      user_id: userIdHash,
      activity_id: `steps:${day}`,
      type: "steps",
      start_ts: ts, end_ts: ts + 86399, duration_s: 86400,
      distance_m: null, elev_gain_m: null, steps: Number(d.steps || 0),
      avg_hr_bpm: null,
      source_device: "garmin_daily",
      checksum: sha256hex(JSON.stringify(d))
    };
  });
}

function dayUTC(ts: number) { return new Date(ts * 1000).toISOString().slice(0, 10); }

export const garminAdapter: Adapter = {
  name: "garmin.multi",
  category: "fitness",
  supports(modelHash: string) {
    return isFitnessModel(modelHash);
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const { context } = input;
    const { challengeId, subject, modelHash, params } = context;
    const h = modelHash.toLowerCase();

    const userIdHash = sha256hex(Buffer.from(String(subject)));
    let records: CanonicalRecord[] = [];

    if (input.json) {
      records = parseStepsJson(input.json, userIdHash);
    } else if (input.file) {
      const text = Buffer.from(input.file).toString("utf8");
      if (text.includes("<TrainingCenterDatabase")) {
        records = parseTCX(text, userIdHash);
      } else if (text.includes("<gpx")) {
        records = parseGPX(text, userIdHash);
      } else if (text.trim().startsWith("[")) {
        records = parseStepsJson(JSON.parse(text), userIdHash);
      } else {
        throw new Error("Unsupported Garmin file (expect TCX/GPX or steps JSON)");
      }
    } else {
      throw new Error("Garmin adapter needs TCX/GPX or steps JSON");
    }

    const bind = computeBind(challengeId, subject);
    let publicSignals: bigint[] = [];
    let dataHash: `0x${string}`;

    const startTs = Number(params?.startTs ?? params?.start_ts ?? 0);
    const endTs = Number(params?.endTs ?? params?.end_ts ?? Math.floor(Date.now() / 1000));

    // Filter records to challenge window
    const inWindow = records.filter(r => r.start_ts >= startTs && r.end_ts <= endTs);

    if (h === getFitnessHash("fitness.steps@1")) {
      // Steps: sum daily step counts
      const targetDayUtc = String(params?.targetDayUtc || "").slice(0, 10);
      const minSteps = Number(params?.minSteps ?? 5000);
      const daySteps = records
        .filter(r => r.type === "steps" && dayUTC(r.start_ts) === targetDayUtc)
        .reduce((a, r) => a + (r.steps ?? 0), 0);
      const success = daySteps >= minSteps ? 1n : 0n;
      publicSignals = [bind, success, BigInt(daySteps)];
      dataHash = sha256hex(Buffer.from(JSON.stringify({ targetDayUtc, daySteps })));
    } else if (h === getFitnessHash("fitness.hiking@1")) {
      // Hiking: sum elevation gain from hike records
      const elev_gain_m = Math.round(
        inWindow
          .filter(r => r.type === "hike")
          .reduce((a, r) => a + (r.elev_gain_m ?? 0), 0)
      );
      const minElev = Number(params?.min_elev_gain_m ?? params?.minElevGainM ?? 1000);
      const success = elev_gain_m >= minElev ? 1n : 0n;
      publicSignals = [bind, success, BigInt(elev_gain_m)];
      dataHash = sha256hex(Buffer.from(JSON.stringify({ startTs, endTs, elev_gain_m })));
    } else {
      // Generic distance aggregation — accepts all activity types in window
      const distance_m = Math.round(
        inWindow.reduce((a, r) => a + (r.distance_m ?? 0), 0)
      );
      const minMeters = Number(params?.minMeters ?? params?.min_distance_m ?? 5000);
      const success = distance_m >= minMeters ? 1n : 0n;
      publicSignals = [bind, success, BigInt(distance_m)];
      dataHash = sha256hex(Buffer.from(JSON.stringify({ startTs, endTs, distance_m })));
    }

    return { records, publicSignals, dataHash };
  }
};

export default garminAdapter;
