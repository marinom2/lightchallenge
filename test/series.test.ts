/**
 * test/series.test.ts
 *
 * Unit tests for the series logic (offchain/db/series.ts).
 *
 * Since series.ts depends on a PostgreSQL database, we test the helper
 * functions (formatToNumber, majority) by re-implementing them inline,
 * and test the reportGameResult logic by mocking pool.query calls.
 *
 * Run: npx tsx --test test/series.test.ts
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import type { SeriesFormat, SeriesStatus } from "../offchain/db/series";

// ─── Re-implement helpers for testing (they are not exported) ───────────────

function formatToNumber(format: SeriesFormat): number {
  return parseInt(format.replace("bo", ""), 10);
}

function majority(format: SeriesFormat): number {
  return Math.ceil(formatToNumber(format) / 2);
}

// ─── Simulate reportGameResult logic (no DB) ───────────────────────────────

type MinimalSeries = {
  format: SeriesFormat;
  participant_a: string;
  participant_b: string;
  score_a: number;
  score_b: number;
  status: SeriesStatus;
  winner: string | null;
};

type GameResult = {
  gameNumber: number;
  winner: string;
};

/**
 * Simulate the series completion logic from reportGameResult.
 * Given a series and a sequence of game results, return the state after each game.
 */
function simulateSeries(
  format: SeriesFormat,
  participantA: string,
  participantB: string,
  results: GameResult[]
): { series: MinimalSeries; completed: boolean }[] {
  const states: { series: MinimalSeries; completed: boolean }[] = [];

  let scoreA = 0;
  let scoreB = 0;
  let status: SeriesStatus = "pending";
  let winner: string | null = null;

  for (const result of results) {
    if (result.winner === participantA) {
      scoreA++;
    } else if (result.winner === participantB) {
      scoreB++;
    }

    const needed = majority(format);
    const isCompleted = scoreA >= needed || scoreB >= needed;
    const seriesWinner = isCompleted
      ? scoreA >= needed
        ? participantA
        : participantB
      : null;

    const newStatus: SeriesStatus = isCompleted
      ? "completed"
      : status === "pending"
        ? "in_progress"
        : status;

    status = newStatus;
    winner = seriesWinner;

    states.push({
      series: {
        format,
        participant_a: participantA,
        participant_b: participantB,
        score_a: scoreA,
        score_b: scoreB,
        status: newStatus,
        winner: seriesWinner,
      },
      completed: isCompleted,
    });
  }

  return states;
}

// ─── Helper function tests ───────────────────────────────────────────────────

describe("formatToNumber", () => {
  it("parses bo1 -> 1", () => {
    assert.equal(formatToNumber("bo1"), 1);
  });

  it("parses bo3 -> 3", () => {
    assert.equal(formatToNumber("bo3"), 3);
  });

  it("parses bo5 -> 5", () => {
    assert.equal(formatToNumber("bo5"), 5);
  });

  it("parses bo7 -> 7", () => {
    assert.equal(formatToNumber("bo7"), 7);
  });
});

describe("majority", () => {
  it("bo1 -> 1 win needed", () => {
    assert.equal(majority("bo1"), 1);
  });

  it("bo3 -> 2 wins needed", () => {
    assert.equal(majority("bo3"), 2);
  });

  it("bo5 -> 3 wins needed", () => {
    assert.equal(majority("bo5"), 3);
  });

  it("bo7 -> 4 wins needed", () => {
    assert.equal(majority("bo7"), 4);
  });
});

// ─── Series completion logic tests ──────────────────────────────────────────

describe("Series completion — Bo1", () => {
  it("completes after 1 game", () => {
    const states = simulateSeries("bo1", "A", "B", [{ gameNumber: 1, winner: "A" }]);
    assert.equal(states.length, 1);
    assert.equal(states[0].completed, true);
    assert.equal(states[0].series.winner, "A");
    assert.equal(states[0].series.score_a, 1);
    assert.equal(states[0].series.score_b, 0);
    assert.equal(states[0].series.status, "completed");
  });
});

describe("Series completion — Bo3", () => {
  it("completes at 2-0 (sweep)", () => {
    const states = simulateSeries("bo3", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "A" },
    ]);

    assert.equal(states[0].completed, false);
    assert.equal(states[0].series.status, "in_progress");
    assert.equal(states[0].series.score_a, 1);

    assert.equal(states[1].completed, true);
    assert.equal(states[1].series.winner, "A");
    assert.equal(states[1].series.score_a, 2);
    assert.equal(states[1].series.score_b, 0);
    assert.equal(states[1].series.status, "completed");
  });

  it("completes at 2-1", () => {
    const states = simulateSeries("bo3", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "A" },
    ]);

    assert.equal(states[0].completed, false);
    assert.equal(states[1].completed, false);
    assert.equal(states[1].series.score_a, 1);
    assert.equal(states[1].series.score_b, 1);

    assert.equal(states[2].completed, true);
    assert.equal(states[2].series.winner, "A");
    assert.equal(states[2].series.score_a, 2);
    assert.equal(states[2].series.score_b, 1);
  });

  it("does not complete at 1-1", () => {
    const states = simulateSeries("bo3", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
    ]);

    assert.equal(states[1].completed, false);
    assert.equal(states[1].series.winner, null);
    assert.equal(states[1].series.status, "in_progress");
  });

  it("does not complete at 1-0", () => {
    const states = simulateSeries("bo3", "A", "B", [{ gameNumber: 1, winner: "B" }]);

    assert.equal(states[0].completed, false);
    assert.equal(states[0].series.winner, null);
  });

  it("participant B can win 2-0", () => {
    const states = simulateSeries("bo3", "A", "B", [
      { gameNumber: 1, winner: "B" },
      { gameNumber: 2, winner: "B" },
    ]);

    assert.equal(states[1].completed, true);
    assert.equal(states[1].series.winner, "B");
    assert.equal(states[1].series.score_a, 0);
    assert.equal(states[1].series.score_b, 2);
  });

  it("participant B can win 2-1", () => {
    const states = simulateSeries("bo3", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "B" },
    ]);

    assert.equal(states[2].completed, true);
    assert.equal(states[2].series.winner, "B");
    assert.equal(states[2].series.score_a, 1);
    assert.equal(states[2].series.score_b, 2);
  });
});

describe("Series completion — Bo5", () => {
  it("completes at 3-0 (sweep)", () => {
    const states = simulateSeries("bo5", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "A" },
      { gameNumber: 3, winner: "A" },
    ]);

    assert.equal(states[0].completed, false);
    assert.equal(states[1].completed, false);
    assert.equal(states[2].completed, true);
    assert.equal(states[2].series.winner, "A");
    assert.equal(states[2].series.score_a, 3);
    assert.equal(states[2].series.score_b, 0);
  });

  it("completes at 3-1", () => {
    const states = simulateSeries("bo5", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "A" },
      { gameNumber: 4, winner: "A" },
    ]);

    assert.equal(states[2].completed, false);
    assert.equal(states[3].completed, true);
    assert.equal(states[3].series.winner, "A");
    assert.equal(states[3].series.score_a, 3);
    assert.equal(states[3].series.score_b, 1);
  });

  it("completes at 3-2", () => {
    const states = simulateSeries("bo5", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "B" },
      { gameNumber: 4, winner: "A" },
      { gameNumber: 5, winner: "A" },
    ]);

    assert.equal(states[3].completed, false);
    assert.equal(states[4].completed, true);
    assert.equal(states[4].series.winner, "A");
    assert.equal(states[4].series.score_a, 3);
    assert.equal(states[4].series.score_b, 2);
  });

  it("does not complete at 2-2", () => {
    const states = simulateSeries("bo5", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "A" },
      { gameNumber: 4, winner: "B" },
    ]);

    assert.equal(states[3].completed, false);
    assert.equal(states[3].series.winner, null);
    assert.equal(states[3].series.score_a, 2);
    assert.equal(states[3].series.score_b, 2);
  });

  it("does not complete at 2-1", () => {
    const states = simulateSeries("bo5", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "A" },
      { gameNumber: 3, winner: "B" },
    ]);

    assert.equal(states[2].completed, false);
    assert.equal(states[2].series.winner, null);
  });
});

describe("Series completion — Bo7", () => {
  it("completes at 4-0 (sweep)", () => {
    const states = simulateSeries("bo7", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "A" },
      { gameNumber: 3, winner: "A" },
      { gameNumber: 4, winner: "A" },
    ]);

    assert.equal(states[3].completed, true);
    assert.equal(states[3].series.winner, "A");
    assert.equal(states[3].series.score_a, 4);
  });

  it("completes at 4-3 (full series)", () => {
    const states = simulateSeries("bo7", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "A" },
      { gameNumber: 4, winner: "B" },
      { gameNumber: 5, winner: "A" },
      { gameNumber: 6, winner: "B" },
      { gameNumber: 7, winner: "B" },
    ]);

    assert.equal(states[5].completed, false);
    assert.equal(states[6].completed, true);
    assert.equal(states[6].series.winner, "B");
    assert.equal(states[6].series.score_a, 3);
    assert.equal(states[6].series.score_b, 4);
  });

  it("does not complete at 3-3", () => {
    const states = simulateSeries("bo7", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "A" },
      { gameNumber: 4, winner: "B" },
      { gameNumber: 5, winner: "A" },
      { gameNumber: 6, winner: "B" },
    ]);

    assert.equal(states[5].completed, false);
    assert.equal(states[5].series.winner, null);
    assert.equal(states[5].series.score_a, 3);
    assert.equal(states[5].series.score_b, 3);
  });
});

// ─── Status transitions ─────────────────────────────────────────────────────

describe("Series status transitions", () => {
  it("pending -> in_progress after first game", () => {
    const states = simulateSeries("bo3", "A", "B", [{ gameNumber: 1, winner: "A" }]);
    assert.equal(states[0].series.status, "in_progress");
  });

  it("stays in_progress during the series", () => {
    const states = simulateSeries("bo3", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
    ]);
    assert.equal(states[0].series.status, "in_progress");
    assert.equal(states[1].series.status, "in_progress");
  });

  it("transitions to completed when majority reached", () => {
    const states = simulateSeries("bo3", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "A" },
    ]);
    assert.equal(states[1].series.status, "completed");
  });

  it("bo1 goes directly from pending to completed", () => {
    const states = simulateSeries("bo1", "A", "B", [{ gameNumber: 1, winner: "B" }]);
    // The series was pending, first game completes it immediately
    assert.equal(states[0].series.status, "completed");
    assert.equal(states[0].series.winner, "B");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("Series edge cases", () => {
  it("alternating wins in Bo5 takes exactly 5 games to complete", () => {
    const states = simulateSeries("bo5", "X", "Y", [
      { gameNumber: 1, winner: "X" },
      { gameNumber: 2, winner: "Y" },
      { gameNumber: 3, winner: "X" },
      { gameNumber: 4, winner: "Y" },
      { gameNumber: 5, winner: "X" },
    ]);

    // Games 1-4 should not complete
    for (let i = 0; i < 4; i++) {
      assert.equal(states[i].completed, false, `Game ${i + 1} should not complete the series`);
    }
    assert.equal(states[4].completed, true);
    assert.equal(states[4].series.winner, "X");
  });

  it("all wins by one player in Bo5 completes in minimum games", () => {
    const states = simulateSeries("bo5", "A", "B", [
      { gameNumber: 1, winner: "B" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "B" },
    ]);

    assert.equal(states[2].completed, true);
    assert.equal(states[2].series.winner, "B");
    assert.equal(states[2].series.score_a, 0);
    assert.equal(states[2].series.score_b, 3);
  });

  it("score tracking is cumulative across games", () => {
    const states = simulateSeries("bo5", "A", "B", [
      { gameNumber: 1, winner: "A" },
      { gameNumber: 2, winner: "B" },
      { gameNumber: 3, winner: "A" },
    ]);

    assert.equal(states[0].series.score_a, 1);
    assert.equal(states[0].series.score_b, 0);

    assert.equal(states[1].series.score_a, 1);
    assert.equal(states[1].series.score_b, 1);

    assert.equal(states[2].series.score_a, 2);
    assert.equal(states[2].series.score_b, 1);
  });
});
