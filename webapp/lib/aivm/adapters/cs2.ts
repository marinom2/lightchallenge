import { Adapter, AdapterContext, AdapterResult, CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";

const CS2_FACEIT_WINS_MODEL = "0x68897197aeecd201ed61384bb4b1b07b1e14d4c3ac57ed33ebc0dd528ed551f4" as const;

function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}

function normalizeCs2(json: any, userIdHash: string): CanonicalRecord[] {
  const matches = Array.isArray(json) ? json : json?.items ?? json?.matches ?? [];
  if (!Array.isArray(matches)) throw new Error("CS2 adapter requires an array of match records");

  return matches.map((m: any, i: number) => {
    const startTs = typeof m.start_time === "number"
      ? m.start_time
      : m.started_at
        ? Math.floor(new Date(m.started_at).getTime() / 1000)
        : 0;
    const endTs = typeof m.end_time === "number"
      ? m.end_time
      : m.finished_at
        ? Math.floor(new Date(m.finished_at).getTime() / 1000)
        : startTs;

    const isWin =
      m.result_for_player === "win" ||
      m.team_result === "win" ||
      m.win === true;

    return {
      provider: "faceit",
      user_id: userIdHash,
      activity_id: `match:${m.match_id ?? startTs}:${i}`,
      match_id: m.match_id ?? `${startTs}:${i}`,
      start_time: startTs,
      end_time: endTs,
      game_mode: m.game_mode ?? m.competition_type ?? "competitive",
      result_for_player: isWin ? "win" : "loss",
      elo: typeof m.elo === "number" ? m.elo : null,
      player_team: m.player_team ?? null,
      opponent_team: m.opponent_team ?? null,
      score: m.score ?? null,
      checksum: sha256hex(JSON.stringify(m)),
    };
  });
}

export const cs2Adapter: Adapter = {
  name: "cs2.faceit_wins",
  supports(modelHash: string) {
    return modelHash.toLowerCase() === CS2_FACEIT_WINS_MODEL.toLowerCase();
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const { context } = input;
    const { challengeId, subject, params } = context;

    const userIdHash = sha256hex(Buffer.from(String(subject)));

    let payload: any;
    if (input.json) payload = input.json;
    else if (input.file) {
      const text = Buffer.from(input.file).toString("utf8");
      payload = JSON.parse(text);
    } else {
      throw new Error("CS2 adapter requires JSON match data");
    }

    const records = normalizeCs2(payload, userIdHash);
    const bind = computeBind(challengeId, subject);

    const startTs = Number(params?.startTs || 0);
    const endTs = Number(params?.endTs || Date.now() / 1000);
    const minWins = Number(params?.minWins ?? 1);

    const eligible = records.filter(
      (r) => r.start_time >= startTs && r.start_time <= endTs
    );
    const wins = eligible.filter((r) => r.result_for_player === "win").length;
    const success = wins >= minWins ? 1n : 0n;

    const publicSignals = [bind, success, BigInt(wins)];
    const dataHash = sha256hex(
      Buffer.from(JSON.stringify({ startTs, endTs, wins, total: eligible.length }))
    );

    return { records, publicSignals, dataHash };
  },
};

export default cs2Adapter;
