// webapp/app/challenges/create/lib/constants.ts
import { addDays, addHours, startOfTomorrow } from "date-fns";

export const SAFE_APPROVAL_WINDOW_SEC = 3600;
export const SAFE_MIN_LEAD_SEC = 7200;
export const GAS_BUFFER_BPS = 115n;

export const ERC20_MIN_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export const FITNESS_TEMPLATES = [
  {
    id: "10k_steps_5d",
    name: "10k steps × 5 days",
    title: "Walk 10,000 steps per day for 5 days",
    joinCloses: (d: Date): Date => addHours(d, -12),
    starts: (d: Date): Date => d,
    ends: (d: Date): Date => addDays(d, 5),
  },
  {
    id: "5k_run_7d",
    name: "5km run × 7 days",
    title: "Run 5km every day for a week",
    joinCloses: (d: Date): Date => addHours(d, -12),
    starts: (d: Date): Date => d,
    ends: (d: Date): Date => addDays(d, 7),
  },
  {
    id: "weekend_hike_10k",
    name: "Weekend hike 10km",
    title: "Complete a 10km hike this weekend",
    joinCloses: (d: Date): Date => addHours(d, -12),
    starts: (d: Date): Date => d,
    ends: (d: Date): Date => addDays(d, 2),
  },
] as const;

export type GameId = "dota" | "cs" | "lol";
export type GameMode = "1v1" | "5v5";
export type GameKey = `${GameId}_${GameMode}`;

export interface GamingDefault {
  title: string;
  joinCloses: (d: Date) => Date;
  starts: (d: Date) => Date;
  ends: (d: Date) => Date;
  rosterSlots: { id: string; team: "A" | "B" | null }[];
}

function makeRoster(size: 2 | 10): { id: string; team: "A" | "B" | null }[] {
  if (size === 2) {
    return [
      { id: "A1", team: "A" },
      { id: "B1", team: "B" },
    ];
  }

  return Array.from({ length: 10 }, (_, i) => ({
    id: `${i < 5 ? "A" : "B"}${(i % 5) + 1}`,
    team: i < 5 ? "A" : "B",
  }));
}

export const GAMING_DEFAULTS: Record<GameKey, GamingDefault> = {
  dota_5v5: {
    title: "Dota 2 5v5 Match",
    joinCloses: (d) => addHours(d, -0.75),
    starts: (d) => d,
    ends: (d) => addHours(d, 6),
    rosterSlots: makeRoster(10),
  },
  cs_5v5: {
    title: "CS:GO 5v5 Match",
    joinCloses: (d) => addHours(d, -0.75),
    starts: (d) => d,
    ends: (d) => addHours(d, 6),
    rosterSlots: makeRoster(10),
  },
  lol_5v5: {
    title: "LoL 5v5 Match",
    joinCloses: (d) => addHours(d, -0.75),
    starts: (d) => d,
    ends: (d) => addHours(d, 6),
    rosterSlots: makeRoster(10),
  },
  dota_1v1: {
    title: "Dota 2 1v1 Mid",
    joinCloses: (d) => addHours(d, -0.75),
    starts: (d) => d,
    ends: (d) => addHours(d, 2),
    rosterSlots: makeRoster(2),
  },
  cs_1v1: {
    title: "CS:GO 1v1 Match",
    joinCloses: (d) => addHours(d, -0.75),
    starts: (d) => d,
    ends: (d) => addHours(d, 2),
    rosterSlots: makeRoster(2),
  },
  lol_1v1: {
    title: "LoL 1v1 Match",
    joinCloses: (d) => addHours(d, -0.75),
    starts: (d) => d,
    ends: (d) => addHours(d, 2),
    rosterSlots: makeRoster(2),
  },
};

export const TOMORROW_0900 = (): Date => {
  const d = startOfTomorrow();
  d.setHours(9, 0, 0, 0);
  return d;
};