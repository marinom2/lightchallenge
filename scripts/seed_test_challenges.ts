#!/usr/bin/env npx tsx
/**
 * scripts/seed_test_challenges.ts
 *
 * Wipes existing test data and seeds 100 challenges spanning every status,
 * fitness type, progress level, and outcome combination.
 *
 * Wallets:
 *   - WALLET_A (0x95A4...A217) — creates challenges, varied outcomes
 *   - WALLET_B (0x8176...cB31) — joins challenges, varied outcomes
 *
 * Challenge statuses seeded:
 *   - Active:     with evidence at 10%, 20%, 35%, 50%, 65%, 80%, 95%, 100%
 *   - Active:     no evidence yet (proof needed)
 *   - Active:     expired but in proof window
 *   - Finalized:  A wins / B loses, B wins / A loses, both win, both lose
 *   - Finalized:  edge cases (marginal pass, high score, low score)
 *
 * Fitness types: walking, running, cycling, swimming, hiking, strength
 *
 * Also seeds: evidence, verdicts, achievement_mints, reputation, claims.
 *
 * Usage:
 *   npx tsx scripts/seed_test_challenges.ts            # seed
 *   npx tsx scripts/seed_test_challenges.ts --wipe      # wipe ALL challenges first
 *   npx tsx scripts/seed_test_challenges.ts --dry-run   # show plan only
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../webapp/.env.local") });

import { getPool, closePool } from "../offchain/db/pool";

const WALLET_A = "0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217";
const WALLET_B = "0x8176735dE44c6a6e64C9153F2448B15F2F53cB31";

const BASE_ID = 1000;

// ─── Types ──────────────────────────────────────────────────────────────────

type FitnessType = "walking" | "running" | "cycling" | "swimming" | "hiking" | "strength";

interface ChallengeSpec {
  id: number;
  title: string;
  description: string;
  category: FitnessType;
  stakeWei: string;
  creator: string;
  status: "Active" | "Finalized";
  verdictA: boolean | null;
  verdictB: boolean | null;
  /** Days ago the challenge was created */
  daysAgo: number;
  /** Progress percentage for wallet A (0.0 - 1.5). Only used for Active challenges. */
  progressA: number;
  /** Progress percentage for wallet B */
  progressB: number;
  /** True if challenge period has ended but proof window still open */
  inProofWindow?: boolean;
  /** True if past proof deadline too */
  pastDeadline?: boolean;
}

// ─── Titles & Descriptions ──────────────────────────────────────────────────

const TEMPLATES: Record<FitnessType, { titles: string[]; descs: string[] }> = {
  walking: {
    titles: [
      "10K Steps Daily", "Step Marathon Week", "Morning Walk Streak",
      "Office Walk Break Challenge", "Family Walking Week", "50K Steps Sprint",
      "Walk to the Moon (in steps)", "Lunchtime Walk Habit", "Commute Walking Week",
      "Weekend Walker Challenge", "Mindful Walking Days", "Step Count Showdown",
      "Power Walk Week", "Daily 8K Steps", "Walking for Wellness",
      "Autumn Steps Challenge", "Park Walking Circuit", "Neighborhood Explorer Walk",
    ],
    descs: [
      "Hit your daily step goal consistently for a week",
      "Walk at least 10,000 steps every day — rain or shine",
      "Get moving! Track your steps with Apple Watch, Strava, or Garmin",
      "Build a walking habit and earn rewards for consistency",
      "Simple goal: walk more than yesterday, every day this week",
    ],
  },
  running: {
    titles: [
      "5K Morning Run", "Marathon Prep 20K", "Sub-30 5K Challenge",
      "Run 50K This Week", "Sunrise Jog Streak", "10K Personal Best",
      "Trail Run Explorer", "Speed Interval Week", "Run Streak 7 Days",
      "Half Marathon Training", "Couch to 5K Blitz", "Distance Runner Week",
      "Evening Run Habit", "Tempo Run Challenge", "Weekend Long Run",
      "Run 100K This Month", "Fartlek Training Week", "Recovery Jog Challenge",
    ],
    descs: [
      "Complete the distance within the time limit to earn your reward",
      "Track your runs with any connected fitness device",
      "Push your pace and set a new personal record",
      "Consistent daily running — build endurance and earn",
      "Run every day this week, minimum 3K per session",
    ],
  },
  cycling: {
    titles: [
      "Century Ride Challenge", "Bike to Work Week", "100K Cycling Sprint",
      "Mountain Bike Explorer", "Cycling Commute Champion", "50K Weekend Ride",
      "Bike Path Adventure", "Cycling Endurance Week", "Indoor Cycling Blitz",
      "Hill Climbing Challenge", "Road Bike Century", "Evening Ride Streak",
      "Cycling Speed Challenge", "Cross-Country Ride", "Peloton Challenge Week",
      "Tour de Neighborhood", "Gravel Ride 75K", "Cycling for Charity",
    ],
    descs: [
      "Ride the distance — road, mountain, or indoor bike all count",
      "Pedal to work and back every day this week",
      "Complete 100km on your bike to claim the reward",
      "Track your cycling distance with Apple Watch or Strava",
      "Push your cycling limits and earn on-chain rewards",
    ],
  },
  swimming: {
    titles: [
      "50 Lap Challenge", "Open Water Swim 5K", "Pool Sprint Week",
      "Swim 2K Daily", "Butterfly Stroke Challenge", "Swim & Earn",
      "Morning Lap Swim", "Swim Distance Challenge", "Pool Mile Week",
      "Aquatic Endurance Test", "Swim 10K This Week", "Freestyle Sprint Day",
      "Backstroke Challenge", "Swim for Fitness Week", "Ocean Swim Prep",
      "Swim Team Challenge", "Triathlon Swim Prep", "Pool Recovery Week",
    ],
    descs: [
      "Swim the distance in pool or open water — any stroke counts",
      "Track your laps with Apple Watch or compatible swim tracker",
      "Complete 50 laps in an Olympic-size pool",
      "Build swimming endurance with daily distance goals",
      "Get in the water every day and track your progress",
    ],
  },
  hiking: {
    titles: [
      "Mountain Trail 25K", "Summit Trail Challenge", "Weekend Hike Warrior",
      "Trail Explorer 30K", "Elevation Gain Challenge", "Forest Trail Week",
      "Ridgeline Hike Series", "Nature Trail Challenge", "Alpine Hike Day",
      "Canyon Trail Explorer", "Coastal Path Challenge", "Peak Bagger Week",
      "Desert Trail Run-Hike", "Valley Trail 20K", "Wilderness Hike",
      "Sunrise Hike Challenge", "Trail Running Mix", "Backcountry Adventure",
    ],
    descs: [
      "Hike the trails — distance and elevation gain both count",
      "Explore nature while earning on-chain rewards",
      "Hit the trail every day this week — any terrain counts",
      "Track your hiking with GPS-enabled device",
      "Conquer trails and earn rewards for your adventure",
    ],
  },
  strength: {
    titles: [
      "Iron Strength Week", "Gym Warrior Challenge", "Lift Heavy Week",
      "Strength Training 5-Day", "Push-Up Marathon", "Deadlift PR Week",
      "Full Body Blast", "Core Strength Challenge", "Upper Body Week",
      "Leg Day Champion", "HIIT Strength Combo", "Muscle Building Week",
      "Calisthenics Challenge", "Functional Fitness Week", "Powerlifting Prep",
      "Bodyweight Challenge", "CrossFit Inspired Week", "Progressive Overload Week",
    ],
    descs: [
      "Complete your strength training sessions with logged weights",
      "Hit the gym consistently and track your sessions",
      "Build strength with tracked workouts — gym or home",
      "Consistent weight training — each session counts toward the goal",
      "Push your limits with progressive strength training",
    ],
  },
};

const CATEGORIES: FitnessType[] = ["walking", "running", "cycling", "swimming", "hiking", "strength"];

const STAKES = [
  "100000000000000000",   // 0.1 LCAI
  "200000000000000000",   // 0.2
  "250000000000000000",   // 0.25
  "500000000000000000",   // 0.5
  "750000000000000000",   // 0.75
  "1000000000000000000",  // 1.0
  "1500000000000000000",  // 1.5
  "2000000000000000000",  // 2.0
  "3000000000000000000",  // 3.0
  "5000000000000000000",  // 5.0
];

// ─── Challenge generation ───────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickRemove<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length);
  return arr.splice(idx, 1)[0];
}

function generateChallenges(): ChallengeSpec[] {
  const specs: ChallengeSpec[] = [];
  let id = BASE_ID;

  // Track used titles per category to avoid duplicates
  const usedTitles: Record<FitnessType, Set<string>> = {
    walking: new Set(), running: new Set(), cycling: new Set(),
    swimming: new Set(), hiking: new Set(), strength: new Set(),
  };

  function nextTitle(cat: FitnessType): string {
    const templates = TEMPLATES[cat].titles;
    for (const t of templates) {
      if (!usedTitles[cat].has(t)) {
        usedTitles[cat].add(t);
        return t;
      }
    }
    // All used — add suffix
    const t = pick(templates);
    const suffix = ` #${usedTitles[cat].size + 1}`;
    usedTitles[cat].add(t + suffix);
    return t + suffix;
  }

  // ─── GROUP 1: Active challenges with varied progress (36 total, 6 per category)
  // Progress levels: 10%, 25%, 50%, 65%, 80%, 95%
  const progressLevels = [0.10, 0.25, 0.50, 0.65, 0.80, 0.95];
  for (const cat of CATEGORIES) {
    for (let pi = 0; pi < progressLevels.length; pi++) {
      const prog = progressLevels[pi];
      specs.push({
        id: id++,
        title: nextTitle(cat),
        description: pick(TEMPLATES[cat].descs),
        category: cat,
        stakeWei: pick(STAKES),
        creator: pi % 2 === 0 ? WALLET_A : WALLET_B,
        status: "Active",
        verdictA: null,
        verdictB: null,
        daysAgo: 2 + Math.floor(Math.random() * 5),
        progressA: prog,
        progressB: Math.max(0.05, prog - 0.15 + Math.random() * 0.30),
      });
    }
  }

  // ─── GROUP 2: Active, no evidence yet — proof needed (6, one per category)
  for (const cat of CATEGORIES) {
    specs.push({
      id: id++,
      title: nextTitle(cat),
      description: pick(TEMPLATES[cat].descs),
      category: cat,
      stakeWei: pick(STAKES),
      creator: pick([WALLET_A, WALLET_B]),
      status: "Active",
      verdictA: null,
      verdictB: null,
      daysAgo: 1,
      progressA: 0,
      progressB: 0,
    });
  }

  // ─── GROUP 3: Active, in proof window — challenge ended but proof deadline not yet (6)
  for (const cat of CATEGORIES) {
    specs.push({
      id: id++,
      title: nextTitle(cat),
      description: pick(TEMPLATES[cat].descs),
      category: cat,
      stakeWei: pick(STAKES),
      creator: pick([WALLET_A, WALLET_B]),
      status: "Active",
      verdictA: null,
      verdictB: null,
      daysAgo: 10,
      progressA: 0.70 + Math.random() * 0.30,
      progressB: 0.40 + Math.random() * 0.40,
      inProofWindow: true,
    });
  }

  // ─── GROUP 4: Finalized — A wins, B loses (12, 2 per category)
  for (const cat of CATEGORIES) {
    for (let i = 0; i < 2; i++) {
      specs.push({
        id: id++,
        title: nextTitle(cat),
        description: pick(TEMPLATES[cat].descs),
        category: cat,
        stakeWei: pick(STAKES),
        creator: i === 0 ? WALLET_A : WALLET_B,
        status: "Finalized",
        verdictA: true,
        verdictB: false,
        daysAgo: 15 + Math.floor(Math.random() * 30),
        progressA: 1.0 + Math.random() * 0.3,
        progressB: 0.2 + Math.random() * 0.3,
      });
    }
  }

  // ─── GROUP 5: Finalized — B wins, A loses (12, 2 per category)
  for (const cat of CATEGORIES) {
    for (let i = 0; i < 2; i++) {
      specs.push({
        id: id++,
        title: nextTitle(cat),
        description: pick(TEMPLATES[cat].descs),
        category: cat,
        stakeWei: pick(STAKES),
        creator: i === 0 ? WALLET_B : WALLET_A,
        status: "Finalized",
        verdictA: false,
        verdictB: true,
        daysAgo: 12 + Math.floor(Math.random() * 25),
        progressA: 0.15 + Math.random() * 0.30,
        progressB: 1.0 + Math.random() * 0.2,
      });
    }
  }

  // ─── GROUP 6: Finalized — both pass (community challenges, 6)
  for (const cat of CATEGORIES) {
    specs.push({
      id: id++,
      title: nextTitle(cat),
      description: pick(TEMPLATES[cat].descs),
      category: cat,
      stakeWei: pick(STAKES),
      creator: pick([WALLET_A, WALLET_B]),
      status: "Finalized",
      verdictA: true,
      verdictB: true,
      daysAgo: 8 + Math.floor(Math.random() * 15),
      progressA: 1.0 + Math.random() * 0.2,
      progressB: 1.0 + Math.random() * 0.15,
    });
  }

  // ─── GROUP 7: Finalized — both fail (6)
  for (const cat of CATEGORIES) {
    specs.push({
      id: id++,
      title: nextTitle(cat),
      description: pick(TEMPLATES[cat].descs),
      category: cat,
      stakeWei: pick(STAKES),
      creator: pick([WALLET_A, WALLET_B]),
      status: "Finalized",
      verdictA: false,
      verdictB: false,
      daysAgo: 20 + Math.floor(Math.random() * 20),
      progressA: 0.1 + Math.random() * 0.3,
      progressB: 0.05 + Math.random() * 0.25,
    });
  }

  // ─── GROUP 8: Active with 100% progress (completed goal, not yet finalized, 6)
  for (const cat of CATEGORIES) {
    specs.push({
      id: id++,
      title: nextTitle(cat),
      description: pick(TEMPLATES[cat].descs),
      category: cat,
      stakeWei: pick(STAKES),
      creator: pick([WALLET_A, WALLET_B]),
      status: "Active",
      verdictA: null,
      verdictB: null,
      daysAgo: 5,
      progressA: 1.0 + Math.random() * 0.1,
      progressB: 0.60 + Math.random() * 0.30,
    });
  }

  // ─── GROUP 9: Finalized — past deadline, expired (4)
  for (let i = 0; i < 4; i++) {
    const cat = CATEGORIES[i % CATEGORIES.length];
    specs.push({
      id: id++,
      title: nextTitle(cat),
      description: pick(TEMPLATES[cat].descs),
      category: cat,
      stakeWei: pick(STAKES),
      creator: pick([WALLET_A, WALLET_B]),
      status: "Finalized",
      verdictA: null,
      verdictB: null,
      daysAgo: 45 + Math.floor(Math.random() * 30),
      progressA: 0,
      progressB: 0,
      pastDeadline: true,
    });
  }

  // Fill remaining to reach exactly 100
  while (specs.length < 100) {
    const cat = CATEGORIES[specs.length % CATEGORIES.length];
    const isFinalized = specs.length % 3 === 0;
    specs.push({
      id: id++,
      title: nextTitle(cat),
      description: pick(TEMPLATES[cat].descs),
      category: cat,
      stakeWei: pick(STAKES),
      creator: pick([WALLET_A, WALLET_B]),
      status: isFinalized ? "Finalized" : "Active",
      verdictA: isFinalized ? pick([true, false]) : null,
      verdictB: isFinalized ? pick([true, false]) : null,
      daysAgo: 3 + Math.floor(Math.random() * 40),
      progressA: isFinalized ? (Math.random() > 0.5 ? 1.1 : 0.3) : (0.1 + Math.random() * 0.8),
      progressB: isFinalized ? (Math.random() > 0.5 ? 1.05 : 0.25) : (0.05 + Math.random() * 0.7),
    });
  }

  return specs;
}

// ─── Model ID / Hash helpers ────────────────────────────────────────────────

function modelIdForCategory(category: FitnessType): string {
  switch (category) {
    case "walking":  return "fitness.steps@1";
    case "running":  return "fitness.distance@1";
    case "cycling":  return "fitness.cycling@1";
    case "swimming": return "fitness.swimming@1";
    case "hiking":   return "fitness.hiking@1";
    case "strength": return "fitness.strength@1";
  }
}

function modelHashForCategory(category: FitnessType): string {
  switch (category) {
    case "walking":  return "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001";
    case "running":  return "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60002";
    case "cycling":  return "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60003";
    case "hiking":   return "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60004";
    case "swimming": return "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60005";
    case "strength": return "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60006";
  }
}

function rulesForCategory(category: FitnessType) {
  switch (category) {
    case "walking":
      return { type: "fitness", period: "total", metric: "steps", threshold: 100000 };
    case "running":
      return { type: "fitness", period: "total", metric: "distance_km", threshold: 50 };
    case "cycling":
      return { type: "fitness", period: "total", metric: "cycling_km", threshold: 100 };
    case "swimming":
      return { type: "fitness", period: "total", metric: "swimming_km", threshold: 5 };
    case "hiking":
      return { type: "fitness", period: "total", metric: "hiking_km", threshold: 30 };
    case "strength":
      return { type: "fitness", period: "total", metric: "strength_sessions", threshold: 6 };
  }
}

// ─── Evidence generation ────────────────────────────────────────────────────

function generateEvidenceRecords(category: FitnessType, daysAgo: number, progressPct: number) {
  const rules = rulesForCategory(category);
  const goal = rules.threshold;
  const targetTotal = goal * progressPct;
  const numDays = Math.max(1, daysAgo);
  const records = [];

  for (let d = 0; d < numDays; d++) {
    const date = new Date(Date.now() - (numDays - d) * 86400000);
    const dateStr = date.toISOString().split("T")[0];
    const dailyBase = targetTotal / numDays;
    const dailyValue = dailyBase * (0.7 + Math.random() * 0.6);

    switch (category) {
      case "walking":
        records.push({
          date: dateStr, type: "steps",
          steps: Math.round(dailyValue),
          distance_m: Math.round(dailyValue * 0.75),
          active_minutes: Math.round(dailyValue / 120),
          source: "apple_health",
        });
        break;
      case "running":
        records.push({
          date: dateStr, type: "run",
          distance_km: Math.round(dailyValue * 100) / 100,
          distance_m: Math.round(dailyValue * 1000),
          duration_s: Math.round(dailyValue * 360),
          steps: Math.round(dailyValue * 1200),
          active_minutes: Math.round(dailyValue * 6),
          source: "apple_health",
        });
        break;
      case "cycling":
        records.push({
          date: dateStr, type: "cycle",
          distance_km: Math.round(dailyValue * 100) / 100,
          distance_m: Math.round(dailyValue * 1000),
          duration_s: Math.round(dailyValue * 150),
          active_minutes: Math.round(dailyValue * 2.5),
          source: "apple_health",
        });
        break;
      case "swimming":
        records.push({
          date: dateStr, type: "swim",
          distance_km: Math.round(dailyValue * 1000) / 1000,
          distance_m: Math.round(dailyValue * 1000),
          duration_s: Math.round(dailyValue * 1200),
          laps: Math.round(dailyValue * 20),
          active_minutes: Math.round(dailyValue * 20),
          source: "apple_health",
        });
        break;
      case "hiking":
        records.push({
          date: dateStr, type: "hike",
          distance_km: Math.round(dailyValue * 100) / 100,
          distance_m: Math.round(dailyValue * 1000),
          elev_gain_m: Math.round(dailyValue * 40),
          duration_s: Math.round(dailyValue * 600),
          steps: Math.round(dailyValue * 1400),
          active_minutes: Math.round(dailyValue * 10),
          source: "apple_health",
        });
        break;
      case "strength":
        records.push({
          date: dateStr, type: "strength",
          active_minutes: Math.round(dailyValue * 10),
          duration_s: Math.round(dailyValue * 600),
          calories: Math.round(dailyValue * 60),
          source: "apple_health",
        });
        break;
    }
  }
  return records;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const wipe = args.includes("--wipe");

  const challenges = generateChallenges();

  if (dryRun) {
    console.log("=== DRY RUN — would seed these challenges ===\n");
    const groups = {
      "Active (with progress)": challenges.filter(c => c.status === "Active" && c.progressA > 0 && !c.inProofWindow),
      "Active (no evidence)": challenges.filter(c => c.status === "Active" && c.progressA === 0),
      "Active (proof window)": challenges.filter(c => c.inProofWindow),
      "Finalized (A wins)": challenges.filter(c => c.status === "Finalized" && c.verdictA === true && c.verdictB === false),
      "Finalized (B wins)": challenges.filter(c => c.status === "Finalized" && c.verdictA === false && c.verdictB === true),
      "Finalized (both win)": challenges.filter(c => c.status === "Finalized" && c.verdictA === true && c.verdictB === true),
      "Finalized (both fail)": challenges.filter(c => c.status === "Finalized" && c.verdictA === false && c.verdictB === false),
      "Finalized (expired/no verdict)": challenges.filter(c => c.status === "Finalized" && c.verdictA === null),
    };
    for (const [label, group] of Object.entries(groups)) {
      console.log(`${label}: ${group.length}`);
      for (const c of group.slice(0, 3)) {
        console.log(`  ${c.id}: ${c.title} [${c.category}] progress=${Math.round(c.progressA * 100)}%`);
      }
      if (group.length > 3) console.log(`  ... and ${group.length - 3} more`);
    }
    console.log(`\nTotal: ${challenges.length} challenges`);
    return;
  }

  const pool = getPool();

  // ─── Wipe existing data ─────────────────────────────────────────────────
  if (wipe) {
    console.log("=== WIPING existing challenge data ===\n");
    // Delete in FK-dependency order (children before parents)
    await pool.query(`DELETE FROM public.claims`);
    await pool.query(`DELETE FROM public.achievement_mints WHERE token_id >= 900000`);
    await pool.query(`DELETE FROM public.aivm_jobs`);
    await pool.query(`DELETE FROM public.verdicts`);
    await pool.query(`DELETE FROM public.evidence`);
    await pool.query(`DELETE FROM public.participants`);
    // Tables that reference challenges
    try { await pool.query(`DELETE FROM public.reminders`); } catch { /* table may not exist */ }
    try { await pool.query(`DELETE FROM public.progress_snapshots`); } catch { /* table may not exist */ }
    await pool.query(`DELETE FROM public.challenges`);
    await pool.query(`DELETE FROM public.reputation`);
    console.log("  Wiped: challenges, participants, evidence, verdicts, claims, achievements, reputation, reminders, aivm_jobs\n");
  }

  console.log(`=== Seeding ${challenges.length} test challenges ===\n`);

  for (const c of challenges) {
    const createdAt = new Date(Date.now() - c.daysAgo * 86400000);
    let endAt: Date;
    let proofDeadline: Date;

    if (c.inProofWindow) {
      // Challenge ended 2 days ago, proof deadline in 1 day
      endAt = new Date(Date.now() - 2 * 86400000);
      proofDeadline = new Date(Date.now() + 1 * 86400000);
    } else if (c.pastDeadline) {
      // Both ended long ago
      endAt = new Date(createdAt.getTime() + 7 * 86400000);
      proofDeadline = new Date(endAt.getTime() + 3 * 86400000);
    } else if (c.status === "Active") {
      // End in the future
      endAt = new Date(Date.now() + (7 - c.daysAgo) * 86400000);
      proofDeadline = new Date(endAt.getTime() + 3 * 86400000);
    } else {
      // Finalized — ended in the past
      endAt = new Date(createdAt.getTime() + 7 * 86400000);
      proofDeadline = new Date(endAt.getTime() + 3 * 86400000);
    }

    const startsAt = new Date(createdAt.getTime());

    // 1. Upsert challenge
    await pool.query(
      `INSERT INTO public.challenges (id, title, description, subject, status, model_id, model_hash, params, proof, timeline, funds, options, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description,
         status = EXCLUDED.status, params = EXCLUDED.params,
         timeline = EXCLUDED.timeline, funds = EXCLUDED.funds,
         options = EXCLUDED.options, model_id = EXCLUDED.model_id,
         model_hash = EXCLUDED.model_hash, updated_at = now()`,
      [
        c.id,
        c.title,
        c.description,
        c.creator.toLowerCase(),
        c.status,
        modelIdForCategory(c.category),
        modelHashForCategory(c.category),
        JSON.stringify({ rules: rulesForCategory(c.category) }),
        JSON.stringify({
          backend: "aivm_poi",
          verifier: "ChallengePayAivmPoiVerifier",
          modelHash: modelHashForCategory(c.category),
        }),
        JSON.stringify({
          startsAt: startsAt.toISOString(),
          endsAt: endAt.toISOString(),
          proofDeadline: proofDeadline.toISOString(),
        }),
        JSON.stringify({
          stake: c.stakeWei,
          stakeWei: c.stakeWei,
          budgetWei: (BigInt(c.stakeWei) * 2n).toString(),
          currency: "LCAI",
        }),
        JSON.stringify({
          category: "fitness",
          tags: [c.category, "test"],
        }),
        createdAt,
        new Date(),
      ],
    );

    // 2. Upsert participants
    for (const wallet of [WALLET_A, WALLET_B]) {
      await pool.query(
        `INSERT INTO public.participants (challenge_id, subject, source, joined_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (challenge_id, lower(subject)) DO NOTHING`,
        [c.id, wallet.toLowerCase(), "seed", createdAt],
      );
    }

    // 3. Insert evidence (skip if no progress)
    for (const [wallet, progress] of [[WALLET_A, c.progressA], [WALLET_B, c.progressB]] as const) {
      if (progress <= 0) continue;

      const records = generateEvidenceRecords(c.category, c.daysAgo, progress);
      const sampleData = JSON.stringify(records);
      await pool.query(
        `INSERT INTO public.evidence (challenge_id, subject, provider, data, evidence_hash)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT DO NOTHING`,
        [
          c.id,
          wallet.toLowerCase(),
          "apple_health",
          sampleData,
          `0x${Buffer.from(`${c.id}-${wallet}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
        ],
      );
    }

    // 4. Insert verdicts
    for (const [wallet, pass, progress] of [
      [WALLET_A, c.verdictA, c.progressA],
      [WALLET_B, c.verdictB, c.progressB],
    ] as const) {
      if (pass === null) continue;
      await pool.query(
        `INSERT INTO public.verdicts (challenge_id, subject, pass, reasons, evidence_hash, evaluator, score, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (challenge_id, subject) DO UPDATE SET
           pass = EXCLUDED.pass, reasons = EXCLUDED.reasons,
           score = EXCLUDED.score, updated_at = now()`,
        [
          c.id,
          wallet.toLowerCase(),
          pass,
          pass
            ? ["All fitness criteria met", "Daily threshold exceeded"]
            : ["Insufficient activity data", "Below minimum threshold"],
          `0x${Buffer.from(`${c.id}-${wallet}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
          "fitnessEvaluator",
          pass ? 90 + Math.floor(Math.random() * 10) : 10 + Math.floor(Math.random() * 40),
          JSON.stringify({ seeded: true, progressPct: Math.round(progress * 100) }),
        ],
      );
    }

    const pctA = c.progressA > 0 ? `${Math.round(c.progressA * 100)}%` : "none";
    const pctB = c.progressB > 0 ? `${Math.round(c.progressB * 100)}%` : "none";
    const suffix = c.inProofWindow ? " [PROOF WINDOW]" : c.pastDeadline ? " [EXPIRED]" : "";
    console.log(`  [✓] ${c.id}: ${c.title.padEnd(35)} ${c.status.padEnd(10)} ${c.category.padEnd(10)} A=${pctA} B=${pctB}${suffix}`);
  }

  // 5. Seed achievements
  console.log("\n=== Seeding achievements ===\n");

  let nextTokenId = 900000;
  const achievementMints: { tokenId: number; challengeId: number; recipient: string; type: string }[] = [];

  for (const c of challenges.filter(c => c.status === "Finalized")) {
    if (c.verdictA === true) {
      achievementMints.push({ tokenId: nextTokenId++, challengeId: c.id, recipient: WALLET_A, type: "victory" });
    }
    if (c.verdictA !== null) {
      achievementMints.push({ tokenId: nextTokenId++, challengeId: c.id, recipient: WALLET_A, type: "completion" });
    }
    if (c.verdictB === true) {
      achievementMints.push({ tokenId: nextTokenId++, challengeId: c.id, recipient: WALLET_B, type: "victory" });
    }
    if (c.verdictB !== null) {
      achievementMints.push({ tokenId: nextTokenId++, challengeId: c.id, recipient: WALLET_B, type: "completion" });
    }
  }

  // Special achievements
  const firstWinA = challenges.find(c => c.verdictA === true);
  const firstWinB = challenges.find(c => c.verdictB === true);
  if (firstWinA) achievementMints.push({ tokenId: nextTokenId++, challengeId: firstWinA.id, recipient: WALLET_A, type: "first_win" });
  if (firstWinB) achievementMints.push({ tokenId: nextTokenId++, challengeId: firstWinB.id, recipient: WALLET_B, type: "first_win" });
  achievementMints.push(
    { tokenId: nextTokenId++, challengeId: BASE_ID, recipient: WALLET_A, type: "early_adopter" },
    { tokenId: nextTokenId++, challengeId: BASE_ID, recipient: WALLET_B, type: "early_adopter" },
    { tokenId: nextTokenId++, challengeId: BASE_ID + 5, recipient: WALLET_A, type: "explorer" },
    { tokenId: nextTokenId++, challengeId: BASE_ID + 10, recipient: WALLET_B, type: "explorer" },
  );

  for (const m of achievementMints) {
    await pool.query(
      `INSERT INTO public.achievement_mints (token_id, challenge_id, recipient, achievement_type, tx_hash, block_number, minted_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (token_id) DO NOTHING`,
      [
        m.tokenId, m.challengeId, m.recipient.toLowerCase(), m.type,
        `0x${m.tokenId.toString(16).padStart(64, "0")}`,
        100000 + m.challengeId,
      ],
    );
  }
  console.log(`  [✓] ${achievementMints.length} achievements`);

  // 6. Recompute reputation
  console.log("\n=== Recomputing reputation ===\n");

  const typePoints: Record<string, number> = {
    completion: 50, victory: 150, streak: 100, first_win: 75,
    participation: 25, top_scorer: 200, undefeated: 250, comeback: 125,
    speedrun: 150, social: 50, early_adopter: 100, veteran: 200,
    perfectionist: 300, explorer: 75,
  };

  for (const wallet of [WALLET_A, WALLET_B]) {
    const addr = wallet.toLowerCase();
    const mints = await pool.query<{ achievement_type: string }>(
      `SELECT achievement_type FROM public.achievement_mints WHERE lower(recipient) = $1`,
      [addr],
    );

    let points = 0, completions = 0, victories = 0;
    for (const row of mints.rows) {
      points += typePoints[row.achievement_type] ?? 0;
      if (row.achievement_type === "completion") completions++;
      if (row.achievement_type === "victory") victories++;
    }

    const level = points >= 2000 ? 5 : points >= 800 ? 4 : points >= 300 ? 3 : points >= 100 ? 2 : 1;

    await pool.query(
      `INSERT INTO public.reputation (subject, points, level, completions, victories, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (subject) DO UPDATE SET
         points = EXCLUDED.points, level = EXCLUDED.level,
         completions = EXCLUDED.completions, victories = EXCLUDED.victories,
         updated_at = now()`,
      [addr, points, level, completions, victories],
    );
    console.log(`  [✓] ${wallet.slice(-6)}: ${points} pts, level ${level}, ${victories}W/${completions}C`);
  }

  // 7. Seed claims
  console.log("\n=== Seeding claims ===\n");

  let claimCount = 0;
  for (const c of challenges.filter(c => c.status === "Finalized")) {
    const winnerRewardWei = (BigInt(c.stakeWei) * 3n / 2n).toString();
    const cashbackWei = (BigInt(c.stakeWei) / 10n).toString();

    for (const [wallet, pass] of [[WALLET_A, c.verdictA], [WALLET_B, c.verdictB]] as const) {
      if (pass === true) {
        await pool.query(
          `INSERT INTO public.claims (challenge_id, subject, claim_type, amount_wei, tx_hash, source)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (challenge_id, lower(subject), claim_type) DO NOTHING`,
          [
            c.id, wallet.toLowerCase(), "principal", winnerRewardWei,
            `0x${Buffer.from(`claim-${wallet.slice(-4)}-${c.id}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
            "seed",
          ],
        );
        claimCount++;
      } else if (pass === false) {
        await pool.query(
          `INSERT INTO public.claims (challenge_id, subject, claim_type, amount_wei, tx_hash, source)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (challenge_id, lower(subject), claim_type) DO NOTHING`,
          [
            c.id, wallet.toLowerCase(), "cashback", cashbackWei,
            `0x${Buffer.from(`cashback-${wallet.slice(-4)}-${c.id}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
            "seed",
          ],
        );
        claimCount++;
      }
    }
  }
  console.log(`  [✓] ${claimCount} claims\n`);

  // 8. Summary
  console.log("=== Seed complete ===\n");

  const counts = await pool.query<{ challenges: string; evidence: string; verdicts: string; achievements: string; claims: string }>(
    `SELECT
       (SELECT COUNT(*) FROM public.challenges WHERE id >= $1 AND id < $2) as challenges,
       (SELECT COUNT(*) FROM public.evidence WHERE challenge_id >= $1 AND challenge_id < $2) as evidence,
       (SELECT COUNT(*) FROM public.verdicts WHERE challenge_id >= $1 AND challenge_id < $2) as verdicts,
       (SELECT COUNT(*) FROM public.achievement_mints WHERE token_id >= 900000) as achievements,
       (SELECT COUNT(*) FROM public.claims WHERE challenge_id >= $1 AND challenge_id < $2) as claims`,
    [BASE_ID, BASE_ID + 200],
  );

  const r = counts.rows[0];
  console.log(`  Challenges:   ${r.challenges}`);
  console.log(`  Evidence:     ${r.evidence}`);
  console.log(`  Verdicts:     ${r.verdicts}`);
  console.log(`  Achievements: ${r.achievements}`);
  console.log(`  Claims:       ${r.claims}`);

  for (const wallet of [WALLET_A, WALLET_B]) {
    const stats = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN pass THEN 1 ELSE 0 END), 0) as wins,
         COALESCE(SUM(CASE WHEN NOT pass THEN 1 ELSE 0 END), 0) as losses
       FROM public.verdicts
       WHERE lower(subject) = lower($1)
         AND challenge_id >= $2 AND challenge_id < $3`,
      [wallet, BASE_ID, BASE_ID + 200],
    );
    const { wins, losses } = stats.rows[0];
    console.log(`  ${wallet.slice(-6)}: ${wins}W / ${losses}L`);
  }

  await closePool();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
