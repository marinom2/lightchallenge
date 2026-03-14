/**
 * test/competitive-ranking.test.ts
 *
 * Unit tests for the competitive ranking system (Option C: hardened off-chain).
 * Tests the evaluator scoring, ranking logic, and tie-breaking behavior.
 *
 * These tests are pure TypeScript — no DB or chain dependencies.
 * Run: npx tsx --test test/competitive-ranking.test.ts
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

// ─── Inline test implementations ──────────────────────────────────────────────
// We test the ranking algorithm directly rather than importing from the
// dispatcher (which has side effects like DB connections).

type TestVerdict = {
  subject: string;
  score: number | null;
  pass: boolean;
  created_at: Date;
};

/**
 * Rank verdicts by score descending, break ties by earliest submission.
 * This mirrors the SQL in getVerdictsRankedByScore and the JS in applyRanking.
 */
function rankVerdicts(verdicts: TestVerdict[]): TestVerdict[] {
  return [...verdicts].sort((a, b) => {
    // Score descending (nulls last)
    const sa = a.score ?? -Infinity;
    const sb = b.score ?? -Infinity;
    if (sa !== sb) return sb - sa;
    // Tie-break: earliest submission first
    return a.created_at.getTime() - b.created_at.getTime();
  });
}

/**
 * Apply competitive ranking: top-N get pass=true, rest get pass=false.
 */
function applyRanking(verdicts: TestVerdict[], topN: number): TestVerdict[] {
  const ranked = rankVerdicts(verdicts);
  return ranked.map((v, i) => ({
    ...v,
    pass: i < topN,
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Competitive Ranking", () => {
  const t = (offset: number) => new Date(Date.now() - offset * 60000);

  describe("rankVerdicts", () => {
    it("ranks by score descending", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 100, pass: true, created_at: t(3) },
        { subject: "0xB", score: 500, pass: true, created_at: t(2) },
        { subject: "0xC", score: 250, pass: true, created_at: t(1) },
      ];
      const ranked = rankVerdicts(verdicts);
      assert.deepStrictEqual(ranked.map((v) => v.subject), ["0xB", "0xC", "0xA"]);
    });

    it("breaks ties by earliest submission", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 100, pass: true, created_at: t(1) },
        { subject: "0xB", score: 100, pass: true, created_at: t(3) },
        { subject: "0xC", score: 100, pass: true, created_at: t(2) },
      ];
      const ranked = rankVerdicts(verdicts);
      // Earliest first among equal scores
      assert.deepStrictEqual(ranked.map((v) => v.subject), ["0xB", "0xC", "0xA"]);
    });

    it("handles null scores (ranked last)", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: null, pass: true, created_at: t(3) },
        { subject: "0xB", score: 50, pass: true, created_at: t(2) },
        { subject: "0xC", score: null, pass: true, created_at: t(1) },
      ];
      const ranked = rankVerdicts(verdicts);
      assert.strictEqual(ranked[0].subject, "0xB");
      // Null scores ranked last, broken by created_at
      assert.strictEqual(ranked[1].subject, "0xA");
      assert.strictEqual(ranked[2].subject, "0xC");
    });
  });

  describe("applyRanking", () => {
    it("marks top-1 as winner, rest as losers", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 100, pass: true, created_at: t(3) },
        { subject: "0xB", score: 500, pass: true, created_at: t(2) },
        { subject: "0xC", score: 250, pass: true, created_at: t(1) },
      ];
      const result = applyRanking(verdicts, 1);
      const winner = result.find((v) => v.pass);
      assert.strictEqual(winner?.subject, "0xB");
      assert.strictEqual(result.filter((v) => v.pass).length, 1);
      assert.strictEqual(result.filter((v) => !v.pass).length, 2);
    });

    it("marks top-N as winners", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 100, pass: true, created_at: t(3) },
        { subject: "0xB", score: 500, pass: true, created_at: t(2) },
        { subject: "0xC", score: 250, pass: true, created_at: t(1) },
        { subject: "0xD", score: 300, pass: true, created_at: t(0) },
      ];
      const result = applyRanking(verdicts, 2);
      const winners = result.filter((v) => v.pass).map((v) => v.subject);
      assert.deepStrictEqual(winners, ["0xB", "0xD"]);
    });

    it("handles topN greater than participants (all win)", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 100, pass: true, created_at: t(2) },
        { subject: "0xB", score: 200, pass: true, created_at: t(1) },
      ];
      const result = applyRanking(verdicts, 5);
      assert.strictEqual(result.filter((v) => v.pass).length, 2);
    });

    it("handles single participant", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 42, pass: true, created_at: t(0) },
      ];
      const result = applyRanking(verdicts, 1);
      assert.strictEqual(result[0].pass, true);
    });

    it("handles tie at the cutoff boundary correctly", () => {
      // Two players tied at score=100, only 1 spot available.
      // The one who submitted earlier wins the tiebreak.
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 100, pass: true, created_at: t(1) },
        { subject: "0xB", score: 100, pass: true, created_at: t(5) },
        { subject: "0xC", score: 50, pass: true, created_at: t(0) },
      ];
      const result = applyRanking(verdicts, 1);
      const winner = result.find((v) => v.pass);
      // 0xB submitted earlier (t(5) = 5 minutes ago)
      assert.strictEqual(winner?.subject, "0xB");
    });

    it("handles all zeros", () => {
      const verdicts: TestVerdict[] = [
        { subject: "0xA", score: 0, pass: true, created_at: t(3) },
        { subject: "0xB", score: 0, pass: true, created_at: t(2) },
        { subject: "0xC", score: 0, pass: true, created_at: t(1) },
      ];
      const result = applyRanking(verdicts, 1);
      const winner = result.find((v) => v.pass);
      // All tied at 0 — earliest submission wins
      assert.strictEqual(winner?.subject, "0xA");
    });
  });

  describe("Competitive evaluator scoring", () => {
    // Test the scoring functions directly

    function computeFitnessScore(
      activities: { steps_count?: number; distance_km?: number; duration_min?: number }[],
      metric: string
    ): number {
      let total = 0;
      for (const a of activities) {
        switch (metric) {
          case "steps_count": total += a.steps_count ?? 0; break;
          case "distance_km": total += a.distance_km ?? 0; break;
          case "duration_min": total += a.duration_min ?? 0; break;
          default: total += a.steps_count ?? 0; break;
        }
      }
      return total;
    }

    it("sums steps correctly", () => {
      const acts = [
        { steps_count: 5000 },
        { steps_count: 3000 },
        { steps_count: 2500 },
      ];
      assert.strictEqual(computeFitnessScore(acts, "steps_count"), 10500);
    });

    it("sums distance correctly", () => {
      const acts = [
        { distance_km: 5.2 },
        { distance_km: 3.8 },
      ];
      assert.strictEqual(computeFitnessScore(acts, "distance_km"), 9.0);
    });

    it("handles missing values as 0", () => {
      const acts = [
        { steps_count: 5000 },
        {},
        { steps_count: 2000 },
      ];
      assert.strictEqual(computeFitnessScore(acts, "steps_count"), 7000);
    });

    it("returns 0 for empty activities", () => {
      assert.strictEqual(computeFitnessScore([], "steps_count"), 0);
    });
  });

  describe("Gaming competitive scoring", () => {
    function numericField(record: Record<string, unknown>, ...fields: string[]): number {
      for (const f of fields) {
        if (typeof record[f] === "number") return record[f] as number;
      }
      return 0;
    }

    function computeGamingScore(
      eligible: Record<string, unknown>[],
      metric: string
    ): number {
      const sumField = (...fields: string[]) =>
        eligible.reduce<number>((sum, r) => sum + numericField(r, ...fields), 0);

      switch (metric) {
        case "wins": return eligible.filter((r) => r.win === true).length;
        case "kills": return sumField("kills");
        case "assists": return sumField("assists");
        case "kda": {
          const k = sumField("kills");
          const d = sumField("deaths");
          const a = sumField("assists");
          return d === 0 ? k + a : (k + a) / d;
        }
        default: return 0;
      }
    }

    it("counts kills", () => {
      const records = [
        { kills: 10, deaths: 2 },
        { kills: 7, deaths: 3 },
        { kills: 15, deaths: 1 },
      ];
      assert.strictEqual(computeGamingScore(records, "kills"), 32);
    });

    it("computes KDA correctly", () => {
      const records = [
        { kills: 10, deaths: 5, assists: 5 },
      ];
      // (10 + 5) / 5 = 3.0
      assert.strictEqual(computeGamingScore(records, "kda"), 3.0);
    });

    it("handles zero deaths in KDA", () => {
      const records = [
        { kills: 10, deaths: 0, assists: 5 },
      ];
      // 0 deaths → return kills + assists
      assert.strictEqual(computeGamingScore(records, "kda"), 15);
    });

    it("counts wins", () => {
      const records = [
        { win: true },
        { win: false },
        { win: true },
        { win: true },
      ];
      assert.strictEqual(computeGamingScore(records, "wins"), 3);
    });
  });

  describe("Payout correctness", () => {
    // ChallengePay payout math:
    //   perCommittedBonusX = distributable * 1e18 / winnersPool
    //   winner claims: principal + (principal * perCommittedBonusX / 1e18)
    //   loser claims: principal * perCashbackX / 1e18

    const SCALE = 1000000000000000000n; // 10^18

    function computePayouts(params: {
      stakes: bigint[];
      winnerIndices: number[];
      forfeitFeeBps: number;
      cashbackBps: number;
      protocolBps: number;
      creatorBps: number;
    }) {
      const { stakes, winnerIndices, forfeitFeeBps, cashbackBps, protocolBps, creatorBps } = params;

      const totalPool = stakes.reduce((a, b) => a + b, 0n);
      const winnersPool = winnerIndices.reduce((sum, i) => sum + stakes[i], 0n);
      const losersPool = totalPool - winnersPool;

      // Fee calculations (applied to losers' pool)
      const cashback = losersPool * BigInt(cashbackBps) / 10000n;
      const forfeitFee = losersPool * BigInt(forfeitFeeBps) / 10000n;
      const protocolFee = forfeitFeeBps > 0 ? forfeitFee * BigInt(protocolBps) / BigInt(forfeitFeeBps) : 0n;
      const creatorFee = forfeitFeeBps > 0 ? forfeitFee * BigInt(creatorBps) / BigInt(forfeitFeeBps) : 0n;

      const distributable = losersPool - cashback - protocolFee - creatorFee;

      const perCommittedBonusX = winnersPool > 0n ? distributable * SCALE / winnersPool : 0n;
      const perCashbackX = losersPool > 0n ? cashback * SCALE / losersPool : 0n;

      return {
        winnersPool,
        losersPool,
        distributable,
        perCommittedBonusX,
        perCashbackX,
        winnerPayout: (principal: bigint) => principal + principal * perCommittedBonusX / SCALE,
        loserPayout: (principal: bigint) => principal * perCashbackX / SCALE,
      };
    }

    it("single winner gets the full distributable", () => {
      const p = computePayouts({
        stakes: [1000n, 1000n, 1000n],
        winnerIndices: [0],
        forfeitFeeBps: 1000, // 10%
        cashbackBps: 500,    // 5%
        protocolBps: 500,    // 5% of forfeit
        creatorBps: 500,     // 5% of forfeit
      });

      // Losers pool = 2000
      // Cashback = 2000 * 5% = 100
      // Forfeit fee = 2000 * 10% = 200
      // Protocol = 200 * 5/10 = 100
      // Creator = 200 * 5/10 = 100
      // Distributable = 2000 - 100 - 100 - 100 = 1700
      assert.strictEqual(p.distributable, 1700n);

      // Winner gets principal + bonus
      const winnerTotal = p.winnerPayout(1000n);
      assert.strictEqual(winnerTotal, 1000n + 1700n);
    });

    it("competitive top-2 from 5 players splits distributable proportionally", () => {
      const p = computePayouts({
        stakes: [1000n, 1000n, 1000n, 1000n, 1000n],
        winnerIndices: [0, 1],
        forfeitFeeBps: 1000,
        cashbackBps: 0,
        protocolBps: 500,
        creatorBps: 500,
      });

      // Losers pool = 3000
      // Forfeit fee = 3000 * 10% = 300
      // Protocol = 300 * 500/1000 = 150
      // Creator = 300 * 500/1000 = 150
      // Distributable = 3000 - 0 - 150 - 150 = 2700
      assert.strictEqual(p.distributable, 2700n);

      // Each winner gets principal + share
      // perCommittedBonusX = 2700 * 1e18 / 2000
      // winner payout = 1000 + 1000 * (2700*1e18/2000) / 1e18 = 1000 + 1350 = 2350
      const w = p.winnerPayout(1000n);
      assert.strictEqual(w, 2350n);
    });

    it("no losers means no bonus", () => {
      // All participants are winners
      const p = computePayouts({
        stakes: [1000n, 1000n],
        winnerIndices: [0, 1],
        forfeitFeeBps: 1000,
        cashbackBps: 500,
        protocolBps: 500,
        creatorBps: 500,
      });

      assert.strictEqual(p.losersPool, 0n);
      assert.strictEqual(p.distributable, 0n);
      // Winners just get their principal back
      assert.strictEqual(p.winnerPayout(1000n), 1000n);
    });

    it("unequal stakes distribute proportionally", () => {
      const p = computePayouts({
        stakes: [2000n, 1000n, 1000n],
        winnerIndices: [0], // The high-staker wins
        forfeitFeeBps: 0,   // No fees
        cashbackBps: 0,
        protocolBps: 0,
        creatorBps: 0,
      });

      // Losers pool = 2000
      // No fees → distributable = 2000
      // perCommittedBonusX = 2000 * 1e18 / 2000 = 1e18
      // Winner gets 2000 + 2000 * 1e18 / 1e18 = 4000 (double)
      assert.strictEqual(p.winnerPayout(2000n), 4000n);
    });
  });
});
