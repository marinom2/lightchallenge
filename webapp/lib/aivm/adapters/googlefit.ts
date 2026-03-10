import { Adapter, AdapterContext, AdapterResult, CanonicalRecord, adapters } from "./index";
import { computeBind } from "@/lib/aivm/bind";

const GFIT_STEPS_DAY_MODEL       = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const GFIT_DISTANCE_WINDOW_MODEL = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

type GFitPoint = {
  startTimeNanos?: string;
  endTimeNanos?: string;
  startTime?: string;
  endTime?: string;
  dataTypeName?: string;
  value?: number;
  fields?: Array<{ name: string; intVal?: number; fpVal?: number }>;
};

const toUnix = (isoOrMs: string | number | undefined) => {
  if (!isoOrMs) return 0;
  if (typeof isoOrMs === "number") return Math.floor(isoOrMs / 1000);
  const n = Date.parse(isoOrMs);
  return Number.isFinite(n) ? Math.floor(n / 1000) : 0;
};
const nanosToUnix = (ns?: string) => {
  if (!ns) return 0;
  const ms = Math.floor(Number(ns) / 1_000_000);
  return Math.floor(ms / 1000);
};
const dayUTC = (ts: number) => new Date(ts * 1000).toISOString().slice(0,10);

function normalizeGoogleFit(json: any, userIdHash: string): CanonicalRecord[] {
  const out: CanonicalRecord[] = [];

  if (Array.isArray(json) && json.length && typeof json[0]?.date === "string" && "steps" in json[0]) {
    for (const d of json) {
      const ts = toUnix(d.date + "T00:00:00Z");
      out.push({
        provider: "googlefit",
        user_id: userIdHash,
        activity_id: `steps:${d.date}`,
        type: "steps",
        start_ts: ts, end_ts: ts+86399, duration_s: 86400,
        distance_m: null, steps: Number(d.steps||0),
        avg_hr_bpm: null, source_device: "gfit_daily",
        checksum: sha256hex(JSON.stringify(d))
      });
    }
    return out;
  }

  const points: GFitPoint[] = [];
  if (json?.bucket && Array.isArray(json.bucket)) {
    for (const b of json.bucket) {
      const datasets = b.dataset || b.dataSet || [];
      for (const ds of datasets) {
        const pts = ds.point || ds.points || [];
        for (const p of pts) points.push(p);
      }
    }
  } else if (Array.isArray(json)) {
    for (const p of json) points.push(p);
  } else if (json?.points) {
    for (const p of json.points) points.push(p);
  }

  for (const p of points) {
    const start_ts = p.startTimeNanos ? nanosToUnix(p.startTimeNanos) : toUnix(p.startTime);
    const end_ts   = p.endTimeNanos   ? nanosToUnix(p.endTimeNanos)   : toUnix(p.endTime);
    const dtn = (p.dataTypeName || "").toLowerCase();

    let steps: number | null = null;
    let distance_m: number | null = null;

    if (Array.isArray(p.fields) && p.fields.length) {
      for (const f of p.fields) {
        if ((f.name || "").toLowerCase().includes("steps") || dtn.includes("step")) {
          steps = Number(f.intVal ?? f.fpVal ?? 0);
        }
        if ((f.name || "").toLowerCase().includes("distance") || dtn.includes("distance")) {
          distance_m = Number(f.fpVal ?? f.intVal ?? 0);
        }
      }
    } else if (typeof p.value === "number") {
      if (dtn.includes("step")) steps = Number(p.value);
      if (dtn.includes("distance")) distance_m = Number(p.value);
    }

    if (steps !== null || distance_m !== null) {
      out.push({
        provider: "googlefit",
        user_id: userIdHash,
        activity_id: `pt:${start_ts}:${end_ts}:${dtn}`,
        type: steps !== null ? "steps" : "distance",
        start_ts, end_ts, duration_s: Math.max(0, end_ts - start_ts),
        distance_m, steps,
        avg_hr_bpm: null,
        source_device: "gfit",
        checksum: sha256hex(JSON.stringify(p))
      });
    }
  }

  return out;
}

export const googleFitAdapter: Adapter = {
  name: "googlefit.multi",
  supports(modelHash: string) {
    const h = modelHash.toLowerCase();
    return h === GFIT_STEPS_DAY_MODEL.toLowerCase() || h === GFIT_DISTANCE_WINDOW_MODEL.toLowerCase();
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
      throw new Error("Google Fit adapter requires JSON upload");
    }

    const records = normalizeGoogleFit(payload, userIdHash);
    const bind = computeBind(challengeId, subject);

    let publicSignals: bigint[] = [];
    let dataHash: `0x${string}`;

    if (h === GFIT_STEPS_DAY_MODEL.toLowerCase()) {
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

(adapters as any).push(googleFitAdapter);
export default googleFitAdapter;