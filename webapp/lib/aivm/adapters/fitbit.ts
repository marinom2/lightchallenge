import { Adapter, AdapterContext, AdapterResult, CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";

const FITBIT_STEPS_DAY_MODEL       = "0xef89f75d3f5b1bb04ee42748a51dc8410c79cfdea474356ed5edb0b08e451ee9" as const;
const FITBIT_DISTANCE_WINDOW_MODEL = "0x3a7a7b773abcce8dd5619d63eff68bb14d12b873ca5d2fb395aee7a5c5d89fd6" as const;

function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

const toUnixDay = (day: string) => Math.floor(new Date(day + "T00:00:00Z").getTime() / 1000);
const dayUTC = (ts: number) => new Date(ts * 1000).toISOString().slice(0,10);

function normalizeFitbit(json: any, userIdHash: string): CanonicalRecord[] {
  const out: CanonicalRecord[] = [];

  if (Array.isArray(json) && json.length && typeof json[0]?.dateTime === "string" && "value" in json[0]) {
    for (const r of json) {
      const day = r.dateTime;
      const steps = Number(r.value || 0);
      const ts = toUnixDay(day);
      out.push({
        provider: "fitbit",
        user_id: userIdHash,
        activity_id: `steps:${day}`,
        type: "steps",
        start_ts: ts, end_ts: ts+86399, duration_s: 86400,
        distance_m: null, steps,
        avg_hr_bpm: null, source_device: "fitbit_daily",
        checksum: sha256hex(JSON.stringify(r))
      });
    }
    return out;
  }

  if (Array.isArray(json)) {
    for (let i=0; i<json.length; i++) {
      const a = json[i];
      const start_ts = Math.floor(new Date(a.startTime || a.startDate || a.datetime || 0).getTime()/1000);
      const dur_s = Math.floor((a.duration || a.duration_ms || 0) / 1000);
      const end_ts = start_ts + Math.max(0, dur_s);
      let dist_m = 0;
      if (a.distance != null) {
        const unit = String(a.distanceUnit || a.unit || "m").toLowerCase();
        const val = Number(a.distance);
        dist_m = unit.startsWith("km") ? val * 1000 : unit.startsWith("mi") ? val * 1609.34 : val;
      }
      if (start_ts > 0 && dist_m >= 0) {
        out.push({
          provider: "fitbit",
          user_id: userIdHash,
          activity_id: `act:${start_ts}:${i}`,
          type: "distance",
          start_ts, end_ts, duration_s: dur_s,
          distance_m: dist_m, steps: null,
          avg_hr_bpm: null, source_device: "fitbit",
          checksum: sha256hex(JSON.stringify(a))
        });
      }
    }
    return out;
  }

  if (json?.steps || json?.activities) {
    if (Array.isArray(json.steps)) out.push(...normalizeFitbit(json.steps, userIdHash));
    if (Array.isArray(json.activities)) out.push(...normalizeFitbit(json.activities, userIdHash));
    return out;
  }

  throw new Error("Unsupported Fitbit JSON shape");
}

export const fitbitAdapter: Adapter = {
  name: "fitbit.multi",
  supports(modelHash: string) {
    const h = modelHash.toLowerCase();
    return h === FITBIT_STEPS_DAY_MODEL.toLowerCase() || h === FITBIT_DISTANCE_WINDOW_MODEL.toLowerCase();
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const { context } = input;
    const { challengeId, subject, modelHash, params } = context;

    const h = modelHash.toLowerCase();
    const userIdHash = sha256hex(Buffer.from(String(subject)));

    let payload: any;
    if (input.json) payload = input.json;
    else if (input.file) {
      const text = Buffer.from(input.file).toString("utf8");
      payload = JSON.parse(text);
    } else {
      throw new Error("Fitbit adapter requires JSON upload");
    }

    const records = normalizeFitbit(payload, userIdHash);
    const bind = computeBind(challengeId, subject);

    let publicSignals: bigint[] = [];
    let dataHash: `0x${string}`;

    if (h === FITBIT_STEPS_DAY_MODEL.toLowerCase()) {
      const targetDayUtc = String(params?.targetDayUtc || "").slice(0,10);
      const minSteps = Number(params?.minSteps ?? 5000);
      const total = records
        .filter(r => r.type === "steps" && dayUTC(r.start_ts) === targetDayUtc)
        .reduce((a, r) => a + (r.steps ?? 0), 0);
      const success = total >= minSteps ? 1n : 0n;
      publicSignals = [bind, success, BigInt(total)];
      dataHash = sha256hex(Buffer.from(JSON.stringify({ targetDayUtc, total })));
    } else {
      const startTs = Number(params?.startTs);
      const endTs   = Number(params?.endTs);
      const minMeters = Number(params?.minMeters ?? 5000);
      const distance_m = Math.round(
        records
          .filter(r => r.type === "distance" && r.start_ts >= startTs && r.end_ts <= endTs)
          .reduce((a, r) => a + (r.distance_m ?? 0), 0)
      );
      const success = distance_m >= minMeters ? 1n : 0n;
      publicSignals = [bind, success, BigInt(distance_m)];
      dataHash = sha256hex(Buffer.from(JSON.stringify({ startTs, endTs, distance_m })));
    }

    return { records, publicSignals, dataHash };
  }
};

export default fitbitAdapter;