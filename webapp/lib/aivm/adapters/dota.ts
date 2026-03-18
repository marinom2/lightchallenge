import { type Adapter, type AdapterContext, type AdapterResult, type CanonicalRecord } from "./types";
import { computeBind } from "@/lib/aivm/bind";

/** All supported Dota 2 model hashes (DB models table). */
const DOTA_MODELS = new Set([
  "0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def", // dota.private_match_1v1@1
  "0xa36667f7fba0e008bfca236bcec118fef4f7177046cbc57f093b557b41ca95e6", // dota.private_match_5v5@1
  "0x0de4617204f86e47e89b88696ce2d323fa053589dce9152a523741429a83ddb1", // dota.hero_kills_window@1
  "0x39abeb3664e21ae78cd0ae1b2393ac5e3d3fa3fa5a2f290474c323cce59d93c6", // dota.winrate_next_n@1
]);

// helpers
function sha256hex(buf: Buffer | string): `0x${string}` {
  const { createHash } = require("node:crypto");
  return ("0x" + createHash("sha256").update(buf).digest("hex")) as `0x${string}`;
}
type Team = "radiant" | "dire";
type OpenDotaPlayer = { isRadiant?: boolean; account_id?: number };
type OpenDotaMatch = {
  match_id?: number | string;
  human_players?: number;
  game_mode?: number;
  lobby_type?: number;
  start_time?: number;
  duration?: number;
  radiant_win?: boolean;
  players?: OpenDotaPlayer[];
};

const OPENDOTA = process.env.OPENDOTA_BASE || "https://api.opendota.com";

function steam64To32(steam64: string): string {
  const base = BigInt("76561197960265728");
  return (BigInt(steam64) - base).toString();
}
function teamFor(platformId: string, radiant32: string[], dire32: string[]): Team | undefined {
  if (radiant32.includes(platformId)) return "radiant";
  if (dire32.includes(platformId)) return "dire";
  return undefined;
}

export const dotaAdapter: Adapter = {
  name: "dota.opendota_match",
  category: "gaming",
  supports(modelHash: string) {
    return DOTA_MODELS.has(modelHash.toLowerCase());
  },
  async ingest(input: { file?: Buffer; json?: any; context: AdapterContext }): Promise<AdapterResult> {
    const { context } = input;
    const { challengeId, subject, params } = context;

    // required params (provided by your create flow)
    const matchId = String(params?.matchId ?? "");
    const participantWallets: `0x${string}`[] = Array.isArray(params?.participants) ? params.participants : [];
    if (!matchId || participantWallets.length === 0) {
      throw new Error("dotaAdapter params: { matchId, participants[wallets] } are required");
    }

    const requireHumanPlayers: number | undefined = params?.requireHumanPlayers != null ? Number(params.requireHumanPlayers) : undefined;
    const disallowGameModes: number[] = Array.isArray(params?.disallowGameModes) ? params.disallowGameModes.map(Number) : [];

    // optional wallet→steam mapping (steam32 or steam64). If absent, we can’t verify team membership.
    const steamBindings: Record<`0x${string}`, string> = (params?.steamBindings || {}) as Record<`0x${string}`, string>;

    // 1) fetch OpenDota match
    const r = await fetch(`${OPENDOTA}/api/matches/${matchId}`);
    if (!r.ok) throw new Error(`OpenDota ${matchId}: ${r.status} ${r.statusText}`);
    const raw = (await r.json()) as OpenDotaMatch;

    if (requireHumanPlayers != null && Number(raw?.human_players) !== Number(requireHumanPlayers)) {
      throw new Error(`Human players mismatch: expected ${requireHumanPlayers}, got ${raw?.human_players ?? "n/a"}`);
    }
    if (disallowGameModes.length) {
      const gm = Number(raw?.game_mode);
      if (disallowGameModes.includes(gm)) throw new Error(`Disallowed game_mode ${gm}`);
    }

    const players: OpenDotaPlayer[] = Array.isArray(raw?.players) ? raw.players! : [];
    const radiantWin = !!raw?.radiant_win;

    // Build team buckets in steam32
    const radiant32 = players.filter(p => p.isRadiant).map(p => String(p.account_id));
    const dire32    = players.filter(p => !p.isRadiant).map(p => String(p.account_id));

    // 2) enrich participants with platform id + team
    const enriched = participantWallets.map((wallet) => {
      const bound = steamBindings[wallet];
      if (!bound) {
        // If you require strict binding, throw; else leave undefined team.
        // throw new Error(`No Steam binding for ${wallet}`);
        return { wallet, platformId: "", handle: undefined, team: undefined as Team | undefined };
      }
      const platformId = /^\d{17}$/.test(bound) ? steam64To32(bound) : String(bound);
      const team = teamFor(platformId, radiant32, dire32);
      return { wallet, platformId, handle: undefined as string | undefined, team };
    });

    const winners = radiantWin ? radiant32 : dire32;
    const losers  = radiantWin ? dire32 : radiant32;

    // 3) canonical records (one per enriched participant)
    const records: CanonicalRecord[] = enriched.map((p, idx) => ({
      provider: "dota2",
      user_wallet: p.wallet,
      platform_id: p.platformId || null,
      team: p.team || null,
      match_id: String(raw?.match_id ?? matchId),
      start_ts: Number(raw?.start_time ?? 0),
      duration_s: Number(raw?.duration ?? 0),
      game_mode: Number(raw?.game_mode ?? -1),
      lobby_type: Number(raw?.lobby_type ?? -1),
      result_for_player: p.platformId
        ? (winners.includes(p.platformId) ? "win" : (losers.includes(p.platformId) ? "loss" : "unknown"))
        : "unknown",
      checksum: sha256hex(`${matchId}:${idx}:${p.wallet}`),
    }));

    // 4) public signals
    const bind = computeBind(challengeId, subject);
    // Example metric: number of participant wins in this set
    const wins = enriched.filter(p => p.platformId && winners.includes(p.platformId)).length;
    const publicSignals = [bind, BigInt(wins)];

    // 5) commitment (typed hex)
    const dataHash = sha256hex(
      Buffer.from(JSON.stringify({
        matchId: String(raw?.match_id ?? matchId),
        participants: enriched.map(p => ({ w: p.wallet, pid: p.platformId, team: p.team })),
        winners, losers,
      }))
    );

    return { records, publicSignals, dataHash };
  },
};

export default dotaAdapter;