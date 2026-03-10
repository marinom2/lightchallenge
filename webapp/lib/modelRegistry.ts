// webapp/lib/modelRegistry.ts
// Cached loader for model metadata (kind, hash, verifiers, etc.)
// -------------------------------------------------------------------

import type { Hex, Address } from "viem";

/* ────────────────────────────────────────────────────────────────────────────
 * Types (aligned with /public/models/models.json and /api/admin/models)
 * ──────────────────────────────────────────────────────────────────────────── */
export type ModelKind = "aivm" | "zk" | "plonk";

export interface ModelRow {
  id: string;                     // e.g. "dota.hero_kills_window@1"
  label?: string;
  kind: ModelKind;                // "aivm" | "zk" | "plonk"
  modelHash: Hex;                 // keccak256 hash of model (0x…)
  verifier: Address;              // primary verifier (AIVM or zk verifier)
  plonkVerifier?: Address;        // optional separate plonk adapter/verifier
  binding?: boolean;
  signals?: string[];
  params?: Array<{ key: string; label?: string; type?: string; default?: any }>;
  sources?: string[];
  fileAccept?: string[];
  notes?: string;
}

type ModelsPayload =
  | { models: ModelRow[] }
  | { models?: ModelRow[] }
  | ModelRow[];

/* ────────────────────────────────────────────────────────────────────────────
 * Base URL (SSR-safe)
 * ──────────────────────────────────────────────────────────────────────────── */
const BASE =
  typeof window === "undefined"
    ? (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "")
    : "";

/* ────────────────────────────────────────────────────────────────────────────
 * Module-level cache
 * ──────────────────────────────────────────────────────────────────────────── */
let registry: Map<string, ModelRow> | null = null;
let loading: Promise<void> | null = null;
let lastLoadedMs = 0;
const MAX_AGE_MS = 5 * 60 * 1000; // refresh every 5 minutes

/* ────────────────────────────────────────────────────────────────────────────
 * Loader
 * ──────────────────────────────────────────────────────────────────────────── */
async function loadOnce(): Promise<void> {
  if (registry && Date.now() - lastLoadedMs < MAX_AGE_MS) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      const res = await fetch(`${BASE}/api/admin/models`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ModelsPayload;

      const rows: ModelRow[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any).models)
        ? ((data as any).models as ModelRow[])
        : [];

      const map = new Map<string, ModelRow>();
      for (const m of rows) {
        if (!m?.id) continue;
        map.set(m.id, m);
      }

      registry = map;
      lastLoadedMs = Date.now();
    } catch (err) {
      console.warn("[modelRegistry] load failed:", err);
      if (!registry) registry = new Map(); // keep a defined map
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Heuristic fallback (when registry missing / offline)
 * ──────────────────────────────────────────────────────────────────────────── */
function guessKind(modelId?: string): ModelKind | null {
  if (!modelId) return null;
  const id = modelId.toLowerCase();
  if (id.includes("plonk")) return "plonk";
  if (id.includes("zk")) return "zk";
  // Common AIVM ids in your catalog
  if (
    id.includes("steps") ||
    id.includes("winrate") ||
    id.includes("hero_kills") ||
    id.includes("private_match") ||
    id.includes("distance_in_window")
  ) {
    return "aivm";
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────────── */

/** Returns the full row (hashes, verifiers, etc.) or null if unknown. */
export async function getModelFromRegistry(modelId?: string): Promise<ModelRow | null> {
  if (!modelId) return null;
  await loadOnce();
  return registry?.get(modelId) ?? null;
}

/** Returns only the model kind ("aivm" | "zk" | "plonk"), with no heuristics. */
export async function getModelKindFromRegistry(modelId?: string): Promise<ModelKind | null> {
  const row = await getModelFromRegistry(modelId);
  return row?.kind ?? null;
}

/** Returns modelHash (0x…) if known. */
export async function getModelHashFromRegistry(modelId?: string): Promise<Hex | null> {
  const row = await getModelFromRegistry(modelId);
  return row?.modelHash ?? null;
}

/** Returns all cached models (after first load). */
export async function getAllModels(): Promise<ModelRow[]> {
  await loadOnce();
  return Array.from(registry?.values() ?? []);
}

/**
 * Resolve kind + verifier addresses for a modelId.
 * - Reads the admin registry if available.
 * - Falls back to the provided addresses if the registry row is missing.
 * - Uses a small heuristic to guess kind if the registry can’t be loaded.
 *
 * @param modelId
 * @param fallbacks Provide your known on-chain defaults here.
 *   - aivm: address of your AIVM verifier
 *   - zk: address of your zk verifier
 *   - plonkAdapter: address of your Plonk adapter/verifier
 */
export async function getVerifierForModel(
  modelId?: string,
  fallbacks?: { aivm?: Address; zk?: Address; plonkAdapter?: Address }
): Promise<{ kind: ModelKind | null; verifier: Address; plonkVerifier?: Address }> {
  const ZERO = "0x0000000000000000000000000000000000000000" as Address;

  // Try registry first
  const row = await getModelFromRegistry(modelId).catch(() => null);
  const kind: ModelKind | null = row?.kind ?? guessKind(modelId);

  if (kind === "plonk") {
    return {
      kind,
      verifier: (row?.plonkVerifier ?? fallbacks?.plonkAdapter ?? ZERO) as Address,
      plonkVerifier: row?.plonkVerifier as Address | undefined,
    };
  }

  if (kind === "aivm") {
    return {
      kind,
      verifier: (row?.verifier ?? fallbacks?.aivm ?? ZERO) as Address,
      plonkVerifier: row?.plonkVerifier as Address | undefined,
    };
  }

  if (kind === "zk") {
    return {
      kind,
      verifier: (row?.verifier ?? fallbacks?.zk ?? ZERO) as Address,
      plonkVerifier: row?.plonkVerifier as Address | undefined,
    };
  }

  // Unknown → generic zk fallback (safer default)
  return {
    kind: null,
    verifier: (row?.verifier ?? fallbacks?.zk ?? ZERO) as Address,
    plonkVerifier: row?.plonkVerifier as Address | undefined,
  };
}

/** Warm the cache manually (e.g., from SSR) with known models. */
export function primeModelRegistry(models: ModelRow[]) {
  if (!registry) registry = new Map();
  for (const m of models) if (m?.id) registry.set(m.id, m);
  lastLoadedMs = Date.now();
}

/** Clear cache (tests / dev reloads). */
export function resetModelRegistryCache() {
  registry = null;
  loading = null;
  lastLoadedMs = 0;
}