// webapp/lib/modelRegistry.ts
// Cached loader for model metadata (kind, hash, verifiers, etc.)
// -------------------------------------------------------------------

import type { Hex, Address } from "viem";

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 *
 * COMPATIBILITY NOTE:
 * Active model kinds: "aivm" (Lightchain AIVM + PoI) and "custom".
 * "zk" and "plonk" are legacy values that may exist in the DB but are NOT
 * part of the active product architecture. Do not use for new models.
 * ──────────────────────────────────────────────────────────────────────────── */
export type ModelKind = "aivm" | "custom" | "zk" | "plonk";

export interface ModelRow {
  id: string;                     // e.g. "dota.hero_kills_window@1"
  label?: string;
  kind: ModelKind;                // active: "aivm"|"custom"; legacy: "zk"|"plonk"
  modelHash: Hex;                 // keccak256 hash of model (0x…)
  verifier: Address;              // primary verifier (AIVM PoI verifier)
  /** @deprecated Legacy field — not used in AIVM + PoI product flow */
  plonkVerifier?: Address;
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
/**
 * Heuristic fallback when the registry is unavailable.
 * All active production models use the AIVM kind.
 */
function guessKind(modelId?: string): ModelKind | null {
  if (!modelId) return null;
  return "aivm";
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

/** Returns the model kind from the registry (no heuristic fallback). */
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
 *   - aivm: address of the AIVM PoI verifier (active product path)
 */
export async function getVerifierForModel(
  modelId?: string,
  fallbacks?: { aivm?: Address }
): Promise<{ kind: ModelKind | null; verifier: Address }> {
  const ZERO = "0x0000000000000000000000000000000000000000" as Address;

  const row = await getModelFromRegistry(modelId).catch(() => null);
  const kind: ModelKind | null = row?.kind ?? guessKind(modelId);

  return {
    kind,
    verifier: (row?.verifier ?? fallbacks?.aivm ?? ZERO) as Address,
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