import { Adapter, AdapterContext, AdapterResult, CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";

/** Matches lol.winrate_next_n@1 in models.json. */
const LOL_WINS_MODEL = "0x6a68a575fa50ebbc7c0404ebe2078f7a79cfa95b4c2efd9c869b0744137456c3" as const;

function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

export const lolAdapter: Adapter = {
  name: "lol.ranked_wins_window",
  supports(modelHash: string) {
    return modelHash.toLowerCase() === LOL_WINS_MODEL.toLowerCase();
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const data = input.json ?? JSON.parse(Buffer.from(input.file!).toString("utf8"));
    const { puuid, matches } = data as { puuid: string; matches: any[] };
    const { context } = input;
    const { challengeId, subject, params } = context;

    const startTs = Number(params?.startTs);
    const endTs   = Number(params?.endTs);
    const minWins = Number(params?.minWins ?? 2);
    const rankedQueues = new Set<number>([420, 440]);

    const recs: CanonicalRecord[] = [];
    for (const m of (matches || [])) {
      const start_ts = Math.floor((m?.info?.gameCreation ?? 0) / 1000);
      const end_ts = start_ts + Number(m?.info?.gameDuration ?? 0);
      const queueId = Number(m?.info?.queueId ?? 0);
      const p = (m?.info?.participants || []).find((x: any) => x?.puuid === puuid);
      if (!p) continue;
      const won = !!p.win;
      const k = Number(p.kills || 0), d = Number(p.deaths || 0), a = Number(p.assists || 0);
      const champ = String(p.championName || "");

      recs.push({
        provider: "lol",
        player_id: puuid,
        match_id: String(m?.metadata?.matchId || ""),
        queue: rankedQueues.has(queueId) ? "ranked" : "other",
        start_ts, end_ts,
        team_result: won ? "win" : "loss",
        k, d, a,
        hero_champion: champ,
        mmr_or_lp: null,
        checksum: sha256hex(String(m?.metadata?.matchId || "") + ":" + start_ts)
      });
    }

    const windowed = recs.filter(r => r.start_ts >= startTs && r.end_ts <= endTs);
    const ranked = windowed.filter(r => r.queue === "ranked");
    const wins = ranked.filter(r => r.team_result === "win").length;
    const success = wins >= minWins ? 1n : 0n;

    const bind = computeBind(challengeId, subject);
    const publicSignals = [bind, success, BigInt(wins)];
    const dataHash = sha256hex(Buffer.from(JSON.stringify({ startTs, endTs, wins })));

    return { records: recs, publicSignals, dataHash };
  }
};

export default lolAdapter;