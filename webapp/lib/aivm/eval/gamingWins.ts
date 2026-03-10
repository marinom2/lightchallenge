import { CanonicalRecord } from "../adapters";

export function rankedWins(records: CanonicalRecord[], startTs: number, endTs: number) {
  const inWin = records.filter(r =>
    r.queue === "ranked" && r.start_ts >= startTs && r.end_ts <= endTs && r.team_result === "win");
  return inWin.length;
}