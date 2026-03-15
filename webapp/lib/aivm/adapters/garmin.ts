import { Adapter, AdapterContext, AdapterResult, CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";

/** Matches garmin.steps@1 in models.json. */
const GARMIN_STEPS_DAY_MODEL = "0x7abfc322e4b015bd06ff99afe644c44868506d0ef39ae80a17b21813a389a1f2" as const;
const GARMIN_DISTANCE_WINDOW_MODEL = "0x1f0529367f707855129caa7af76a01c8ed88b22602f06433aaa7fc0a50cd1b90" as const;

function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

function parseTCX(text: string, userIdHash: string): CanonicalRecord[] {
  const recs: CanonicalRecord[] = [];
  const lapRe = /<Lap[^>]*?>([\s\S]*?)<\/Lap>/g;
  let m;
  while ((m = lapRe.exec(text))) {
    const lap = m[1];
    const tpRe = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;
    let tp;
    while ((tp = tpRe.exec(lap))) {
      const t = tp[1];
      const time = (t.match(/<Time>(.*?)<\/Time>/) || [])[1];
      const dist = Number((t.match(/<DistanceMeters>(.*?)<\/DistanceMeters>/) || [])[1] || 0);
      const ts = time ? Math.floor(new Date(time).getTime()/1000) : 0;
      recs.push({
        provider: "garmin",
        user_id: userIdHash,
        activity_id: `tcx:${ts}`,
        type: "distance",
        start_ts: ts, end_ts: ts, duration_s: 0,
        distance_m: dist || 0, steps: null,
        avg_hr_bpm: null,
        source_device: "garmin_tcx",
        checksum: sha256hex(t)
      });
    }
  }
  return recs;
}

function parseGPX(text: string, userIdHash: string): CanonicalRecord[] {
  const recs: CanonicalRecord[] = [];
  const tpRe = /<trkpt[^>]*?>([\s\S]*?)<\/trkpt>/g;
  let tp;
  let stepIdx = 0;
  while ((tp = tpRe.exec(text))) {
    const t = tp[1];
    const time = (t.match(/<time>(.*?)<\/time>/) || [])[1];
    const ts = time ? Math.floor(new Date(time).getTime()/1000) : 0;
    recs.push({
      provider: "garmin",
      user_id: userIdHash,
      activity_id: `gpx:${ts}:${stepIdx++}`,
      type: "distance",
      start_ts: ts, end_ts: ts, duration_s: 0,
      distance_m: 0, steps: null,
      avg_hr_bpm: null,
      source_device: "garmin_gpx",
      checksum: sha256hex(t)
    });
  }
  return recs;
}

function parseStepsJson(json: any, userIdHash: string): CanonicalRecord[] {
  if (!Array.isArray(json)) throw new Error("Garmin steps JSON must be an array");
  return json.map((d: any) => {
    const day = String(d.date);
    const ts = Math.floor(new Date(day + "T00:00:00Z").getTime()/1000);
    return {
      provider: "garmin",
      user_id: userIdHash,
      activity_id: `steps:${day}`,
      type: "steps",
      start_ts: ts, end_ts: ts + 86399, duration_s: 86400,
      distance_m: null, steps: Number(d.steps || 0),
      avg_hr_bpm: null,
      source_device: "garmin_daily",
      checksum: sha256hex(JSON.stringify(d))
    };
  });
}

function dayUTC(ts: number) { return new Date(ts * 1000).toISOString().slice(0,10); }

export const garminAdapter: Adapter = {
  name: "garmin.multi",
  category: "fitness",
  supports(modelHash: string) {
    const h = modelHash.toLowerCase();
    return h === GARMIN_STEPS_DAY_MODEL.toLowerCase() ||
           h === GARMIN_DISTANCE_WINDOW_MODEL.toLowerCase();
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

    if (h === GARMIN_STEPS_DAY_MODEL.toLowerCase()) {
      const targetDayUtc = String(params?.targetDayUtc || "").slice(0,10);
      const minSteps = Number(params?.minSteps ?? 5000);
      const daySteps = records
        .filter(r => r.type === "steps" && dayUTC(r.start_ts) === targetDayUtc)
        .reduce((a, r) => a + (r.steps ?? 0), 0);
      const success = daySteps >= minSteps ? 1n : 0n;
      publicSignals = [bind, success, BigInt(daySteps)];
      dataHash = sha256hex(Buffer.from(JSON.stringify({ targetDayUtc, daySteps })));
    } else {
      const startTs = Number(params?.startTs);
      const endTs = Number(params?.endTs);
      const distance_m = Math.round(
        records
          .filter(r => r.type === "distance" && r.start_ts >= startTs && r.end_ts <= endTs)
          .reduce((a, r) => a + (r.distance_m ?? 0), 0)
      );
      const minMeters = Number(params?.minMeters ?? 5000);
      const success = distance_m >= minMeters ? 1n : 0n;
      publicSignals = [bind, success, BigInt(distance_m)];
      dataHash = sha256hex(Buffer.from(JSON.stringify({ startTs, endTs, distance_m })));
    }

    return { records, publicSignals, dataHash };
  }
};

export default garminAdapter;