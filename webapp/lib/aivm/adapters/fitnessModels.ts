/**
 * Provider-agnostic fitness model hashes.
 *
 * Challenges reference these generic model IDs (e.g., "fitness.steps@1")
 * regardless of which tracking provider the user has connected.
 * All fitness adapters accept any fitness model hash — the adapter is
 * selected by the `provider` field, not the model hash.
 *
 * Hashes are loaded from the model registry (DB) at runtime via
 * `initFitnessModels()`. The hardcoded defaults below are used only
 * until the first registry load completes.
 */

// ── Defaults (used until initFitnessModels() is called) ──────────────

const DEFAULT_HASHES: [string, string][] = [
  ["fitness.steps@1",     "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001"],
  ["fitness.distance@1",  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60002"],
  ["fitness.cycling@1",   "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60003"],
  ["fitness.hiking@1",    "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60004"],
  ["fitness.swimming@1",  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60005"],
  ["fitness.strength@1",  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60006"],
  ["fitness.yoga@1",      "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60007"],
  ["fitness.hiit@1",      "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60008"],
  ["fitness.calories@1",  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60009"],
  ["fitness.rowing@1",    "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000a"],
  ["fitness.walking@1",   "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000b"],
  ["fitness.exercise@1",  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000c"],
];

// ── Mutable state (rebuilt by initFitnessModels) ─────────────────────

let _fitnessHashes: Set<string> = new Set(DEFAULT_HASHES.map(([, h]) => h));
let _fitnessIdToHash: Record<string, string> = Object.fromEntries(DEFAULT_HASHES);

/** Kept for backward compat — reads from the mutable set. */
export const FITNESS_MODEL_HASHES: Set<string> = _fitnessHashes;

/** Check if a model hash represents a fitness model. */
export function isFitnessModel(hash: string): boolean {
  return _fitnessHashes.has(hash.toLowerCase());
}

/** Provider-agnostic model hash lookup by model ID. Reads from mutable map. */
export function getFitnessHash(modelId: string): string | undefined {
  return _fitnessIdToHash[modelId];
}

/** @deprecated Use getFitnessHash() — kept for backward compat. */
export const FITNESS_MODEL_ID_TO_HASH: Record<string, string> = _fitnessIdToHash;

/**
 * Rebuild fitness model hashes from the model registry (DB).
 * Call this on server startup or when models are refreshed.
 * Any model whose ID starts with "fitness." is included.
 */
export function initFitnessModels(models: { id: string; modelHash: string }[]): void {
  const hashes = new Set<string>();
  const idToHash: Record<string, string> = {};
  for (const m of models) {
    if (m.id.startsWith("fitness.")) {
      const h = m.modelHash.toLowerCase();
      hashes.add(h);
      idToHash[m.id] = h;
    }
  }
  if (hashes.size > 0) {
    _fitnessHashes = hashes;
    _fitnessIdToHash = idToHash;
  }
}
