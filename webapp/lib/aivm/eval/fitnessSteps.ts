import { CanonicalRecord } from "../adapters";

export function stepsOnDayUTC(records: CanonicalRecord[], day: string) {
  return records
    .filter(r => r.type === "steps" && new Date(r.start_ts * 1000).toISOString().slice(0,10) === day)
    .reduce((a, r) => a + (r.steps ?? 0), 0);
}