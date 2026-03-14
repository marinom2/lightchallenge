// /offchain/adapters/riot.ts
import fetch from "node-fetch";
import Ajv from "ajv";
import { lookup } from "../identity/registry";
import { keccak256, toUtf8Bytes } from "ethers";

const ajv = new Ajv();
const matchSchema = require("../../schemas/game.match.schema.json");

function regionForPUUID(_puuid: string): string {
  return process.env.RIOT_REGION || "americas";
}

type RiotParticipant = {
  puuid?: string;
  win?: boolean;
};
type RiotMatch = {
  info?: {
    participants?: RiotParticipant[];
    gameStartTimestamp?: number;
    gameDuration?: number;
  };
  metadata?: {
    matchId?: string;
  };
};

async function fetchJSON<T = unknown>(u: string, init?: RequestInit): Promise<T> {
  const r = await fetch(u, init as any);
  if (!r.ok) throw new Error(`Riot ${r.status}`);
  return r.json() as Promise<T>;
}

export async function getLolMatchNormalized(args: {
  puuids: Array<{ wallet: `0x${string}` }>;
  matchId: string;
  challengeId: string;
  subject: `0x${string}`;
}) {
  const API_KEY = process.env.RIOT_API_KEY!;
  if (!API_KEY) throw new Error("Missing RIOT_API_KEY");

  const enriched = await Promise.all(
    args.puuids.map(async (p) => {
      const b = await lookup(p.wallet, "riot");
      if (!b) throw new Error(`No identity binding for ${p.wallet} on Riot`);
      return { wallet: p.wallet, platformId: b.platformId, handle: b.handle };
    }),
  );

  const any = enriched[0];
  const region = regionForPUUID(any.platformId);

  const raw = await fetchJSON<RiotMatch>(
    `https://${region}.api.riotgames.com/lol/match/v5/matches/${args.matchId}`,
    { headers: { "X-Riot-Token": API_KEY } as any }
  );

  const participants = raw?.info?.participants ?? [];
  const winners: string[] = participants.filter(p => p.win === true).map(p => String(p.puuid));
  const losers: string[]  = participants.filter(p => p.win === false).map(p => String(p.puuid));

  const startMs = Number(raw?.info?.gameStartTimestamp ?? 0);
  const subjectHash = keccak256(toUtf8Bytes(JSON.stringify({ challengeId: args.challengeId, subject: args.subject })));

  const normalized = {
    platform: "lol",
    matchId: String(raw?.metadata?.matchId ?? args.matchId),
    participants: enriched,
    winners,
    losers,
    metadata: {
      startTime: startMs ? Math.floor(startMs / 1000) : 0,
      durationSec: Number(raw?.info?.gameDuration ?? 0),
      raw,
    },
    binding: {
      challengeId: String(args.challengeId),
      subjectHash,
    },
  };

  const validate = ajv.compile(matchSchema);
  if (!validate(normalized)) {
    throw new Error(`Normalized LoL match failed schema: ${JSON.stringify(validate.errors, null, 2)}`);
  }
  return normalized;
}