// webapp/lib/templateRegistry.ts
import type { ChallengeFormState } from "@/app/challenges/create/state/types";
import {
  getAllCodeTemplates,
  getTemplateById as getStaticTemplateById,
  type Template,
  type TemplateField,
  type TemplatePlain,
  type FitnessKind,
  type GameId,
} from "@/lib/templates";
import { loadRuntimeTemplates } from "@/lib/loadRuntimeTemplates";

export type TemplateRegistryIntent = {
  type: "FITNESS" | "GAMING";
  gameId?: GameId | null;
  gameMode?: string | null;
  fitnessKind?: FitnessKind | string | null;
};

export type TemplateRegistryEntry = {
  id: string;
  name: string;
  hint?: string;
  kind: string;
  modelId: string;
  fields: TemplateField[];
  /**
   * Present for code-defined templates.
   * Runtime/admin templates may omit this until you decide how to version/build params dynamically.
   */
  paramsBuilder?: Template["paramsBuilder"];
  /** Produces the evaluator Rule/GamingRule stored as proof.params.rule at challenge creation. */
  ruleBuilder?: Template["ruleBuilder"];
  source: "static" | "runtime" | "merged";
};

type CacheState = {
  loaded: boolean;
  byId: Map<string, TemplateRegistryEntry>;
  all: TemplateRegistryEntry[];
};

const cache: CacheState = {
  loaded: false,
  byId: new Map(),
  all: [],
};

function normalizeRuntimeTemplate(t: TemplatePlain): TemplateRegistryEntry {
  return {
    id: t.id,
    name: t.name,
    hint: t.hint,
    kind: t.kind,
    modelId: t.modelId,
    fields: t.fields,
    source: "runtime",
  };
}

function normalizeStaticTemplate(t: Template): TemplateRegistryEntry {
  return {
    id: t.id,
    name: t.name,
    hint: t.hint,
    kind: t.kind,
    modelId: t.modelId,
    fields: t.fields,
    paramsBuilder: t.paramsBuilder,
    ruleBuilder: t.ruleBuilder,
    source: "static",
  };
}

function mergeTemplateEntries(
  staticTpl: TemplateRegistryEntry | undefined,
  runtimeTpl: TemplateRegistryEntry | undefined
): TemplateRegistryEntry | null {
  if (!staticTpl && !runtimeTpl) return null;
  if (staticTpl && !runtimeTpl) return staticTpl;
  if (!staticTpl && runtimeTpl) return runtimeTpl;

  return {
    id: runtimeTpl!.id,
    name: runtimeTpl!.name || staticTpl!.name,
    hint: runtimeTpl!.hint ?? staticTpl!.hint,
    kind: runtimeTpl!.kind || staticTpl!.kind,
    modelId: runtimeTpl!.modelId || staticTpl!.modelId,
    fields: runtimeTpl!.fields?.length ? runtimeTpl!.fields : staticTpl!.fields,
    paramsBuilder: staticTpl!.paramsBuilder,
    ruleBuilder: staticTpl!.ruleBuilder,
    source: "merged",
  };
}

function buildMergedRegistry(runtimeTemplates: TemplatePlain[]): CacheState {
  const staticTemplates = getAllCodeTemplates().map(normalizeStaticTemplate);
  const runtimeEntries = runtimeTemplates.map(normalizeRuntimeTemplate);

  const staticById = new Map(staticTemplates.map((t) => [t.id, t]));
  const runtimeById = new Map(runtimeEntries.map((t) => [t.id, t]));

  const ids = new Set<string>([
    ...Array.from(staticById.keys()),
    ...Array.from(runtimeById.keys()),
  ]);

  const all: TemplateRegistryEntry[] = [];
  const byId = new Map<string, TemplateRegistryEntry>();

  for (const id of ids) {
    const merged = mergeTemplateEntries(staticById.get(id), runtimeById.get(id));
    if (!merged) continue;
    byId.set(id, merged);
    all.push(merged);
  }

  all.sort((a, b) => a.name.localeCompare(b.name));

  return {
    loaded: true,
    byId,
    all,
  };
}

export async function ensureTemplateRegistryLoaded(): Promise<void> {
  if (cache.loaded) return;

  try {
    const runtime = await loadRuntimeTemplates();
    const next = buildMergedRegistry(runtime);
    cache.loaded = next.loaded;
    cache.byId = next.byId;
    cache.all = next.all;
  } catch {
    const next = buildMergedRegistry([]);
    cache.loaded = next.loaded;
    cache.byId = next.byId;
    cache.all = next.all;
  }
}

export function resetTemplateRegistryCache() {
  cache.loaded = false;
  cache.byId = new Map();
  cache.all = [];
}

/**
 * Synchronous accessor.
 * Returns merged cache when loaded, otherwise falls back to static templates immediately.
 */
export function getAllTemplatesSync(): TemplateRegistryEntry[] {
  if (cache.loaded) return cache.all;
  return getAllCodeTemplates().map(normalizeStaticTemplate);
}

/**
 * Synchronous accessor by id.
 * Returns merged cache when loaded, otherwise falls back to static templates immediately.
 */
export function getTemplateByIdSync(id?: string | null): TemplateRegistryEntry | null {
  if (!id) return null;

  if (cache.loaded) {
    return cache.byId.get(id) ?? null;
  }

  const staticTpl = getStaticTemplateById(id);
  return staticTpl ? normalizeStaticTemplate(staticTpl) : null;
}

export async function getTemplateById(id?: string | null): Promise<TemplateRegistryEntry | null> {
  if (!id) return null;
  await ensureTemplateRegistryLoaded();
  return cache.byId.get(id) ?? null;
}

function filterByIntent(
  templates: TemplateRegistryEntry[],
  intent: TemplateRegistryIntent
): TemplateRegistryEntry[] {
  if (intent.type === "FITNESS") {
    if (intent.fitnessKind) {
      return templates.filter((t) => t.kind === intent.fitnessKind);
    }
    return templates.filter((t) =>
      ["steps", "running", "cycling", "hiking", "swimming"].includes(t.kind)
    );
  }

  if (intent.type === "GAMING") {
    const gameId = intent.gameId ?? "dota";
    let pool = templates.filter((t) => t.kind === gameId);

    const mode = (intent.gameMode ?? "").toLowerCase();
    if (!mode) return pool;

    const isMode1v1 = mode.includes("1v1");
    const isMode5v5 = mode.includes("5v5");

    pool = pool.filter((tpl) => {
      const id = tpl.id.toLowerCase();
      const name = tpl.name.toLowerCase();
      const tpl1v1 = id.includes("1v1") || name.includes("1v1");
      const tpl5v5 = id.includes("5v5") || name.includes("5v5");

      if (isMode1v1) return !tpl5v5;
      if (isMode5v5) return !tpl1v1;
      return true;
    });

    return pool;
  }

  return templates;
}

export function getTemplatesForIntentSync(
  intent: TemplateRegistryIntent
): TemplateRegistryEntry[] {
  return filterByIntent(getAllTemplatesSync(), intent);
}

export async function getTemplatesForIntent(
  intent: TemplateRegistryIntent
): Promise<TemplateRegistryEntry[]> {
  await ensureTemplateRegistryLoaded();
  return filterByIntent(cache.all, intent);
}

/**
 * Resolve field defaults for a template.
 * Only writes defaults for missing fields; never overwrites user-entered values.
 */
export function buildTemplateDefaultFormState(
  template: TemplateRegistryEntry | null,
  current: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(current ?? {}),
  };

  if (!template) return next;

  for (const field of template.fields) {
    if (field.kind === "readonly") continue;

    const existing = next[field.key];
    const isMissing =
      existing == null || (typeof existing === "string" && existing.trim() === "");

    if (!isMissing) continue;

    if ("default" in field && field.default != null) {
      next[field.key] = field.default;
    }
  }

  return next;
}

/**
 * Helper for UIs that need concrete select options.
 * If options are dynamic and no ctx is available, returns [] safely.
 */
export function resolveTemplateFieldOptions(
  field: Extract<TemplateField, { kind: "select" }>,
  state: ChallengeFormState
): Array<{ value: string; label: string }> {
  if (Array.isArray(field.options)) return field.options;
  try {
    return field.options(state) ?? [];
  } catch {
    return [];
  }
}