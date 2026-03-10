// /offchain/adapters/opendota.ts
import fetch from "node-fetch";
import Ajv from "ajv";
import { lookup } from "../identity/registry";
import { keccak256, stringToBytes } from "viem";

const ajv = new Ajv();
const matchSchema = require("../../schemas/game.match.schema.json");

const OPENDOTA = process.env.OPENDOTA_BASE || "https://api.opendota.com";
const API_KEY = process.env.OPENDOTA_KEY || "";

type Team = "radiant" | "dire";

type Normalized = {
  platform: "dota2";
  matchId: string;
  participants: Array<{
    wallet: `0x${string}`;
    platformId: string;
    handle?: string;
    team?: Team;
  }>;
  winners: string[];
  losers: string[];
  metadata: any;
  binding: { challengeId: string; subjectHash: `0x${string}` };
};

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

function steam64To32(steam64: string): string {
  const base = BigInt("76561197960265728");
  return (BigInt(steam64) - base).toString();
}

async function fetchJSON<T>(u: string): Promise<T> {
  const url = API_KEY ? `${u}${u.includes("?") ? "&" : "?"}api_key=${API_KEY}` : u;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${u} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

function teamFor(platformId: string, radiant32: string[], dire32: string[]): Team | undefined {
  if (radiant32.includes(platformId)) return "radiant";
  if (dire32.includes(platformId)) return "dire";
  return undefined;
}

export async function getDotaMatchNormalized(args: {
  matchId: string;
  participants: Array<{ wallet: `0x${string}` }>;
  challengeId: string;
  subject: `0x${string}`;
  requireHumanPlayers?: number;
  disallowGameModes?: number[];
}): Promise<Normalized> {
  const raw = await fetchJSON<OpenDotaMatch>(`${OPENDOTA}/api/matches/${args.matchId}`);

  if (args.requireHumanPlayers && Number(raw?.human_players) !== Number(args.requireHumanPlayers)) {
    throw new Error(`Human player count mismatch: expected ${args.requireHumanPlayers}, got ${raw?.human_players ?? "n/a"}`);
  }
  if (args.disallowGameModes?.length) {
    const mode = Number(raw?.game_mode);
    if (args.disallowGameModes.includes(mode)) throw new Error(`Disallowed game_mode ${mode}`);
  }

  const radiantWin = Boolean(raw?.radiant_win);
  const players: OpenDotaPlayer[] = Array.isArray(raw?.players) ? raw.players! : [];
  const radiant32 = players.filter(p => p.isRadiant).map(p => String(p.account_id));
  const dire32 = players.filter(p => !p.isRadiant).map(p => String(p.account_id));

  const enriched = await Promise.all(
    args.participants.map(async (p) => {
      const b = lookup(p.wallet, "steam");
      if (!b) throw new Error(`No Steam binding for ${p.wallet}`);
      const platformId = /^\d{17}$/.test(b.platformId) ? steam64To32(b.platformId) : String(b.platformId);
      return { wallet: p.wallet, platformId, handle: b.handle, team: teamFor(platformId, radiant32, dire32) };
    })
  );

  const winners = radiantWin ? radiant32 : dire32;
  const losers  = radiantWin ? dire32 : radiant32;
  const subjectHash = keccak256(stringToBytes(JSON.stringify({ challengeId: args.challengeId, subject: args.subject }))) as `0x${string}`;

  const normalized: Normalized = {
    platform: "dota2",
    matchId: String(raw?.match_id ?? args.matchId),
    participants: enriched,
    winners,
    losers,
    metadata: {
      startTime: Number(raw?.start_time ?? 0),
      durationSec: Number(raw?.duration ?? 0),
      humanPlayers: Number(raw?.human_players ?? 0),
      gameMode: Number(raw?.game_mode ?? -1),
      lobbyType: Number(raw?.lobby_type ?? -1),
      raw,
    },
    binding: { challengeId: args.challengeId, subjectHash },
  };

  const validate = ajv.compile(matchSchema);
  if (!validate(normalized)) {
    throw new Error(`Normalized match failed schema: ${JSON.stringify(validate.errors, null, 2)}`);
  }
  return normalized;
}