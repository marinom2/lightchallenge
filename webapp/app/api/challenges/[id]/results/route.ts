/**
 * GET /api/challenges/{id}/results
 *
 * Comprehensive challenge results: winners, losers, scores, verdicts,
 * evidence providers, claims, and achievement mints.
 *
 * Designed for webapp UI, AI agents, and developer tools.
 */

import { NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResultRow = {
  subject: string;
  pass: boolean;
  score: string | null;
  evaluator: string | null;
  verdict_reasons: string[] | null;
  verdict_metadata: Record<string, unknown> | null;
  verdict_at: string | null;
  evidence_provider: string | null;
  evidence_at: string | null;
  claim_types: string[] | null;
  total_claimed_wei: string | null;
  achievements: string[] | null;
  joined_at: string | null;
};

type ChallengeMeta = {
  title: string | null;
  description: string | null;
  status: string | null;
  chain_outcome: number | null;
  category: string | null;
  model_id: string | null;
  funds: Record<string, unknown> | null;
  timeline: Record<string, unknown> | null;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Bad challenge id" }, { status: 400 });
  }

  try {
    const pool = getPool();

    // Challenge metadata
    const metaRes = await pool.query<ChallengeMeta>(
      `SELECT title, description, status, chain_outcome,
              options->>'category' AS category,
              model_id, funds, timeline
       FROM public.challenges WHERE id = $1::bigint LIMIT 1`,
      [id]
    );

    if (metaRes.rows.length === 0) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }
    const meta = metaRes.rows[0];

    // Per-participant results
    const resultsRes = await pool.query<ResultRow>(
      `SELECT
         p.subject,
         v.pass,
         v.score::text,
         v.evaluator,
         v.reasons       AS verdict_reasons,
         v.metadata      AS verdict_metadata,
         v.updated_at    AS verdict_at,
         e.provider      AS evidence_provider,
         e.created_at    AS evidence_at,
         cl.claim_types,
         cl.total_wei    AS total_claimed_wei,
         ach.types       AS achievements,
         p.joined_at
       FROM public.participants p
       LEFT JOIN public.verdicts v
         ON v.challenge_id = p.challenge_id
         AND lower(v.subject) = lower(p.subject)
       LEFT JOIN LATERAL (
         SELECT provider, created_at
         FROM public.evidence e2
         WHERE e2.challenge_id = p.challenge_id
           AND lower(e2.subject) = lower(p.subject)
         ORDER BY e2.created_at DESC LIMIT 1
       ) e ON true
       LEFT JOIN LATERAL (
         SELECT array_agg(claim_type) AS claim_types,
                coalesce(sum(amount_wei), 0)::text AS total_wei
         FROM public.claims cl2
         WHERE cl2.challenge_id = p.challenge_id
           AND lower(cl2.subject) = lower(p.subject)
       ) cl ON true
       LEFT JOIN LATERAL (
         SELECT array_agg(achievement_type) AS types
         FROM public.achievement_mints am
         WHERE am.challenge_id = p.challenge_id
           AND lower(am.recipient) = lower(p.subject)
       ) ach ON true
       WHERE p.challenge_id = $1::bigint
       ORDER BY v.score DESC NULLS LAST, v.updated_at ASC NULLS LAST`,
      [id]
    );

    // Summary counts
    const participants = resultsRes.rows;
    const winners = participants.filter((r) => r.pass === true);
    const losers = participants.filter((r) => r.pass === false);

    return NextResponse.json({
      challenge_id: id,
      title: meta.title,
      description: meta.description,
      status: meta.status,
      chain_outcome: meta.chain_outcome,
      category: meta.category,
      model_id: meta.model_id,
      funds: meta.funds,
      timeline: meta.timeline,
      summary: {
        total_participants: participants.length,
        winners: winners.length,
        losers: losers.length,
        pending: participants.length - winners.length - losers.length,
        total_claimed_wei: participants
          .reduce((s, r) => s + BigInt(r.total_claimed_wei || "0"), 0n)
          .toString(),
        achievements_minted: participants.filter((r) => r.achievements?.length).length,
      },
      participants,
    });
  } catch (e) {
    console.error("[challenges/results]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
