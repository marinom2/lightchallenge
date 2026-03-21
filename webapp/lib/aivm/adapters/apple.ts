import unzipper from "unzipper";
import sax from "sax";
import { Adapter, AdapterContext, AdapterResult, CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";
import { isFitnessModel } from "./fitnessModels";

// —— Types / helpers ————————————————————————————————————————

/** EVM-friendly 0x-prefixed SHA-256 (kept to preserve your current semantics) */
function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

/** Apple’s `2025-09-20T18:45:00Z` or with timezone offsets. Fallback to native Date. */
function toUnix(s?: string): number {
  if (!s) return 0;
  // Normalize trailing Z → +00:00 to be explicit for Date.parse
  const norm = s.replace("Z", "+00:00");
  const ts = Date.parse(norm);
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(new Date(s).getTime() / 1000);
}
function dayUTC(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Attributes we care about from <Record .../> in Apple export.xml */
type AppleRecordAttrs = {
  type?: string;
  startDate?: string;
  endDate?: string;
  value?: string | number;
  unit?: string;
  sourceName?: string;
};

// —— Core parsing ——————————————————————————————————————————————

async function parseExportXml(zipBuf: Buffer, userIdHash: `0x${string}`): Promise<CanonicalRecord[]> {
  const out: CanonicalRecord[] = [];
  const zip = await unzipper.Open.buffer(zipBuf);
  const entry = zip.files.find((f: any) => f.path.endsWith("export.xml"));
  if (!entry) throw new Error("export.xml not found");

  await new Promise<void>((resolve, reject) => {
    const parser = sax.createStream(true, { trim: true });

    parser.on("opentag", (node: any) => {
      if (node.name !== "Record") return;

      const attrs = node.attributes as AppleRecordAttrs;
      const t = String(attrs.type || "");

      // Record types we care about from Apple Health export.xml
      const SUPPORTED_TYPES = new Set([
        "HKQuantityTypeIdentifierStepCount",
        "HKQuantityTypeIdentifierDistanceWalkingRunning",
        "HKQuantityTypeIdentifierDistanceCycling",
        "HKQuantityTypeIdentifierDistanceSwimming",
        "HKQuantityTypeIdentifierActiveEnergyBurned",
        "HKQuantityTypeIdentifierFlightsClimbed",
      ]);

      if (SUPPORTED_TYPES.has(t)) {
        const s = toUnix(attrs.startDate);
        const e = toUnix(attrs.endDate);
        const valNum = Number(attrs.value ?? 0);
        const unit = String(attrs.unit || "").toLowerCase();

        let type: string = "steps";
        let steps: number | null = null;
        let distance_m: number | null = null;

        if (t.endsWith("StepCount")) {
          type = "steps";
          steps = Math.round(valNum);
        } else if (t.endsWith("DistanceCycling")) {
          type = "cycle";
          distance_m =
            unit.startsWith("km") ? valNum * 1000 :
            unit.startsWith("mi") ? valNum * 1609.34 :
            valNum;
        } else if (t.endsWith("DistanceSwimming")) {
          type = "swim";
          distance_m =
            unit.startsWith("km") ? valNum * 1000 :
            unit.startsWith("mi") ? valNum * 1609.34 :
            valNum;
        } else if (t.endsWith("ActiveEnergyBurned")) {
          type = "active_energy";
        } else if (t.endsWith("FlightsClimbed")) {
          type = "hike";
          // ~3m elevation per flight of stairs
          distance_m = null;
          steps = null;
        } else {
          type = "distance";
          distance_m =
            unit.startsWith("km") ? valNum * 1000 :
            unit.startsWith("mi") ? valNum * 1609.34 :
            valNum;
        }

        const checksum = sha256hex(JSON.stringify({ t, s, e, val: valNum, unit }));

        out.push({
          provider: "apple_health",
          user_id: userIdHash,
          activity_id: `record:${t}:${s}:${e}`,
          type,
          start_ts: s,
          end_ts: e || s,
          duration_s: e ? e - s : 0,
          distance_m,
          steps,
          source_device: attrs.sourceName || null,
          checksum,
        });
      }

      // Also parse Workout records for all activity types
      if (node.name === "Workout") {
        const wt = String(attrs.type || "");
        const s = toUnix(attrs.startDate);
        const e = toUnix(attrs.endDate);

        // Map HKWorkoutActivityType to canonical types
        let type: string | null = null;
        if (wt === "HKWorkoutActivityTypeTraditionalStrengthTraining"
            || wt === "HKWorkoutActivityTypeFunctionalStrengthTraining") {
          type = "strength";
        } else if (wt === "HKWorkoutActivityTypeHiking") {
          type = "hike";
        } else if (wt === "HKWorkoutActivityTypeRunning") {
          type = "run";
        } else if (wt === "HKWorkoutActivityTypeWalking") {
          type = "walk";
        } else if (wt === "HKWorkoutActivityTypeCycling") {
          type = "cycle";
        } else if (wt === "HKWorkoutActivityTypeSwimming") {
          type = "swim";
        } else if (wt === "HKWorkoutActivityTypeYoga") {
          type = "yoga";
        } else if (wt === "HKWorkoutActivityTypeCrossTraining"
            || wt === "HKWorkoutActivityTypeHighIntensityIntervalTraining") {
          type = "crossfit";
        } else if (wt === "HKWorkoutActivityTypeRowing") {
          type = "rowing";
        }

        if (type) {
          out.push({
            provider: "apple_health",
            user_id: userIdHash,
            activity_id: `workout:${wt}:${s}:${e}`,
            type,
            start_ts: s,
            end_ts: e || s,
            duration_s: e ? e - s : 0,
            distance_m: null,
            steps: null,
            source_device: attrs.sourceName || null,
            checksum: sha256hex(JSON.stringify({ wt, s, e })),
          });
        }
      }
    });

    parser.on("end", () => resolve());
    parser.on("error", reject);

    entry.stream().pipe(parser);
  });

  return out;
}

function totalStepsOnDay(records: CanonicalRecord[], yyyy_mm_dd: string) {
  return records
    .filter((r) => r.type === "steps" && dayUTC(r.start_ts) === yyyy_mm_dd)
    .reduce((a, r) => a + (r.steps ?? 0), 0);
}

// —— Adapter implementation ————————————————————————————————————

export const appleAdapter: Adapter = {
  name: "apple_health.steps_on_day",
  category: "fitness",
  supports(modelHash: string) {
    return isFitnessModel(modelHash);
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const { context } = input;
    const { challengeId, subject, params } = context;
    const userIdHash = sha256hex(Buffer.from(String(subject)));

    let records: CanonicalRecord[];

    if (input.json && Array.isArray(input.json)) {
      // iOS HealthKit path: pre-parsed JSON records from HealthKit API
      records = input.json as CanonicalRecord[];
    } else if (input.file) {
      // Web/export path: ZIP file from Apple Health export
      records = await parseExportXml(input.file, userIdHash);
    } else {
      throw new Error("Apple adapter requires either JSON records or ZIP file upload");
    }

    // Business rules from params
    const targetDayUtc = String(params?.targetDayUtc || "").slice(0, 10);
    const minSteps = Number(params?.minSteps ?? 5000);

    const stepsTotal = totalStepsOnDay(records, targetDayUtc);
    const success = stepsTotal >= minSteps ? 1n : 0n;

    // Same bind + public signals format as your original
    const bind = computeBind(challengeId, subject);
    const publicSignals = [bind, success, BigInt(stepsTotal)];

    const dataHash = sha256hex(
      Buffer.from(JSON.stringify({ targetDayUtc, minSteps, stepsTotal }))
    );

    return { records, publicSignals, dataHash };
  },
};

export default appleAdapter;