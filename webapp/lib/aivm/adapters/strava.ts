import { Adapter, AdapterContext, AdapterResult, CanonicalRecord, adapters } from "./index";
import { computeBind } from "@/lib/aivm/bind";

const STRAVA_DISTANCE_MODEL =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

/** EVM-friendly 0x-prefixed SHA-256 (keeps your original hashing choice) */
function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
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
    const type = String(a.type || "").toLowerCase();
    const id = String(a.id ?? `json-${i}`);

    return {
      provider: "strava",
      user_id: userIdHash,
      activity_id: id,
      type: type === "run" || type === "ride" || type === "walk" ? type : "other",
      start_ts,
      end_ts,
      duration_s: duration,
      distance_m,
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
    const type = safeGet(cols, iType).toLowerCase();
    const id = safeGet(cols, iId) || `csv-${i}`;

    return {
      provider: "strava",
      user_id: userIdHash,
      activity_id: id,
      type: type === "run" || type === "ride" || type === "walk" ? type : "other",
      start_ts,
      end_ts,
      duration_s: duration,
      distance_m,
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
  supports(modelHash: string) {
    return modelHash.toLowerCase() === STRAVA_DISTANCE_MODEL.toLowerCase();
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const { context } = input;
    const { challengeId, subject, params } = context;

    const startTs = Number(params?.startTs);
    const endTs = Number(params?.endTs);
    const minMeters = Number(params?.minMeters ?? 5000);

    // Accept CSV or JSON; default allowed types are run, walk, ride
    const allowedTypes: string[] = String(params?.types ?? "run,walk,ride")
      .split(",")
      .map((s) => s.trim().toLowerCase());

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

    // Aggregate by window and type
    const windowed = records.filter(
      (r) => r.start_ts >= startTs && r.end_ts <= endTs && allowedTypes.includes(r.type)
    );
    const distance_m = Math.round(
      windowed.reduce((a, r) => a + (r.distance_m ?? 0), 0)
    );
    const success = distance_m >= minMeters ? 1n : 0n;

    // Public signals + commitment
    const bind = computeBind(challengeId, subject);
    const publicSignals = [bind, success, BigInt(distance_m)];
    const dataHash = sha256hex(
      Buffer.from(JSON.stringify({ startTs, endTs, distance_m }))
    );

    return { records, publicSignals, dataHash };
  },
};

// auto-register
(adapters as any).push(stravaAdapter);
export default stravaAdapter;