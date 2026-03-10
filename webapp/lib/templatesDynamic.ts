// webapp/lib/templatesDynamic.ts
export type TemplateFieldJson =
  | { kind: "number"; key: string; label: string; min?: number; step?: number; default?: number }
  | { kind: "text"; key: string; label: string; default?: string }
  | { kind: "readonly"; key: string; label: string; value: string }
  | { kind: "select"; key: string; label: string; options: { value: string; label: string }[]; default?: string };

  export type TemplateJson = {
    id: string;
    kind:
      | "steps"
      | "running"
      | "cycling"
      | "hiking"
      | "swimming"
      | "dota"
      | "cs"
      | "lol";
  name: string;
  hint?: string;
  modelId: string;
  fields: TemplateFieldJson[];
};
export type TemplatesFile = { templates: TemplateJson[] };

const base =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    : "";

// ---------------------
// existing loader
// ---------------------
export async function loadTemplates(): Promise<TemplatesFile> {
  const res = await fetch(`${base}/api/admin/templates`, { cache: "no-store" });
  if (!res.ok) return { templates: [] };
  const data = await res.json();
  return { templates: Array.isArray(data) ? data : data.templates ?? [] };
}

// ---------------------
// small module-level cache
// ---------------------
let _cache: TemplatesFile | null = null;
let _loading: Promise<TemplatesFile> | null = null;

export async function ensureTemplatesLoaded(): Promise<TemplatesFile> {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = loadTemplates().then((f) => {
    _cache = f;
    _loading = null;
    return f;
  });
  return _loading;
}

export function getAllTemplates(): TemplateJson[] {
  return _cache?.templates ?? [];
}

export function getTemplateById(id: string): TemplateJson | null {
  return getAllTemplates().find((t) => t.id === id) ?? null;
}

type Intent =
  | { type: "FITNESS" }
  | { type: "GAMING"; gameId?: "dota" | "cs" | "lol"; gameMode?: string }
  | null
  | undefined;

  export function getTemplatesForIntent(intent: Intent): TemplateJson[] {
    const all = getAllTemplates();
    if (!intent) return all;
  
    if (intent.type === "FITNESS") {
      const fitnessKinds = ["steps", "running", "cycling", "hiking", "swimming"];
      const selectedKind = (intent as any).fitnessKind as (typeof fitnessKinds)[number] | undefined;
      return selectedKind ? all.filter((t) => t.kind === selectedKind)
                          : all.filter((t) => fitnessKinds.includes(t.kind));
    }
  
    if (intent.type === "GAMING") {
      const k = intent.gameId ?? "dota";
      const pool = all.filter((t) => t.kind === k);
      const mode = intent.gameMode?.toLowerCase();
  
      if (!mode) return pool;
  
      const isMode1v1 = mode.includes("1v1");
      const isMode5v5 = mode.includes("5v5");
  
      return pool.filter((tpl) => {
        const id = tpl.id.toLowerCase();
        const name = tpl.name.toLowerCase();
        const isTpl1v1 = id.includes("1v1") || name.includes("1v1");
        const isTpl5v5 = id.includes("5v5") || name.includes("5v5");
  
        if (isMode1v1) return !isTpl5v5;
        if (isMode5v5) return !isTpl1v1;
        return true;
      });
    }
  
    return all;
  }