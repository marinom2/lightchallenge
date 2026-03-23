/**
 * test/brackets.test.ts
 *
 * Comprehensive unit tests for the tournament bracket engine (offchain/engine/brackets.ts).
 * All functions are pure logic — no DB or chain dependencies.
 *
 * Run: npx tsx --test test/brackets.test.ts
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  nextPowerOf2,
  seedByRanking,
  shuffle,
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  getNextMatch,
  getLoserDestination,
  swissRoundCount,
  generateSwissRound1,
  computeSwissStandings,
  generateSwissRound,
  type MatchSlot,
  type SwissStanding,
} from "../offchain/engine/brackets";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesInRound(matches: MatchSlot[], round: number, bracketType?: string): MatchSlot[] {
  return matches.filter(
    (m) => m.round === round && (bracketType === undefined || m.bracketType === bracketType)
  );
}

function matchesByBracket(matches: MatchSlot[], bracketType: string): MatchSlot[] {
  return matches.filter((m) => m.bracketType === bracketType);
}

function players(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `P${i + 1}`);
}

// ─── nextPowerOf2 ─────────────────────────────────────────────────────────────

describe("nextPowerOf2", () => {
  it("returns 1 for n=0 and n=1", () => {
    assert.equal(nextPowerOf2(0), 1);
    assert.equal(nextPowerOf2(1), 1);
  });

  it("returns n when n is already a power of 2", () => {
    assert.equal(nextPowerOf2(2), 2);
    assert.equal(nextPowerOf2(4), 4);
    assert.equal(nextPowerOf2(8), 8);
    assert.equal(nextPowerOf2(16), 16);
  });

  it("rounds up to the next power of 2", () => {
    assert.equal(nextPowerOf2(3), 4);
    assert.equal(nextPowerOf2(5), 8);
    assert.equal(nextPowerOf2(6), 8);
    assert.equal(nextPowerOf2(7), 8);
    assert.equal(nextPowerOf2(9), 16);
  });
});

// ─── shuffle ──────────────────────────────────────────────────────────────────

describe("shuffle", () => {
  it("does not mutate the original array", () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffle(original);
    assert.deepEqual(original, copy);
  });

  it("returns an array with the same elements", () => {
    const input = ["A", "B", "C", "D"];
    const result = shuffle(input);
    assert.equal(result.length, input.length);
    for (const item of input) {
      assert.ok(result.includes(item), `Missing ${item}`);
    }
  });

  it("returns an array of the same length", () => {
    assert.equal(shuffle([1]).length, 1);
    assert.equal(shuffle([]).length, 0);
  });
});

// ─── seedByRanking ────────────────────────────────────────────────────────────

describe("seedByRanking", () => {
  it("4 players: seed 1 vs seed 4 and seed 2 vs seed 3 in round 1", () => {
    const result = seedByRanking(["S1", "S2", "S3", "S4"]);
    assert.equal(result.length, 4);
    // Standard bracket order for 4: [S1, S4, S2, S3] so that
    // match 1 = S1 vs S4, match 2 = S2 vs S3
    assert.equal(result[0], "S1");
    assert.equal(result[1], "S4");
    assert.equal(result[2], "S2");
    assert.equal(result[3], "S3");
  });

  it("pads to next power of 2 with empty strings", () => {
    const result = seedByRanking(["A", "B", "C"]);
    assert.equal(result.length, 4);
    // One slot should be empty
    const empties = result.filter((s) => s === "");
    assert.equal(empties.length, 1);
  });

  it("2 players: no padding needed", () => {
    const result = seedByRanking(["X", "Y"]);
    assert.equal(result.length, 2);
    assert.equal(result[0], "X");
    assert.equal(result[1], "Y");
  });

  it("8 players: seed 1 plays seed 8", () => {
    const p = players(8);
    const result = seedByRanking(p);
    assert.equal(result.length, 8);
    // In a standard 8-player bracket, slot 0 = seed 1, slot 1 = seed 8
    assert.equal(result[0], "P1");
    assert.equal(result[1], "P8");
  });
});

// ─── generateSingleElimination ───────────────────────────────────────────────

describe("generateSingleElimination", () => {
  it("throws for fewer than 2 participants", () => {
    assert.throws(() => generateSingleElimination(["A"]), /at least 2/);
    assert.throws(() => generateSingleElimination([]), /at least 2/);
  });

  it("2 participants: 1 match (the final)", () => {
    const matches = generateSingleElimination(["A", "B"]);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].round, 1);
    assert.equal(matches[0].participantA, "A");
    assert.equal(matches[0].participantB, "B");
    assert.equal(matches[0].status, "pending");
    assert.equal(matches[0].bracketType, "winners");
  });

  it("4 participants: 3 matches (2 round 1 + 1 final)", () => {
    const matches = generateSingleElimination(["A", "B", "C", "D"]);
    assert.equal(matches.length, 3);

    const r1 = matchesInRound(matches, 1);
    assert.equal(r1.length, 2);
    assert.equal(r1[0].participantA, "A");
    assert.equal(r1[0].participantB, "B");
    assert.equal(r1[1].participantA, "C");
    assert.equal(r1[1].participantB, "D");

    const r2 = matchesInRound(matches, 2);
    assert.equal(r2.length, 1);
    assert.equal(r2[0].participantA, null); // TBD
    assert.equal(r2[0].participantB, null); // TBD
  });

  it("5 participants: pads to 8, 7 total matches across 3 rounds", () => {
    const matches = generateSingleElimination(players(5));
    // Bracket size = 8 -> 4 + 2 + 1 = 7 matches
    assert.equal(matches.length, 7);

    const r1 = matchesInRound(matches, 1);
    assert.equal(r1.length, 4);

    // 5 participants padded to 8: 3 null slots produce bye matches
    // Match pairings: (P1,P2), (P3,P4), (P5,null), (null,null) => 2 byes
    const byeMatches = r1.filter((m) => m.status === "bye");
    assert.ok(byeMatches.length >= 2, `Expected at least 2 byes, got ${byeMatches.length}`);
    // Exactly 2 pending matches (the ones with all real participants)
    const pendingMatches = r1.filter((m) => m.status === "pending");
    assert.equal(pendingMatches.length, 2);

    const r2 = matchesInRound(matches, 2);
    assert.equal(r2.length, 2);

    const r3 = matchesInRound(matches, 3);
    assert.equal(r3.length, 1); // final
  });

  it("8 participants: 7 matches across 3 rounds", () => {
    const matches = generateSingleElimination(players(8));
    assert.equal(matches.length, 7); // 4 + 2 + 1

    const r1 = matchesInRound(matches, 1);
    assert.equal(r1.length, 4);
    // No byes with exactly 8 players
    assert.ok(r1.every((m) => m.status === "pending"));

    const r2 = matchesInRound(matches, 2);
    assert.equal(r2.length, 2);

    const r3 = matchesInRound(matches, 3);
    assert.equal(r3.length, 1);
  });

  it("3 participants: pads to 4, 3 matches, 1 bye", () => {
    const matches = generateSingleElimination(["A", "B", "C"]);
    assert.equal(matches.length, 3); // 2 + 1

    const r1 = matchesInRound(matches, 1);
    const byeMatches = r1.filter((m) => m.status === "bye");
    assert.equal(byeMatches.length, 1);
  });

  it("all matches have bracketType = winners", () => {
    const matches = generateSingleElimination(players(8));
    assert.ok(matches.every((m) => m.bracketType === "winners"));
  });

  it("16 participants: 15 matches across 4 rounds", () => {
    const matches = generateSingleElimination(players(16));
    assert.equal(matches.length, 15); // 8 + 4 + 2 + 1
    assert.equal(matchesInRound(matches, 1).length, 8);
    assert.equal(matchesInRound(matches, 2).length, 4);
    assert.equal(matchesInRound(matches, 3).length, 2);
    assert.equal(matchesInRound(matches, 4).length, 1);
  });
});

// ─── generateDoubleElimination ───────────────────────────────────────────────

describe("generateDoubleElimination", () => {
  it("throws for fewer than 2 participants", () => {
    assert.throws(() => generateDoubleElimination(["A"]), /at least 2/);
  });

  it("4 participants: has winners, losers, and grand final brackets", () => {
    const matches = generateDoubleElimination(players(4));

    const winners = matchesByBracket(matches, "winners");
    const losers = matchesByBracket(matches, "losers");
    const gf = matchesByBracket(matches, "grand_final");

    assert.ok(winners.length > 0, "Should have winners bracket matches");
    assert.ok(losers.length > 0, "Should have losers bracket matches");
    assert.ok(gf.length > 0, "Should have grand final matches");
  });

  it("grand final has exactly 2 matches (regular + reset)", () => {
    const matches = generateDoubleElimination(players(4));
    const gf = matchesByBracket(matches, "grand_final");
    assert.equal(gf.length, 2);
    assert.equal(gf[0].round, 1);
    assert.equal(gf[1].round, 2);
  });

  it("4 participants: winners bracket has 3 matches (2 R1 + 1 R2)", () => {
    const matches = generateDoubleElimination(players(4));
    const winners = matchesByBracket(matches, "winners");
    assert.equal(winners.length, 3);
    assert.equal(matchesInRound(winners, 1, "winners").length, 2);
    assert.equal(matchesInRound(winners, 2, "winners").length, 1);
  });

  it("4 participants: losers bracket has correct number of rounds", () => {
    // bracketSize=4, winnersRounds=2, losersRounds= 2*(2-1) = 2
    const matches = generateDoubleElimination(players(4));
    const losers = matchesByBracket(matches, "losers");

    const losersR1 = losers.filter((m) => m.round === 1);
    const losersR2 = losers.filter((m) => m.round === 2);

    assert.ok(losersR1.length > 0, "Losers round 1 should exist");
    assert.ok(losersR2.length > 0, "Losers round 2 should exist");
  });

  it("8 participants: produces more losers rounds than 4 participants", () => {
    const matches4 = generateDoubleElimination(players(4));
    const matches8 = generateDoubleElimination(players(8));

    const losers4 = matchesByBracket(matches4, "losers");
    const losers8 = matchesByBracket(matches8, "losers");

    assert.ok(losers8.length > losers4.length);
  });

  it("2 participants: minimal double elimination", () => {
    const matches = generateDoubleElimination(["A", "B"]);
    const winners = matchesByBracket(matches, "winners");
    const gf = matchesByBracket(matches, "grand_final");
    assert.equal(winners.length, 1); // 1 winners match
    assert.equal(gf.length, 2); // grand final + reset
  });

  it("round 1 winners matches have participants filled in", () => {
    const p = players(4);
    const matches = generateDoubleElimination(p);
    const r1 = matchesInRound(matches, 1, "winners").filter(
      (m) => m.bracketType === "winners"
    );
    for (const m of r1) {
      assert.ok(m.participantA !== null);
      assert.ok(m.participantB !== null);
    }
  });
});

// ─── getNextMatch (single elimination) ──────────────────────────────────────

describe("getNextMatch — single elimination", () => {
  it("round 1 match 1 -> round 2 match 1 slot a", () => {
    const result = getNextMatch("winners", 1, 1, 4, "single");
    assert.deepEqual(result, {
      round: 2,
      matchNumber: 1,
      bracketType: "winners",
      slot: "a",
    });
  });

  it("round 1 match 2 -> round 2 match 1 slot b", () => {
    const result = getNextMatch("winners", 1, 2, 4, "single");
    assert.deepEqual(result, {
      round: 2,
      matchNumber: 1,
      bracketType: "winners",
      slot: "b",
    });
  });

  it("final match -> null (no further advancement)", () => {
    // 4 participants => 2 rounds, round 2 is the final
    const result = getNextMatch("winners", 2, 1, 4, "single");
    assert.equal(result, null);
  });

  it("8 participants: round 1 match 3 -> round 2 match 2 slot a", () => {
    const result = getNextMatch("winners", 1, 3, 8, "single");
    assert.deepEqual(result, {
      round: 2,
      matchNumber: 2,
      bracketType: "winners",
      slot: "a",
    });
  });

  it("8 participants: round 1 match 4 -> round 2 match 2 slot b", () => {
    const result = getNextMatch("winners", 1, 4, 8, "single");
    assert.deepEqual(result, {
      round: 2,
      matchNumber: 2,
      bracketType: "winners",
      slot: "b",
    });
  });

  it("8 participants: round 2 match 1 -> round 3 match 1 slot a", () => {
    const result = getNextMatch("winners", 2, 1, 8, "single");
    assert.deepEqual(result, {
      round: 3,
      matchNumber: 1,
      bracketType: "winners",
      slot: "a",
    });
  });

  it("8 participants: round 3 (final) -> null", () => {
    const result = getNextMatch("winners", 3, 1, 8, "single");
    assert.equal(result, null);
  });
});

// ─── getNextMatch (double elimination) ──────────────────────────────────────

describe("getNextMatch — double elimination", () => {
  it("winners bracket: round 1 match 1 -> round 2 match 1 slot a", () => {
    const result = getNextMatch("winners", 1, 1, 4, "double");
    assert.deepEqual(result, {
      round: 2,
      matchNumber: 1,
      bracketType: "winners",
      slot: "a",
    });
  });

  it("winners bracket final -> grand final slot a", () => {
    // 4 participants => winnersRounds=2, so round 2 is the winners final
    const result = getNextMatch("winners", 2, 1, 4, "double");
    assert.deepEqual(result, {
      round: 1,
      matchNumber: 1,
      bracketType: "grand_final",
      slot: "a",
    });
  });

  it("losers bracket final -> grand final slot b", () => {
    // 4 participants => losersRounds=2, so L-round 2 is the losers final
    const result = getNextMatch("losers", 2, 1, 4, "double");
    assert.deepEqual(result, {
      round: 1,
      matchNumber: 1,
      bracketType: "grand_final",
      slot: "b",
    });
  });

  it("losers bracket odd round (internal) -> next round slot a", () => {
    // 8 participants => winnersRounds=3, losersRounds=4
    // L-round 1 (odd, internal) -> L-round 2, slot a
    const result = getNextMatch("losers", 1, 1, 8, "double");
    assert.deepEqual(result, {
      round: 2,
      matchNumber: 1,
      bracketType: "losers",
      slot: "a",
    });
  });

  it("losers bracket even round (drop-down) -> next internal round", () => {
    // L-round 2 (even) -> L-round 3 (internal), matchNumber = ceil(1/2)=1, slot a
    const result = getNextMatch("losers", 2, 1, 8, "double");
    assert.deepEqual(result, {
      round: 3,
      matchNumber: 1,
      bracketType: "losers",
      slot: "a",
    });
  });

  it("losers bracket even round match 2 -> next internal round slot b", () => {
    const result = getNextMatch("losers", 2, 2, 8, "double");
    assert.deepEqual(result, {
      round: 3,
      matchNumber: 1,
      bracketType: "losers",
      slot: "b",
    });
  });

  it("grand final round 1 -> null (caller handles reset)", () => {
    const result = getNextMatch("grand_final", 1, 1, 4, "double");
    assert.equal(result, null);
  });

  it("grand final round 2 (reset) -> null (tournament over)", () => {
    const result = getNextMatch("grand_final", 2, 1, 4, "double");
    assert.equal(result, null);
  });
});

// ─── getLoserDestination ─────────────────────────────────────────────────────

describe("getLoserDestination", () => {
  it("round 1 match 1 loser -> losers round 1 match 1 slot a", () => {
    const result = getLoserDestination(1, 1, 8);
    assert.deepEqual(result, {
      round: 1,
      matchNumber: 1,
      bracketType: "losers",
      slot: "a",
    });
  });

  it("round 1 match 2 loser -> losers round 1 match 1 slot b", () => {
    const result = getLoserDestination(1, 2, 8);
    assert.deepEqual(result, {
      round: 1,
      matchNumber: 1,
      bracketType: "losers",
      slot: "b",
    });
  });

  it("round 1 match 3 loser -> losers round 1 match 2 slot a", () => {
    const result = getLoserDestination(1, 3, 8);
    assert.deepEqual(result, {
      round: 1,
      matchNumber: 2,
      bracketType: "losers",
      slot: "a",
    });
  });

  it("round 1 match 4 loser -> losers round 1 match 2 slot b", () => {
    const result = getLoserDestination(1, 4, 8);
    assert.deepEqual(result, {
      round: 1,
      matchNumber: 2,
      bracketType: "losers",
      slot: "b",
    });
  });

  it("round 2 loser -> losers round 2 (drop-down) slot b", () => {
    // R=2 => losersRound = 2*(2-1) = 2
    const result = getLoserDestination(2, 1, 8);
    assert.deepEqual(result, {
      round: 2,
      matchNumber: 1,
      bracketType: "losers",
      slot: "b",
    });
  });

  it("round 3 loser -> losers round 4 slot b", () => {
    // R=3 => losersRound = 2*(3-1) = 4
    const result = getLoserDestination(3, 1, 8);
    assert.deepEqual(result, {
      round: 4,
      matchNumber: 1,
      bracketType: "losers",
      slot: "b",
    });
  });

  it("returns null for round beyond winners rounds", () => {
    // 4 participants => winnersRounds=2, round 3 is invalid
    const result = getLoserDestination(3, 1, 4);
    assert.equal(result, null);
  });

  it("returns null for round 0", () => {
    const result = getLoserDestination(0, 1, 4);
    assert.equal(result, null);
  });
});

// ─── Swiss format ────────────────────────────────────────────────────────────

describe("swissRoundCount", () => {
  it("8 players -> 3 rounds", () => {
    assert.equal(swissRoundCount(8), 3);
  });

  it("16 players -> 4 rounds", () => {
    assert.equal(swissRoundCount(16), 4);
  });

  it("4 players -> 2 rounds", () => {
    assert.equal(swissRoundCount(4), 2);
  });

  it("2 players -> 1 round", () => {
    assert.equal(swissRoundCount(2), 1);
  });

  it("1 player -> 0 rounds", () => {
    assert.equal(swissRoundCount(1), 0);
  });

  it("6 players -> 3 rounds (ceil(log2(6)) = 3)", () => {
    assert.equal(swissRoundCount(6), 3);
  });

  it("10 players -> 4 rounds (ceil(log2(10)) = 4)", () => {
    assert.equal(swissRoundCount(10), 4);
  });
});

describe("generateSwissRound1", () => {
  it("throws for fewer than 2 participants", () => {
    assert.throws(() => generateSwissRound1(["A"]), /at least 2/);
  });

  it("4 players: pairs 1v3, 2v4", () => {
    const matches = generateSwissRound1(["P1", "P2", "P3", "P4"]);
    assert.equal(matches.length, 2);

    assert.equal(matches[0].participantA, "P1");
    assert.equal(matches[0].participantB, "P3");
    assert.equal(matches[0].status, "pending");

    assert.equal(matches[1].participantA, "P2");
    assert.equal(matches[1].participantB, "P4");
    assert.equal(matches[1].status, "pending");
  });

  it("8 players: pairs 1v5, 2v6, 3v7, 4v8", () => {
    const p = players(8);
    const matches = generateSwissRound1(p);
    assert.equal(matches.length, 4);

    assert.equal(matches[0].participantA, "P1");
    assert.equal(matches[0].participantB, "P5");
    assert.equal(matches[1].participantA, "P2");
    assert.equal(matches[1].participantB, "P6");
    assert.equal(matches[2].participantA, "P3");
    assert.equal(matches[2].participantB, "P7");
    assert.equal(matches[3].participantA, "P4");
    assert.equal(matches[3].participantB, "P8");
  });

  it("odd players: last player gets a bye", () => {
    const matches = generateSwissRound1(["A", "B", "C", "D", "E"]);
    // 2 regular matches + 1 bye
    assert.equal(matches.length, 3);

    const byeMatch = matches.find((m) => m.status === "bye");
    assert.ok(byeMatch, "Should have a bye match");
    assert.equal(byeMatch!.participantA, "E");
    assert.equal(byeMatch!.participantB, null);
  });

  it("all matches are round 1", () => {
    const matches = generateSwissRound1(players(6));
    assert.ok(matches.every((m) => m.round === 1));
  });

  it("all matches have bracketType = winners", () => {
    const matches = generateSwissRound1(players(6));
    assert.ok(matches.every((m) => m.bracketType === "winners"));
  });
});

describe("computeSwissStandings", () => {
  it("correctly counts wins and losses", () => {
    const p = ["A", "B", "C", "D"];
    const results = [
      { participantA: "A", participantB: "C", winner: "A" },
      { participantA: "B", participantB: "D", winner: "D" },
    ];

    const standings = computeSwissStandings(p, results);
    const mapByP = new Map(standings.map((s) => [s.participant, s]));

    assert.equal(mapByP.get("A")!.wins, 1);
    assert.equal(mapByP.get("A")!.losses, 0);
    assert.equal(mapByP.get("C")!.wins, 0);
    assert.equal(mapByP.get("C")!.losses, 1);
    assert.equal(mapByP.get("D")!.wins, 1);
    assert.equal(mapByP.get("D")!.losses, 0);
    assert.equal(mapByP.get("B")!.wins, 0);
    assert.equal(mapByP.get("B")!.losses, 1);
  });

  it("sorts by wins descending", () => {
    const p = ["A", "B", "C", "D"];
    const results = [
      { participantA: "A", participantB: "C", winner: "A" },
      { participantA: "B", participantB: "D", winner: "B" },
      { participantA: "A", participantB: "B", winner: "A" },
      { participantA: "C", participantB: "D", winner: "C" },
    ];

    const standings = computeSwissStandings(p, results);
    // A: 2W-0L, B: 1W-1L, C: 1W-1L, D: 0W-2L
    assert.equal(standings[0].participant, "A");
    assert.equal(standings[0].wins, 2);
    assert.equal(standings[standings.length - 1].participant, "D");
    assert.equal(standings[standings.length - 1].wins, 0);
  });

  it("computes Buchholz tiebreaker correctly", () => {
    const p = ["A", "B", "C", "D"];
    const results = [
      { participantA: "A", participantB: "B", winner: "A" },
      { participantA: "C", participantB: "D", winner: "C" },
      // After round 1: A=1W, B=0W, C=1W, D=0W
      { participantA: "A", participantB: "C", winner: "C" },
      { participantA: "B", participantB: "D", winner: "B" },
      // Final: A=1W-1L, B=1W-1L, C=2W-0L, D=0W-2L
    ];

    const standings = computeSwissStandings(p, results);
    const mapByP = new Map(standings.map((s) => [s.participant, s]));

    // A's opponents: B(1W), C(2W) => Buchholz = 3
    assert.equal(mapByP.get("A")!.buchholz, 3);
    // B's opponents: A(1W), D(0W) => Buchholz = 1
    assert.equal(mapByP.get("B")!.buchholz, 1);

    // A and B both have 1W-1L, but A has higher Buchholz
    const oneWinners = standings.filter((s) => s.wins === 1);
    assert.equal(oneWinners[0].participant, "A"); // Higher Buchholz
    assert.equal(oneWinners[1].participant, "B");
  });

  it("tracks opponents correctly", () => {
    const p = ["A", "B"];
    const results = [{ participantA: "A", participantB: "B", winner: "A" }];
    const standings = computeSwissStandings(p, results);
    const mapByP = new Map(standings.map((s) => [s.participant, s]));

    assert.deepEqual(mapByP.get("A")!.opponents, ["B"]);
    assert.deepEqual(mapByP.get("B")!.opponents, ["A"]);
  });

  it("empty results: all zeros", () => {
    const standings = computeSwissStandings(["X", "Y"], []);
    assert.ok(standings.every((s) => s.wins === 0 && s.losses === 0 && s.buchholz === 0));
  });
});

describe("generateSwissRound", () => {
  it("pairs participants with same record", () => {
    // After round 1: A=1W, B=0L, C=0L, D=1W
    const standings: SwissStanding[] = [
      { participant: "A", wins: 1, losses: 0, buchholz: 0, opponents: ["B"] },
      { participant: "D", wins: 1, losses: 0, buchholz: 0, opponents: ["C"] },
      { participant: "B", wins: 0, losses: 1, buchholz: 1, opponents: ["A"] },
      { participant: "C", wins: 0, losses: 1, buchholz: 1, opponents: ["D"] },
    ];

    const matches = generateSwissRound(standings, 2);
    // Should pair 1W group: A vs D, and 0W group: B vs C
    assert.equal(matches.length, 2);
    assert.ok(matches.every((m) => m.round === 2));
    assert.ok(matches.every((m) => m.status === "pending"));
  });

  it("avoids rematches when possible", () => {
    // 4 players, round 2. A beat B (round 1), C beat D (round 1)
    // In round 2, A should play D (not B again), C should play B (not D again)
    const standings: SwissStanding[] = [
      { participant: "A", wins: 1, losses: 0, buchholz: 0, opponents: ["B"] },
      { participant: "C", wins: 1, losses: 0, buchholz: 0, opponents: ["D"] },
      { participant: "B", wins: 0, losses: 1, buchholz: 1, opponents: ["A"] },
      { participant: "D", wins: 0, losses: 1, buchholz: 1, opponents: ["C"] },
    ];

    const matches = generateSwissRound(standings, 2);

    // Verify no rematches
    for (const m of matches) {
      if (m.status === "bye") continue;
      const a = standings.find((s) => s.participant === m.participantA);
      if (a) {
        assert.ok(
          !a.opponents.includes(m.participantB!),
          `Rematch detected: ${m.participantA} vs ${m.participantB}`
        );
      }
    }
  });

  it("gives bye to odd participant", () => {
    const standings: SwissStanding[] = [
      { participant: "A", wins: 1, losses: 0, buchholz: 0, opponents: ["B"] },
      { participant: "C", wins: 1, losses: 0, buchholz: 0, opponents: ["D"] },
      { participant: "B", wins: 0, losses: 1, buchholz: 1, opponents: ["A"] },
      { participant: "D", wins: 0, losses: 1, buchholz: 1, opponents: ["C"] },
      { participant: "E", wins: 0, losses: 0, buchholz: 0, opponents: [] },
    ];

    const matches = generateSwissRound(standings, 2);
    const byeMatches = matches.filter((m) => m.status === "bye");
    assert.equal(byeMatches.length, 1);
    assert.equal(byeMatches[0].participantB, null);
  });

  it("assigns correct round number", () => {
    const standings: SwissStanding[] = [
      { participant: "X", wins: 0, losses: 0, buchholz: 0, opponents: [] },
      { participant: "Y", wins: 0, losses: 0, buchholz: 0, opponents: [] },
    ];
    const matches = generateSwissRound(standings, 5);
    assert.ok(matches.every((m) => m.round === 5));
  });
});

// ─── generateRoundRobin ─────────────────────────────────────────────────────

describe("generateRoundRobin", () => {
  it("throws for fewer than 2 participants", () => {
    assert.throws(() => generateRoundRobin(["A"]), /at least 2/);
  });

  it("4 participants: 3 rounds, 2 matches each", () => {
    const matches = generateRoundRobin(["A", "B", "C", "D"]);
    // 4 even => 3 rounds, 2 matches per round = 6 total
    assert.equal(matches.length, 6);

    for (let r = 1; r <= 3; r++) {
      const roundMatches = matchesInRound(matches, r);
      assert.equal(roundMatches.length, 2, `Round ${r} should have 2 matches`);
    }
  });

  it("4 participants: everyone plays everyone exactly once", () => {
    const p = ["A", "B", "C", "D"];
    const matches = generateRoundRobin(p);

    // Build a set of all pairings
    const pairings = new Set<string>();
    for (const m of matches) {
      if (m.status === "bye") continue;
      const pair = [m.participantA!, m.participantB!].sort().join("-");
      assert.ok(!pairings.has(pair), `Duplicate pairing: ${pair}`);
      pairings.add(pair);
    }

    // Should be C(4,2) = 6 unique pairings
    assert.equal(pairings.size, 6);
  });

  it("3 participants (odd): everyone plays everyone, with byes", () => {
    const matches = generateRoundRobin(["A", "B", "C"]);
    // 3 odd => 3 rounds, 1 real match + 1 bye per round (but __BYE__ is added making it 4)
    // Actually: 3 rounds, 2 matches each (one is bye)

    const byeMatches = matches.filter((m) => m.status === "bye");
    const realMatches = matches.filter((m) => m.status === "pending");

    // Each player sits out once => 3 byes across 3 rounds
    assert.equal(byeMatches.length, 3);
    // C(3,2) = 3 real matches
    assert.equal(realMatches.length, 3);

    // Verify all pairs play
    const pairings = new Set<string>();
    for (const m of realMatches) {
      pairings.add([m.participantA!, m.participantB!].sort().join("-"));
    }
    assert.equal(pairings.size, 3);
  });

  it("2 participants: 1 round, 1 match", () => {
    const matches = generateRoundRobin(["X", "Y"]);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].round, 1);
    assert.equal(matches[0].participantA, "X");
    assert.equal(matches[0].participantB, "Y");
    assert.equal(matches[0].status, "pending");
  });

  it("6 participants: 5 rounds, 3 matches each", () => {
    const matches = generateRoundRobin(players(6));
    assert.equal(matches.length, 15); // 5 * 3

    // Verify all 15 unique pairings
    const pairings = new Set<string>();
    for (const m of matches) {
      if (m.status === "bye") continue;
      pairings.add([m.participantA!, m.participantB!].sort().join("-"));
    }
    assert.equal(pairings.size, 15); // C(6,2) = 15
  });

  it("5 participants (odd): 5 rounds, each player gets 1 bye total", () => {
    const p = players(5);
    const matches = generateRoundRobin(p);

    // Count byes per player
    const byeCounts: Record<string, number> = {};
    for (const pid of p) byeCounts[pid] = 0;

    for (const m of matches) {
      if (m.status === "bye") {
        const player = m.participantA ?? m.participantB;
        if (player) byeCounts[player]++;
      }
    }

    // Each player should have exactly 1 bye
    for (const pid of p) {
      assert.equal(byeCounts[pid], 1, `Player ${pid} should have exactly 1 bye`);
    }
  });

  it("no __BYE__ sentinel leaks into match participants", () => {
    const matches = generateRoundRobin(["A", "B", "C"]);
    for (const m of matches) {
      assert.notEqual(m.participantA, "__BYE__");
      assert.notEqual(m.participantB, "__BYE__");
    }
  });
});
