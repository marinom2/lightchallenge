/**
 * POST /api/v1/webhooks/faceit
 *
 * Receives FACEIT webhook callbacks for instant CS2 match results.
 *
 * FACEIT sends a POST with match data when a match finishes.
 * We verify the HMAC signature, extract player data, cross-reference
 * with linked_accounts to find wallets, and store evidence.
 *
 * Setup: Register this endpoint at https://developers.faceit.com/apps
 * with event: match_status_finished
 *
 * Env: FACEIT_WEBHOOK_SECRET — HMAC secret for signature verification
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPool } from "../../../../../../offchain/db/pool";
import { insertEvidence } from "../../../../../../offchain/db/evidence";
import { webhookLimiter } from "../../../../../lib/rateLimit";

const WEBHOOK_SECRET = process.env.FACEIT_WEBHOOK_SECRET ?? "";

function verifySignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

type FaceitWebhookPayload = {
  event: string; // "match_status_finished"
  payload: {
    id: string; // match_id
    game: string; // "cs2"
    teams: Array<{
      id: string;
      name: string;
      roster: Array<{
        id: string; // FACEIT player_id
        nickname: string;
        game_player_id?: string; // Steam64
      }>;
    }>;
    results: Array<{
      winner: string; // team id
      score: { [teamId: string]: number };
    }>;
    started_at: number;
    finished_at: number;
    competition_type?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = webhookLimiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded", retry_after_ms: rl.retryAfterMs },
        { status: 429 }
      );
    }

    const rawBody = await req.text();

    // Verify HMAC signature if secret is configured
    if (WEBHOOK_SECRET) {
      const sig = req.headers.get("x-faceit-signature") ?? "";
      if (!sig || !verifySignature(rawBody, sig)) {
        return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
      }
    }

    const webhook: FaceitWebhookPayload = JSON.parse(rawBody);

    if (webhook.event !== "match_status_finished") {
      // We only care about finished matches
      return NextResponse.json({ ok: true, skipped: true });
    }

    const match = webhook.payload;
    const pool = getPool();

    // Build a map: Steam64 → { wallet, faceitPlayerId, team, won }
    const winnerTeamId = match.results?.[0]?.winner;

    for (const team of match.teams) {
      for (const player of team.roster) {
        const steam64 = player.game_player_id;
        if (!steam64) continue;

        // Look up wallet by Steam64 in linked_accounts (provider = 'opendota' or 'faceit')
        const { rows } = await pool.query<{ subject: string }>(
          `SELECT subject FROM public.linked_accounts
           WHERE external_id = $1 AND provider IN ('opendota', 'faceit')
           LIMIT 1`,
          [steam64]
        );

        if (rows.length === 0) continue;
        const wallet = rows[0].subject;

        const won = team.id === winnerTeamId;
        const scores = match.results?.[0]?.score ?? {};
        const opponentTeam = match.teams.find((t) => t.id !== team.id);

        const record = {
          match_id: match.id,
          platform: "faceit",
          start_time: match.started_at,
          end_time: match.finished_at,
          game_mode: match.competition_type ?? "5v5",
          result_for_player: won ? "win" : "loss",
          player_team: team.name,
          opponent_team: opponentTeam?.name ?? "Unknown",
          score: Object.values(scores).join("-"),
        };

        // Find active challenges this wallet is participating in
        const { rows: challenges } = await pool.query<{ challenge_id: string }>(
          `SELECT p.challenge_id::text
           FROM public.participants p
           JOIN public.challenges c ON c.id = p.challenge_id
           WHERE lower(p.subject) = lower($1)
             AND c.status = 'Active'
             AND c.proof->>'category' IN ('cs', 'gaming')`,
          [wallet]
        );

        for (const ch of challenges) {
          try {
            await insertEvidence({
              challengeId: ch.challenge_id,
              subject: wallet,
              provider: "faceit",
              data: [record],
              evidenceHash: `faceit_webhook_${match.id}_${wallet}`,
            });
          } catch {
            // Duplicate or limit reached — safe to skip
          }
        }
      }
    }

    return NextResponse.json({ ok: true, match_id: match.id });
  } catch (e: any) {
    console.error("[v1/webhooks/faceit POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
