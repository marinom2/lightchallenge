import { Adapter, AdapterContext, AdapterResult, CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";
import { isFitnessModel, getFitnessHash } from "./fitnessModels";

/** EVM-friendly 0x-prefixed SHA-256 (keeps your original hashing choice) */
function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

// ──────────────────────────────────────────────
// Type normalization
// ──────────────────────────────────────────────

/**
 * Map Strava activity type strings to canonical Activity["type"] values.
 * Evaluators and metrics.evaluate() require these exact strings.
 *
 * Strava sport_type values: Run, TrailRun, Walk, Hike, Ride,
 * MountainBikeRide, GravelRide, VirtualRide, EBikeRide, Swim,
 * WeightTraining, Crossfit, Workout, Yoga, Rowing, etc.
 */
function mapStravaType(t: string): string {
  const x = t.toLowerCase();
  if (x.includes("run") || x === "virtualrun") return "run";
  if (x === "hike" || x === "hiking") return "hike";
  if (x.includes("ride") || x.includes("cycl") || x === "virtualride" || x === "ebikeride"
      || x === "mountainbikeride" || x === "gravelride") return "cycle";
  if (x.includes("swim")) return "swim";
  if (x === "yoga" || x === "pilates") return "yoga";
  if (x === "crossfit" || x === "hiit" || x === "highintensityintervaltraining") return "hiit";
  if (x === "rowing" || x === "virtualrowing") return "rowing";
  if (x === "weighttraining" || x === "workout"
      || x === "strength" || x === "weight_training") return "strength";
  if (x.includes("walk")) return "walk";
  return "walk"; // safe default for unknown types
}

// ──────────────────────────────────────────────
// Parsers (JSON and CSV)
// ──────────────────────────────────────────────

/**
 * Accepts Strava JSON export:
 * [
 *   { "id":123, "type":"Run", "start_date":"2025-05-20T06:12:34Z",
 *     "elapsed_time": 1800, "distance": 5213.4, "average_heartrate": 154.2 },
 *   ...
 * ]
 */
function parseJson(json: any, userIdHash: `0x${string}`): CanonicalRecord[] {
  if (!Array.isArray(json)) throw new Error("Strava JSON must be an array of activities");

  return json.map((a: any, i: number) => {
    const start_ts = Math.floor(
      new Date(a.start_date || a.start_date_local || 0).getTime() / 1000
    );
    const duration = Number(a.elapsed_time || 0);
    const end_ts = start_ts + duration;
    const distance_m = Number(a.distance || 0);
    const rawType = String(a.type || a.sport_type || "").toLowerCase();
    const id = String(a.id ?? `json-${i}`);
    const elev_gain_m = a.total_elevation_gain != null ? Math.round(Number(a.total_elevation_gain)) : null;

    return {
      provider: "strava",
      user_id: userIdHash,
      activity_id: id,
      type: mapStravaType(rawType),
      start_ts,
      end_ts,
      duration_s: duration,
      distance_m,
      elev_gain_m,
      steps: null,
      avg_hr_bpm: a.average_heartrate ?? null,
      source_device: "strava",
      checksum: sha256hex(JSON.stringify(a)),
    };
  });
}

/**
 * Accepts Strava CSV export (`activities.csv`).
 * We do a minimal, safe header lookup and loose number parsing.
 * For full RFC CSV robustness, swap to a CSV lib later.
 */
function parseCsv(csvText: string, userIdHash: `0x${string}`): CanonicalRecord[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines.shift()!.split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name);

  const iType = col("type");
  const iStart = col("start date"); // Strava column name
  const iElapsed = col("elapsed time");
  const iDist = col("distance");
  const iId = col("activity id");
  const iElev = col("elevation gain");

  const safeGet = (arr: string[], idx: number) => (idx >= 0 ? arr[idx] : "");
  const toNum = (v: string) => {
    const parsed = Number(v.replace?.(/[^0-9.\-eE]/g, "") ?? v);
    return Number.isFinite(parsed) ? parsed : 0;
    // (Strava CSV can include units in the same cell depending on locale/export)
  };

  return lines.map((line, i) => {
    const cols = line.split(",");
    const start_ts = Math.floor(new Date(safeGet(cols, iStart)).getTime() / 1000);
    const duration = toNum(safeGet(cols, iElapsed));
    const end_ts = start_ts + duration;
    const distance_m = toNum(safeGet(cols, iDist));
    const rawType = safeGet(cols, iType).toLowerCase();
    const id = safeGet(cols, iId) || `csv-${i}`;
    const elevRaw = safeGet(cols, iElev);
    const elev_gain_m = elevRaw ? Math.round(toNum(elevRaw)) : null;

    return {
      provider: "strava",
      user_id: userIdHash,
      activity_id: id,
      type: mapStravaType(rawType),
      start_ts,
      end_ts,
      duration_s: duration,
      distance_m,
      elev_gain_m,
      steps: null,
      avg_hr_bpm: null,
      source_device: "strava",
      checksum: sha256hex(line),
    };
  });
}

// ──────────────────────────────────────────────
// Adapter
// ──────────────────────────────────────────────

export const stravaAdapter: Adapter = {
  name: "strava.distance_in_window",
  category: "fitness",
  supports(modelHash: string) {
    return isFitnessModel(modelHash);
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const { context } = input;
    const { challengeId, subject, modelHash, params } = context;
    const h = modelHash.toLowerCase();

    const startTs = Number(params?.startTs ?? params?.start_ts ?? 0);
    const endTs = Number(params?.endTs ?? params?.end_ts ?? Math.floor(Date.now() / 1000));

    const userIdHash = sha256hex(Buffer.from(String(subject)));

    // Parse
    let records: CanonicalRecord[] = [];
    if (input.json) {
      records = parseJson(input.json, userIdHash);
    } else if (input.file) {
      const text = Buffer.from(input.file).toString("utf8");
      if (text.trim().startsWith("[")) {
        records = parseJson(JSON.parse(text), userIdHash);
      } else {
        records = parseCsv(text, userIdHash);
      }
    } else {
      throw new Error("Strava adapter needs JSON or CSV file");
    }

    // Filter to challenge window
    const inWindow = records.filter(
      (r) => r.start_ts >= startTs && r.end_ts <= endTs
    );

    const bind = computeBind(challengeId, subject);
    let publicSignals: bigint[];
    let dataHash: `0x${string}`;

    if (h === getFitnessHash("fitness.hiking@1")) {
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
  },
};

export default stravaAdapter;