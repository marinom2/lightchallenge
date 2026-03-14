export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";

function nextPow2(n: number): number { let p = 1; while (p < n) p *= 2; return p; }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const pool = getPool();
    const { rows: [comp] } = await pool.query(
      `SELECT id, type, status, settings FROM public.competitions WHERE id = $1`, [params.id]
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

    // For bracket types, generate bracket
    if (comp.type === "bracket") {
      const participants = regs.map((r: any) => r.wallet || r.team_id);
      const size = nextPow2(participants.length);
      const totalRounds = Math.log2(size);

      // Pad with byes
      while (participants.length < size) participants.push(null);

      // Seed pairing: 1v8, 2v7, 3v6, 4v5
      const paired: [string | null, string | null][] = [];
      for (let i = 0; i < size / 2; i++) {
        paired.push([participants[i], participants[size - 1 - i]]);
      }

      // Insert all match slots
      const matchValues: any[] = [];
      const matchPlaceholders: string[] = [];
      let idx = 1;

      // Round 1 matches with participants
      for (let m = 0; m < paired.length; m++) {
        const [a, b] = paired[m];
        const isBye = !a || !b;
        matchPlaceholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        matchValues.push(params.id, 1, m + 1, "winners", a, b, isBye ? "bye" : "pending");
      }

      // Empty slots for subsequent rounds
      for (let r = 2; r <= totalRounds; r++) {
        const matchesInRound = size / Math.pow(2, r);
        for (let m = 0; m < matchesInRound; m++) {
          matchPlaceholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
          matchValues.push(params.id, r, m + 1, "winners", null, null, "pending");
        }
      }

      await pool.query(
        `INSERT INTO public.bracket_matches (competition_id, round, match_number, bracket_type, participant_a, participant_b, status)
         VALUES ${matchPlaceholders.join(", ")}`,
        matchValues
      );

      // Auto-advance byes
      const { rows: byes } = await pool.query(
        `SELECT id, match_number, participant_a, participant_b FROM public.bracket_matches
         WHERE competition_id = $1 AND round = 1 AND status = 'bye'`, [params.id]
      );
      for (const bye of byes) {
        const winner = bye.participant_a || bye.participant_b;
        await pool.query(
          `UPDATE public.bracket_matches SET winner = $2, status = 'bye', completed_at = now() WHERE id = $1`,
          [bye.id, winner]
        );
        // Advance winner to next round
        const nextMatch = Math.ceil(bye.match_number / 2);
        const slot = bye.match_number % 2 === 1 ? "participant_a" : "participant_b";
        await pool.query(
          `UPDATE public.bracket_matches SET ${slot} = $3
           WHERE competition_id = $1 AND round = 2 AND match_number = $2 AND bracket_type = 'winners'`,
          [params.id, nextMatch, winner]
        );
      }

    } else if (comp.type === "league") {
      // Round-robin: generate all pairs
      const participants = regs.map((r: any) => r.wallet || r.team_id);
      const n = participants.length;
      const matchValues: any[] = [];
      const matchPlaceholders: string[] = [];
      let idx = 1;
      let round = 1;

      // Circle method for round-robin scheduling
      const list = [...participants];
      if (n % 2 !== 0) list.push(null); // add bye for odd
      const half = list.length / 2;
      const rounds = list.length - 1;

      for (let r = 0; r < rounds; r++) {
        let matchNum = 1;
        for (let m = 0; m < half; m++) {
          const a = list[m];
          const b = list[list.length - 1 - m];
          if (a && b) {
            matchPlaceholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
            matchValues.push(params.id, r + 1, matchNum++, a, b, "pending");
          }
        }
        // Rotate: fix first, rotate rest
        const last = list.pop()!;
        list.splice(1, 0, last);
      }

      if (matchPlaceholders.length > 0) {
        await pool.query(
          `INSERT INTO public.bracket_matches (competition_id, round, match_number, participant_a, participant_b, status)
           VALUES ${matchPlaceholders.join(", ")}`,
          matchValues
        );
      }
    }

    // Update status
    await pool.query(
      `UPDATE public.competitions SET status = 'active', updated_at = now() WHERE id = $1`, [params.id]
    );

    return NextResponse.json({ ok: true, status: "active", participants: regs.length });
  } catch (e) {
    console.error("[v1/competitions/start POST]", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
