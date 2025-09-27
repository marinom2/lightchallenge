// webapp/lib/challengeKinds.ts
export type ChallengeKindKey = "steps" | "running" | "dota";
export type ChallengeKind = {
  key: ChallengeKindKey;
  label: string;
  kindId: number; // on-chain "kind"
  fields: { name: string; label: string; placeholder?: string; type?: "text" | "number" }[];
};

export const CHALLENGE_KINDS: ChallengeKind[] = [
  {
    key: "steps",
    label: "Steps (per day)",
    kindId: 1,
    fields: [
      { name: "minSteps", label: "Min steps per day", placeholder: "5000", type: "number" },
      { name: "days", label: "Consecutive days", placeholder: "5", type: "number" },
    ],
  },
  {
    key: "running",
    label: "Running (distance)",
    kindId: 2,
    fields: [
      { name: "distanceKm", label: "Distance (km)", placeholder: "10", type: "number" },
      { name: "deadlineDays", label: "Complete within (days)", placeholder: "7", type: "number" },
    ],
  },
  {
    key: "dota",
    label: "Dota (hero kills)",
    kindId: 3,
    fields: [
      { name: "hero", label: "Hero (exact name)", placeholder: "Anti-Mage" },
      { name: "kills", label: "Required kills", placeholder: "100", type: "number" },
      { name: "account", label: "Game account / ID", placeholder: "Your Steam32/Matchmaking ID" },
    ],
  },
];

// Helper to get config by key
export function getKind(key: ChallengeKindKey) {
  return CHALLENGE_KINDS.find(k => k.key === key)!;
}