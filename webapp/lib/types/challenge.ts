export type ChallengeMeta = {
    id: string            // must match on-chain challengeId
    title: string         // human-readable challenge title
    description: string   // longer text describing the challenge
    params: string        // encoded rules, e.g. "minSteps=5000;days=5"
    category: string      // category key, e.g. "fitness", "gaming", "custom"
    verifier: string      // verifier contract address
    txHash?: string       // optional: on-chain tx that created the challenge
  }