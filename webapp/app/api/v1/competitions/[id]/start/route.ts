export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import { emitWebhookEvent } from "../../../../../../../offchain/workers/webhookDelivery";
import { createMatches, type CreateMatchInput } from "../../../../../../../offchain/db/brackets";
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  generateSwissRound1,
  seedByRanking,
  getNextMatch,
  getLoserDestination,
  type MatchSlot,
} from "../../../../../../../offchain/engine/brackets";
import { createSeries, createSeriesGames, type SeriesFormat } from "../../../../../../../offchain/db/series";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();
    const { rows: [comp] } = await pool.query(
      `SELECT id, org_id, type, status, settings FROM public.competitions WHERE id = $1`, [params.id]
    );
    if (!comp) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (comp.status !== "registration")
      return NextResponse.json({ ok: false, error: "Competition must be in registration status" }, { status: 400 });

    // Get registrations
    const { rows: regs } = await pool.query(
      `SELECT id, wallet, team_id, seed FROM public.competition_registrations
       WHERE competition_id = $1 ORDER BY seed NULLS LAST, registered_at`, [params.id]
    );

    if (regs.length < 2)
      return NextResponse.json({ ok: false, error: "Need at least 2 participants" }, { status: 400 });

    const participants = regs.map((r: any) => r.wallet || r.team_id);
    const format = (comp.settings as any)?.format ?? "single_elim";

    if (comp.type === "bracket") {
      // Seed participants by ranking order
      const seeded = seedByRanking(participants);
      // Filter out empty strings (bye padding) for the generator — it handles byes internally
      // Actually the generators expect the full participant list, not the seeded array
      // Use the seeded order directly

      let slots: MatchSlot[];
      if (format === "double_elim") {
        slots = generateDoubleElimination(seeded);
      } else {
        slots = generateSingleElimination(seeded);
      }

      // Convert MatchSlots to DB rows
      const matchInputs: CreateMatchInput[] = slots.map((s) => ({
        competitionId: params.id,
        round: s.round,
        matchNumber: s.matchNumber,
        bracketType: s.bracketType,
        participantA: s.participantA || null,
        participantB: s.participantB || null,
        status: s.status,
      }));

      await createMatches(matchInputs, pool);

      // Auto-advance byes in winners bracket round 1
      const { rows: byes } = await pool.query(
        `SELECT id, round, match_number, bracket_type, participant_a, participant_b
         FROM public.bracket_matches
         WHERE competition_id = $1 AND round = 1 AND status = 'bye' AND bracket_type = 'winners'`,
        [params.id]
      );

      const eliminationType: "single" | "double" = format === "double_elim" ? "double" : "single";

      for (const bye of byes) {
        const winner = bye.participant_a || bye.participant_b;
        if (!winner) continue;

        // Mark bye as completed with winner
        await pool.query(
          `UPDATE public.bracket_matches SET winner = $2, completed_at = now() WHERE id = $1`,
          [bye.id, winner]
        );

        // Advance winner using engine logic
        const dest = getNextMatch(
          bye.bracket_type,
          bye.round,
          bye.match_number,
          participants.length,
          eliminationType
        );
        if (dest) {
          const slot = dest.slot === "a" ? "participant_a" : "participant_b";
          await pool.query(
            `UPDATE public.bracket_matches SET ${slot} = $4
             WHERE competition_id = $1 AND round = $2 AND match_number = $3 AND bracket_type = $5`,
            [params.id, dest.round, dest.matchNumber, winner, dest.bracketType]
          );
        }

        // For double-elim, byes don't produce a loser (no one to route)
      }

    } else if (comp.type === "league") {
      const slots = generateRoundRobin(participants);

      const matchInputs: CreateMatchInput[] = slots
        .filter((s) => s.status !== "bye") // skip bye slots in round-robin
        .map((s) => ({
          competitionId: params.id,
          round: s.round,
          matchNumber: s.matchNumber,
          bracketType: s.bracketType,
          participantA: s.participantA,
          participantB: s.participantB,
          status: s.status,
        }));

      await createMatches(matchInputs, pool);

    } else if (comp.type === "swiss") {
      // Swiss: generate only round 1 — subsequent rounds via /advance-round
      const slots = generateSwissRound1(participants);

      const matchInputs: CreateMatchInput[] = slots
        .filter((s) => s.status !== "bye")
        .map((s) => ({
          competitionId: params.id,
          round: s.round,
          matchNumber: s.matchNumber,
          bracketType: s.bracketType,
          participantA: s.participantA,
          participantB: s.participantB,
          status: s.status,
        }));

      await createMatches(matchInputs, pool);

      // Handle bye matches (odd participant count)
      for (const s of slots) {
        if (s.status === "bye" && s.participantA) {
          const byeInputs: CreateMatchInput[] = [{
            competitionId: params.id,
            round: s.round,
            matchNumber: s.matchNumber,
            bracketType: s.bracketType,
            participantA: s.participantA,
            participantB: null,
            status: "bye",
          }];
          const [byeMatch] = await createMatches(byeInputs, pool);
          if (byeMatch) {
            await pool.query(
              `UPDATE public.bracket_matches SET winner = $2, completed_at = now() WHERE id = $1`,
              [byeMatch.id, s.participantA]
            );
          }
        }
      }
    }

    // Create series for bracket matches if series format is configured (Bo3/Bo5/Bo7)
    const seriesFormat = (comp.settings as any)?.series_format as SeriesFormat | undefined;
    if (seriesFormat && seriesFormat !== "bo1" && (comp.type === "bracket" || comp.type === "swiss")) {
      // Get all non-bye matches that have both participants (round 1)
      const { rows: matchesForSeries } = await pool.query(
        `SELECT id, participant_a, participant_b FROM public.bracket_matches
         WHERE competition_id = $1 AND status = 'pending'
           AND participant_a IS NOT NULL AND participant_b IS NOT NULL`,
        [params.id]
      );

      for (const m of matchesForSeries) {
        const series = await createSeries({
          bracketMatchId: m.id,
          competitionId: params.id,
          format: seriesFormat,
          participantA: m.participant_a,
          participantB: m.participant_b,
        }, pool);
        await createSeriesGames(series.id, seriesFormat, pool);
      }
    }

    // Update status
    await pool.query(
      `UPDATE public.competitions SET status = 'active', updated_at = now() WHERE id = $1`, [params.id]
    );

    if (comp.org_id) {
      emitWebhookEvent(comp.org_id, "competition.started", {
        competition_id: params.id,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, status: "active", participants: regs.length });
  } catch (e) {
    console.error("[v1/competitions/start POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
