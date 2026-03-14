export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";

/**
 * GET /api/v1/competitions/[id]/live
 *
 * Server-Sent Events endpoint for real-time bracket updates.
 * Sends an initial "init" event with all matches, then polls every 3 seconds
 * and emits "update" events for any changed/in-progress matches.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const pool = getPool();

      // Send initial bracket state
      try {
        const { rows } = await pool.query(
          `SELECT id, round, match_number, bracket_type, participant_a, participant_b,
                  score_a, score_b, winner, status, scheduled_at, completed_at
           FROM public.bracket_matches WHERE competition_id = $1
           ORDER BY bracket_type, round, match_number`,
          [id]
        );

        controller.enqueue(
          encoder.encode(
            `event: init\ndata: ${JSON.stringify({ matches: rows })}\n\n`
          )
        );
      } catch (err) {
        console.error("[v1/competitions/live] init error:", err);
        controller.close();
        return;
      }

      // Poll for changes every 3 seconds
      let lastCheck = new Date().toISOString();

      const interval = setInterval(async () => {
        try {
          const { rows: updated } = await pool.query(
            `SELECT id, round, match_number, bracket_type, participant_a, participant_b,
                    score_a, score_b, winner, status, completed_at
             FROM public.bracket_matches
             WHERE competition_id = $1
               AND (completed_at > $2 OR status = 'in_progress')
             ORDER BY completed_at DESC NULLS LAST`,
            [id, lastCheck]
          );

          if (updated.length > 0) {
            controller.enqueue(
              encoder.encode(
                `event: update\ndata: ${JSON.stringify({ matches: updated })}\n\n`
              )
            );
            lastCheck = new Date().toISOString();
          }

          // Heartbeat keeps the connection alive
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // Stream already closed — safe to ignore
          }
        }
      }, 3000);

      // Clean up on client abort
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Stream already closed — safe to ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
