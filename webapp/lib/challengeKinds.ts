// webapp/lib/challengeKinds.ts
//
// On-chain "kind" is a uint8 metadata tag on ChallengePay. It has no functional
// impact on settlement — it's purely for indexing/discovery. We assign a unique
// ID per logical category so the contract emits a meaningful ChallengeCreated event.

export type ChallengeKindKey =
  | "steps"
  | "running"
  | "dota"
  | "cycling"
  | "hiking"
  | "swimming"
  | "lol"
  | "cs"
  | "fitness_general"
  | "gaming_general";

export type ChallengeKind = {
  key: ChallengeKindKey;
  label: string;
  kindId: number; // on-chain "kind" uint8
};

export const CHALLENGE_KINDS: ChallengeKind[] = [
  { key: "steps", label: "Steps", kindId: 1 },
  { key: "running", label: "Running", kindId: 2 },
  { key: "dota", label: "Dota 2", kindId: 3 },
  { key: "cycling", label: "Cycling", kindId: 4 },
  { key: "hiking", label: "Hiking", kindId: 5 },
  { key: "swimming", label: "Swimming", kindId: 6 },
  { key: "lol", label: "League of Legends", kindId: 7 },
  { key: "cs", label: "CS2 / FACEIT", kindId: 8 },
  { key: "fitness_general", label: "Fitness", kindId: 9 },
  { key: "gaming_general", label: "Gaming", kindId: 10 },
];

export function getKind(key: ChallengeKindKey): ChallengeKind {
  const found = CHALLENGE_KINDS.find((k) => k.key === key);
  if (!found) throw new Error(`Unknown challenge kind: ${key}`);
  return found;
}
